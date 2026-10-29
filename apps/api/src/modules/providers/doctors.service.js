import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { requireManageDoctors } from '../identity/permissions.js';
import { assertCanAddDoctor } from '../identity/entitlements.js';

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
  assertCanAddDoctor(tenantId, 1);
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

function assertUserNotLinkedToOtherDoctor(tenantId, userId, exceptDoctorId) {
  if (!userId) return;
  const clash = getDb().prepare(`
    SELECT id FROM doctors WHERE tenant_id = ? AND user_id = ? AND id != ?
  `).get(tenantId, userId, exceptDoctorId);
  if (clash) {
    const err = new Error('This user account is already linked to another doctor profile');
    err.status = 409;
    throw err;
  }
}

/**
 * After staff invite approval with role doctor: link to an existing profile or create one.
 * Prefer explicit doctorId; else match by email; else create a minimal active doctor row.
 */
export function linkInvitedDoctorUser(tenantId, userId, { name, email, doctorId } = {}) {
  const db = getDb();
  const existingByUser = db.prepare(
    'SELECT id FROM doctors WHERE tenant_id = ? AND user_id = ?',
  ).get(tenantId, userId);
  if (existingByUser) return existingByUser.id;

  if (doctorId) {
    assertDoctorBelongsToTenant(doctorId, tenantId);
    const row = db.prepare(
      'SELECT id, user_id, email FROM doctors WHERE id = ? AND tenant_id = ?',
    ).get(doctorId, tenantId);
    if (row.user_id && row.user_id !== userId) {
      const err = new Error('Selected doctor profile is already linked to another account');
      err.status = 409;
      throw err;
    }
    assertUserNotLinkedToOtherDoctor(tenantId, userId, doctorId);
    const em = String(email || '').trim();
    db.prepare(`
      UPDATE doctors SET user_id = ?, email = CASE WHEN trim(COALESCE(email, '')) = '' THEN ? ELSE email END, updated_at = ?
      WHERE id = ? AND tenant_id = ?
    `).run(userId, em, nowIso(), doctorId, tenantId);
    return doctorId;
  }

  const em = String(email || '').trim().toLowerCase();
  if (em) {
    const emailMatches = db.prepare(`
      SELECT id, user_id FROM doctors WHERE tenant_id = ? AND lower(trim(email)) = ?
    `).all(tenantId, em);
    if (emailMatches.length > 1) {
      const err = new Error('Multiple doctor profiles share this email; select a profile explicitly when approving');
      err.status = 409;
      throw err;
    }
    const byEmail = emailMatches[0];
    if (byEmail) {
      if (byEmail.user_id && byEmail.user_id !== userId) {
        const err = new Error('A doctor profile with this email is linked to another account');
        err.status = 409;
        throw err;
      }
      assertUserNotLinkedToOtherDoctor(tenantId, userId, byEmail.id);
      db.prepare(`UPDATE doctors SET user_id = ?, updated_at = ? WHERE id = ?`).run(userId, nowIso(), byEmail.id);
      return byEmail.id;
    }
  }

  assertCanAddDoctor(tenantId, 1);
  const displayName = String(name || 'Doctor').trim() || 'Doctor';
  const id = nanoid(12);
  const now = nowIso();
  db.prepare(`
    INSERT INTO doctors (
      id, tenant_id, name, display_name, specialty, phone, email,
      qualification, registration_number, avatar_url, user_id,
      appointment_color, default_slot_duration, is_active, sort_order,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, '', '', ?, '', '', '', ?, '#2563eb', 30, 1, 0, ?, ?)
  `).run(id, tenantId, displayName, displayName, String(email || '').trim(), userId, now, now);
  return id;
}

export function updateDoctor(doctorId, tenantId, user, patch) {
  requireManageDoctors(user);
  assertDoctorBelongsToTenant(doctorId, tenantId);

  if (patch.userId !== undefined && patch.userId) {
    assertUserNotLinkedToOtherDoctor(tenantId, patch.userId, doctorId);
  }

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

/** Owner/clinician links their login to an existing doctor row (self-service onboarding). */
export function linkDoctorToCurrentUser(doctorId, tenantId, user) {
  if (!user?.sub) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  if (user.role !== 'owner' && user.role !== 'doctor') {
    const err = new Error('Only clinic owners or doctors can link a clinical profile');
    err.status = 403;
    throw err;
  }
  assertDoctorBelongsToTenant(doctorId, tenantId);
  assertUserNotLinkedToOtherDoctor(tenantId, user.sub, doctorId);
  return updateDoctor(doctorId, tenantId, user, { userId: user.sub });
}

export function resolveDoctorDisplayName(doctorId, tenantId) {
  const doc = getDoctorById(doctorId, tenantId);
  return doc ? (doc.displayName || doc.name) : '';
}
