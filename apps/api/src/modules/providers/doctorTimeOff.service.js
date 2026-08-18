import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { assertDoctorBelongsToTenant } from './doctors.service.js';
import { requireManageDoctors } from '../identity/permissions.js';

export function rowToTimeOff(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    doctorId: row.doctor_id,
    startDatetime: row.start_datetime,
    endDatetime: row.end_datetime,
    reason: row.reason || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at,
  };
}

export function listDoctorTimeOff(doctorId, tenantId) {
  assertDoctorBelongsToTenant(doctorId, tenantId);
  return getDb().prepare(`
    SELECT * FROM doctor_time_off
    WHERE doctor_id = ? AND tenant_id = ?
    ORDER BY start_datetime ASC
  `).all(doctorId, tenantId).map(rowToTimeOff);
}

export function createDoctorTimeOff(doctorId, tenantId, user, data) {
  requireManageDoctors(user);
  assertDoctorBelongsToTenant(doctorId, tenantId);

  const startDatetime = String(data.startDatetime || '').trim();
  const endDatetime = String(data.endDatetime || '').trim();
  if (!startDatetime || !endDatetime) throw new Error('startDatetime and endDatetime required');
  if (endDatetime <= startDatetime) throw new Error('endDatetime must be after startDatetime');

  const id = nanoid(12);
  getDb().prepare(`
    INSERT INTO doctor_time_off (id, tenant_id, doctor_id, start_datetime, end_datetime, reason, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    doctorId,
    startDatetime,
    endDatetime,
    String(data.reason || '').trim(),
    user.sub || null,
  );

  return rowToTimeOff(getDb().prepare('SELECT * FROM doctor_time_off WHERE id = ?').get(id));
}

export function deleteDoctorTimeOff(offId, doctorId, tenantId, user) {
  requireManageDoctors(user);
  assertDoctorBelongsToTenant(doctorId, tenantId);

  const existing = getDb().prepare(`
    SELECT id FROM doctor_time_off WHERE id = ? AND doctor_id = ? AND tenant_id = ?
  `).get(offId, doctorId, tenantId);
  if (!existing) {
    const err = new Error('Time off not found');
    err.status = 404;
    throw err;
  }

  getDb().prepare('DELETE FROM doctor_time_off WHERE id = ?').run(offId);
  return { ok: true };
}
