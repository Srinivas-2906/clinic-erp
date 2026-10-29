#!/usr/bin/env node
/**
 * Idempotent local E2E fixtures: role accounts + platform admin.
 * Uses DATABASE_PATH (isolated e2e DB recommended). Never touches production.
 */
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
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
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(u.email);
  if (!existing) {
    db.prepare(`
      INSERT INTO users (id, tenant_id, username, email, password_hash, name, role, is_platform_admin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(u.id, tid, u.username, u.email, hash, u.name, u.role, u.isPlatformAdmin);
    console.log(`Created: ${u.email} (${u.role}${u.isPlatformAdmin ? ', platform' : ''})`);
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

console.log(JSON.stringify({
  tenant: 'dentacare',
  password,
  users: USERS.map((u) => ({ email: u.email, role: u.role, platform: !!u.isPlatformAdmin })),
  loginUrl: 'http://localhost:5185?tenant=dentacare',
  platformUrl: 'http://localhost:5185/platform',
}, null, 2));
