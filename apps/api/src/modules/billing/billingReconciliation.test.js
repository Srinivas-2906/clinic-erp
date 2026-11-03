import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'recon-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'r.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.CLINIC_RAZORPAY_MOCK = '1';
process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay';
process.env.CLINIC_RAZORPAY_KEY_ID = 'rzp_test_x';
process.env.CLINIC_RAZORPAY_KEY_SECRET = 'secret';

const { initDatabase, getDb } = await import('../../db/index.js');
const { runBillingReconciliation } = await import('./billingReconciliation.service.js');

before(() => {
  initDatabase();
  getDb().prepare(`
    INSERT INTO tenants (id, slug, name, status, plan, subscription_status)
    VALUES ('t1', 't1', 'T1', 'active', 'essential', 'active')
  `).run();
  getDb().prepare(`
    INSERT INTO billing_provider_subscriptions (tenant_id, provider, external_subscription_id, provider_status)
    VALUES ('t1', 'razorpay', 'sub_missing_mock', 'active')
  `).run();
});

after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

describe('billing reconciliation', () => {
  it('completes dry run and records run row', async () => {
    const report = await runBillingReconciliation({ dryRun: true });
    assert.ok(report.runId);
    assert.equal(report.discrepancyCount >= 0, true);
  });
});
