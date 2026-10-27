import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDb = path.join(os.tmpdir(), `plat-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';

const { initDatabase, getDb } = await import('../../db/index.js');
const { listTenantsForPlatformAdmin, patchTenantAsPlatformAdmin } = await import('./platformAdmin.service.js');

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`INSERT INTO tenants (id, slug, name, status, plan, subscription_status) VALUES ('t1', 'alpha', 'Alpha Clinic', 'active', 'professional', 'active')`).run();
  const hash = bcrypt.hashSync('x', 10);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES ('admin', NULL, 'admin@platform.invalid', ?, 'Admin', 'owner', 1)
  `).run(hash);
});

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
});

describe('platformAdmin', () => {
  it('lists tenants for platform admin', () => {
    const rows = listTenantsForPlatformAdmin({ search: 'alpha' });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].slug, 'alpha');
  });

  it('requires confirmation note for subscription patch', () => {
    assert.throws(
      () => patchTenantAsPlatformAdmin({ sub: 'admin' }, 't1', { subscriptionStatus: 'active' }),
      /confirmation/i,
    );
  });
});
