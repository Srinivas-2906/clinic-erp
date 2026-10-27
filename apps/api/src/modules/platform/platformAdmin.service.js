import { getDb } from '../../db/index.js';
import { getTenantEntitlements } from '../identity/entitlements.js';
import { normalizePlanId } from '../identity/plans.js';
import {
  assertSubscriptionTransition,
  normalizeSubscriptionStatus,
} from '../identity/subscription.js';
import { updateTenantSubscription } from '../../services/tenantProvisioning.js';
import { logAudit } from '../../services/clinicAudit.js';
import { parseTenantSettings } from '../../services/clinicSettings.js';

function onboardingHints(tenantId) {
  const db = getDb();
  const doctors = db.prepare(`SELECT COUNT(*) AS c FROM doctors WHERE tenant_id = ? AND is_active = 1`).get(tenantId)?.c ?? 0;
  const patients = db.prepare(`SELECT COUNT(*) AS c FROM patients WHERE tenant_id = ?`).get(tenantId)?.c ?? 0;
  const appts = db.prepare(`SELECT COUNT(*) AS c FROM appointments WHERE tenant_id = ?`).get(tenantId)?.c ?? 0;
  const staff = db.prepare(`
    SELECT COUNT(*) AS c FROM users WHERE tenant_id = ? AND is_platform_admin = 0
  `).get(tenantId)?.c ?? 0;
  const steps = [
    { id: 'staff', done: staff > 1, label: 'Additional staff invited' },
    { id: 'doctors', done: doctors > 0, label: 'Doctor profile configured' },
    { id: 'patients', done: patients > 0, label: 'First patient registered' },
    { id: 'appointments', done: appts > 0, label: 'First appointment booked' },
  ];
  const completed = steps.filter((s) => s.done).length;
  return { steps, completed, total: steps.length };
}

function reminderHealth(tenantId) {
  const db = getDb();
  const pending = db.prepare(`
    SELECT COUNT(*) AS c FROM reminder_jobs WHERE tenant_id = ? AND status = 'pending'
  `).get(tenantId)?.c ?? 0;
  const failed = db.prepare(`
    SELECT COUNT(*) AS c FROM reminder_jobs WHERE tenant_id = ? AND status = 'failed'
  `).get(tenantId)?.c ?? 0;
  return { pendingReminderJobs: pending, failedReminderJobs: failed };
}

export function listTenantsForPlatformAdmin({ search, status, limit = 100, offset = 0 } = {}) {
  const db = getDb();
  let sql = `
    SELECT id, slug, name, plan, status, subscription_status, trial_ends_at, created_at, settings
    FROM tenants WHERE 1=1
  `;
  const params = [];
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (search) {
    const q = `%${String(search).trim().toLowerCase()}%`;
    sql += ' AND (lower(slug) LIKE ? OR lower(name) LIKE ?)';
    params.push(q, q);
  }
  sql += ' ORDER BY datetime(created_at) DESC LIMIT ? OFFSET ?';
  params.push(Math.min(limit, 500), offset);

  const rows = db.prepare(sql).all(...params);
  return rows.map((row) => {
    let ent;
    try {
      ent = getTenantEntitlements(row.id);
    } catch {
      ent = null;
    }
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      plan: row.plan,
      planLabel: ent?.planLabel,
      status: row.status,
      subscriptionStatus: row.subscription_status,
      trialEndsAt: row.trial_ends_at,
      createdAt: row.created_at,
      usage: ent?.usage ?? null,
      limits: ent?.limits ?? null,
      canWrite: ent?.subscription?.canWrite ?? true,
    };
  });
}

export function getTenantDetailForPlatformAdmin(tenantId) {
  const db = getDb();
  const row = db.prepare(`SELECT * FROM tenants WHERE id = ?`).get(tenantId);
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  const entitlements = getTenantEntitlements(tenantId);
  const settings = parseTenantSettings(row.settings);
  return {
    tenant: {
      id: row.id,
      slug: row.slug,
      name: row.name,
      plan: row.plan,
      status: row.status,
      subscriptionStatus: row.subscription_status,
      trialEndsAt: row.trial_ends_at,
      createdAt: row.created_at,
      settings: {
        timezone: settings.timezone,
        appointmentRemindersEnabled: settings.appointmentRemindersEnabled !== false,
      },
    },
    entitlements,
    onboarding: onboardingHints(tenantId),
    operations: reminderHealth(tenantId),
  };
}

export function patchTenantAsPlatformAdmin(adminUser, tenantId, { planId, subscriptionStatus, confirmNote } = {}) {
  if (!confirmNote || String(confirmNote).trim().length < 3) {
    const err = new Error('Confirmation note required (min 3 characters)');
    err.status = 400;
    throw err;
  }
  const db = getDb();
  const row = db.prepare(`SELECT id, subscription_status, plan FROM tenants WHERE id = ?`).get(tenantId);
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  if (subscriptionStatus !== undefined) {
    assertSubscriptionTransition(row.subscription_status, subscriptionStatus);
  }

  const tenant = updateTenantSubscription(tenantId, {
    subscriptionStatus: subscriptionStatus !== undefined ? normalizeSubscriptionStatus(subscriptionStatus) : undefined,
    planId: planId !== undefined ? normalizePlanId(planId) : undefined,
  });

  logAudit(tenantId, adminUser.sub, 'platform_admin_update', 'tenant', tenantId, {
    planId: planId ?? null,
    subscriptionStatus: subscriptionStatus ?? null,
    note: String(confirmNote).trim(),
  });

  return getTenantDetailForPlatformAdmin(tenant.id);
}
