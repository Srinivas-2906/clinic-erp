/**
 * Razorpay REST client with injectable mock for CI (CLINIC_RAZORPAY_MOCK=1).
 */

const BASE = 'https://api.razorpay.com/v1';

function basicAuth(keyId, keySecret) {
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
}

export function shouldUseRazorpayMock() {
  return process.env.CLINIC_RAZORPAY_MOCK === '1' || process.env.NODE_ENV === 'test';
}

export function createRazorpayClient({ keyId, keySecret, mock = shouldUseRazorpayMock() } = {}) {
  if (mock) {
    return createMockClient();
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
  };
}

function createMockClient() {
  const subs = new Map();
  return {
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
    /** Test helper — simulate provider activation webhook payload */
    _mockSubs: subs,
  };
}
