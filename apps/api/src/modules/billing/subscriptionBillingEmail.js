import { nanoid } from 'nanoid';
import { getDb } from '../../db/index.js';
import { deliverMail } from '../../services/emailDelivery.js';
import { parseTenantSettings } from '../../services/clinicSettings.js';

/** Subscription SaaS emails — separate from patient appointment reminders. */
export async function notifySubscriptionBillingEvent(tenantId, kind, payload = {}) {
  const db = getDb();
  const dedupeKey = `${tenantId}:${kind}:${payload.dedupeSuffix || payload.daysLeft || payload.paymentId || 'once'}`;
  const existing = db.prepare('SELECT id FROM billing_notification_log WHERE dedupe_key = ?').get(dedupeKey);
  if (existing) return { sent: false, reason: 'duplicate' };

  const tenant = db.prepare('SELECT name, settings FROM tenants WHERE id = ?').get(tenantId);
  const settings = parseTenantSettings(tenant?.settings);
  const to = settings.email || settings.ownerEmail;
  if (!to) return { sent: false, reason: 'no_owner_email' };

  const clinicName = tenant?.name || 'Clinic';
  const templates = {
    trial_ending: {
      subject: `${clinicName} — trial ending soon`,
      text: `Your Clinic ERP trial ends in ${payload.daysLeft} day(s). Open Settings → Plan & subscription to renew.`,
    },
    trial_expired: {
      subject: `${clinicName} — trial ended`,
      text: 'Your trial has ended. Complete subscription checkout to restore full write access.',
    },
    payment_failed: {
      subject: `${clinicName} — subscription payment failed`,
      text: 'We could not process your subscription payment. Update billing in Settings or contact support.',
    },
    subscription_activated: {
      subject: `${clinicName} — subscription active`,
      text: `Your ${payload.planId || 'clinic'} plan is now active. Thank you for subscribing.`,
    },
    renewal_confirmed: {
      subject: `${clinicName} — renewal received`,
      text: 'Your subscription renewal payment was confirmed.',
    },
    subscription_cancelled: {
      subject: `${clinicName} — subscription cancelled`,
      text: 'Your subscription has been cancelled. Contact support if this was a mistake.',
    },
  };

  const tpl = templates[kind];
  if (!tpl) return { sent: false, reason: 'unknown_kind' };

  const result = await deliverMail({ to, subject: tpl.subject, text: tpl.text });
  if (result.delivered) {
    db.prepare(`
      INSERT INTO billing_notification_log (id, tenant_id, kind, dedupe_key) VALUES (?, ?, ?, ?)
    `).run(nanoid(10), tenantId, kind, dedupeKey);
  }
  return { sent: result.delivered, provider: result.provider, reason: result.reason };
}
