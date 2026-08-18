import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import {
  assertDoctorBelongsToTenant,
  getDefaultDoctorId,
  resolveDoctorDisplayName,
} from '../modules/providers/doctors.service.js';
import {
  getAvailableSlots as computeAvailableSlots,
  formatSlotLabel,
} from '../modules/scheduling/slotEngine.js';

function scheduleAppointmentReminders() {}
function scheduleRecallReminder() {}
function clearAppointmentReminders() {}

function formatPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 11 && digits.startsWith('91')) {
    return `+${digits.slice(0, 2)} ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  if (digits.length === 10) return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  return phone ? `+${digits}` : '';
}

function phoneDigits(phone) {
  return String(phone).replace(/\D/g, '');
}

function rowToPatient(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    phone: row.phone,
    phoneDigits: row.phone_digits,
    email: row.email || '',
    age: row.age,
    gender: row.gender || '',
    chiefComplaint: row.chief_complaint || '',
    isReturning: !!row.is_returning,
    tags: JSON.parse(row.tags || '[]'),
    notes: JSON.parse(row.notes || '[]'),
    lastVisit: row.last_visit,
    source: row.source || 'WhatsApp',
    conversationId: row.conversation_id,
    photoUrl: row.photo_url || '',
    prescriptionUrl: row.prescription_url || '',
    recordUrls: (() => {
      try {
        const arr = JSON.parse(row.record_urls || '[]');
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
      } catch {
        return [];
      }
    })(),
    totalPaid: row.total_paid != null ? Number(row.total_paid) : 0,
    lastPaymentAmount: row.last_payment_amount != null ? Number(row.last_payment_amount) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToAppointment(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    patientName: row.patient_name,
    patientPhone: row.patient_phone,
    service: row.service || '',
    serviceId: row.service_id,
    scheduledAt: row.scheduled_at,
    durationMin: row.duration_min ?? 30,
    status: row.status,
    assignedDoctor: row.assigned_doctor || row.doctor_display_name || '',
    assignedDoctorId: row.assigned_doctor_id || null,
    notes: row.notes || '',
    source: row.source || 'WhatsApp',
    paymentAmount: row.payment_amount != null ? Number(row.payment_amount) : null,
    paymentMethod: row.payment_method || '',
    reminderSent: !!row.reminder_sent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Morning 10–2 and evening 5–9 (end hour exclusive in slot loop). */
const DEFAULT_SESSIONS = [
  { start: 10, end: 15, slotMin: 30 },
  { start: 17, end: 22, slotMin: 30 },
];

const DEFAULT_HOURS = { start: 10, end: 19, slotMin: 30 };

export function getClinicSessions(tenantId) {
  const row = getDb().prepare('SELECT settings FROM tenants WHERE id = ?').get(tenantId);
  if (row) {
    try {
      const s = JSON.parse(row.settings || '{}');
      if (Array.isArray(s.clinicSessions) && s.clinicSessions.length) {
        return s.clinicSessions.map((session) => ({
          start: session.start ?? DEFAULT_SESSIONS[0].start,
          end: session.end ?? DEFAULT_SESSIONS[0].end,
          slotMin: session.slotMin ?? 30,
        }));
      }
    } catch {
      /* use defaults */
    }
  }
  return DEFAULT_SESSIONS;
}

export function getClinicHours(tenantId) {
  const sessions = getClinicSessions(tenantId);
  return sessions[0] ?? DEFAULT_HOURS;
}

export function getOrCreatePatient({ phone, name, tenantId, source = 'WhatsApp', chiefComplaint, age, conversationId }) {
  const db = getDb();
  const digits = phoneDigits(phone);
  let row = db.prepare('SELECT * FROM patients WHERE tenant_id = ? AND phone_digits = ?').get(tenantId, digits);
  if (row) {
    const updates = [];
    const vals = [];
    if (name && name !== 'WhatsApp User' && name !== 'WhatsApp Lead') {
      updates.push('name = ?');
      vals.push(name);
    }
    if (chiefComplaint) {
      updates.push('chief_complaint = ?');
      vals.push(chiefComplaint);
    }
    if (age != null) {
      updates.push('age = ?');
      vals.push(age);
    }
    if (conversationId) {
      updates.push('conversation_id = ?');
      vals.push(conversationId);
    }
    if (updates.length) {
      updates.push("updated_at = datetime('now')");
      vals.push(row.id);
      db.prepare(`UPDATE patients SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
      row = db.prepare('SELECT * FROM patients WHERE id = ?').get(row.id);
    }
    return rowToPatient(row);
  }

  const id = nanoid(12);
  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits, chief_complaint, age, source, conversation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    name || 'New Patient',
    formatPhone(phone),
    digits,
    chiefComplaint || '',
    age ?? null,
    source,
    conversationId || null,
  );
  row = db.prepare('SELECT * FROM patients WHERE id = ?').get(id);
  return rowToPatient(row);
}

export function createPatient(tenantId, data) {
  const digits = phoneDigits(data.phone);
  if (!digits) throw new Error('Phone required');
  const existing = getDb().prepare('SELECT id FROM patients WHERE tenant_id = ? AND phone_digits = ?').get(tenantId, digits);
  if (existing) return updatePatient(existing.id, tenantId, data);

  const id = nanoid(12);
  getDb().prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits, email, age, gender, chief_complaint, is_returning, tags, notes, source, photo_url, prescription_url, record_urls)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    data.name || 'Patient',
    formatPhone(data.phone),
    digits,
    data.email || '',
    data.age ?? null,
    data.gender || '',
    data.chiefComplaint || '',
    data.isReturning ? 1 : 0,
    JSON.stringify(data.tags || []),
    JSON.stringify(data.notes || []),
    data.source || 'Walk-in',
    data.photoUrl || '',
    data.prescriptionUrl || '',
    JSON.stringify(Array.isArray(data.recordUrls) ? data.recordUrls : []),
  );
  return rowToPatient(getDb().prepare('SELECT * FROM patients WHERE id = ?').get(id));
}

export function updatePatient(id, tenantId, patch) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM patients WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!row) return null;

  const fields = [];
  const values = [];
  const map = {
    name: 'name',
    email: 'email',
    age: 'age',
    gender: 'gender',
    chiefComplaint: 'chief_complaint',
    isReturning: 'is_returning',
    lastVisit: 'last_visit',
    source: 'source',
    photoUrl: 'photo_url',
    prescriptionUrl: 'prescription_url',
    recordUrls: 'record_urls',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      fields.push(`${col} = ?`);
      if (k === 'isReturning') values.push(patch[k] ? 1 : 0);
      else if (k === 'recordUrls') values.push(JSON.stringify(Array.isArray(patch[k]) ? patch[k] : []));
      else values.push(patch[k]);
    }
  }
  if (patch.phone) {
    fields.push('phone = ?', 'phone_digits = ?');
    values.push(formatPhone(patch.phone), phoneDigits(patch.phone));
  }
  if (patch.tags) {
    fields.push('tags = ?');
    values.push(JSON.stringify(patch.tags));
  }
  if (patch.notes) {
    fields.push('notes = ?');
    values.push(JSON.stringify(patch.notes));
  }
  if (patch.note) {
    const notes = JSON.parse(row.notes || '[]');
    notes.unshift({ text: patch.note, at: new Date().toISOString(), by: patch.by || 'Staff' });
    fields.push('notes = ?');
    values.push(JSON.stringify(notes.slice(0, 50)));
  }

  if (fields.length) {
    fields.push("updated_at = datetime('now')");
    values.push(id, tenantId);
    db.prepare(`UPDATE patients SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...values);
  }
  return rowToPatient(db.prepare('SELECT * FROM patients WHERE id = ?').get(id));
}

export function getPatients(tenantId, { search, limit = 100 } = {}) {
  let sql = `
    SELECT p.*,
      (SELECT COALESCE(SUM(pp.amount), 0) FROM patient_payments pp
        WHERE pp.patient_id = p.id AND pp.tenant_id = p.tenant_id AND pp.status = 'paid') AS total_paid,
      (SELECT pp.amount FROM patient_payments pp
        WHERE pp.patient_id = p.id AND pp.tenant_id = p.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS last_payment_amount
    FROM patients p
    WHERE p.tenant_id = ?
  `;
  const params = [tenantId];
  if (search) {
    const q = `%${search.trim()}%`;
    sql += ` AND (
      p.name LIKE ? OR p.phone LIKE ? OR p.phone_digits LIKE ?
      OR p.email LIKE ? OR p.chief_complaint LIKE ? OR p.gender LIKE ?
      OR p.source LIKE ? OR p.tags LIKE ? OR p.notes LIKE ?
      OR CAST(p.age AS TEXT) LIKE ?
    )`;
    params.push(q, q, q, q, q, q, q, q, q, q);
  }
  sql += ' ORDER BY p.updated_at DESC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(rowToPatient);
}

export function getPatientById(id, tenantId) {
  const row = getDb().prepare(`
    SELECT p.*,
      (SELECT COALESCE(SUM(pp.amount), 0) FROM patient_payments pp
        WHERE pp.patient_id = p.id AND pp.tenant_id = p.tenant_id AND pp.status = 'paid') AS total_paid,
      (SELECT pp.amount FROM patient_payments pp
        WHERE pp.patient_id = p.id AND pp.tenant_id = p.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS last_payment_amount
    FROM patients p
    WHERE p.id = ? AND p.tenant_id = ?
  `).get(id, tenantId);
  return rowToPatient(row);
}

export function getPatientByPhone(phone, tenantId) {
  const digits = phoneDigits(phone);
  const row = getDb().prepare('SELECT * FROM patients WHERE tenant_id = ? AND phone_digits = ?').get(tenantId, digits);
  return rowToPatient(row);
}

export function createAppointment(tenantId, data) {
  const db = getDb();
  let patient = data.patientId
    ? getPatientById(data.patientId, tenantId)
    : data.phone
      ? getOrCreatePatient({ phone: data.phone, name: data.patientName, tenantId, source: data.source || 'WhatsApp', chiefComplaint: data.service })
      : null;

  if (!patient && data.patientName) {
    patient = createPatient(tenantId, { name: data.patientName, phone: data.phone || '', source: data.source || 'Walk-in' });
  }
  if (!patient) throw new Error('Patient required');

  const id = nanoid(12);
  const status = data.status || 'requested';

  let assignedDoctorId = data.assignedDoctorId || null;
  if (assignedDoctorId) {
    assertDoctorBelongsToTenant(assignedDoctorId, tenantId);
  } else {
    assignedDoctorId = getDefaultDoctorId(tenantId);
  }
  const assignedDoctor = assignedDoctorId
    ? resolveDoctorDisplayName(assignedDoctorId, tenantId)
    : (data.assignedDoctor || '');

  db.prepare(`
    INSERT INTO appointments (
      id, tenant_id, patient_id, service, service_id, scheduled_at, duration_min,
      status, assigned_doctor, assigned_doctor_id, notes, source
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    patient.id,
    data.service || '',
    data.serviceId || null,
    data.scheduledAt,
    data.durationMin ?? 30,
    status,
    assignedDoctor,
    assignedDoctorId,
    data.notes || '',
    data.source || 'WhatsApp',
  );

  db.prepare("UPDATE patients SET updated_at = datetime('now') WHERE id = ?").run(patient.id);
  const appt = getAppointmentById(id, tenantId);
  scheduleAppointmentReminders(tenantId, id);
  return appt;
}

export function getAppointmentById(id, tenantId) {
  const row = getDb().prepare(`
    SELECT a.*, p.name AS patient_name, p.phone AS patient_phone
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.id = ? AND a.tenant_id = ?
  `).get(id, tenantId);
  return rowToAppointment(row);
}

export function updateAppointment(id, tenantId, patch) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM appointments WHERE id = ? AND tenant_id = ?').get(id, tenantId);
  if (!existing) return null;

  const fields = [];
  const values = [];
  const map = {
    scheduledAt: 'scheduled_at',
    status: 'status',
    service: 'service',
    assignedDoctor: 'assigned_doctor',
    assignedDoctorId: 'assigned_doctor_id',
    notes: 'notes',
    durationMin: 'duration_min',
    reminderSent: 'reminder_sent',
  };
  for (const [k, col] of Object.entries(map)) {
    if (patch[k] !== undefined) {
      if (k === 'assignedDoctorId' && patch[k]) {
        assertDoctorBelongsToTenant(patch[k], tenantId);
        const displayName = resolveDoctorDisplayName(patch[k], tenantId);
        fields.push('assigned_doctor_id = ?');
        values.push(patch[k]);
        fields.push('assigned_doctor = ?');
        values.push(displayName);
        continue;
      }
      fields.push(`${col} = ?`);
      values.push(k === 'reminderSent' ? (patch[k] ? 1 : 0) : patch[k]);
    }
  }

  if (fields.length) {
    fields.push("updated_at = datetime('now')");
    values.push(id, tenantId);
    db.prepare(`UPDATE appointments SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...values);
  }

  if (patch.status === 'visited') {
    db.prepare("UPDATE patients SET last_visit = datetime('now'), is_returning = 1, updated_at = datetime('now') WHERE id = ?").run(existing.patient_id);
    const patient = db.prepare('SELECT name FROM patients WHERE id = ?').get(existing.patient_id);
    scheduleRecallReminder(tenantId, existing.patient_id, patient?.name || 'Patient');
  }

  if (patch.status === 'confirmed' || patch.scheduledAt) {
    scheduleAppointmentReminders(tenantId, id);
  }

  return getAppointmentById(id, tenantId);
}

export function getAppointments(tenantId, { date, status, patientId, limit = 200 } = {}) {
  let sql = `
    SELECT a.*, p.name AS patient_name, p.phone AS patient_phone,
      (SELECT pp.amount FROM patient_payments pp
        WHERE pp.appointment_id = a.id AND pp.tenant_id = a.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS payment_amount,
      (SELECT pp.method FROM patient_payments pp
        WHERE pp.appointment_id = a.id AND pp.tenant_id = a.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS payment_method
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.tenant_id = ?
  `;
  const params = [tenantId];
  if (date) {
    sql += ' AND date(a.scheduled_at) = date(?)';
    params.push(date);
  }
  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  if (patientId) {
    sql += ' AND a.patient_id = ?';
    params.push(patientId);
  }
  sql += ' ORDER BY a.scheduled_at ASC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(rowToAppointment);
}

export function getAppointmentsRange(tenantId, { from, to, status, patientId, limit = 1500 } = {}) {
  let sql = `
    SELECT a.*, p.name AS patient_name, p.phone AS patient_phone,
      (SELECT pp.amount FROM patient_payments pp
        WHERE pp.appointment_id = a.id AND pp.tenant_id = a.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS payment_amount,
      (SELECT pp.method FROM patient_payments pp
        WHERE pp.appointment_id = a.id AND pp.tenant_id = a.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS payment_method
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.tenant_id = ?
  `;
  const params = [tenantId];
  if (from) {
    sql += ' AND date(a.scheduled_at) >= date(?)';
    params.push(from);
  }
  if (to) {
    sql += ' AND date(a.scheduled_at) <= date(?)';
    params.push(to);
  }
  if (status) {
    sql += ' AND a.status = ?';
    params.push(status);
  }
  if (patientId) {
    sql += ' AND a.patient_id = ?';
    params.push(patientId);
  }
  sql += ' ORDER BY a.scheduled_at ASC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(rowToAppointment);
}

function clinicTodayDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export function getTodayStats(tenantId) {
  const today = clinicTodayDate();
  const db = getDb();
  const appointments = getAppointments(tenantId, { date: today });
  const upcomingLater = getDb().prepare(`
    SELECT a.*, p.name AS patient_name, p.phone AS patient_phone,
      (SELECT pp.amount FROM patient_payments pp
        WHERE pp.appointment_id = a.id AND pp.tenant_id = a.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS payment_amount,
      (SELECT pp.method FROM patient_payments pp
        WHERE pp.appointment_id = a.id AND pp.tenant_id = a.tenant_id
        ORDER BY pp.created_at DESC LIMIT 1) AS payment_method
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    WHERE a.tenant_id = ?
      AND date(a.scheduled_at) > date(?)
      AND a.status NOT IN ('visited', 'cancelled', 'no_show')
    ORDER BY a.scheduled_at ASC
    LIMIT 30
  `).all(tenantId, today).map(rowToAppointment);
  const pendingRequests = upcomingLater.filter((a) => a.status === 'requested');

  const unconfirmedToday = appointments.filter((a) => a.status === 'requested').length;
  const confirmed = appointments.filter((a) => a.status === 'confirmed').length;
  const arrived = appointments.filter((a) => ['arrived', 'visited'].includes(a.status)).length;
  const totalPatients = db.prepare('SELECT COUNT(*) AS c FROM patients WHERE tenant_id = ?').get(tenantId)?.c ?? 0;
  return {
    date: today,
    total: appointments.length,
    unconfirmedToday,
    unconfirmed: unconfirmedToday + pendingRequests.length,
    confirmed,
    arrived,
    totalPatients,
    appointments,
    pendingRequests,
    upcomingLater,
  };
}

function parseDateLabel(label) {
  const now = new Date();
  const d = new Date(now);
  if (/today/i.test(label)) return d.toISOString().slice(0, 10);
  if (/tomorrow/i.test(label)) {
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  if (/weekend|saturday/i.test(label)) {
    const day = d.getDay();
    const add = day === 6 ? 0 : 6 - day;
    d.setDate(d.getDate() + add);
    return d.toISOString().slice(0, 10);
  }
  if (/flexible/i.test(label)) {
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

function timeLabelToISO(dateStr, timeLabel) {
  const map = {
    '10:00 AM': '10:00',
    '11:00 AM': '11:00',
    '12:00 PM': '12:00',
    '2:00 PM': '14:00',
    '4:00 PM': '16:00',
    '6:00 PM': '18:00',
    Evening: '17:00',
    Morning: '10:00',
  };
  const time = map[timeLabel] || '10:00';
  return `${dateStr}T${time}:00`;
}

export function resolveScheduledAt(dateLabel, timeLabel) {
  const dateStr = parseDateLabel(dateLabel);
  return timeLabelToISO(dateStr, timeLabel);
}

export function getAvailableSlots(tenantId, dateStr, options = {}) {
  const result = computeAvailableSlots(tenantId, dateStr, options);
  if (options?.returnDetails) return result;
  return result.slots;
}

export { formatSlotLabel };

export function getPatientTimeline(patientId, tenantId) {
  const patient = getPatientById(patientId, tenantId);
  if (!patient) return null;
  const appointments = getAppointments(tenantId, { patientId });
  return { patient, appointments };
}
