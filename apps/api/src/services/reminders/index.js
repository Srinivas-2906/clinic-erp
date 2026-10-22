import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { createMockReminderProvider } from './mockProvider.js';

const DEFAULT_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000];

let provider = createMockReminderProvider();

export function setReminderProvider(impl) {
  provider = impl;
}

export function getReminderProvider() {
  return provider;
}

function ensureReminderSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS reminder_jobs (
      id TEXT PRIMARY KEY,
      tenant_id TEXT NOT NULL,
      appointment_id TEXT,
      kind TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'mock',
      recipient TEXT DEFAULT '',
      payload TEXT DEFAULT '{}',
      scheduled_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      last_error TEXT,
      delivered_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_jobs_due ON reminder_jobs(status, scheduled_at);
    CREATE INDEX IF NOT EXISTS idx_reminder_jobs_tenant ON reminder_jobs(tenant_id);
  `);
}

export function initReminderInfrastructure(db = getDb()) {
  ensureReminderSchema(db);
}

export function enqueueReminder({
  tenantId,
  appointmentId,
  kind,
  recipient,
  scheduledAt,
  payload = {},
  channel = 'mock',
}) {
  const db = getDb();
  initReminderInfrastructure(db);
  const id = nanoid(12);
  const when = scheduledAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO reminder_jobs (
      id, tenant_id, appointment_id, kind, channel, recipient, payload, scheduled_at, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    id,
    tenantId,
    appointmentId || null,
    kind,
    channel,
    String(recipient || ''),
    JSON.stringify(payload),
    when,
  );
  return id;
}

export function scheduleAppointmentReminders(tenantId, appointmentId) {
  const db = getDb();
  const appt = db.prepare(
    'SELECT id, patient_id, scheduled_at, reminder_sent FROM appointments WHERE id = ? AND tenant_id = ?',
  ).get(appointmentId, tenantId);
  if (!appt || appt.reminder_sent) return null;

  const patient = db.prepare('SELECT phone FROM patients WHERE id = ? AND tenant_id = ?').get(appt.patient_id, tenantId);
  const scheduledAt = new Date(appt.scheduled_at);
  const remindAt = new Date(scheduledAt.getTime() - 24 * 60 * 60 * 1000);
  const runAt = remindAt > new Date() ? remindAt : new Date(Date.now() + 5_000);

  return enqueueReminder({
    tenantId,
    appointmentId,
    kind: 'appointment_reminder',
    recipient: patient?.phone || '',
    scheduledAt: runAt.toISOString(),
    payload: { appointmentId, patientId: appt.patient_id },
  });
}

export function scheduleRecallReminder() {
  /* Recall campaigns — future milestone */
  return null;
}

export function clearAppointmentReminders(tenantId, appointmentId) {
  const db = getDb();
  initReminderInfrastructure(db);
  db.prepare(`
    UPDATE reminder_jobs
    SET status = 'cancelled', updated_at = datetime('now')
    WHERE tenant_id = ? AND appointment_id = ? AND status = 'pending'
  `).run(tenantId, appointmentId);
}

export function processDueReminders({ limit = 20, now = new Date() } = {}) {
  const db = getDb();
  initReminderInfrastructure(db);
  const due = db.prepare(`
    SELECT * FROM reminder_jobs
    WHERE status = 'pending' AND scheduled_at <= ?
    ORDER BY scheduled_at ASC
    LIMIT ?
  `).all(now.toISOString(), limit);

  const results = [];
  for (const row of due) {
    results.push(processOneReminder(row));
  }
  return results;
}

function processOneReminder(row) {
  const db = getDb();
  const prov = getReminderProvider();
  if (process.env.REMINDER_DELIVERY_ENABLED === '1' && prov.id !== 'mock') {
    const err = new Error('External reminder delivery is disabled until approved');
    err.status = 503;
    throw err;
  }

  try {
    const payload = JSON.parse(row.payload || '{}');
    prov.send({
      tenantId: row.tenant_id,
      appointmentId: row.appointment_id,
      kind: row.kind,
      channel: row.channel,
      recipient: row.recipient,
      payload,
    });
    db.prepare(`
      UPDATE reminder_jobs
      SET status = 'delivered', delivered_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ?
    `).run(row.id);
    if (row.appointment_id && row.kind === 'appointment_reminder') {
      db.prepare('UPDATE appointments SET reminder_sent = 1 WHERE id = ?').run(row.appointment_id);
    }
    return { id: row.id, status: 'delivered' };
  } catch (err) {
    const attempts = (row.attempts ?? 0) + 1;
    const maxAttempts = row.max_attempts ?? DEFAULT_MAX_ATTEMPTS;
    const failed = attempts >= maxAttempts;
    const delay = RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
    const nextAt = new Date(Date.now() + delay).toISOString();
    db.prepare(`
      UPDATE reminder_jobs
      SET attempts = ?, last_error = ?, status = ?, scheduled_at = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      attempts,
      String(err.message || err),
      failed ? 'failed' : 'pending',
      failed ? row.scheduled_at : nextAt,
      row.id,
    );
    return { id: row.id, status: failed ? 'failed' : 'retry', error: err.message };
  }
}
