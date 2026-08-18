import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { assertDoctorBelongsToTenant } from './doctors.service.js';
import { requireManageDoctors } from '../identity/permissions.js';
import { validateDoctorSessions } from '../scheduling/scheduleValidation.js';

function nowIso() {
  return new Date().toISOString();
}

export function rowToSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    doctorId: row.doctor_id,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    slotDurationMinutes: row.slot_duration_minutes ?? 30,
    locationId: row.location_id || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listDoctorSessions(doctorId, tenantId) {
  assertDoctorBelongsToTenant(doctorId, tenantId);
  return getDb().prepare(`
    SELECT * FROM doctor_sessions
    WHERE doctor_id = ? AND tenant_id = ?
    ORDER BY day_of_week ASC, start_time ASC
  `).all(doctorId, tenantId).map(rowToSession);
}

/**
 * Replace all weekly sessions for a doctor.
 * sessions: [{ dayOfWeek, startTime, endTime, slotDurationMinutes?, locationId? }]
 */
export function replaceDoctorSessions(doctorId, tenantId, user, sessions) {
  requireManageDoctors(user);
  assertDoctorBelongsToTenant(doctorId, tenantId);

  if (!Array.isArray(sessions)) throw new Error('sessions array required');

  const normalized = validateDoctorSessions(sessions);

  const db = getDb();
  const now = nowIso();

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM doctor_sessions WHERE doctor_id = ? AND tenant_id = ?').run(doctorId, tenantId);
    const insert = db.prepare(`
      INSERT INTO doctor_sessions (
        id, tenant_id, doctor_id, day_of_week, start_time, end_time,
        slot_duration_minutes, location_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of normalized) {
      insert.run(
        nanoid(12),
        tenantId,
        doctorId,
        s.dayOfWeek,
        s.startTime,
        s.endTime,
        s.slotDurationMinutes,
        s.locationId || null,
        now,
        now,
      );
    }
  });

  replace();
  return listDoctorSessions(doctorId, tenantId);
}

/** Legacy hour-based sessions from tenant settings (used during migration fallback). */
export function getDoctorSessionsAsHours(doctorId, tenantId, dateStr) {
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  const rows = getDb().prepare(`
    SELECT * FROM doctor_sessions
    WHERE doctor_id = ? AND tenant_id = ? AND day_of_week = ?
    ORDER BY start_time ASC
  `).all(doctorId, tenantId, dow);

  return rows.map((row) => {
    const [sh] = row.start_time.split(':').map(Number);
    const [eh] = row.end_time.split(':').map(Number);
    return {
      start: sh,
      end: eh,
      slotMin: row.slot_duration_minutes ?? 30,
    };
  });
}
