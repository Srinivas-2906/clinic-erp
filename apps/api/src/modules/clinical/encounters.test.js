import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDb = path.join(__dirname, '../../../data/test-clinical.db');

process.env.DATABASE_PATH = testDb;
process.env.SKIP_DEMO_SEED = '1';
process.env.CLINIC_FILES_STORAGE = 'memory';

const { initDatabase, getDb } = await import('../../db/index.js');
const { createDoctor } = await import('../providers/doctors.service.js');
const {
  createMemoryUploadStorage,
  setUploadStorageBackendForTests,
  resetUploadStorageBackendForTests,
} = await import('../../services/uploadStorage.js');
const {
  createEncounter,
  updateEncounterDraft,
  finalizeEncounter,
  regeneratePrescriptionPdf,
  encounterDetail,
  listEncountersForPatient,
  scheduleFollowUp,
  amendFinalizedEncounter,
  setFinalizeTxnBeforeCommitForTests,
  resetFinalizeTxnBeforeCommitForTests,
} = await import('./encounters.service.js');

const tenantId = 'tenant-clinical-test';

function seedTenant() {
  initDatabase();
  const db = getDb();
  db.prepare(`
    INSERT OR IGNORE INTO tenants (id, slug, name, plan, status, settings)
    VALUES (?, 'clinical-test', 'Clinical Test Clinic', 'professional', 'active', '{}')
  `).run(tenantId);

  const ownerId = 'owner-clinical';
  const clinicianId = 'user-clinician';
  const hash = bcrypt.hashSync('test', 4);
  db.prepare(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, 'owner@test.com', ?, 'Owner', 'owner', 0)
  `).run(ownerId, tenantId, hash);
  db.prepare(`
    INSERT OR REPLACE INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, 'dr@test.com', ?, 'Dr Test', 'staff', 0)
  `).run(clinicianId, tenantId, hash);

  const doc = createDoctor(
    tenantId,
    { sub: ownerId, tenantId, role: 'owner', isPlatformAdmin: false },
    { name: 'Dr Clinical' },
  );
  db.prepare(`UPDATE doctors SET user_id = ? WHERE id = ?`).run(clinicianId, doc.id);

  const patientId = 'pat-clinical-1';
  db.prepare(`
    INSERT OR REPLACE INTO patients (id, tenant_id, name, phone, phone_digits, chief_complaint)
    VALUES (?, ?, 'Test Patient', '9999999999', '9999999999', 'Tooth pain')
  `).run(patientId, tenantId);

  return { tenantId, ownerId, clinicianId, doctorId: doc.id, patientId };
}

describe('clinical encounters', () => {
  let ctx;
  /** @type {ReturnType<typeof createMemoryUploadStorage>} */
  let memoryStorage;

  before(() => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
    ctx = seedTenant();
    memoryStorage = createMemoryUploadStorage();
    setUploadStorageBackendForTests(memoryStorage);
  });

  beforeEach(() => {
    resetFinalizeTxnBeforeCommitForTests();
    memoryStorage.objects.clear();
    const db = getDb();
    db.prepare(`DELETE FROM follow_ups WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`DELETE FROM record_amendments WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`UPDATE appointments SET encounter_id = NULL WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`DELETE FROM prescription_items WHERE prescription_id IN (SELECT id FROM prescriptions WHERE tenant_id = ?)`).run(tenantId);
    db.prepare(`DELETE FROM prescriptions WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`DELETE FROM encounter_diagnoses WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`DELETE FROM encounter_vitals WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`DELETE FROM encounters WHERE tenant_id = ?`).run(tenantId);
    db.prepare(`DELETE FROM appointments WHERE tenant_id = ?`).run(tenantId);
  });

  after(() => {
    resetUploadStorageBackendForTests();
    resetFinalizeTxnBeforeCommitForTests();
    try { fs.unlinkSync(testDb); } catch { /* ignore */ }
  });

  it('owner without doctor link cannot finalize', async () => {
    const enc = createEncounter(ctx.tenantId, { sub: ctx.ownerId, tenantId: ctx.tenantId, role: 'owner' }, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      chiefComplaint: 'Pain',
    });
    assert.equal(enc.status, 'draft');
    await assert.rejects(
      () => finalizeEncounter(enc.id, ctx.tenantId, { sub: ctx.ownerId, tenantId: ctx.tenantId, role: 'owner' }),
      (err) => err.status === 403,
    );
  });

  it('does not expose encounters across tenants', () => {
    const other = listEncountersForPatient(ctx.patientId, 'other-tenant-id');
    assert.deepEqual(other, []);
    assert.equal(encounterDetail('any-id', 'other-tenant-id'), null);
  });

  it('draft save and reopen preserves clinical content', () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      chiefComplaint: 'Initial',
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      clinicalNote: 'Draft note',
      diagnoses: [{ description: 'Gingivitis', isPrimary: true }],
      prescriptionItems: [{ drugName: 'Ibuprofen', dose: '400mg' }],
    });
    const reopened = encounterDetail(enc.id, ctx.tenantId);
    assert.equal(reopened.clinicalNote, 'Draft note');
    assert.equal(reopened.diagnoses[0].description, 'Gingivitis');
    assert.equal(reopened.prescription.items[0].drugName, 'Ibuprofen');
    assert.equal(reopened.status, 'draft');
  });

  it('owner cannot edit clinician-only fields on draft', () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
    });
    assert.throws(
      () => updateEncounterDraft(enc.id, ctx.tenantId, { sub: ctx.ownerId, tenantId: ctx.tenantId, role: 'owner' }, {
        clinicalNote: 'Sneak',
      }),
      (err) => err.status === 403,
    );
    const ok = updateEncounterDraft(enc.id, ctx.tenantId, { sub: ctx.ownerId, tenantId: ctx.tenantId, role: 'owner' }, {
      chiefComplaint: 'Updated complaint',
    });
    assert.equal(ok.chiefComplaint, 'Updated complaint');
  });

  it('clinician completes draft → finalize → PDF key', async () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      clinicalNote: 'Examined. Advised oral hygiene.',
      diagnoses: [{ description: 'Dental caries', isPrimary: true }],
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg', frequency: 'BD', duration: '3 days' }],
    });
    const finalized = await finalizeEncounter(enc.id, ctx.tenantId, user);
    assert.equal(finalized.status, 'finalized');
    const detail = encounterDetail(enc.id, ctx.tenantId);
    assert.ok(detail.prescription?.pdfStorageKey);
    assert.equal(memoryStorage.objects.size, 1);
  });

  it('rejects finalize when PDF upload fails', async () => {
    setUploadStorageBackendForTests({
      async saveObject() {
        const err = new Error('Upload failed');
        err.code = 'UPLOAD_FAILED';
        throw err;
      },
      async openReadStream() {
        throw new Error('not used');
      },
      async deleteObject() {},
    });

    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
    });

    await assert.rejects(() => finalizeEncounter(enc.id, ctx.tenantId, user));
    const stillDraft = encounterDetail(enc.id, ctx.tenantId);
    assert.equal(stillDraft.status, 'draft');
    assert.equal(stillDraft.prescription.pdfStorageKey, '');

    setUploadStorageBackendForTests(memoryStorage);
  });

  it('cleans up uploaded PDF when DB transaction fails', async () => {
    setFinalizeTxnBeforeCommitForTests(() => {
      throw new Error('Simulated DB failure');
    });

    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
    });

    await assert.rejects(() => finalizeEncounter(enc.id, ctx.tenantId, user));
    assert.equal(memoryStorage.objects.size, 0);
    assert.equal(encounterDetail(enc.id, ctx.tenantId).status, 'draft');
  });

  it('regenerates prescription PDF after finalize', async () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
    });
    await finalizeEncounter(enc.id, ctx.tenantId, user);
    const firstKey = encounterDetail(enc.id, ctx.tenantId).prescription.pdfStorageKey;
    await regeneratePrescriptionPdf(enc.id, ctx.tenantId, user);
    const secondKey = encounterDetail(enc.id, ctx.tenantId).prescription.pdfStorageKey;
    assert.notEqual(firstKey, secondKey);
    assert.equal(memoryStorage.objects.size, 1);
  });

  it('duplicate follow-up requests are idempotent', async () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
    });
    await finalizeEncounter(enc.id, ctx.tenantId, user);

    const due = '2030-06-15';
    const first = scheduleFollowUp(enc.id, ctx.tenantId, user, { dueDate: due, instructions: 'Review' });
    const second = scheduleFollowUp(enc.id, ctx.tenantId, user, { dueDate: due, instructions: 'Review again' });
    assert.equal(second.id, first.id);
    assert.equal(second.idempotentReplay, true);

    const rows = getDb().prepare(
      `SELECT COUNT(*) AS c FROM follow_ups WHERE tenant_id = ? AND encounter_id = ? AND due_date = ?`,
    ).get(ctx.tenantId, enc.id, due);
    assert.equal(rows.c, 1);
  });

  it('amendment is auditable and limited to permitted fields', () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      clinicalNote: 'Original note',
    });
    updateEncounterDraft(enc.id, ctx.tenantId, user, {
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
    });
    return finalizeEncounter(enc.id, ctx.tenantId, user).then(() => {
      const amended = amendFinalizedEncounter(enc.id, ctx.tenantId, user, {
        reason: 'Corrected documentation typo',
        patch: { clinicalNote: 'Amended note' },
      });
      assert.equal(amended.clinicalNote, 'Amended note');
      const audit = getDb().prepare(
        `SELECT * FROM record_amendments WHERE entity_id = ? AND tenant_id = ?`,
      ).get(enc.id, ctx.tenantId);
      assert.ok(audit);
      assert.match(audit.reason, /Corrected/);
    });
  });

  it('reuses encounter when creating again for same appointment', () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const db = getDb();
    const apptId = `appt-enc-dup-${Date.now()}`;
    db.prepare(`DELETE FROM appointments WHERE id = ?`).run(apptId);
    db.prepare(`
      INSERT INTO appointments (id, tenant_id, patient_id, service, scheduled_at, status)
      VALUES (?, ?, ?, 'Consultation', datetime('now'), 'arrived')
    `).run(apptId, ctx.tenantId, ctx.patientId);
    const first = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      appointmentId: apptId,
    });
    const second = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      appointmentId: apptId,
    });
    assert.equal(first.id, second.id);
    const rows = db.prepare(`SELECT COUNT(*) AS c FROM encounters WHERE appointment_id = ?`).get(apptId);
    assert.equal(rows.c, 1);
  });

  it('lists patient visit history in reverse chronological order', async () => {
    const user = { sub: ctx.clinicianId, tenantId: ctx.tenantId, role: 'staff' };
    const enc1 = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      chiefComplaint: 'First visit',
    });
    updateEncounterDraft(enc1.id, ctx.tenantId, user, {
      prescriptionItems: [{ drugName: 'A', dose: '1' }],
    });
    await finalizeEncounter(enc1.id, ctx.tenantId, user);

    const enc2 = createEncounter(ctx.tenantId, user, {
      patientId: ctx.patientId,
      doctorId: ctx.doctorId,
      chiefComplaint: 'Second visit',
    });
    const list = listEncountersForPatient(ctx.patientId, ctx.tenantId);
    assert.equal(list.length, 2);
    assert.equal(list[0].chiefComplaint, 'Second visit');
  });
});
