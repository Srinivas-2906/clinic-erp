import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'life-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'l.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.CLINIC_TRIAL_WARN_DAYS = '14';
process.env.CLINIC_SUBSCRIPTION_GRACE_DAYS = '0';

const { initDatabase, getDb } = await import('../../db/index.js');
const { processSubscriptionLifecycle } = await import('./subscriptionLifecycle.service.js');

before(() => {
  initDatabase();
  getDb().prepare(`
    INSERT INTO tenants (id, slug, name, status, plan, subscription_status, trial_ends_at)
    VALUES ('exp', 'exp', 'Exp', 'active', 'essential', 'trialing', datetime('now', '-1 day'))
  `).run();
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('subscription lifecycle', () => {
  it('transitions expired trial after grace handling', () => {
    const results = processSubscriptionLifecycle({ limit: 10 });
    assert.ok(results.some((r) => r.tenantId === 'exp' && (r.action === 'trial_expired_past_due' || r.action === 'grace_ended_past_due')));
  });
});
