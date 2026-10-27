import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

const tmpDb = path.join(os.tmpdir(), `doclink-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';

const { initDatabase, getDb } = await import('../../db/index.js');
const { linkInvitedDoctorUser } = await import('./doctors.service.js');

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, status, plan) VALUES ('t1', 'demo', 'Demo', 'active', 'professional')`).run();
  const hash = bcrypt.hashSync('x', 10);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role)
    VALUES ('u1', 't1', 'doc@test.invalid', ?, 'Dr A', 'doctor')
  `).run(hash);
  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, email, user_id, is_active, sort_order, created_at, updated_at)
    VALUES ('d1', 't1', 'Dr One', 'Dr One', 'one@clinic.invalid', NULL, 1, 0, datetime('now'), datetime('now'))
  `).run();
  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, email, user_id, is_active, sort_order, created_at, updated_at)
    VALUES ('d2', 't1', 'Dr Two', 'Dr Two', 'dup@clinic.invalid', NULL, 1, 1, datetime('now'), datetime('now'))
  `).run();
  db.prepare(`
    INSERT INTO doctors (id, tenant_id, name, display_name, email, user_id, is_active, sort_order, created_at, updated_at)
    VALUES ('d3', 't1', 'Dr Three', 'Dr Three', 'dup@clinic.invalid', NULL, 1, 2, datetime('now'), datetime('now'))
  `).run();
});

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
});

describe('doctor linking on invite', () => {
  it('explicit doctorId takes precedence over email', () => {
    const id = linkInvitedDoctorUser('t1', 'u1', {
      name: 'Dr A',
      email: 'dup@clinic.invalid',
      doctorId: 'd1',
    });
    assert.equal(id, 'd1');
    const row = getDb().prepare(`SELECT user_id FROM doctors WHERE id = 'd1'`).get();
    assert.equal(row.user_id, 'u1');
  });

  it('rejects ambiguous email match without doctorId', () => {
    const u2 = `user-${nanoid(6)}`;
    getDb().prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role)
      VALUES (?, 't1', 'new@test.invalid', ?, 'Dr New', 'doctor')
    `).run(u2, bcrypt.hashSync('x', 10));
    assert.throws(
      () => linkInvitedDoctorUser('t1', u2, { name: 'Dr New', email: 'dup@clinic.invalid' }),
      /Multiple doctor profiles/i,
    );
  });

  it('rejects linking profile already tied to another user', () => {
    const u3 = `user-${nanoid(6)}`;
    getDb().prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role)
      VALUES (?, 't1', 'other@test.invalid', ?, 'Other', 'doctor')
    `).run(u3, bcrypt.hashSync('x', 10));
    getDb().prepare(`UPDATE doctors SET user_id = 'u1' WHERE id = 'd1'`).run();
    assert.throws(
      () => linkInvitedDoctorUser('t1', u3, { doctorId: 'd1' }),
      /already linked/i,
    );
  });
});
