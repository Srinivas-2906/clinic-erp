/**
 * Payment gateway abstraction — patient ledger stays in patient_payments.
 * Subscription checkout uses billing_transactions + webhooks (razorpay_sandbox for CI).
 */

export const GATEWAY_STATUS = {
  NOT_CONFIGURED: 'not_configured',
  PENDING: 'pending',
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
};

export function getPaymentGatewayConfig() {
  const provider = String(process.env.CLINIC_PAYMENT_GATEWAY || '').trim().toLowerCase();
  if (!provider || provider === 'none') {
    return {
      provider: null,
      configured: false,
      checkoutEnabled: false,
      mode: 'none',
    };
  }

  if (provider === 'razorpay_sandbox') {
    return {
      provider: 'razorpay',
      configured: true,
      checkoutEnabled: true,
      mode: 'sandbox',
      note: 'Sandbox mode — no live Razorpay API calls; webhooks drive activation.',
    };
  }

  if (provider === 'razorpay') {
    const hasKey = !!(process.env.CLINIC_RAZORPAY_KEY_ID && process.env.CLINIC_RAZORPAY_KEY_SECRET);
    return {
      provider: 'razorpay',
      configured: hasKey,
      checkoutEnabled: hasKey,
      mode: hasKey ? 'live' : 'unconfigured',
      note: hasKey ? undefined : 'Set CLINIC_RAZORPAY_KEY_ID and CLINIC_RAZORPAY_KEY_SECRET for live checkout.',
    };
  }

  return {
    provider,
    configured: false,
    checkoutEnabled: false,
    mode: 'unknown',
    note: 'Gateway integration stub — use razorpay_sandbox for test checkout',
  };
}

/** Patient invoice collect (unchanged stub). */
export async function initiateGatewayCollection(_tenantId, _payload) {
  const cfg = getPaymentGatewayConfig();
  if (!cfg.configured || cfg.mode === 'sandbox') {
    const err = new Error('Payment gateway is not configured');
    err.status = 501;
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  return { status: GATEWAY_STATUS.PENDING, externalId: null };
}

export async function initiateGatewayRefund(_tenantId, _payload) {
  const cfg = getPaymentGatewayConfig();
  if (!cfg.configured || cfg.mode === 'sandbox') {
    const err = new Error('Payment gateway refund is not configured');
    err.status = 501;
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  return { status: GATEWAY_STATUS.PENDING, externalId: null };
}
