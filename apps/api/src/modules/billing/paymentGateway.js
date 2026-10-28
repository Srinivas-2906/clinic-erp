/**
 * Payment gateway abstraction — ledger remains authoritative in patient_payments.
 * Do not mark funds as returned unless an external gateway refund succeeded.
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
    return { provider: null, configured: false };
  }
  return {
    provider,
    configured: false,
    note: 'Gateway integration stub — use manual/ledger payments until approved',
  };
}

/** Initiate an external collect flow (stub). */
export async function initiateGatewayCollection(_tenantId, _payload) {
  const cfg = getPaymentGatewayConfig();
  if (!cfg.configured) {
    const err = new Error('Payment gateway is not configured');
    err.status = 501;
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  return { status: GATEWAY_STATUS.PENDING, externalId: null };
}

/** Initiate an external refund (stub). */
export async function initiateGatewayRefund(_tenantId, _payload) {
  const cfg = getPaymentGatewayConfig();
  if (!cfg.configured) {
    const err = new Error('Payment gateway refund is not configured');
    err.status = 501;
    err.code = 'GATEWAY_NOT_CONFIGURED';
    throw err;
  }
  return { status: GATEWAY_STATUS.PENDING, externalId: null };
}
