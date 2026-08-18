#!/usr/bin/env node
/**
 * Seed dedicated Playwright E2E credentials (idempotent).
 *
 *   node scripts/seed-e2e-user.js
 *
 * Env overrides:
 *   E2E_EMAIL, E2E_PASSWORD, E2E_USER_NAME
 */
import bcrypt from 'bcryptjs';
import { initDatabase, getDb } from '../src/db/index.js';

const tenantId = 'denta-care';

const E2E = {
  id: 'user-e2e-owner',
  email: process.env.E2E_EMAIL || 'e2e-owner@dentacare.in',
  username: 'E2E Owner',
  name: process.env.E2E_USER_NAME || 'E2E Test Owner',
  password: process.env.E2E_PASSWORD || 'E2eTest@2026',
  role: 'owner',
};

initDatabase();
const db = getDb();

const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenantId);
if (!tenant) {
  console.error(`Tenant ${tenantId} not found — start clinic-api once to seed demo tenant.`);
  process.exit(1);
}

const hash = bcrypt.hashSync(E2E.password, 10);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(E2E.email);

if (!existing) {
  db.prepare(`
    INSERT INTO users (id, tenant_id, username, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0)
  `).run(E2E.id, tenantId, E2E.username, E2E.email, hash, E2E.name, E2E.role);
  console.log(`Created E2E user: ${E2E.email}`);
} else {
  db.prepare(`
    UPDATE users SET tenant_id = ?, username = ?, password_hash = ?, name = ?, role = ?
    WHERE email = ?
  `).run(tenantId, E2E.username, hash, E2E.name, E2E.role, E2E.email);
  console.log(`Updated E2E user: ${E2E.email}`);
}

console.log(JSON.stringify({
  tenant: 'dentacare',
  email: E2E.email,
  password: E2E.password,
  loginUrl: 'http://localhost:5185?tenant=dentacare',
}, null, 2));
