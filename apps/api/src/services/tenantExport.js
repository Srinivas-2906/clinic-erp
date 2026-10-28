import { getDb } from '../db/index.js';
import { assertCapability, canManageClinicSettings } from '../modules/identity/rolePolicy.js';
import { logAudit } from './clinicAudit.js';

const MAX_ROWS = 5000;

export function buildTenantExportBundle(tenantId, user) {
  assertCapability(user, canManageClinicSettings, 'Owner required for tenant export');
  const db = getDb();
  const tenant = db.prepare(`SELECT id, slug, name, plan, status, subscription_status, trial_ends_at, settings FROM tenants WHERE id = ?`).get(tenantId);
  if (!tenant) {
    const err = new Error('Tenant not found');
    err.status = 404;
    throw err;
  }

  const patients = db.prepare(`
    SELECT id, name, phone, email, created_at, updated_at FROM patients WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(tenantId, MAX_ROWS);

  const appointments = db.prepare(`
    SELECT id, patient_id, service, status, scheduled_at, source, created_at FROM appointments
    WHERE tenant_id = ? ORDER BY scheduled_at DESC LIMIT ?
  `).all(tenantId, MAX_ROWS);

  const invoices = db.prepare(`
    SELECT id, patient_id, status, total, amount_paid, created_at FROM patient_invoices
    WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(tenantId, MAX_ROWS);

  const payments = db.prepare(`
    SELECT id, patient_id, amount, method, kind, status, invoice_id, created_at FROM patient_payments
    WHERE tenant_id = ? ORDER BY created_at DESC LIMIT ?
  `).all(tenantId, MAX_ROWS);

  logAudit(tenantId, user.sub, 'export', 'tenant_data', tenantId, {
    patients: patients.length,
    appointments: appointments.length,
  });

  return {
    exportedAt: new Date().toISOString(),
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      plan: tenant.plan,
      status: tenant.status,
      subscriptionStatus: tenant.subscription_status,
      trialEndsAt: tenant.trial_ends_at,
    },
    counts: {
      patients: db.prepare(`SELECT COUNT(*) AS c FROM patients WHERE tenant_id = ?`).get(tenantId)?.c ?? 0,
      appointments: db.prepare(`SELECT COUNT(*) AS c FROM appointments WHERE tenant_id = ?`).get(tenantId)?.c ?? 0,
      invoices: db.prepare(`SELECT COUNT(*) AS c FROM patient_invoices WHERE tenant_id = ?`).get(tenantId)?.c ?? 0,
      payments: db.prepare(`SELECT COUNT(*) AS c FROM patient_payments WHERE tenant_id = ?`).get(tenantId)?.c ?? 0,
    },
    patients,
    appointments,
    invoices,
    payments,
    truncated: {
      patients: patients.length >= MAX_ROWS,
      appointments: appointments.length >= MAX_ROWS,
      invoices: invoices.length >= MAX_ROWS,
      payments: payments.length >= MAX_ROWS,
    },
  };
}
