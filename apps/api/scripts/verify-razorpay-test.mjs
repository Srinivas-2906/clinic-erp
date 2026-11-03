#!/usr/bin/env node
/**
 * Optional manual verification against Razorpay test mode (requires network + credentials).
 * CI does not run this script.
 */
import { createRazorpayClient, shouldUseRazorpayMock } from '../src/modules/billing/razorpayClient.js';
import { getPaymentGatewayConfig } from '../src/modules/billing/paymentGateway.js';

if (shouldUseRazorpayMock() || process.env.CLINIC_RAZORPAY_MOCK === '1') {
  console.error('Unset CLINIC_RAZORPAY_MOCK to verify real test API');
  process.exit(1);
}

const cfg = getPaymentGatewayConfig();
if (cfg.mode !== 'test') {
  console.error('Configure CLINIC_PAYMENT_GATEWAY=razorpay with rzp_test_* keys');
  process.exit(1);
}

const planId = process.env.CLINIC_RAZORPAY_PLAN_ESSENTIAL || process.env.CLINIC_RAZORPAY_PLAN_PROFESSIONAL;
if (!planId) {
  console.error('Set CLINIC_RAZORPAY_PLAN_ESSENTIAL or CLINIC_RAZORPAY_PLAN_PROFESSIONAL');
  process.exit(1);
}

const client = createRazorpayClient({
  keyId: process.env.CLINIC_RAZORPAY_KEY_ID,
  keySecret: process.env.CLINIC_RAZORPAY_KEY_SECRET,
  mock: false,
});

const sub = await client.createSubscription({
  plan_id: planId,
  total_count: 1,
  customer_notify: 0,
  notes: { verify_script: '1' },
});

console.log(JSON.stringify({ ok: true, subscriptionId: sub.id, status: sub.status }, null, 2));
