import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-entitlements-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase, getDb } = await import('../../db/index.js');
const { getTenantEntitlements, assertCanAddDoctor, assertCanAddStaff } = await import('./entitlements.js');
const { createDoctor } = await import('../providers/doctors.service.js');
const { migrateTenantsToDoctors } = await import('../providers/doctorMigration.js');

const tenantId = 'tenant-essential';
const owner = { id: 'owner-1', tenant_id: tenantId, email: 'o@test.com', name: 'Owner', role: 'owner' };

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`
    INSERT INTO tenants (id, slug, name, industry, plan, status, settings)
    VALUES (?, 'essential-clinic', 'Essential Clinic', 'clinic', 'essential', 'active', '{}')
  `).run(tenantId);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, ?, 'owner', 0)
  `).run(owner.id, tenantId, owner.email, bcrypt.hashSync('x', 4), owner.name);
  migrateTenantsToDoctors(db);
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('entitlements', () => {
  it('maps legacy growth plan to professional limits', () => {
    const db = getDb();
    db.prepare(`UPDATE tenants SET plan = 'growth' WHERE id = ?`).run(tenantId);
    const ent = getTenantEntitlements(tenantId);
    assert.equal(ent.planId, 'professional');
    assert.equal(ent.limits.maxDoctors, 10);
    db.prepare(`UPDATE tenants SET plan = 'essential' WHERE id = ?`).run(tenantId);
  });

  it('enforces essential doctor limit', () => {
    assert.throws(() => assertCanAddDoctor(tenantId, 1), (err) => err.code === 'PLAN_LIMIT');
  });

  it('allows doctor create on professional plan', () => {
    getDb().prepare(`UPDATE tenants SET plan = 'professional' WHERE id = ?`).run(tenantId);
    const doc = createDoctor(tenantId, { sub: owner.id, tenantId, role: 'owner', isPlatformAdmin: false }, { name: 'Dr Two' });
    assert.ok(doc.id);
  });

  it('enforces staff limit on essential', () => {
    const db = getDb();
    db.prepare(`UPDATE tenants SET plan = 'essential' WHERE id = ?`).run(tenantId);
    const hash = bcrypt.hashSync('x', 4);
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
      VALUES ('s1', ?, 's1@test.com', ?, 'S1', 'staff', 0), ('s2', ?, 's2@test.com', ?, 'S2', 'staff', 0)
    `).run(tenantId, hash, tenantId, hash);
    assert.throws(() => assertCanAddStaff(tenantId, 1), (err) => err.status === 403);
  });
});
