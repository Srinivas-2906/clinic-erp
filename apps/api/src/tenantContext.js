import { getDb, tenantToClient, parseSettings } from './db/index.js';
import { listDoctors } from './modules/providers/doctors.service.js';
import { AsyncLocalStorage } from 'node:async_hooks';

const tenantCache = new Map();
let defaultTenantId = process.env.DEFAULT_TENANT_ID || 'denta-care';

const als = new AsyncLocalStorage();

export function runWithTenant(tenantId, fn) {
  const nextId = tenantId || null;
  return als.run({ tenantId: nextId }, fn);
}

export function setRequestTenant(tenantId) {
  const store = als.getStore();
  if (store) store.tenantId = tenantId || null;
}

export function getRequestTenantId() {
  const store = als.getStore();
  return store?.tenantId || defaultTenantId;
}

export function clearRequestTenant() {
  const store = als.getStore();
  if (store) store.tenantId = null;
}

export function getTenantById(id) {
  if (!id) return null;
  const cached = tenantCache.get(id);
  if (cached) return cached;
  const row = getDb().prepare('SELECT * FROM tenants WHERE id = ?').get(id);
  if (row) tenantCache.set(id, row);
  return row ?? null;
}

const SLUG_ALIASES = {
  'denta-care': 'dentacare',
  ajithdentacare: 'dentacare',
};

export function getTenantBySlug(slug) {
  const resolved = SLUG_ALIASES[slug] || slug;
  const row = getDb().prepare('SELECT * FROM tenants WHERE slug = ?').get(resolved);
  if (row) tenantCache.set(row.id, row);
  return row ?? null;
}

export function invalidateTenantCache(id) {
  tenantCache.delete(id);
}

export function getClient() {
  const tenant = getTenantById(getRequestTenantId());
  if (!tenant) {
    return {
      id: defaultTenantId,
      slug: 'dentacare',
      name: 'Clinic',
      agentName: 'Reception',
      agentPhone: '',
      city: 'India',
      emoji: '🏥',
    };
  }
  const c = tenantToClient(tenant);
  const s = parseSettings(tenant.settings);
  const doctors = listDoctors(tenant.id);
  const defaultDoctor = doctors[0];
  return {
    id: c.id,
    slug: c.slug,
    name: c.name,
    agentName: c.agentName,
    agentPhone: c.agentPhone,
    city: c.city,
    emoji: c.emoji,
    doctorName: defaultDoctor?.displayName || defaultDoctor?.name || s.doctorName || '',
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.name,
      displayName: d.displayName,
      specialty: d.specialty,
      appointmentColor: d.appointmentColor,
      isActive: d.isActive,
    })),
  };
}
