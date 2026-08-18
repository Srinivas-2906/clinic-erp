import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { requireManageDoctors } from '../identity/permissions.js';

function nowIso() {
  return new Date().toISOString();
}

export function rowToDoctor(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    displayName: row.display_name || row.name,
    specialty: row.specialty || '',
    phone: row.phone || '',
    email: row.email || '',
    qualification: row.qualification || '',
    registrationNumber: row.registration_number || '',
    avatarUrl: row.avatar_url || '',
    userId: row.user_id || null,
    appointmentColor: row.appointment_color || '#2563eb',
    defaultSlotDuration: row.default_slot_duration ?? 30,
    isActive: !!row.is_active,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function assertDoctorBelongsToTenant(doctorId, tenantId) {
  const row = getDb().prepare(
    'SELECT id FROM doctors WHERE id = ? AND tenant_id = ?',
  ).get(doctorId, tenantId);
  if (!row) {
    const err = new Error('Doctor not found');
    err.status = 404;
    throw err;
  }
  return row;
}

export function getDoctorById(doctorId, tenantId) {
  const row = getDb().prepare(
    'SELECT * FROM doctors WHERE id = ? AND tenant_id = ?',
  ).get(doctorId, tenantId);
  return rowToDoctor(row);
}

export function listDoctors(tenantId, { includeInactive = false } = {}) {
  let sql = 'SELECT * FROM doctors WHERE tenant_id = ?';
  if (!includeInactive) sql += ' AND is_active = 1';
  sql += ' ORDER BY sort_order ASC, name ASC';
  return getDb().prepare(sql).all(tenantId).map(rowToDoctor);
}

export function createDoctor(tenantId, user, data) {
  requireManageDoctors(user);
  const name = String(data.name || '').trim();
  if (!name) throw new Error('Doctor name required');

  const id = nanoid(12);
  const now = nowIso();
  const displayName = String(data.displayName || name).trim() || name;

  getDb().prepare(`
    INSERT INTO doctors (
      id, tenant_id, name, display_name, specialty, phone, email,
      qualification, registration_number, avatar_url, user_id,
      appointment_color, default_slot_duration, is_active, sort_order,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    name,
    displayName,
    String(data.specialty || '').trim(),
    String(data.phone || '').trim(),
    String(data.email || '').trim(),
    String(data.qualification || '').trim(),
    String(data.registrationNumber || '').trim(),
    String(data.avatarUrl || '').trim(),
    data.userId || null,
    data.appointmentColor || '#2563eb',
    data.defaultSlotDuration ?? 30,
    data.isActive === false ? 0 : 1,
    data.sortOrder ?? 0,
    now,
    now,
  );

  return getDoctorById(id, tenantId);
}

export function updateDoctor(doctorId, tenantId, user, patch) {
  requireManageDoctors(user);
  assertDoctorBelongsToTenant(doctorId, tenantId);

  const fields = [];
  const values = [];
  const map = {
    name: 'name',
    displayName: 'display_name',
    specialty: 'specialty',
    phone: 'phone',
    email: 'email',
    qualification: 'qualification',
    registrationNumber: 'registration_number',
    avatarUrl: 'avatar_url',
    userId: 'user_id',
    appointmentColor: 'appointment_color',
    defaultSlotDuration: 'default_slot_duration',
    sortOrder: 'sort_order',
  };

  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(patch[key]);
    }
  }

  if (patch.isActive !== undefined) {
    fields.push('is_active = ?');
    values.push(patch.isActive ? 1 : 0);
  }

  if (!fields.length) return getDoctorById(doctorId, tenantId);

  fields.push('updated_at = ?');
  values.push(nowIso());
  values.push(doctorId, tenantId);

  getDb().prepare(
    `UPDATE doctors SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
  ).run(...values);

  if (patch.name !== undefined || patch.displayName !== undefined) {
    const doc = getDoctorById(doctorId, tenantId);
    getDb().prepare(`
      UPDATE appointments SET assigned_doctor = ? WHERE tenant_id = ? AND assigned_doctor_id = ?
    `).run(doc.displayName || doc.name, tenantId, doctorId);
  }

  return getDoctorById(doctorId, tenantId);
}

export function getDefaultDoctorId(tenantId) {
  const row = getDb().prepare(`
    SELECT id FROM doctors WHERE tenant_id = ? AND is_active = 1
    ORDER BY sort_order ASC, created_at ASC LIMIT 1
  `).get(tenantId);
  return row?.id ?? null;
}

export function resolveDoctorDisplayName(doctorId, tenantId) {
  const doc = getDoctorById(doctorId, tenantId);
  return doc ? (doc.displayName || doc.name) : '';
}
