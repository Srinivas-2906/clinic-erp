/**
 * Simulates process restart: init DB, write marker, re-open same file, verify row survives.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDb = path.join(os.tmpdir(), `mvp-restart-${Date.now()}.db`);

describe('mvp db restart persistence', () => {
  before(() => {
    process.env.DATABASE_PATH = tmpDb;
    process.env.SKIP_DEMO_SEED = '1';
    process.env.NODE_ENV = 'test';
  });

  after(() => {
    try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
    try { fs.unlinkSync(`${tmpDb}-wal`); } catch { /* ok */ }
    try { fs.unlinkSync(`${tmpDb}-shm`); } catch { /* ok */ }
  });

  it('patient row survives closing and reopening database connection', async () => {
    const { initDatabase, getDb, closeDatabase } = await import('../src/db/index.js');
    initDatabase();
    const db = getDb();
    db.prepare(`INSERT INTO tenants (id, slug, name, status) VALUES ('t-mvp', 'mvp', 'MVP', 'active')`).run();
    const hash = bcrypt.hashSync('x', 10);
    db.prepare(`INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES ('u1', 't-mvp', 'o@mvp.test', ?, 'O', 'owner')`).run(hash);
    db.prepare(`
      INSERT INTO patients (id, tenant_id, name, phone, phone_digits)
      VALUES ('p-restart', 't-mvp', 'Restart Marker Patient', '9111111111', '9111111111')
    `).run();
    closeDatabase?.();

    process.env.DATABASE_PATH = tmpDb;
    const mod2 = await import('../src/db/index.js');
    mod2.initDatabase();
    const db2 = mod2.getDb();
    const row = db2.prepare(`SELECT name FROM patients WHERE id = 'p-restart'`).get();
    assert.equal(row?.name, 'Restart Marker Patient');
    mod2.closeDatabase?.();
  });
});
