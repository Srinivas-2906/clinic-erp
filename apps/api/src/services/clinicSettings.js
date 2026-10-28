import { getDb } from '../db/index.js';
import { assertCapability, canManageClinicSettings } from '../modules/identity/rolePolicy.js';
import { logAudit } from './clinicAudit.js';

const DEFAULT_SETTINGS = {
  timezone: 'Asia/Kolkata',
  phone: '',
  email: '',
  address: '',
  website: '',
};

export function parseTenantSettings(raw) {
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : (raw || {});
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function getTenantTimezone(tenantId) {
  const row = getDb().prepare(`SELECT settings FROM tenants WHERE id = ?`).get(tenantId);
  if (!row) return DEFAULT_SETTINGS.timezone;
  return parseTenantSettings(row.settings).timezone || DEFAULT_SETTINGS.timezone;
}

export function getClinicSettings(tenantId) {
  const row = getDb().prepare(`SELECT id, name, slug, settings FROM tenants WHERE id = ?`).get(tenantId);
  if (!row) return null;
  return {
    tenantId: row.id,
    name: row.name,
    slug: row.slug,
    settings: parseTenantSettings(row.settings),
  };
}

export function updateClinicSettings(tenantId, user, patch = {}) {
  assertCapability(user, canManageClinicSettings, 'Owner required to update clinic settings');
  const db = getDb();
  const row = db.prepare(`SELECT settings FROM tenants WHERE id = ?`).get(tenantId);
  if (!row) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  const current = parseTenantSettings(row.settings);
  const next = { ...current };
  const allowed = ['timezone', 'phone', 'email', 'address', 'website', 'displayName'];
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      next[key] = String(patch[key] ?? '').trim();
    }
  }
  if (patch.name !== undefined) {
    const name = String(patch.name || '').trim();
    if (name) {
      db.prepare(`UPDATE tenants SET name = ? WHERE id = ?`).run(name, tenantId);
    }
  }
  db.prepare(`UPDATE tenants SET settings = ? WHERE id = ?`).run(JSON.stringify(next), tenantId);
  logAudit(tenantId, user.sub, 'update', 'clinic_settings', tenantId, { keys: Object.keys(patch) });
  return getClinicSettings(tenantId);
}
