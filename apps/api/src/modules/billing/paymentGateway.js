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

function isProductionRuntime() {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production';
}

/** Simulated checkout must never run in production unless explicitly overridden (dev/staging only). */
export function isSimulatedSandboxBillingAllowed() {
  if (!isProductionRuntime()) return true;
  return process.env.CLINIC_ALLOW_SANDBOX_BILLING === '1';
}

function resolveRazorpayKeyMode() {
  const keyId = process.env.CLINIC_RAZORPAY_KEY_ID?.trim() || '';
  if (keyId.startsWith('rzp_test_')) return 'test';
  if (keyId.startsWith('rzp_live_')) return 'live';
  return keyId ? 'unknown' : null;
}

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
    const allowed = isSimulatedSandboxBillingAllowed();
    return {
      provider: 'razorpay',
      configured: allowed,
      checkoutEnabled: allowed,
      mode: allowed ? 'sandbox' : 'sandbox_blocked',
      note: allowed
        ? 'Sandbox mode — no live Razorpay API calls; webhooks drive activation.'
        : 'Simulated sandbox billing is disabled in production.',
    };
  }

  if (provider === 'razorpay') {
    const hasKey = !!(process.env.CLINIC_RAZORPAY_KEY_ID && process.env.CLINIC_RAZORPAY_KEY_SECRET);
    const keyMode = resolveRazorpayKeyMode();
    const liveAllowed = process.env.CLINIC_PAYMENT_LIVE_ENABLED === '1';
    if (keyMode === 'live' && !liveAllowed) {
      return {
        provider: 'razorpay',
        configured: false,
        checkoutEnabled: false,
        mode: 'live_blocked',
        note: 'Live Razorpay keys detected but CLINIC_PAYMENT_LIVE_ENABLED is not set.',
      };
    }
    const mode = keyMode === 'test' ? 'test' : keyMode === 'live' ? 'live' : hasKey ? 'unknown' : 'unconfigured';
    return {
      provider: 'razorpay',
      configured: hasKey && mode !== 'unknown',
      checkoutEnabled: hasKey && (mode === 'test' || (mode === 'live' && liveAllowed)),
      mode,
      keyId: hasKey ? process.env.CLINIC_RAZORPAY_KEY_ID.trim() : undefined,
      note: hasKey
        ? undefined
        : 'Set CLINIC_RAZORPAY_KEY_ID and CLINIC_RAZORPAY_KEY_SECRET (use rzp_test_* for test mode).',
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
