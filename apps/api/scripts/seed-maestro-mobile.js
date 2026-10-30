#!/usr/bin/env node
/**
 * Deterministic fixtures for native Maestro (isolated E2E DB only).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nanoid } from 'nanoid';
import { initDatabase, getDb, closeDatabase } from '../src/db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
execSync('node scripts/assert-e2e-safe-env.js', {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

const tenantId = 'denta-care';
const MAESTRO_PATIENT_ID = 'pat-maestro-mobile';
const MAESTRO_APPT_ID = 'appt-maestro-consult';
const MAESTRO_CHECKIN_ID = 'appt-maestro-checkin';

initDatabase();
const db = getDb();

const doctor = db.prepare(
  `SELECT id FROM doctors WHERE tenant_id = ? AND is_active = 1 ORDER BY sort_order ASC LIMIT 1`,
).get(tenantId);
if (!doctor) {
  console.error('No active doctor for maestro seed');
  process.exit(1);
}

const now = new Date();
const y = now.getFullYear();
const m = String(now.getMonth() + 1).padStart(2, '0');
const d = String(now.getDate()).padStart(2, '0');
const scheduledAt = `${y}-${m}-${d}T10:30:00+05:30`;

db.prepare(`
  INSERT INTO patients (id, tenant_id, name, phone, phone_digits, chief_complaint)
  VALUES (?, ?, 'Maestro Mobile Patient', '9000000001', '9000000001', 'Routine check')
  ON CONFLICT(id) DO UPDATE SET name = excluded.name, phone = excluded.phone
`).run(MAESTRO_PATIENT_ID, tenantId);

db.prepare(`DELETE FROM appointments WHERE id = ?`).run(MAESTRO_APPT_ID);
db.prepare(`
  INSERT INTO appointments (
    id, tenant_id, patient_id, service, scheduled_at, status, assigned_doctor_id, notes
  ) VALUES (?, ?, ?, 'Consultation', ?, 'arrived', ?, 'Maestro consult fixture')
`).run(MAESTRO_APPT_ID, tenantId, MAESTRO_PATIENT_ID, scheduledAt, doctor.id);

const checkinAt = `${y}-${m}-${d}T11:00:00+05:30`;
db.prepare(`DELETE FROM appointments WHERE id = ?`).run(MAESTRO_CHECKIN_ID);
db.prepare(`
  INSERT INTO appointments (
    id, tenant_id, patient_id, service, scheduled_at, status, assigned_doctor_id, notes
  ) VALUES (?, ?, ?, 'Consultation', ?, 'confirmed', ?, 'Maestro check-in fixture')
`).run(MAESTRO_CHECKIN_ID, tenantId, MAESTRO_PATIENT_ID, checkinAt, doctor.id);

closeDatabase();

console.log(JSON.stringify({
  patientId: MAESTRO_PATIENT_ID,
  appointmentId: MAESTRO_APPT_ID,
  checkInAppointmentId: MAESTRO_CHECKIN_ID,
  doctorId: doctor.id,
  scheduledAt,
  todayConsultTestId: `today-consult-${MAESTRO_APPT_ID}`,
  todayCheckInTestId: `today-action-${MAESTRO_CHECKIN_ID}`,
}, null, 2));
