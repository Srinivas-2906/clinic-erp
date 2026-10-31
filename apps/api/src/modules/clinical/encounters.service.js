import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { getPatientById } from '../../services/clinicStore.js';
import { assertDoctorBelongsToTenant, getDoctorById } from '../providers/doctors.service.js';
import { logAudit } from '../../services/clinicAudit.js';
import { requireClinician, resolveClinicianDoctorId } from './clinicalPermissions.js';
import { assertCapability, canStartConsultation, canManageAppointments } from '../identity/rolePolicy.js';
import { buildPrescriptionPdfBuffer } from './prescriptionPdf.js';
import { saveBinaryUpload, deleteBinaryUpload } from '../../services/uploads.js';
import { enqueueReminder } from '../../services/reminders/index.js';

function nowIso() {
  return new Date().toISOString();
}

/** @type {(() => void) | null} */
let finalizeTxnBeforeCommitForTests = null;

export function setFinalizeTxnBeforeCommitForTests(fn) {
  finalizeTxnBeforeCommitForTests = fn;
}

export function resetFinalizeTxnBeforeCommitForTests() {
  finalizeTxnBeforeCommitForTests = null;
}

function rowToEncounter(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    patientId: row.patient_id,
    doctorId: row.doctor_id,
    appointmentId: row.appointment_id || null,
    status: row.status,
    chiefComplaint: row.chief_complaint || '',
    historySummary: row.history_summary || '',
    clinicalNote: row.clinical_note || '',
    dentalChartJson: row.dental_chart_json ? JSON.parse(row.dental_chart_json) : null,
    createdBy: row.created_by,
    finalizedBy: row.finalized_by || null,
    finalizedAt: row.finalized_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function loadVitals(encounterId, tenantId) {
  return getDb().prepare(
    `SELECT * FROM encounter_vitals WHERE encounter_id = ? AND tenant_id = ? ORDER BY recorded_at ASC`,
  ).all(encounterId, tenantId).map((r) => ({
    id: r.id,
    code: r.code,
    value: r.value,
    unit: r.unit || '',
    recordedAt: r.recorded_at,
  }));
}

function loadDiagnoses(encounterId, tenantId) {
  return getDb().prepare(
    `SELECT * FROM encounter_diagnoses WHERE encounter_id = ? AND tenant_id = ? ORDER BY is_primary DESC`,
  ).all(encounterId, tenantId).map((r) => ({
    id: r.id,
    description: r.description,
    code: r.code || '',
    isPrimary: !!r.is_primary,
  }));
}

function loadPrescription(encounterId, tenantId) {
  const rx = getDb().prepare(
    `SELECT * FROM prescriptions WHERE encounter_id = ? AND tenant_id = ?`,
  ).get(encounterId, tenantId);
  if (!rx) return null;
  const items = getDb().prepare(
    `SELECT * FROM prescription_items WHERE prescription_id = ? ORDER BY sort_order ASC, drug_name ASC`,
  ).all(rx.id).map((r) => ({
    id: r.id,
    drugName: r.drug_name,
    dose: r.dose || '',
    frequency: r.frequency || '',
    duration: r.duration || '',
    instructions: r.instructions || '',
  }));
  return {
    id: rx.id,
    status: rx.status,
    pdfStorageKey: rx.pdf_storage_key || '',
    items,
  };
}

export function encounterDetail(encounterId, tenantId) {
  const row = getDb().prepare(
    `SELECT * FROM encounters WHERE id = ? AND tenant_id = ?`,
  ).get(encounterId, tenantId);
  if (!row) return null;
  const enc = rowToEncounter(row);
  enc.vitals = loadVitals(encounterId, tenantId);
  enc.diagnoses = loadDiagnoses(encounterId, tenantId);
  enc.prescription = loadPrescription(encounterId, tenantId);
  enc.doctor = getDoctorById(enc.doctorId, tenantId);
  return enc;
}

export function listEncountersForPatient(patientId, tenantId, { limit = 50 } = {}) {
  if (!getPatientById(patientId, tenantId)) return [];
  const rows = getDb().prepare(
    `SELECT * FROM encounters WHERE tenant_id = ? AND patient_id = ? ORDER BY created_at DESC LIMIT ?`,
  ).all(tenantId, patientId, limit);
  return rows.map((row) => {
    const enc = rowToEncounter(row);
    enc.prescription = loadPrescription(enc.id, tenantId);
    return enc;
  });
}

function replaceVitals(db, encounterId, tenantId, vitals) {
  db.prepare(`DELETE FROM encounter_vitals WHERE encounter_id = ? AND tenant_id = ?`).run(encounterId, tenantId);
  if (!Array.isArray(vitals)) return;
  const ins = db.prepare(`
    INSERT INTO encounter_vitals (id, tenant_id, encounter_id, code, value, unit)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const v of vitals) {
    const code = String(v.code || '').trim();
    const value = String(v.value ?? '').trim();
    if (!code || !value) continue;
    ins.run(nanoid(10), tenantId, encounterId, code, value, String(v.unit || '').trim());
  }
}

function replaceDiagnoses(db, encounterId, tenantId, diagnoses) {
  db.prepare(`DELETE FROM encounter_diagnoses WHERE encounter_id = ? AND tenant_id = ?`).run(encounterId, tenantId);
  if (!Array.isArray(diagnoses)) return;
  const ins = db.prepare(`
    INSERT INTO encounter_diagnoses (id, tenant_id, encounter_id, description, code, is_primary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const d of diagnoses) {
    const description = String(d.description || '').trim();
    if (!description) continue;
    ins.run(
      nanoid(10),
      tenantId,
      encounterId,
      description,
      String(d.code || '').trim(),
      d.isPrimary ? 1 : 0,
    );
  }
}

function upsertPrescription(db, encounterId, tenantId, items, status = 'draft') {
  let rx = db.prepare(`SELECT id FROM prescriptions WHERE encounter_id = ?`).get(encounterId);
  if (!rx) {
    const id = nanoid(12);
    db.prepare(`
      INSERT INTO prescriptions (id, tenant_id, encounter_id, status) VALUES (?, ?, ?, ?)
    `).run(id, tenantId, encounterId, status);
    rx = { id };
  } else {
    db.prepare(`UPDATE prescriptions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, rx.id);
  }
  db.prepare(`DELETE FROM prescription_items WHERE prescription_id = ?`).run(rx.id);
  if (!Array.isArray(items)) return rx.id;
  const ins = db.prepare(`
    INSERT INTO prescription_items (id, prescription_id, drug_name, dose, frequency, duration, instructions, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  items.forEach((item, i) => {
    const drugName = String(item.drugName || item.drug_name || '').trim();
    if (!drugName) return;
    ins.run(
      nanoid(10),
      rx.id,
      drugName,
      String(item.dose || '').trim(),
      String(item.frequency || '').trim(),
      String(item.duration || '').trim(),
      String(item.instructions || '').trim(),
      i,
    );
  });
  return rx.id;
}

function validatePrescriptionItems(items) {
  if (!items?.length) return;
  for (const item of items) {
    const name = String(item.drugName || item.drug_name || '').trim();
    if (!name) throw new Error('Each prescription line requires a medicine name');
    if (name.length > 200) throw new Error('Medicine name too long');
  }
}

export function createEncounter(tenantId, user, input = {}) {
  assertCapability(user, canStartConsultation, 'Not allowed to start consultations');
  const patientId = String(input.patientId || '').trim();
  if (!patientId) throw new Error('patientId required');
  const patient = getPatientById(patientId, tenantId);
  if (!patient) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }

  let doctorId = String(input.doctorId || '').trim();
  const clinicianDoctorId = resolveClinicianDoctorId(user, tenantId);
  if (!doctorId) {
    doctorId = clinicianDoctorId;
  }
  if (!doctorId) {
    const err = new Error('doctorId required (or link user to a doctor profile)');
    err.status = 400;
    throw err;
  }
  assertDoctorBelongsToTenant(doctorId, tenantId);

  let appointmentId = input.appointmentId ? String(input.appointmentId).trim() : null;
  if (appointmentId) {
    const appt = getDb().prepare(
      `SELECT id, patient_id, encounter_id FROM appointments WHERE id = ? AND tenant_id = ?`,
    ).get(appointmentId, tenantId);
    if (!appt) {
      const err = new Error('Appointment not found');
      err.status = 404;
      throw err;
    }
    if (appt.patient_id !== patientId) throw new Error('Appointment patient mismatch');
    if (appt.encounter_id) {
      const existing = encounterDetail(appt.encounter_id, tenantId);
      if (existing) return existing;
    }
  }

  const id = nanoid(12);
  const now = nowIso();
  getDb().prepare(`
    INSERT INTO encounters (
      id, tenant_id, patient_id, doctor_id, appointment_id, status,
      chief_complaint, history_summary, clinical_note, dental_chart_json,
      created_by, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    tenantId,
    patientId,
    doctorId,
    appointmentId,
    String(input.chiefComplaint || patient.chiefComplaint || '').trim(),
    String(input.historySummary || '').trim(),
    String(input.clinicalNote || '').trim(),
    input.dentalChartJson ? JSON.stringify(input.dentalChartJson) : '',
    user.sub,
    now,
    now,
  );

  if (appointmentId) {
    getDb().prepare(`UPDATE appointments SET encounter_id = ? WHERE id = ? AND tenant_id = ?`).run(id, appointmentId, tenantId);
  }

  if (input.vitals) replaceVitals(getDb(), id, tenantId, input.vitals);
  if (input.diagnoses) replaceDiagnoses(getDb(), id, tenantId, input.diagnoses);
  if (input.prescriptionItems) {
    validatePrescriptionItems(input.prescriptionItems);
    upsertPrescription(getDb(), id, tenantId, input.prescriptionItems);
  }

  logAudit(tenantId, user.sub, 'create', 'encounter', id, { patientId, appointmentId });
  return encounterDetail(id, tenantId);
}

export function updateEncounterDraft(encounterId, tenantId, user, patch = {}) {
  const row = getDb().prepare(`SELECT * FROM encounters WHERE id = ? AND tenant_id = ?`).get(encounterId, tenantId);
  if (!row) {
    const err = new Error('Encounter not found');
    err.status = 404;
    throw err;
  }
  if (row.status !== 'draft') {
    const err = new Error('Only draft encounters can be edited. Use amendment for finalized records.');
    err.status = 409;
    throw err;
  }

  const clinicianDoctorId = resolveClinicianDoctorId(user, tenantId);
  const touchesClinicalContent =
    patch.prescriptionItems !== undefined
    || patch.diagnoses !== undefined
    || patch.vitals !== undefined
    || patch.clinicalNote !== undefined;
  if (touchesClinicalContent) {
    requireClinician(user, tenantId);
    if (row.doctor_id !== clinicianDoctorId) {
      const err = new Error('You can only edit consultations assigned to your doctor profile');
      err.status = 403;
      throw err;
    }
  }

  const fields = [];
  const values = [];
  if (patch.chiefComplaint !== undefined) {
    fields.push('chief_complaint = ?');
    values.push(String(patch.chiefComplaint || '').trim());
  }
  if (patch.historySummary !== undefined) {
    fields.push('history_summary = ?');
    values.push(String(patch.historySummary || '').trim());
  }
  if (patch.clinicalNote !== undefined) {
    fields.push('clinical_note = ?');
    values.push(String(patch.clinicalNote || '').trim());
  }
  if (patch.dentalChartJson !== undefined) {
    fields.push('dental_chart_json = ?');
    values.push(patch.dentalChartJson ? JSON.stringify(patch.dentalChartJson) : '');
  }
  if (fields.length) {
    fields.push(`updated_at = ?`);
    values.push(nowIso());
    values.push(encounterId, tenantId);
    getDb().prepare(`UPDATE encounters SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...values);
  }

  if (patch.vitals !== undefined) replaceVitals(getDb(), encounterId, tenantId, patch.vitals);
  if (patch.diagnoses !== undefined) replaceDiagnoses(getDb(), encounterId, tenantId, patch.diagnoses);
  if (patch.prescriptionItems !== undefined) {
    validatePrescriptionItems(patch.prescriptionItems);
    upsertPrescription(getDb(), encounterId, tenantId, patch.prescriptionItems);
  }

  logAudit(tenantId, user.sub, 'update', 'encounter', encounterId, {});
  return encounterDetail(encounterId, tenantId);
}

export async function finalizeEncounter(encounterId, tenantId, user) {
  requireClinician(user, tenantId);
  const row = getDb().prepare(`SELECT * FROM encounters WHERE id = ? AND tenant_id = ?`).get(encounterId, tenantId);
  if (!row) {
    const err = new Error('Encounter not found');
    err.status = 404;
    throw err;
  }
  if (row.status === 'finalized') {
    const err = new Error('Encounter already finalized');
    err.status = 409;
    throw err;
  }

  const clinicianDoctorId = resolveClinicianDoctorId(user, tenantId);
  if (row.doctor_id !== clinicianDoctorId) {
    const err = new Error('Only the assigned clinician can finalize this consultation');
    err.status = 403;
    throw err;
  }

  const detail = encounterDetail(encounterId, tenantId);
  const patient = getPatientById(row.patient_id, tenantId);
  const doctor = getDoctorById(row.doctor_id, tenantId);
  const tenant = getDb().prepare(`SELECT name, settings FROM tenants WHERE id = ?`).get(tenantId);

  let pdfFileName = '';
  if (detail.prescription?.items?.length) {
    const pdfBuffer = await buildPrescriptionPdfBuffer({
      clinicName: tenant?.name || 'Clinic',
      patient,
      doctor,
      encounter: { ...detail, finalizedAt: nowIso() },
      items: detail.prescription.items,
    });
    const saved = await saveBinaryUpload(tenantId, {
      buffer: pdfBuffer,
      contentType: 'application/pdf',
      prefix: 'prescription-pdf',
    });
    pdfFileName = saved.fileName;
  }

  const now = nowIso();
  const db = getDb();
  try {
    db.transaction(() => {
      const info = db.prepare(`
        UPDATE encounters SET status = 'finalized', finalized_by = ?, finalized_at = ?, updated_at = ?
        WHERE id = ? AND tenant_id = ? AND status = 'draft'
      `).run(user.sub, now, now, encounterId, tenantId);
      if (info.changes === 0) {
        const err = new Error('Encounter already finalized');
        err.status = 409;
        throw err;
      }

      if (detail.prescription?.items?.length) {
        upsertPrescription(db, encounterId, tenantId, detail.prescription.items, 'finalized');
        if (pdfFileName) {
          db.prepare(`
            UPDATE prescriptions SET pdf_storage_key = ?, updated_at = datetime('now')
            WHERE encounter_id = ? AND tenant_id = ?
          `).run(pdfFileName, encounterId, tenantId);
        }
      }

      if (row.appointment_id) {
        db.prepare(`UPDATE appointments SET status = 'visited' WHERE id = ? AND tenant_id = ?`).run(row.appointment_id, tenantId);
      }

      if (finalizeTxnBeforeCommitForTests) finalizeTxnBeforeCommitForTests();
    })();
  } catch (err) {
    if (pdfFileName) {
      try {
        await deleteBinaryUpload(tenantId, pdfFileName);
      } catch {
        /* best-effort orphan cleanup */
      }
    }
    throw err;
  }

  logAudit(tenantId, user.sub, 'finalize', 'encounter', encounterId, {});
  return encounterDetail(encounterId, tenantId);
}

export async function regeneratePrescriptionPdf(encounterId, tenantId, user) {
  requireClinician(user, tenantId);
  const row = getDb().prepare(`SELECT * FROM encounters WHERE id = ? AND tenant_id = ?`).get(encounterId, tenantId);
  if (!row) {
    const err = new Error('Encounter not found');
    err.status = 404;
    throw err;
  }
  if (row.status !== 'finalized') {
    const err = new Error('Prescription PDF can only be regenerated for finalized consultations');
    err.status = 409;
    throw err;
  }

  const detail = encounterDetail(encounterId, tenantId);
  if (!detail.prescription?.items?.length) {
    const err = new Error('No prescription lines to render');
    err.status = 400;
    throw err;
  }

  const patient = getPatientById(row.patient_id, tenantId);
  const doctor = getDoctorById(row.doctor_id, tenantId);
  const tenant = getDb().prepare(`SELECT name, settings FROM tenants WHERE id = ?`).get(tenantId);

  const pdfBuffer = await buildPrescriptionPdfBuffer({
    clinicName: tenant?.name || 'Clinic',
    patient,
    doctor,
    encounter: detail,
    items: detail.prescription.items,
  });
  const saved = await saveBinaryUpload(tenantId, {
    buffer: pdfBuffer,
    contentType: 'application/pdf',
    prefix: 'prescription-pdf',
  });

  const previousKey = detail.prescription.pdfStorageKey;
  getDb().prepare(`
    UPDATE prescriptions SET pdf_storage_key = ?, updated_at = datetime('now')
    WHERE encounter_id = ? AND tenant_id = ?
  `).run(saved.fileName, encounterId, tenantId);

  if (previousKey && previousKey !== saved.fileName) {
    const prevName = previousKey.includes('/') ? previousKey.split('/').pop() : previousKey;
    try {
      await deleteBinaryUpload(tenantId, prevName);
    } catch {
      /* ignore stale object cleanup failures */
    }
  }

  logAudit(tenantId, user.sub, 'regenerate_pdf', 'encounter', encounterId, {});
  return encounterDetail(encounterId, tenantId);
}

export function amendFinalizedEncounter(encounterId, tenantId, user, { reason, patch = {} } = {}) {
  requireClinician(user, tenantId);
  const trimmedReason = String(reason || '').trim();
  if (trimmedReason.length < 8) throw new Error('Amendment reason required (min 8 characters)');

  const before = encounterDetail(encounterId, tenantId);
  if (!before) {
    const err = new Error('Encounter not found');
    err.status = 404;
    throw err;
  }
  if (before.status !== 'finalized') throw new Error('Amendments apply to finalized records only');

  const allowed = {};
  if (patch.clinicalNote !== undefined) allowed.clinicalNote = String(patch.clinicalNote || '').trim();
  if (patch.historySummary !== undefined) allowed.historySummary = String(patch.historySummary || '').trim();
  if (Object.keys(allowed).length === 0) throw new Error('No permitted fields to amend');

  getDb().prepare(`
    INSERT INTO record_amendments (id, tenant_id, entity_type, entity_id, reason, before_json, after_json, author_id)
    VALUES (?, ?, 'encounter', ?, ?, ?, ?, ?)
  `).run(
    nanoid(12),
    tenantId,
    encounterId,
    trimmedReason,
    JSON.stringify({ clinicalNote: before.clinicalNote, historySummary: before.historySummary }),
    JSON.stringify(allowed),
    user.sub,
  );

  const sets = [];
  const vals = [];
  if (allowed.clinicalNote !== undefined) {
    sets.push('clinical_note = ?');
    vals.push(allowed.clinicalNote);
  }
  if (allowed.historySummary !== undefined) {
    sets.push('history_summary = ?');
    vals.push(allowed.historySummary);
  }
  sets.push('updated_at = ?');
  vals.push(nowIso(), encounterId, tenantId);
  getDb().prepare(`UPDATE encounters SET ${sets.join(', ')} WHERE id = ? AND tenant_id = ?`).run(...vals);

  logAudit(tenantId, user.sub, 'amend', 'encounter', encounterId, { reason: trimmedReason });
  return encounterDetail(encounterId, tenantId);
}

export function scheduleFollowUp(encounterId, tenantId, user, { dueDate, instructions, phone } = {}) {
  const enc = encounterDetail(encounterId, tenantId);
  if (!enc) {
    const err = new Error('Encounter not found');
    err.status = 404;
    throw err;
  }
  if (enc.status !== 'finalized') throw new Error('Finalize consultation before scheduling follow-up');

  const due = String(dueDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error('dueDate must be YYYY-MM-DD');

  const existing = getDb().prepare(
    `SELECT id, reminder_job_id, instructions FROM follow_ups WHERE tenant_id = ? AND encounter_id = ? AND due_date = ? LIMIT 1`,
  ).get(tenantId, encounterId, due);
  if (existing) {
    return {
      id: existing.id,
      encounterId,
      dueDate: due,
      instructions: existing.instructions || '',
      reminderJobId: existing.reminder_job_id,
      idempotentReplay: true,
    };
  }

  const patient = getPatientById(enc.patientId, tenantId);
  const recipient = String(phone || patient?.phone || '').trim();
  const followUpId = nanoid(12);
  const scheduledAt = `${due}T09:00:00.000Z`;

  let reminderJobId = null;
  if (recipient) {
    reminderJobId = enqueueReminder({
      tenantId,
      appointmentId: enc.appointmentId,
      kind: 'follow_up',
      recipient,
      scheduledAt,
      payload: { encounterId, patientId: enc.patientId, instructions: String(instructions || '').trim() },
    });
    if (reminderJobId) {
      getDb().prepare(`UPDATE reminder_jobs SET follow_up_id = ? WHERE id = ?`).run(followUpId, reminderJobId);
    }
  }

  getDb().prepare(`
    INSERT INTO follow_ups (id, tenant_id, encounter_id, patient_id, due_date, instructions, reminder_job_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    followUpId,
    tenantId,
    encounterId,
    enc.patientId,
    due,
    String(instructions || '').trim(),
    reminderJobId,
  );

  logAudit(tenantId, user.sub, 'create', 'follow_up', followUpId, { encounterId, dueDate: due });
  return {
    id: followUpId,
    encounterId,
    dueDate: due,
    instructions: String(instructions || '').trim(),
    reminderJobId,
    status: 'pending',
  };
}

function mapFollowUpRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    encounterId: row.encounter_id,
    patientId: row.patient_id,
    dueDate: row.due_date,
    instructions: row.instructions || '',
    status: row.status || 'pending',
    scheduledAppointmentId: row.scheduled_appointment_id || null,
    createdAt: row.created_at,
    patientName: row.patient_name || '',
    patientPhone: row.patient_phone || '',
    chiefComplaint: row.chief_complaint || '',
    encounterFinalizedAt: row.finalized_at || null,
    scheduledAt: row.scheduled_at || null,
    appointmentStatus: row.appointment_status || null,
  };
}

export function listClinicFollowUps(tenantId, { status = 'pending', patientId, limit = 100 } = {}) {
  let sql = `
    SELECT fu.*, p.name AS patient_name, p.phone AS patient_phone,
      e.chief_complaint, e.finalized_at,
      a.scheduled_at, a.status AS appointment_status
    FROM follow_ups fu
    JOIN patients p ON p.id = fu.patient_id AND p.tenant_id = fu.tenant_id
    JOIN encounters e ON e.id = fu.encounter_id AND e.tenant_id = fu.tenant_id
    LEFT JOIN appointments a ON a.id = fu.scheduled_appointment_id AND a.tenant_id = fu.tenant_id
    WHERE fu.tenant_id = ?
  `;
  const params = [tenantId];
  if (patientId) {
    sql += ' AND fu.patient_id = ?';
    params.push(patientId);
  }
  if (status === 'pending') {
    sql += ` AND fu.status = 'pending'`;
  } else if (status === 'scheduled') {
    sql += ` AND fu.status = 'scheduled' AND (a.status IS NULL OR a.status NOT IN ('cancelled', 'no_show'))`;
  } else if (status !== 'all') {
    sql += ' AND fu.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY fu.due_date ASC, fu.created_at ASC LIMIT ?';
  params.push(limit);
  return getDb().prepare(sql).all(...params).map(mapFollowUpRow);
}

export function linkFollowUpToAppointment(followUpId, tenantId, user, appointmentId) {
  assertCapability(user, canManageAppointments, 'Front desk access required to schedule follow-ups');
  const fu = getDb().prepare(
    `SELECT * FROM follow_ups WHERE id = ? AND tenant_id = ?`,
  ).get(followUpId, tenantId);
  if (!fu) {
    const err = new Error('Follow-up not found');
    err.status = 404;
    throw err;
  }
  if (fu.status === 'cancelled') throw new Error('Follow-up is cancelled');
  const appt = getDb().prepare(
    `SELECT id, patient_id, status, scheduled_at FROM appointments WHERE id = ? AND tenant_id = ?`,
  ).get(appointmentId, tenantId);
  if (!appt) {
    const err = new Error('Appointment not found');
    err.status = 404;
    throw err;
  }
  if (appt.patient_id !== fu.patient_id) throw new Error('Appointment must be for the same patient');
  if (appt.status === 'cancelled' || appt.status === 'no_show') {
    throw new Error('Cannot link to a cancelled appointment');
  }
  if (fu.scheduled_appointment_id === appointmentId && fu.status === 'scheduled') {
    return mapFollowUpRow(getDb().prepare(`
      SELECT fu.*, p.name AS patient_name, p.phone AS patient_phone,
        e.chief_complaint, e.finalized_at, a.scheduled_at, a.status AS appointment_status
      FROM follow_ups fu
      JOIN patients p ON p.id = fu.patient_id AND p.tenant_id = fu.tenant_id
      JOIN encounters e ON e.id = fu.encounter_id AND e.tenant_id = fu.tenant_id
      LEFT JOIN appointments a ON a.id = fu.scheduled_appointment_id AND a.tenant_id = fu.tenant_id
      WHERE fu.id = ? AND fu.tenant_id = ?
    `).get(followUpId, tenantId));
  }
  getDb().prepare(`
    UPDATE follow_ups SET status = 'scheduled', scheduled_appointment_id = ? WHERE id = ? AND tenant_id = ?
  `).run(appointmentId, followUpId, tenantId);
  logAudit(tenantId, user.sub, 'update', 'follow_up', followUpId, { appointmentId, action: 'link_appointment' });
  return mapFollowUpRow(getDb().prepare(`
    SELECT fu.*, p.name AS patient_name, p.phone AS patient_phone,
      e.chief_complaint, e.finalized_at, a.scheduled_at, a.status AS appointment_status
    FROM follow_ups fu
    JOIN patients p ON p.id = fu.patient_id AND p.tenant_id = fu.tenant_id
    JOIN encounters e ON e.id = fu.encounter_id AND e.tenant_id = fu.tenant_id
    LEFT JOIN appointments a ON a.id = fu.scheduled_appointment_id AND a.tenant_id = fu.tenant_id
    WHERE fu.id = ? AND fu.tenant_id = ?
  `).get(followUpId, tenantId));
}

export function listPatientAllergies(patientId, tenantId) {
  return getDb().prepare(
    `SELECT * FROM patient_allergies WHERE tenant_id = ? AND patient_id = ? ORDER BY substance ASC`,
  ).all(tenantId, patientId).map((r) => ({
    id: r.id,
    substance: r.substance,
    severity: r.severity || '',
    notes: r.notes || '',
    createdAt: r.created_at,
  }));
}

export function addPatientAllergy(patientId, tenantId, user, data = {}) {
  const substance = String(data.substance || '').trim();
  if (!substance) throw new Error('substance required');
  if (!getPatientById(patientId, tenantId)) {
    const err = new Error('Patient not found');
    err.status = 404;
    throw err;
  }
  const id = nanoid(10);
  getDb().prepare(`
    INSERT INTO patient_allergies (id, tenant_id, patient_id, substance, severity, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, tenantId, patientId, substance, String(data.severity || '').trim(), String(data.notes || '').trim());
  logAudit(tenantId, user.sub, 'create', 'patient_allergy', id, { patientId, substance });
  return { id, substance, severity: data.severity || '', notes: data.notes || '' };
}

export function updatePatientAllergy(allergyId, patientId, tenantId, user, data = {}) {
  const row = getDb().prepare(
    `SELECT * FROM patient_allergies WHERE id = ? AND tenant_id = ? AND patient_id = ?`,
  ).get(allergyId, tenantId, patientId);
  if (!row) {
    const err = new Error('Allergy not found');
    err.status = 404;
    throw err;
  }
  const substance = data.substance !== undefined ? String(data.substance || '').trim() : row.substance;
  if (!substance) throw new Error('substance required');
  getDb().prepare(`
    UPDATE patient_allergies SET substance = ?, severity = ?, notes = ? WHERE id = ? AND tenant_id = ?
  `).run(
    substance,
    data.severity !== undefined ? String(data.severity || '').trim() : (row.severity || ''),
    data.notes !== undefined ? String(data.notes || '').trim() : (row.notes || ''),
    allergyId,
    tenantId,
  );
  logAudit(tenantId, user.sub, 'update', 'patient_allergy', allergyId, { patientId, substance });
  return {
    id: allergyId,
    substance,
    severity: data.severity !== undefined ? String(data.severity || '').trim() : (row.severity || ''),
    notes: data.notes !== undefined ? String(data.notes || '').trim() : (row.notes || ''),
  };
}

export function deletePatientAllergy(allergyId, patientId, tenantId, user) {
  const row = getDb().prepare(
    `SELECT * FROM patient_allergies WHERE id = ? AND tenant_id = ? AND patient_id = ?`,
  ).get(allergyId, tenantId, patientId);
  if (!row) {
    const err = new Error('Allergy not found');
    err.status = 404;
    throw err;
  }
  getDb().prepare(`DELETE FROM patient_allergies WHERE id = ? AND tenant_id = ?`).run(allergyId, tenantId);
  logAudit(tenantId, user.sub, 'delete', 'patient_allergy', allergyId, { patientId, substance: row.substance });
  return { ok: true };
}
