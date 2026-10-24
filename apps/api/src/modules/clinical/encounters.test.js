import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDb = path.join(__dirname, '../../../data/test-clinical.db');

process.env.DATABASE_PATH = testDb;
process.env.SKIP_DEMO_SEED = '1';

const { initDatabase, getDb } = await import('../../db/index.js');
const { createDoctor } = await import('../providers/doctors.service.js');
const {
  createEncounter,
  updateEncounterDraft,
  finalizeEncounter,
  encounterDetail,
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

  before(() => {
    if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
    ctx = seedTenant();
  });

  after(() => {
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
  });
});
