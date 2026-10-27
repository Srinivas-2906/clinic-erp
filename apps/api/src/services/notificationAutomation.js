import { getDb } from '../db/index.js';
import { getTenantTimezone } from './clinicSettings.js';
import { parseTenantSettings } from './clinicSettings.js';
import { enqueueReminder } from './reminders/index.js';
import { getInvoiceFinancialSummary } from './patientInvoices.js';

function tenantRemindersEnabled(tenantId) {
  const row = getDb().prepare(`SELECT settings FROM tenants WHERE id = ?`).get(tenantId);
  const s = parseTenantSettings(row?.settings);
  return s.appointmentRemindersEnabled !== false;
}

export function scheduleAppointmentConfirmation(tenantId, appointmentId) {
  if (!tenantRemindersEnabled(tenantId)) return null;
  const db = getDb();
  const appt = db.prepare(`
    SELECT a.id, a.patient_id, a.scheduled_at, a.status, p.phone, p.name
    FROM appointments a JOIN patients p ON p.id = a.patient_id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(appointmentId, tenantId);
  if (!appt || appt.status !== 'confirmed') return null;
  return enqueueReminder({
    tenantId,
    appointmentId,
    kind: 'appointment_confirmation',
    recipient: appt.phone || '',
    scheduledAt: new Date(Date.now() + 3000).toISOString(),
    payload: { patientName: appt.name, scheduledAt: appt.scheduled_at },
  });
}

export function enqueuePaymentReceiptNotification(tenantId, paymentRow) {
  if (paymentRow.kind === 'refund') return null;
  const db = getDb();
  const patient = db.prepare(`SELECT phone, email, name FROM patients WHERE id = ? AND tenant_id = ?`).get(
    paymentRow.patient_id,
    tenantId,
  );
  const to = patient?.email || '';
  if (!to) return null;
  return enqueueReminder({
    tenantId,
    appointmentId: paymentRow.appointment_id || null,
    kind: 'payment_receipt',
    recipient: to,
    scheduledAt: new Date(Date.now() + 2000).toISOString(),
    payload: {
      paymentId: paymentRow.id,
      amount: paymentRow.amount,
      patientName: patient?.name,
    },
  });
}

export function enqueueOutstandingInvoiceDigest(tenantId) {
  const stats = getInvoiceFinancialSummary(tenantId);
  if (stats.outstandingBalance <= 0) return null;
  const db = getDb();
  const owner = db.prepare(`
    SELECT email FROM users WHERE tenant_id = ? AND role = 'owner' AND is_platform_admin = 0 LIMIT 1
  `).get(tenantId);
  if (!owner?.email) return null;
  return enqueueReminder({
    tenantId,
    kind: 'outstanding_invoices_digest',
    recipient: owner.email,
    scheduledAt: new Date().toISOString(),
    payload: { outstandingBalance: stats.outstandingBalance, openInvoiceCount: stats.openInvoiceCount },
  });
}

export function enqueueSubscriptionExpiryNotice(tenantId) {
  const db = getDb();
  const row = db.prepare(`SELECT trial_ends_at, subscription_status FROM tenants WHERE id = ?`).get(tenantId);
  if (!row?.trial_ends_at) return null;
  const owner = db.prepare(`
    SELECT email FROM users WHERE tenant_id = ? AND role = 'owner' LIMIT 1
  `).get(tenantId);
  if (!owner?.email) return null;
  return enqueueReminder({
    tenantId,
    kind: 'subscription_expiry_notice',
    recipient: owner.email,
    scheduledAt: new Date().toISOString(),
    payload: { trialEndsAt: row.trial_ends_at, subscriptionStatus: row.subscription_status },
  });
}

export function buildDailyOpsSummary(tenantId) {
  const db = getDb();
  const tz = getTenantTimezone(tenantId);
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const apptCount = db.prepare(`
    SELECT COUNT(*) AS c FROM appointments WHERE tenant_id = ? AND date(scheduled_at) = date(?)
  `).get(tenantId, today)?.c ?? 0;
  const openInv = getInvoiceFinancialSummary(tenantId);
  return { date: today, timezone: tz, appointmentsToday: apptCount, ...openInv };
}

export function enqueueDailyOpsSummary(tenantId) {
  const db = getDb();
  const owner = db.prepare(`SELECT email FROM users WHERE tenant_id = ? AND role = 'owner' LIMIT 1`).get(tenantId);
  if (!owner?.email) return null;
  const payload = buildDailyOpsSummary(tenantId);
  return enqueueReminder({
    tenantId,
    kind: 'daily_ops_summary',
    recipient: owner.email,
    scheduledAt: new Date().toISOString(),
    payload,
  });
}
