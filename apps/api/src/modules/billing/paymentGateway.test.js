import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const envBackup = { ...process.env };

afterEach(() => {
  process.env = { ...envBackup };
});

describe('paymentGateway config guards', () => {
  it('blocks simulated sandbox checkout in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay_sandbox';
    delete process.env.CLINIC_ALLOW_SANDBOX_BILLING;
    const { getPaymentGatewayConfig } = await import('./paymentGateway.js');
    const cfg = getPaymentGatewayConfig();
    assert.equal(cfg.checkoutEnabled, false);
    assert.equal(cfg.mode, 'sandbox_blocked');
  });

  it('blocks live keys unless CLINIC_PAYMENT_LIVE_ENABLED', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay';
    process.env.CLINIC_RAZORPAY_KEY_ID = 'rzp_live_abc';
    process.env.CLINIC_RAZORPAY_KEY_SECRET = 'secret';
    delete process.env.CLINIC_PAYMENT_LIVE_ENABLED;
    const { getPaymentGatewayConfig } = await import('./paymentGateway.js');
    const cfg = getPaymentGatewayConfig();
    assert.equal(cfg.checkoutEnabled, false);
    assert.equal(cfg.mode, 'live_blocked');
  });

  it('enables test-mode razorpay with rzp_test keys', async () => {
    process.env.NODE_ENV = 'development';
    process.env.CLINIC_PAYMENT_GATEWAY = 'razorpay';
    process.env.CLINIC_RAZORPAY_KEY_ID = 'rzp_test_abc';
    process.env.CLINIC_RAZORPAY_KEY_SECRET = 'secret';
    const { getPaymentGatewayConfig } = await import('./paymentGateway.js');
    const cfg = getPaymentGatewayConfig();
    assert.equal(cfg.mode, 'test');
    assert.equal(cfg.checkoutEnabled, true);
  });
});
