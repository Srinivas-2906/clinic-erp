/**
 * Razorpay REST client with injectable mock for CI (CLINIC_RAZORPAY_MOCK=1).
 */

import crypto from 'node:crypto';

const BASE = 'https://api.razorpay.com/v1';

function basicAuth(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export function shouldUseRazorpayMock() {
  return process.env.CLINIC_RAZORPAY_MOCK === '1' || process.env.NODE_ENV === 'test';
}

/** Razorpay payment signature verification (order_id|payment_id). */
export function verifyRazorpayPaymentSignature({ orderId, paymentId, signature, keySecret }) {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  const expected = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(signature)));
  } catch {
    return false;
  }
}

/** Test harness — deterministic mock capture payload for patient intents. */
export function buildMockRazorpayCapture(orderId, keySecret = 'mock_secret') {
  const paymentId = `pay_mock_${String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  const signature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  };
}

export function createRazorpayClient({ keyId, keySecret, mock = shouldUseRazorpayMock() } = {}) {
  if (mock) {
    return createMockClient(keySecret);
  }
  if (!keyId || !keySecret) {
    const err = new Error('Razorpay credentials missing');
    err.code = 'RAZORPAY_NOT_CONFIGURED';
    throw err;
  }
  const auth = basicAuth(keyId, keySecret);

  async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: auth,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data?.error?.description || data?.error?.code || res.statusText);
      err.status = res.status;
      err.code = data?.error?.code || 'RAZORPAY_API_ERROR';
      throw err;
    }
    return data;
  }

  return {
    async createSubscription(payload) {
      return request('POST', '/subscriptions', payload);
    },
    async fetchSubscription(id) {
      return request('GET', `/subscriptions/${id}`);
    },
    async cancelSubscription(id, cancelAtCycleEnd = false) {
      return request('POST', `/subscriptions/${id}/cancel`, {
        cancel_at_cycle_end: cancelAtCycleEnd ? 1 : 0,
      });
    },
    async createOrder(payload) {
      return request('POST', '/orders', payload);
    },
    async fetchPayment(id) {
      return request('GET', `/payments/${id}`);
    },
    async createRefund(paymentId, payload) {
      return request('POST', `/payments/${paymentId}/refund`, payload);
    },
    async fetchRefund(id) {
      return request('GET', `/refunds/${id}`);
    },
  };
}

/** Server-side amount/status gate after HMAC verification. */
export function assertRazorpayPaymentReadyForCapture(payment, { orderId, expectedAmountPaise }) {
  if (!payment) {
    const err = new Error('Payment not found at provider');
    err.code = 'PAYMENT_PROVIDER_NOT_FOUND';
    throw err;
  }
  if (orderId && payment.order_id && String(payment.order_id) !== String(orderId)) {
    const err = new Error('Provider payment order does not match intent');
    err.code = 'PAYMENT_ORDER_MISMATCH';
    throw err;
  }
  const amount = Number(payment.amount);
  if (Number.isFinite(expectedAmountPaise) && amount !== expectedAmountPaise) {
    const err = new Error('Provider payment amount does not match intent');
    err.status = 400;
    err.code = 'PAYMENT_AMOUNT_MISMATCH';
    throw err;
  }
  const status = String(payment.status || '').toLowerCase();
  if (status === 'authorized') {
    return { captureReady: false, asyncState: 'authorized' };
  }
  if (status !== 'captured') {
    const err = new Error(`Payment not captured at provider (status: ${payment.status})`);
    err.status = 409;
    err.code = 'PAYMENT_NOT_CAPTURED';
    throw err;
  }
  return { captureReady: true, asyncState: 'captured' };
}

const sharedMockState = {
  subs: new Map(),
  orders: new Map(),
};

function createMockClient(keySecret = 'mock_secret') {
  const subs = sharedMockState.subs;
  const orders = sharedMockState.orders;
  return {
    keySecret,
    async createSubscription(payload) {
      const id = `sub_mock_${Date.now()}`;
      const sub = {
        id,
        status: 'created',
        plan_id: payload.plan_id,
        short_url: `https://rzp.io/i/mock/${id}`,
        notes: payload.notes || {},
      };
      subs.set(id, sub);
      return sub;
    },
    async fetchSubscription(id) {
      const sub = subs.get(id);
      if (!sub) {
        const err = new Error('Subscription not found');
        err.status = 404;
        throw err;
      }
      return { ...sub, status: sub.status || 'active' };
    },
    async cancelSubscription(id) {
      const sub = subs.get(id);
      if (sub) sub.status = 'cancelled';
      return sub || { id, status: 'cancelled' };
    },
    async createOrder(payload) {
      const id = `order_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const order = {
        id,
        amount: payload.amount,
        currency: payload.currency || 'INR',
        receipt: payload.receipt,
        status: 'created',
        notes: payload.notes || {},
      };
      orders.set(id, order);
      return order;
    },
    async fetchPayment(id) {
      for (const [orderId, order] of orders.entries()) {
        const mockPayId = `pay_mock_${String(orderId).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        if (id === mockPayId) {
          return {
            id,
            status: 'captured',
            amount: order.amount,
            currency: order.currency || 'INR',
            order_id: orderId,
          };
        }
      }
      return {
        id,
        status: 'failed',
        amount: 0,
        currency: 'INR',
      };
    },
    async createRefund({ paymentId, amount, notes } = {}) {
      const refundId = `rfnd_mock_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const refund = {
        id: refundId,
        entity: 'refund',
        amount: amount ?? 0,
        currency: 'INR',
        payment_id: paymentId,
        notes: notes || {},
        status: 'processed',
      };
      return refund;
    },
    async fetchRefund(id) {
      return {
        id,
        status: 'processed',
        amount: 0,
        currency: 'INR',
      };
    },
    _mockSubs: subs,
    _mockOrders: orders,
  };
}
