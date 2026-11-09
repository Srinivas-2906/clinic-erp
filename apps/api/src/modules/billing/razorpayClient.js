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
  };
}

function createMockClient(keySecret = 'mock_secret') {
  const subs = new Map();
  const orders = new Map();
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
      return {
        id,
        status: 'captured',
        amount: 0,
        currency: 'INR',
      };
    },
    _mockSubs: subs,
    _mockOrders: orders,
  };
}
