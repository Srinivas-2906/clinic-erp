import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-slot-test-'));
const dbPath = path.join(tmpDir, 'test.db');

process.env.DATABASE_PATH = dbPath;
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase, getDb } = await import('../../db/index.js');
const { getAvailableSlots, getSlotsForDoctor } = await import('./slotEngine.js');
const { createAppointment } = await import('../../services/clinicStore.js');
const { replaceDoctorSessions } = await import('../providers/doctorSessions.service.js');
const { createDoctorTimeOff } = await import('../providers/doctorTimeOff.service.js');

const owner = { tenantId: 'tenant-slot', role: 'owner', isPlatformAdmin: false, sub: 'owner-1' };
let doctorA;
let doctorB;
const dateStr = '2026-08-17'; // Monday

function seedSessions(doctorId) {
  const days = [1, 2, 3, 4, 5, 6];
  const sessions = [];
  for (const dow of days) {
    sessions.push({ dayOfWeek: dow, startTime: '10:00', endTime: '15:00', slotDurationMinutes: 30 });
  }
  replaceDoctorSessions(doctorId, owner.tenantId, owner, sessions);
}

before(() => {
  initDatabase();
  const db = getDb();

  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'slot-clinic', 'Slot Clinic', 'clinic', 'growth', 'active', '{}')
  `).run(owner.tenantId);

  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, 'owner@test.com', 'hash', 'Owner', 'owner', 0)
  `).run(owner.sub, owner.tenantId);

  db.prepare(`
    INSERT INTO patients (id, tenant_id, name, phone, phone_digits, source)
    VALUES ('pat-slot', ?, 'Slot Patient', '+91 90000 00099', '919000000099', 'Walk-in')
  `).run(owner.tenantId);

  doctorA = { id: 'doc-a', name: 'Dr Ajit' };
  doctorB = { id: 'doc-b', name: 'Dr Priya' };

  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 0, datetime('now'), datetime('now'))
  `).run(doctorA.id, owner.tenantId, doctorA.name, doctorA.name);

  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
  `).run(doctorB.id, owner.tenantId, doctorB.name, doctorB.name);

  seedSessions(doctorA.id);
  seedSessions(doctorB.id);
});

after(() => {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('slotEngine multi-doctor', () => {
  it('Dr Ajit booked at 10:00 — unavailable for Ajit, still available for Priya', () => {
    createAppointment(owner.tenantId, {
      patientId: 'pat-slot',
      service: 'Check-up',
      scheduledAt: `${dateStr}T10:00:00`,
      status: 'confirmed',
      source: 'Walk-in',
      assignedDoctorId: doctorA.id,
    });

    const ajitSlots = getSlotsForDoctor(owner.tenantId, dateStr, doctorA.id);
    const priyaSlots = getSlotsForDoctor(owner.tenantId, dateStr, doctorB.id);

    assert.equal(ajitSlots.some((s) => s.time === '10:00'), false);
    assert.equal(priyaSlots.some((s) => s.time === '10:00'), true);
  });

  it('anyAvailable returns both doctors for same open slot', () => {
    const result = getAvailableSlots(owner.tenantId, dateStr, { anyAvailable: true });
    const tenAm = result.slotOptions.filter((s) => s.time === '10:00');
    assert.equal(tenAm.length, 1);
    assert.equal(tenAm[0].doctorId, doctorB.id);
  });

  it('doctor leave removes slots in blocked window', () => {
    createDoctorTimeOff(doctorB.id, owner.tenantId, owner, {
      startDatetime: `${dateStr}T10:00:00`,
      endDatetime: `${dateStr}T12:00:00`,
      reason: 'Leave',
    });

    const priyaSlots = getSlotsForDoctor(owner.tenantId, dateStr, doctorB.id);
    assert.equal(priyaSlots.some((s) => s.time === '10:00'), false);
    assert.equal(priyaSlots.some((s) => s.time === '10:30'), false);
    assert.equal(priyaSlots.some((s) => s.time === '12:00'), true);
  });

  it('60-minute appointment blocks overlapping 30-minute slot', () => {
    const db = getDb();
    db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(owner.tenantId);
    db.prepare('DELETE FROM doctor_time_off WHERE tenant_id = ?').run(owner.tenantId);

    createAppointment(owner.tenantId, {
      patientId: 'pat-slot',
      service: 'Long procedure',
      scheduledAt: `${dateStr}T11:00:00`,
      durationMin: 60,
      status: 'confirmed',
      assignedDoctorId: doctorA.id,
    });

    const slots = getSlotsForDoctor(owner.tenantId, dateStr, doctorA.id);
    assert.equal(slots.some((s) => s.time === '11:00'), false);
    assert.equal(slots.some((s) => s.time === '11:30'), false);
    assert.equal(slots.some((s) => s.time === '10:30'), true);
    assert.equal(slots.some((s) => s.time === '12:00'), true);
  });

  it('single-doctor mode returns string labels for backward compatibility', () => {
    const result = getAvailableSlots(owner.tenantId, dateStr, { doctorId: doctorA.id });
    assert.ok(Array.isArray(result.slots));
    assert.ok(result.slots.every((s) => typeof s === 'string'));
    assert.ok(result.slotOptions.length > 0);
  });

  it('falls back to tenant legacy sessions when doctor has no weekly sessions', () => {
    const db = getDb();
    const bareId = 'doc-no-sessions';
    db.prepare(`
      INSERT INTO doctors (id, tenant_id, name, display_name, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'Bare', 'Bare', 1, 9, datetime('now'), datetime('now'))
    `).run(bareId, owner.tenantId);
    db.prepare('DELETE FROM doctor_sessions WHERE doctor_id = ?').run(bareId);

    const result = getAvailableSlots(owner.tenantId, dateStr, { doctorId: bareId });
    assert.ok(result.slotOptions.length > 0, 'expected legacy tenant slots when doctor sessions missing');
  });

  it('does not legacy-fallback when doctor has sessions but requested day is closed (Sunday)', () => {
    const sunday = '2026-08-16'; // Sunday
    assert.equal(new Date(`${sunday}T12:00:00+05:30`).getDay(), 0);
    const result = getAvailableSlots(owner.tenantId, sunday, { doctorId: doctorA.id });
    assert.equal(result.slotOptions.length, 0);
  });

  it('does not legacy-fallback when doctor has sessions but is unavailable (time off)', () => {
    const db = getDb();
    db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(owner.tenantId);
    db.prepare('DELETE FROM doctor_time_off WHERE tenant_id = ?').run(owner.tenantId);

    createDoctorTimeOff(doctorA.id, owner.tenantId, owner, {
      startDatetime: `${dateStr}T10:00:00`,
      endDatetime: `${dateStr}T15:00:00`,
      reason: 'Full day block',
    });

    const result = getAvailableSlots(owner.tenantId, dateStr, { doctorId: doctorA.id });
    assert.equal(result.slotOptions.length, 0);
  });

  it('does not legacy-fallback for anyAvailable when all doctors have empty slots', () => {
    const sunday = '2026-08-16';
    const result = getAvailableSlots(owner.tenantId, sunday, { anyAvailable: true });
    assert.equal(result.slotOptions.length, 0);
  });

  it('excludes inactive doctors from anyAvailable aggregation', () => {
    const db = getDb();
    db.prepare('UPDATE doctors SET is_active = 0 WHERE id = ?').run(doctorB.id);
    try {
      const result = getAvailableSlots(owner.tenantId, dateStr, { anyAvailable: true });
      assert.ok(result.slotOptions.every((s) => s.doctorId !== doctorB.id));
    } finally {
      db.prepare('UPDATE doctors SET is_active = 1 WHERE id = ?').run(doctorB.id);
    }
  });

  it('returns no slots for inactive doctor when requested explicitly', () => {
    const db = getDb();
    db.prepare('UPDATE doctors SET is_active = 0 WHERE id = ?').run(doctorA.id);
    try {
      const result = getAvailableSlots(owner.tenantId, dateStr, { doctorId: doctorA.id });
      assert.equal(result.slotOptions.length, 0);
    } finally {
      db.prepare('UPDATE doctors SET is_active = 1 WHERE id = ?').run(doctorA.id);
    }
  });

  it('legacy fallback still respects tenant-wide appointment blocks', () => {
    const db = getDb();
    const bareId = 'doc-legacy-block';
    db.prepare(`
      INSERT INTO doctors (id, tenant_id, name, display_name, is_active, sort_order, created_at, updated_at)
      VALUES (?, ?, 'Legacy', 'Legacy', 1, 10, datetime('now'), datetime('now'))
    `).run(bareId, owner.tenantId);
    db.prepare('DELETE FROM doctor_sessions WHERE doctor_id = ?').run(bareId);
    db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(owner.tenantId);

    createAppointment(owner.tenantId, {
      patientId: 'pat-slot',
      service: 'Block',
      scheduledAt: `${dateStr}T10:00:00`,
      status: 'confirmed',
      assignedDoctorId: doctorA.id,
    });

    const result = getAvailableSlots(owner.tenantId, dateStr, { doctorId: bareId });
    assert.equal(result.slotOptions.some((s) => s.time === '10:00'), false);
    assert.ok(result.slotOptions.some((s) => s.time === '10:30'));
  });

  it('does not legacy-fallback when existing appointments consume all doctor slots', () => {
    const db = getDb();
    db.prepare('DELETE FROM appointments WHERE tenant_id = ?').run(owner.tenantId);
    db.prepare('DELETE FROM doctor_time_off WHERE tenant_id = ?').run(owner.tenantId);

    const open = getSlotsForDoctor(owner.tenantId, dateStr, doctorA.id);
    assert.ok(open.length > 0);
    for (const s of open) {
      createAppointment(owner.tenantId, {
        patientId: 'pat-slot',
        service: 'Fill',
        scheduledAt: `${dateStr}T${s.time}:00`,
        status: 'confirmed',
        assignedDoctorId: doctorA.id,
      });
    }

    const result = getAvailableSlots(owner.tenantId, dateStr, { doctorId: doctorA.id });
    assert.equal(result.slotOptions.length, 0);
  });
});
