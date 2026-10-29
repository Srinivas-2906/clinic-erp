import { getDb } from '../db/index.js';
import { getTenantEntitlements } from '../modules/identity/entitlements.js';
import { parseTenantSettings } from './clinicSettings.js';

/**
 * Owner-facing onboarding checklist derived from live tenant data (no separate store).
 */
export function getClinicOnboardingStatus(tenantId) {
  const db = getDb();
  const tenant = db.prepare(`SELECT settings FROM tenants WHERE id = ?`).get(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }
  const settings = parseTenantSettings(tenant.settings);

  const doctors =
    db.prepare(`SELECT COUNT(*) AS c FROM doctors WHERE tenant_id = ? AND is_active = 1`).get(tenantId)?.c ?? 0;
  const patients = db.prepare(`SELECT COUNT(*) AS c FROM patients WHERE tenant_id = ?`).get(tenantId)?.c ?? 0;
  const appointments =
    db.prepare(`SELECT COUNT(*) AS c FROM appointments WHERE tenant_id = ?`).get(tenantId)?.c ?? 0;
  const staff =
    db.prepare(`
      SELECT COUNT(*) AS c FROM users WHERE tenant_id = ? AND is_platform_admin = 0
    `).get(tenantId)?.c ?? 0;
  const doctorSessions =
    db.prepare(`SELECT COUNT(*) AS c FROM doctor_sessions WHERE tenant_id = ?`).get(tenantId)?.c ?? 0;
  const linkedClinicians =
    db.prepare(`
      SELECT COUNT(*) AS c FROM doctors WHERE tenant_id = ? AND is_active = 1 AND user_id IS NOT NULL AND trim(user_id) != ''
    `).get(tenantId)?.c ?? 0;

  const profileComplete =
    Boolean(String(settings.phone || '').trim())
    && Boolean(String(settings.address || '').trim())
    && Boolean(String(settings.timezone || '').trim());
  const hoursConfigured =
    doctorSessions > 0
    || (Array.isArray(settings.clinicSessions) && settings.clinicSessions.length > 0);

  const steps = [
    {
      id: 'profile',
      label: 'Clinic contact details and timezone',
      done: profileComplete,
      tab: 'settings',
    },
    {
      id: 'hours',
      label: 'Opening hours and slot duration',
      done: hoursConfigured,
      tab: 'doctors',
    },
    {
      id: 'doctors',
      label: 'Add clinic doctors',
      done: doctors > 0,
      tab: 'doctors',
    },
    {
      id: 'clinical_link',
      label: 'Link a doctor login for signing consultations',
      done: linkedClinicians > 0,
      tab: 'doctors',
    },
    {
      id: 'staff',
      label: 'Invite receptionist or staff',
      done: staff > 1,
      tab: 'team',
    },
    {
      id: 'patient',
      label: 'Register your first patient',
      done: patients > 0,
      tab: 'patients',
    },
    {
      id: 'appointment',
      label: 'Book your first appointment',
      done: appointments > 0,
      tab: 'book',
    },
  ];

  const completed = steps.filter((s) => s.done).length;
  let plan = null;
  try {
    const ent = getTenantEntitlements(tenantId);
    plan = {
      planId: ent.planId,
      planLabel: ent.planLabel,
      subscriptionStatus: ent.subscription?.status,
      trialEndsAt: ent.subscription?.trialEndsAt ?? null,
      canWrite: ent.subscription?.canWrite ?? true,
      usage: ent.usage,
      limits: ent.limits,
    };
  } catch {
    plan = null;
  }

  return {
    steps,
    completed,
    total: steps.length,
    allComplete: completed === steps.length,
    plan,
  };
}
