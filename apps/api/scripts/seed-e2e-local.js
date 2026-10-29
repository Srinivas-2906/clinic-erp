#!/usr/bin/env node
/**
 * Idempotent local E2E fixtures: role accounts + platform admin.
 * Uses DATABASE_PATH (isolated e2e DB recommended). Never touches production.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { initDatabase, getDb } from '../src/db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
execSync('node scripts/assert-e2e-safe-env.js', {
  cwd: path.join(__dirname, '..'),
  stdio: 'inherit',
  env: process.env,
});

const tenantId = 'denta-care';
const password = process.env.E2E_PASSWORD || 'E2eTest@2026';

const USERS = [
  {
    id: 'user-e2e-owner',
    email: process.env.E2E_EMAIL || 'e2e-owner@dentacare.in',
    username: 'E2E Owner',
    name: 'E2E Test Owner',
    role: 'owner',
    isPlatformAdmin: 0,
  },
  {
    id: 'user-e2e-receptionist',
    email: process.env.E2E_RECEPTIONIST_EMAIL || 'e2e-receptionist@dentacare.in',
    username: 'E2E Reception',
    name: 'E2E Receptionist',
    role: 'receptionist',
    isPlatformAdmin: 0,
  },
  {
    id: 'user-e2e-doctor',
    email: process.env.E2E_DOCTOR_EMAIL || 'e2e-doctor@dentacare.in',
    username: 'E2E Doctor',
    name: 'E2E Doctor',
    role: 'doctor',
    isPlatformAdmin: 0,
  },
  {
    id: 'user-e2e-platform',
    email: process.env.E2E_PLATFORM_EMAIL || 'e2e-platform@clinic-erp.invalid',
    username: null,
    name: 'E2E Platform Admin',
    role: 'owner',
    isPlatformAdmin: 1,
    tenantId: null,
  },
];

initDatabase();
const db = getDb();

const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
if (!tenant) {
  console.error(`Tenant ${tenantId} not found — start API once to initialize schema/demo tenant.`);
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 10);

for (const u of USERS) {
  const tid = u.tenantId === null ? null : tenantId;
  const existing = db.prepare('SELECT id, email FROM users WHERE id = ? OR email = ?').get(u.id, u.email);
  if (!existing) {
    try {
      db.prepare(`
        INSERT INTO users (id, tenant_id, username, email, password_hash, name, role, is_platform_admin)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(u.id, tid, u.username, u.email, hash, u.name, u.role, u.isPlatformAdmin);
      console.log(`Created: ${u.email} (${u.role}${u.isPlatformAdmin ? ', platform' : ''})`);
    } catch (err) {
      if (err?.code !== 'SQLITE_CONSTRAINT') throw err;
      db.prepare(`
        UPDATE users SET tenant_id = ?, username = ?, password_hash = ?, name = ?, role = ?, is_platform_admin = ?
        WHERE email = ? OR id = ?
      `).run(tid, u.username, hash, u.name, u.role, u.isPlatformAdmin, u.email, u.id);
      console.log(`Updated (after conflict): ${u.email}`);
    }
  } else {
    db.prepare(`
      UPDATE users SET tenant_id = ?, username = ?, password_hash = ?, name = ?, role = ?, is_platform_admin = ?
      WHERE email = ?
    `).run(tid, u.username, hash, u.name, u.role, u.isPlatformAdmin, u.email);
    console.log(`Updated: ${u.email}`);
  }
}

const doctor = db.prepare(
  `SELECT id FROM doctors WHERE tenant_id = ? AND is_active = 1 ORDER BY sort_order ASC LIMIT 1`,
).get(tenantId);
if (doctor) {
  db.prepare(`UPDATE doctors SET user_id = ? WHERE id = ?`).run('user-e2e-doctor', doctor.id);
  console.log(`Linked e2e-doctor to doctor ${doctor.id}`);
}

const doctorCount = db.prepare(`SELECT COUNT(*) AS n FROM doctors WHERE tenant_id = ? AND is_active = 1`).get(tenantId).n;
if (doctorCount < 2 && doctor) {
  const now = new Date().toISOString();
  const secondId = 'doc-e2e-second';
  db.prepare(`
    INSERT OR IGNORE INTO doctors (id, tenant_id, name, display_name, email, user_id, is_active, sort_order, created_at, updated_at)
    VALUES (?, ?, 'E2E Second Doctor', 'Dr. E2E Second', 'e2e-second@dentacare.in', NULL, 1, 2, ?, ?)
  `).run(secondId, tenantId, now, now);
  const sessions = db.prepare(
    `SELECT day_of_week, start_time, end_time, slot_duration_minutes FROM doctor_sessions WHERE doctor_id = ?`,
  ).all(doctor.id);
  const insertSession = db.prepare(`
    INSERT INTO doctor_sessions (id, tenant_id, doctor_id, day_of_week, start_time, end_time, slot_duration_minutes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const s of sessions) {
    insertSession.run(
      nanoid(12),
      tenantId,
      secondId,
      s.day_of_week,
      s.start_time,
      s.end_time,
      s.slot_duration_minutes,
    );
  }
  console.log('Ensured second doctor (with sessions) for multi-doctor E2E');
}

getDb().pragma('wal_checkpoint(FULL)');

console.log(JSON.stringify({
  tenant: 'dentacare',
  password,
  users: USERS.map((u) => ({ email: u.email, role: u.role, platform: !!u.isPlatformAdmin })),
  loginUrl: 'http://localhost:5185?tenant=dentacare',
  platformUrl: 'http://localhost:5185/platform',
}, null, 2));
