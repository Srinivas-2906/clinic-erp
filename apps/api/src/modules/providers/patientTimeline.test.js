import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-timeline-test-'));
const dbPath = path.join(tmpDir, 'test.db');

process.env.DATABASE_PATH = dbPath;
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase } = await import('../../db/index.js');
const { listDoctors } = await import('./doctors.service.js');
const { migrateTenantsToDoctors } = await import('./doctorMigration.js');
const { createAppointment, getPatientTimeline } = await import('../../services/clinicStore.js');
const { getDb } = await import('../../db/index.js');

let tenantId;

before(() => {
  initDatabase();
  const db = getDb();
  tenantId = 'tenant-timeline';

  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'timeline-clinic', 'Timeline Clinic', 'clinic', 'growth', 'active', ?)
  `).run(tenantId, JSON.stringify({ doctorName: 'Dr Timeline' }));

  const hash = bcrypt.hashSync('testpass', 4);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES ('user-timeline', ?, 'owner@timeline.test', ?, 'Owner', 'owner', 0)
  `).run(tenantId, hash);

  migrateTenantsToDoctors(db);

  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits, source)
    VALUES ('pat-timeline', ?, 'Timeline Patient', '+91 90000 00099', '919000000099', 'Walk-in')
  `).run(tenantId);
});

after(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('patient timeline doctor info', () => {
  it('returns assignedDoctor and assignedDoctorId on appointments', () => {
    const doctor = listDoctors(tenantId)[0];
    createAppointment(tenantId, {
      patientId: 'pat-timeline',
      service: 'Check-up',
      scheduledAt: '2026-08-20T10:00:00',
      status: 'visited',
      assignedDoctorId: doctor.id,
      source: 'Walk-in',
    });

    const timeline = getPatientTimeline('pat-timeline', tenantId);
    assert.ok(timeline);
    assert.equal(timeline.patient.id, 'pat-timeline');
    assert.ok(timeline.appointments.length >= 1);

    const appt = timeline.appointments.find((a) => a.service === 'Check-up');
    assert.ok(appt);
    assert.equal(appt.assignedDoctorId, doctor.id);
    assert.ok(appt.assignedDoctor);
    assert.match(appt.assignedDoctor, /Dr/i);
  });
});
