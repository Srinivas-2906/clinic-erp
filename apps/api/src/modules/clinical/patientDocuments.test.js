import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patient-docs-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'docs.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.CLINIC_FILES_STORAGE = 'memory';

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const TINY_PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj<<>>\nendobj\ntrailer<<>>\n%%EOF').toString('base64');

const { initDatabase, getDb } = await import('../../db/index.js');
const {
  createMemoryUploadStorage,
  setUploadStorageBackendForTests,
  resetUploadStorageBackendForTests,
} = await import('../../services/uploadStorage.js');
const {
  listPatientClinicalDocuments,
  createPatientClinicalDocument,
  deletePatientClinicalDocument,
  assertTenantMayReadClinicalFile,
} = await import('./patientDocuments.service.js');
const { openPatientUploadReadStream } = await import('../../services/uploads.js');

const tenantA = 'tenant-doc-a';
const tenantB = 'tenant-doc-b';
const ownerA = { sub: 'user-a', tenantId: tenantA, role: 'owner', isPlatformAdmin: false };
const ownerB = { sub: 'user-b', tenantId: tenantB, role: 'owner', isPlatformAdmin: false };
const receptionistA = { sub: 'recv-a', tenantId: tenantA, role: 'receptionist', isPlatformAdmin: false };
let patientA;
let patientB;

before(() => {
  setUploadStorageBackendForTests(createMemoryUploadStorage());
  initDatabase();
  const db = getDb();

  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'doc-a', 'Doc A', 'clinic', 'growth', 'active', '{}')
  `).run(tenantA);
  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'doc-b', 'Doc B', 'clinic', 'growth', 'active', '{}')
  `).run(tenantB);

  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES ('user-a', ?, 'a@test', 'h', 'A', 'owner', 0)
  `).run(tenantA);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES ('recv-a', ?, 'r@test', 'h', 'R', 'receptionist', 0)
  `).run(tenantA);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES ('user-b', ?, 'b@test', 'h', 'B', 'owner', 0)
  `).run(tenantB);

  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, is_active, sort_order, created_at, updated_at)
    VALUES ('doc-a', ?, 'Dr A', 'Dr A', 1, 0, datetime('now'), datetime('now'))
  `).run(tenantA);

  patientA = 'pat-doc-a';
  patientB = 'pat-doc-b';
  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits)
    VALUES (?, ?, 'Patient A', '9000000001', '9000000001')
  `).run(patientA, tenantA);
  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits)
    VALUES (?, ?, 'Patient B', '9000000002', '9000000002')
  `).run(patientB, tenantB);
});

after(() => {
  resetUploadStorageBackendForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('patient clinical documents', () => {
  it('receptionist can upload PNG and list documents', async () => {
    const created = await createPatientClinicalDocument(patientA, tenantA, receptionistA, {
      data: TINY_PNG_B64,
      contentType: 'image/png',
      title: 'X-ray scan',
    });
    assert.equal(created.title, 'X-ray scan');
    assert.match(created.fileUrl, /clinical-doc-/);

    const list = listPatientClinicalDocuments(patientA, tenantA, receptionistA);
    assert.ok(list.some((d) => d.id === created.id));
  });

  it('accepts PDF with magic-byte validation', async () => {
    const created = await createPatientClinicalDocument(patientA, tenantA, ownerA, {
      data: TINY_PDF_B64,
      contentType: 'application/pdf',
      title: 'Lab report',
    });
    assert.match(created.contentType, /pdf/);
  });

  it('rejects wrong-patient encounter association', async () => {
    const otherEnc = 'enc-other';
    getDb().prepare(`
      INSERT INTO encounters (id, tenant_id, patient_id, doctor_id, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, 'doc-a', 'draft', 'user-a', datetime('now'), datetime('now'))
    `).run(otherEnc, tenantA, patientB);

    await assert.rejects(
      () => createPatientClinicalDocument(patientA, tenantA, ownerA, {
        data: TINY_PNG_B64,
        contentType: 'image/png',
        encounterId: otherEnc,
      }),
      /Encounter not found for this patient/,
    );
  });

  it('isolates documents by tenant on list', async () => {
    await createPatientClinicalDocument(patientB, tenantB, ownerB, {
      data: TINY_PNG_B64,
      contentType: 'image/png',
    });
    const listA = listPatientClinicalDocuments(patientA, tenantA, ownerA);
    assert.ok(listA.every((d) => d.patientId === patientA));
  });

  it('assertTenantMayReadClinicalFile blocks unregistered clinical-doc files', async () => {
    const created = await createPatientClinicalDocument(patientA, tenantA, ownerA, {
      data: TINY_PNG_B64,
      contentType: 'image/png',
    });
    const fileName = created.fileUrl.split('/').pop();
    assert.doesNotThrow(() => assertTenantMayReadClinicalFile(tenantA, fileName));
    assert.throws(
      () => assertTenantMayReadClinicalFile(tenantA, 'clinical-doc-forged-123.png'),
      /File not found/,
    );
  });

  it('allows read stream after registration and blocks after delete', async () => {
    const created = await createPatientClinicalDocument(patientA, tenantA, ownerA, {
      data: TINY_PNG_B64,
      contentType: 'image/png',
    });
    const fileName = created.fileUrl.split('/').pop();
    const opened = await openPatientUploadReadStream(tenantA, fileName);
    assert.ok(opened.stream);

    deletePatientClinicalDocument(created.id, patientA, tenantA, ownerA);
    assert.throws(
      () => assertTenantMayReadClinicalFile(tenantA, fileName),
      /File not found/,
    );
  });

  it('records audit row on create', async () => {
    const before = getDb().prepare(
      `SELECT COUNT(*) AS c FROM audit_log WHERE entity_type = 'clinical_attachment' AND action = 'create'`,
    ).get().c;
    await createPatientClinicalDocument(patientA, tenantA, ownerA, {
      data: TINY_PNG_B64,
      contentType: 'image/png',
      title: 'Audited',
    });
    const after = getDb().prepare(
      `SELECT COUNT(*) AS c FROM audit_log WHERE entity_type = 'clinical_attachment' AND action = 'create'`,
    ).get().c;
    assert.equal(after, before + 1);
  });
});
