import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMockRazorpayCapture, createRazorpayClient, verifyRazorpayPaymentSignature } from './razorpayClient.js';

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

  it('creates mock order and verifies payment signature', async () => {
    const client = createRazorpayClient({ mock: true, keySecret: 'sig_secret' });
    const order = await client.createOrder({ amount: 50000, currency: 'INR' });
    const capture = buildMockRazorpayCapture(order.id, 'sig_secret');
    assert.ok(
      verifyRazorpayPaymentSignature({
        orderId: capture.razorpay_order_id,
        paymentId: capture.razorpay_payment_id,
        signature: capture.razorpay_signature,
        keySecret: 'sig_secret',
      }),
    );
  });
});
