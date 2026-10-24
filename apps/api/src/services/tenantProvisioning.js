import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb, seedCatalogForTenant, tenantToClient } from '../db/index.js';
import { invalidateTenantCache } from '../tenantContext.js';
import { validateTenantSlug, slugFromClinicName } from '../modules/platform/tenantSlug.js';
import { PLAN_IDS, normalizePlanId } from '../modules/identity/plans.js';
import { SUBSCRIPTION_STATUS, normalizeSubscriptionStatus } from '../modules/identity/subscription.js';
import { migrateTenantsToDoctors } from '../modules/providers/doctorMigration.js';
import { logAudit } from './clinicAudit.js';
import { buildSetPasswordUrl, createInviteTokenForUser } from './accessRequests.js';

const DEFAULT_TRIAL_DAYS = Number(process.env.CLINIC_TRIAL_DAYS || 14);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function ensureProvisioningSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tenant_provision_idempotency (
      idempotency_key TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (tenant_id) REFERENCES tenants(id)
    );
  `);
}

function defaultSettings({ city, emoji, doctorName }) {
  return {
    botName: 'Reception',
    agentName: 'Reception',
    agentPhone: '',
    city: city || 'India',
    emoji: emoji || '🏥',
    doctorName: doctorName || 'Doctor',
    clinicSessions: [
      { start: 10, end: 13, slotMin: 30 },
      { start: 17, end: 20, slotMin: 30 },
    ],
  };
}

export function isSlugAvailable(slug) {
  const check = validateTenantSlug(slug);
  if (!check.ok) return { available: false, error: check.error, slug: check.slug };
  const db = getDb();
  const row = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(check.slug);
  if (row) return { available: false, error: 'This workspace URL is already taken', slug: check.slug };
  return { available: true, slug: check.slug };
}

function loadIdempotentResult(db, idempotencyKey) {
  if (!idempotencyKey) return null;
  const row = db.prepare(
    'SELECT response_json FROM tenant_provision_idempotency WHERE idempotency_key = ?',
  ).get(idempotencyKey);
  if (!row) return null;
  try {
    return JSON.parse(row.response_json);
  } catch {
    return null;
  }
}

function saveIdempotentResult(db, idempotencyKey, tenantId, payload) {
  if (!idempotencyKey) return;
  db.prepare(`
    INSERT INTO tenant_provision_idempotency (idempotency_key, tenant_id, response_json)
    VALUES (?, ?, ?)
  `).run(idempotencyKey, tenantId, JSON.stringify(payload));
}

/**
 * Provision a new clinic tenant + owner invite (transactional).
 */
export function provisionClinicTenant(input = {}) {
  const db = getDb();
  ensureProvisioningSchema(db);

  const idempotencyKey = String(input.idempotencyKey || '').trim().slice(0, 128);
  const cached = loadIdempotentResult(db, idempotencyKey);
  if (cached) return { ...cached, idempotentReplay: true };

  const clinicName = String(input.clinicName || input.name || '').trim();
  if (!clinicName || clinicName.length < 2) {
    const err = new Error('Clinic name is required');
    err.status = 400;
    throw err;
  }

  const slugInput = input.slug ? String(input.slug) : slugFromClinicName(clinicName);
  const slugCheck = validateTenantSlug(slugInput);
  if (!slugCheck.ok) {
    const err = new Error(slugCheck.error);
    err.status = 400;
    throw err;
  }
  const slug = slugCheck.slug;

  const ownerEmail = normalizeEmail(input.ownerEmail);
  const ownerName = String(input.ownerName || '').trim() || clinicName.split(' ')[0] || 'Owner';
  if (!isValidEmail(ownerEmail)) {
    const err = new Error('Valid owner email is required');
    err.status = 400;
    throw err;
  }

  const planId = normalizePlanId(input.planId || input.plan || PLAN_IDS.PROFESSIONAL);
  const industry = String(input.industry || 'clinic').trim() || 'clinic';
  const subscriptionStatus = normalizeSubscriptionStatus(
    input.subscriptionStatus || SUBSCRIPTION_STATUS.TRIALING,
  );

  if (db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug)) {
    const err = new Error('This workspace URL is already taken');
    err.status = 409;
    err.code = 'SLUG_TAKEN';
    throw err;
  }
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(ownerEmail)) {
    const err = new Error('This email already has clinic access');
    err.status = 409;
    err.code = 'EMAIL_TAKEN';
    throw err;
  }

  const settings = {
    ...defaultSettings({
      city: input.city,
      emoji: input.emoji,
      doctorName: input.doctorName,
    }),
    ...(input.settings && typeof input.settings === 'object' ? input.settings : {}),
  };

  const tenantId = `tenant-${nanoid(10)}`;
  const userId = `user-${nanoid(10)}`;
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + DEFAULT_TRIAL_DAYS);

  const placeholderHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);

  const provision = db.transaction(() => {
    db.prepare(`
      INSERT INTO tenants (
        id, slug, name, industry, plan, status, subscription_status, trial_ends_at, settings
      ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(
      tenantId,
      slug,
      clinicName,
      industry,
      planId,
      subscriptionStatus,
      trialEnd.toISOString(),
      JSON.stringify(settings),
    );

    seedCatalogForTenant(tenantId, industry);

    db.prepare(`
      INSERT INTO users (id, tenant_id, username, email, password_hash, name, role, is_platform_admin)
      VALUES (?, ?, NULL, ?, ?, ?, 'owner', 0)
    `).run(userId, tenantId, ownerEmail, placeholderHash, ownerName);

    migrateTenantsToDoctors(db);

    const rawToken = createInviteTokenForUser(userId);
    const setPasswordUrl = buildSetPasswordUrl(rawToken);

    logAudit(tenantId, userId, 'provision', 'tenant', tenantId, {
      slug,
      planId,
      subscriptionStatus,
      ownerEmail,
    });

    const tenantRow = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
    const payload = {
      tenant: tenantToClient(tenantRow),
      owner: { id: userId, email: ownerEmail, name: ownerName, role: 'owner' },
      invite: {
        expiresInDays: Number(process.env.INVITE_EXPIRY_DAYS || 7),
        setPasswordUrl,
      },
      planId,
      subscriptionStatus,
    };

    saveIdempotentResult(db, idempotencyKey, tenantId, payload);
    return payload;
  });

  try {
    const result = provision();
    invalidateTenantCache(tenantId);
    return result;
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      const e = new Error('Provisioning conflict — slug or email may already exist');
      e.status = 409;
      throw e;
    }
    throw err;
  }
}

export function updateTenantSubscription(tenantId, { subscriptionStatus, planId } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const updates = [];
  const params = [];
  if (subscriptionStatus !== undefined) {
    updates.push('subscription_status = ?');
    params.push(normalizeSubscriptionStatus(subscriptionStatus));
  }
  if (planId !== undefined) {
    updates.push('plan = ?');
    params.push(normalizePlanId(planId));
  }
  if (!updates.length) return tenantToClient(row);

  params.push(tenantId);
  db.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  invalidateTenantCache(tenantId);
  const updated = db.prepare('SELECT * FROM tenants WHERE id = ?').get(tenantId);
  logAudit(tenantId, null, 'subscription_update', 'tenant', tenantId, {
    subscriptionStatus: updated.subscription_status,
    plan: updated.plan,
  });
  return tenantToClient(updated);
}
