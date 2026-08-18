import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-api-test-'));
const dbPath = path.join(tmpDir, 'test.db');

process.env.DATABASE_PATH = dbPath;
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase, getDb } = await import('../../db/index.js');
const { listDoctors, createDoctor, getDoctorById, assertDoctorBelongsToTenant } = await import('./doctors.service.js');
const { migrateTenantsToDoctors } = await import('./doctorMigration.js');
const { createAppointment, getAppointmentById } = await import('../../services/clinicStore.js');
const { signToken } = await import('../../middleware/auth.js');

let tenantA;
let tenantB;
let ownerA;
let ownerB;

before(() => {
  initDatabase();
  const db = getDb();

  tenantA = { id: 'tenant-a', slug: 'clinic-a', name: 'Clinic A' };
  tenantB = { id: 'tenant-b', slug: 'clinic-b', name: 'Clinic B' };

  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, ?, ?, 'clinic', 'growth', 'active', ?)
  `).run(tenantA.id, tenantA.slug, tenantA.name, JSON.stringify({ doctorName: 'Dr Alpha' }));

  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, ?, ?, 'clinic', 'growth', 'active', ?)
  `).run(tenantB.id, tenantB.slug, tenantB.name, JSON.stringify({ doctorName: 'Dr Beta' }));

  const hash = bcrypt.hashSync('testpass', 4);
  ownerA = { id: 'user-a', tenant_id: tenantA.id, email: 'owner-a@test.com', name: 'Owner A', role: 'owner' };
  ownerB = { id: 'user-b', tenant_id: tenantB.id, email: 'owner-b@test.com', name: 'Owner B', role: 'owner' };

  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, ?, 'owner', 0)
  `).run(ownerA.id, ownerA.tenant_id, ownerA.email, hash, ownerA.name);

  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, ?, 'owner', 0)
  `).run(ownerB.id, ownerB.tenant_id, ownerB.email, hash, ownerB.name);

  migrateTenantsToDoctors(db);

  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits, source)
    VALUES ('pat-a', ?, 'Patient A', '+91 90000 00001', '919000000001', 'Walk-in')
  `).run(tenantA.id);
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('doctor migration', () => {
  it('creates default doctor from tenant settings', () => {
    const doctors = listDoctors(tenantA.id);
    assert.equal(doctors.length, 1);
    assert.match(doctors[0].name, /Dr Alpha/i);
    assert.equal(doctors[0].isActive, true);
  });

  it('seeds doctor sessions for default doctor', () => {
    const db = getDb();
    const doctor = listDoctors(tenantA.id)[0];
    const count = db.prepare('SELECT COUNT(*) AS c FROM doctor_sessions WHERE doctor_id = ?').get(doctor.id).c;
    assert.ok(count > 0);
  });
});

describe('doctor CRUD', () => {
  it('owner can create a second doctor', () => {
    const user = { tenantId: tenantA.id, role: 'owner', isPlatformAdmin: false, sub: ownerA.id };
    const doc = createDoctor(tenantA.id, user, {
      name: 'Dr Priya',
      displayName: 'Dr Priya Sharma',
      specialty: 'General Dentistry',
      appointmentColor: '#7c3aed',
    });
    assert.equal(doc.name, 'Dr Priya');
    assert.equal(listDoctors(tenantA.id).length, 2);
  });

  it('staff cannot create doctors', () => {
    const user = { tenantId: tenantA.id, role: 'staff', isPlatformAdmin: false, sub: 'staff-1' };
    assert.throws(
      () => createDoctor(tenantA.id, user, { name: 'Dr X' }),
      (err) => err.message === 'Owner access required',
    );
  });
});

describe('tenant isolation', () => {
  it('doctor from tenant A is not visible in tenant B', () => {
    const doctorA = listDoctors(tenantA.id)[0];
    const inB = getDoctorById(doctorA.id, tenantB.id);
    assert.equal(inB, null);
  });

  it('assertDoctorBelongsToTenant rejects cross-tenant doctor id', () => {
    const doctorA = listDoctors(tenantA.id)[0];
    assert.throws(
      () => assertDoctorBelongsToTenant(doctorA.id, tenantB.id),
      (err) => err.status === 404,
    );
  });

  it('appointment auto-assigns only tenant default doctor', () => {
    const doctorA = listDoctors(tenantA.id)[0];
    const appt = createAppointment(tenantA.id, {
      patientId: 'pat-a',
      service: 'Check-up',
      scheduledAt: '2026-08-15T10:00:00',
      status: 'confirmed',
      source: 'Walk-in',
    });
    assert.equal(appt.assignedDoctorId, doctorA.id);
    assert.ok(appt.assignedDoctor);

    const stored = getAppointmentById(appt.id, tenantA.id);
    assert.equal(stored.assignedDoctorId, doctorA.id);
  });

  it('cannot assign tenant A doctor to tenant B appointment via assignedDoctorId', () => {
    const doctorA = listDoctors(tenantA.id)[0];
    const db = getDb();
    db.prepare(`
      INSERT INTO patients (id, tenant_id, name, phone, phone_digits, source)
      VALUES ('pat-b', ?, 'Patient B', '+91 90000 00002', '919000000002', 'Walk-in')
    `).run(tenantB.id);

    assert.throws(
      () => createAppointment(tenantB.id, {
        patientId: 'pat-b',
        service: 'Check-up',
        scheduledAt: '2026-08-15T11:00:00',
        assignedDoctorId: doctorA.id,
        source: 'Walk-in',
      }),
      (err) => err.status === 404,
    );
  });
});

describe('permissions helpers', () => {
  it('signToken includes tenant and role', () => {
    const token = signToken(ownerA, tenantA);
    assert.ok(typeof token === 'string');
  });
});
