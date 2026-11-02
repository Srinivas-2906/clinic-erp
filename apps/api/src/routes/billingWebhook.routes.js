import { Router } from 'express';
import {
  verifyRazorpayWebhookSignature,
  processSubscriptionWebhook,
} from '../modules/billing/subscriptionBilling.service.js';

export function billingWebhookRouter() {
  const r = Router();

  r.post('/razorpay-subscription', expressRawJson, (req, res) => {
    const rawBody = req.rawBody || '';
    let payload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    const sig = req.headers['x-razorpay-signature'] || req.headers['x-clinic-webhook-signature'];
    const verify = verifyRazorpayWebhookSignature(rawBody, sig);
    if (!verify.ok) {
      return res.status(401).json({ error: 'Invalid webhook signature', code: verify.reason });
    }
    try {
      const result = processSubscriptionWebhook('razorpay', payload, { rawBody });
      res.json(result);
    } catch (err) {
      res.status(err.status || 400).json({ error: err.message });
    }
  });

  return r;
}

function expressRawJson(req, res, next) {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    req.rawBody = Buffer.concat(chunks).toString('utf8');
    next();
  });
  req.on('error', next);
}
