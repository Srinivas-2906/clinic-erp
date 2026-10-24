import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-provision-'));
process.env.DATABASE_PATH = path.join(tmpDir, 'test.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';

const { initDatabase, getDb } = await import('../db/index.js');
const { provisionClinicTenant, isSlugAvailable } = await import('./tenantProvisioning.js');
const { getTenantEntitlements } = await import('../modules/identity/entitlements.js');
const { SUBSCRIPTION_STATUS } = await import('../modules/identity/subscription.js');
const { updateTenantSubscription } = await import('./tenantProvisioning.js');

before(() => {
  initDatabase();
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('tenant provisioning', () => {
  it('rejects reserved slug', () => {
    const r = isSlugAvailable('dentacare');
    assert.equal(r.available, false);
  });

  it('creates tenant with owner invite', () => {
    const result = provisionClinicTenant({
      idempotencyKey: 'key-1',
      clinicName: 'Sunrise Dental',
      slug: 'sunrise-dental-test',
      ownerEmail: 'owner@sunrise-dental.invalid',
      ownerName: 'Dr Sunrise',
      planId: 'professional',
    });
    assert.equal(result.tenant.slug, 'sunrise-dental-test');
    assert.equal(result.owner.email, 'owner@sunrise-dental.invalid');
    assert.match(result.invite.setPasswordUrl, /set-password=/);

    const ent = getTenantEntitlements(result.tenant.id);
    assert.equal(ent.planId, 'professional');
    assert.equal(ent.subscriptionStatus, SUBSCRIPTION_STATUS.TRIALING);
    assert.equal(ent.subscription.canWrite, true);
  });

  it('is idempotent for same key', () => {
    const a = provisionClinicTenant({
      idempotencyKey: 'key-dup',
      clinicName: 'Dup Clinic',
      slug: 'dup-clinic-test',
      ownerEmail: 'dup@clinic.invalid',
    });
    const b = provisionClinicTenant({
      idempotencyKey: 'key-dup',
      clinicName: 'Other Name',
      slug: 'other-slug',
      ownerEmail: 'other@clinic.invalid',
    });
    assert.equal(a.tenant.id, b.tenant.id);
    assert.equal(b.idempotentReplay, true);
  });

  it('rejects duplicate slug', () => {
    assert.throws(
      () => provisionClinicTenant({
        clinicName: 'Sunrise Dental 2',
        slug: 'sunrise-dental-test',
        ownerEmail: 'other2@sunrise.invalid',
      }),
      (err) => err.status === 409,
    );
  });

  it('blocks writes when subscription past_due', () => {
    const created = provisionClinicTenant({
      clinicName: 'Past Due Clinic',
      slug: 'past-due-clinic',
      ownerEmail: 'pastdue@clinic.invalid',
    });
    updateTenantSubscription(created.tenant.id, { subscriptionStatus: SUBSCRIPTION_STATUS.PAST_DUE });
    const ent = getTenantEntitlements(created.tenant.id);
    assert.equal(ent.subscription.canWrite, false);
    assert.equal(ent.subscriptionStatus, SUBSCRIPTION_STATUS.PAST_DUE);
  });
});
