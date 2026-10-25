import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patient-identity-'));
const dbPath = path.join(tmpDir, 'test.db');

process.env.DATABASE_PATH = dbPath;
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase, getDb } = await import('../../db/index.js');
const {
  createPatient,
  getPatients,
  getPatientsByPhone,
  createAppointment,
  getOrCreatePatient,
  PatientIdentityError,
} = await import('../../services/clinicStore.js');
const { migratePatientPhoneNonUnique } = await import('./patientPhoneMigration.js');
const { migrateTenantsToDoctors } = await import('../providers/doctorMigration.js');

const tenantA = 'tenant-family-a';
const tenantB = 'tenant-family-b';

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'family-a', 'Family Clinic A', 'clinic', 'growth', 'active', '{}')
  `).run(tenantA);
  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'family-b', 'Family Clinic B', 'clinic', 'growth', 'active', '{}')
  `).run(tenantB);
  migrateTenantsToDoctors(db);
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('shared phone — explicit registration', () => {
  it('creates two distinct patients with the same phone', () => {
    const phone = '9876501234';
    const p1 = createPatient(tenantA, { name: 'Ramesh Kumar', phone, source: 'Walk-in' });
    const p2 = createPatient(tenantA, { name: 'Lakshmi Kumar', phone, source: 'Walk-in' });
    assert.notEqual(p1.id, p2.id);
    assert.equal(p1.name, 'Ramesh Kumar');
    assert.equal(p2.name, 'Lakshmi Kumar');
    const matches = getPatientsByPhone(phone, tenantA);
    assert.equal(matches.length, 2);
  });

  it('does not overwrite the first patient when registering a second', () => {
    const phone = '9876505678';
    const p1 = createPatient(tenantA, { name: 'Parent One', phone });
    createPatient(tenantA, { name: 'Child Two', phone });
    const again = createPatient(tenantA, { name: 'Should Not Replace', phone });
    assert.notEqual(again.id, p1.id);
    const first = getDb().prepare('SELECT name FROM patients WHERE id = ?').get(p1.id);
    assert.equal(first.name, 'Parent One');
  });
});

describe('phone search', () => {
  it('returns all matches for a tenant', () => {
    const results = getPatients(tenantA, { search: '9876501234' });
    assert.ok(results.length >= 2);
    const names = new Set(results.map((p) => p.name));
    assert.ok(names.has('Ramesh Kumar'));
    assert.ok(names.has('Lakshmi Kumar'));
  });

  it('does not leak patients across tenants', () => {
    createPatient(tenantB, { name: 'Other Tenant', phone: '9876501234' });
    const bOnly = getPatientsByPhone('9876501234', tenantB);
    assert.equal(bOnly.length, 1);
    assert.equal(bOnly[0].name, 'Other Tenant');
  });
});

describe('booking uses patient id', () => {
  it('keeps separate appointments and encounters per family member', () => {
    const phone = '9876501234';
    const family = getPatientsByPhone(phone, tenantA);
    const ramesh = family.find((p) => p.name === 'Ramesh Kumar');
    const lakshmi = family.find((p) => p.name === 'Lakshmi Kumar');
    assert.ok(ramesh && lakshmi);

    const at = '2030-06-01T10:00:00';
    const apptR = createAppointment(tenantA, {
      patientId: ramesh.id,
      service: 'Checkup',
      scheduledAt: at,
      status: 'confirmed',
    });
    const apptL = createAppointment(tenantA, {
      patientId: lakshmi.id,
      service: 'Cleaning',
      scheduledAt: '2030-06-01T11:00:00',
      status: 'confirmed',
    });
    assert.equal(apptR.patientId, ramesh.id);
    assert.equal(apptL.patientId, lakshmi.id);
    assert.notEqual(apptR.patientId, apptL.patientId);
  });
});

describe('WhatsApp / inbound resolution', () => {
  it('links by conversation id without using phone alone', () => {
    const phone = '9000011111';
    const p = createPatient(tenantA, { name: 'WhatsApp Patient', phone, source: 'WhatsApp' });
    getDb().prepare('UPDATE patients SET conversation_id = ? WHERE id = ?').run('conv-abc', p.id);

    const resolved = getOrCreatePatient({
      tenantId: tenantA,
      phone: '9000099999',
      name: 'Wrong Name',
      conversationId: 'conv-abc',
      source: 'WhatsApp',
    });
    assert.equal(resolved.id, p.id);
    assert.equal(resolved.name, 'WhatsApp Patient');
  });

  it('creates a new family member when name differs on shared phone', () => {
    const phone = '9000022222';
    createPatient(tenantA, { name: 'Existing Member', phone });
    const added = getOrCreatePatient({
      tenantId: tenantA,
      phone,
      name: 'New Member',
      source: 'WhatsApp',
    });
    assert.equal(added.name, 'New Member');
    assert.equal(getPatientsByPhone(phone, tenantA).length, 2);
  });

  it('returns ambiguity when phone matches multiple and name omitted', () => {
    const phone = '9876501234';
    assert.throws(
      () => getOrCreatePatient({ tenantId: tenantA, phone, source: 'WhatsApp' }),
      (err) => err instanceof PatientIdentityError && err.code === 'PATIENT_AMBIGUOUS',
    );
  });

  it('resolves when name uniquely matches one of several shared-phone patients', () => {
    const phone = '9876501234';
    const picked = getOrCreatePatient({
      tenantId: tenantA,
      phone,
      name: 'Lakshmi Kumar',
      source: 'WhatsApp',
    });
    assert.equal(picked.name, 'Lakshmi Kumar');
  });
});

describe('legacy phone uniqueness migration', () => {
  it('preserves patient ids and appointment references after rebuild', () => {
    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patient-legacy-'));
    const legacyPath = path.join(legacyDir, 'legacy.db');
    const db = new Database(legacyPath);
    db.pragma('foreign_keys = ON');
    db.exec(`
      CREATE TABLE tenants (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
      INSERT INTO tenants (id, slug, name) VALUES ('t-legacy', 'legacy', 'Legacy');
      CREATE TABLE patients (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        phone_digits TEXT NOT NULL,
        email TEXT DEFAULT '',
        age INTEGER,
        gender TEXT DEFAULT '',
        chief_complaint TEXT DEFAULT '',
        is_returning INTEGER DEFAULT 0,
        tags TEXT DEFAULT '[]',
        notes TEXT DEFAULT '[]',
        last_visit TEXT,
        source TEXT DEFAULT 'Walk-in',
        photo_url TEXT DEFAULT '',
        prescription_url TEXT DEFAULT '',
        record_urls TEXT DEFAULT '[]',
        conversation_id TEXT,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        UNIQUE(tenant_id, phone_digits),
        FOREIGN KEY (tenant_id) REFERENCES tenants(id)
      );
      INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('pat-legacy-1', 't-legacy', 'Legacy Pat', '+91 90000 00099', '9000000099');
      CREATE TABLE appointments (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        patient_id TEXT NOT NULL,
        service TEXT DEFAULT '',
        scheduled_at TEXT NOT NULL,
        status TEXT DEFAULT 'requested',
        FOREIGN KEY (tenant_id) REFERENCES tenants(id),
        FOREIGN KEY (patient_id) REFERENCES patients(id)
      );
      INSERT INTO appointments (id, tenant_id, patient_id, service, scheduled_at) VALUES ('appt-legacy-1', 't-legacy', 'pat-legacy-1', 'Exam', '2030-01-01T10:00:00');
    `);

    const result = migratePatientPhoneNonUnique(db);
    assert.equal(result.migrated, true);
    assert.equal(result.patientCount, 1);

    db.prepare(`
      INSERT INTO patients (id, tenant_id, name, phone, phone_digits) VALUES ('pat-legacy-2', 't-legacy', 'Legacy Spouse', '+91 90000 00099', '9000000099')
    `).run();

    const appt = db.prepare('SELECT patient_id FROM appointments WHERE id = ?').get('appt-legacy-1');
    assert.equal(appt.patient_id, 'pat-legacy-1');
    const count = db.prepare('SELECT COUNT(*) AS c FROM patients WHERE tenant_id = ? AND phone_digits = ?').get('t-legacy', '9000000099').c;
    assert.equal(count, 2);

    db.close();
    fs.rmSync(legacyDir, { recursive: true, force: true });
  });
});
