#!/usr/bin/env node
/**
 * Idempotent staging platform admin (no credentials in git).
 * Requires: DATABASE_PATH or run inside Cloud Run with DB mounted.
 * Env: PLATFORM_ADMIN_EMAIL, PLATFORM_ADMIN_PASSWORD (from Secret Manager — never log).
 */
import bcrypt from 'bcryptjs';
import { initDatabase, getDb } from '../src/db/index.js';

const email = String(process.env.PLATFORM_ADMIN_EMAIL || '').trim().toLowerCase();
const password = String(process.env.PLATFORM_ADMIN_PASSWORD || '').trim();

if (!email || !password) {
  console.error('Set PLATFORM_ADMIN_EMAIL and PLATFORM_ADMIN_PASSWORD (from secrets).');
  process.exit(1);
}

initDatabase();
const db = getDb();
const existing = db.prepare(`SELECT id FROM users WHERE email = ? AND is_platform_admin = 1`).get(email);
const hash = bcrypt.hashSync(password, 12);
if (existing) {
  db.prepare(`UPDATE users SET password_hash = ?, name = COALESCE(name, 'Platform Admin') WHERE id = ?`).run(hash, existing.id);
  console.log(JSON.stringify({ ok: true, action: 'updated', userId: existing.id, email }));
} else {
  const id = `plat-${Date.now()}`;
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, NULL, ?, ?, 'Platform Admin', 'owner', 1)
  `).run(id, email, hash);
  console.log(JSON.stringify({ ok: true, action: 'created', userId: id, email }));
}
