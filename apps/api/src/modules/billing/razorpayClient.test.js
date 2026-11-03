import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRazorpayClient } from './razorpayClient.js';

describe('razorpayClient mock', () => {
  it('creates mock subscription with id', async () => {
    const client = createRazorpayClient({ mock: true });
    const sub = await client.createSubscription({
      plan_id: 'plan_mock_professional',
      total_count: 12,
      notes: { tenant_id: 't1' },
    });
    assert.ok(sub.id.startsWith('sub_mock_'));
    assert.ok(sub.short_url);
  });

  it('throws when credentials missing and mock disabled', () => {
    assert.throws(() => createRazorpayClient({ mock: false, keyId: '', keySecret: '' }));
  });
});
