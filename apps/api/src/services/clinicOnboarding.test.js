import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initDatabase, getDb, closeDatabase } from '../db/index.js';
import { getClinicOnboardingStatus } from './clinicOnboarding.js';

describe('clinicOnboarding', () => {
  before(() => {
    process.env.DATABASE_PATH = ':memory:';
    initDatabase();
    const db = getDb();
    db.prepare(`
      INSERT INTO tenants (id, slug, name, plan, status, subscription_status, settings, created_at)
      VALUES ('t-onb', 'onb-clinic', 'Onb Clinic', 'professional', 'active', 'trialing', ?, datetime('now'))
    `).run(JSON.stringify({ timezone: 'Asia/Kolkata', phone: '', address: '' }));
    db.prepare(`
      INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
      VALUES ('u1', 't-onb', 'o@x.in', 'x', 'Owner', 'owner', 0)
    `).run();
  });

  after(() => closeDatabase());

  it('starts with incomplete checklist', () => {
    const status = getClinicOnboardingStatus('t-onb');
    assert.equal(status.allComplete, false);
    assert.ok(status.steps.find((s) => s.id === 'profile' && !s.done));
    assert.ok(status.steps.find((s) => s.id === 'staff' && !s.done));
  });

  it('marks profile step when contact fields set', () => {
    const db = getDb();
    db.prepare(`UPDATE tenants SET settings = ? WHERE id = 't-onb'`).run(JSON.stringify({
      timezone: 'Asia/Kolkata',
      phone: '9876543210',
      address: '12 Main St',
    }));
    const status = getClinicOnboardingStatus('t-onb');
    assert.equal(status.steps.find((s) => s.id === 'profile')?.done, true);
  });
});
