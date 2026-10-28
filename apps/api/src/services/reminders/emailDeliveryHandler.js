import { createMockReminderProvider } from './mockProvider.js';
import { deliverMail } from '../emailDelivery.js';

const mockProvider = createMockReminderProvider();

/** Mock/console delivery for email-shaped reminder jobs — no real patient SMS without approval. */
export async function deliverReminderAsEmail(jobRow) {
  const payload = JSON.parse(jobRow.payload || '{}');
  const kind = jobRow.kind;
  let subject = 'Clinic notification';
  let text = JSON.stringify(payload);
  if (kind === 'appointment_reminder' || kind === 'appointment_confirmation') {
    subject = 'Appointment reminder';
    text = `Reminder for your appointment${payload.scheduledAt ? ` on ${payload.scheduledAt}` : ''}. (Mock delivery — not sent to real patients in dev.)`;
  } else if (kind === 'payment_receipt') {
    subject = 'Payment receipt';
    text = `Payment recorded: ₹${payload.amount ?? '—'}. (Mock delivery.)`;
  } else if (kind === 'outstanding_invoices_digest') {
    subject = 'Outstanding invoices summary';
    text = `Open balance: ₹${payload.outstandingBalance ?? 0} across ${payload.openInvoiceCount ?? 0} invoice(s).`;
  } else if (kind === 'subscription_expiry_notice') {
    subject = 'Subscription / trial notice';
    text = `Trial or subscription date: ${payload.trialEndsAt ?? '—'}. Contact support to renew. (No payment gateway configured.)`;
  } else if (kind === 'daily_ops_summary') {
    subject = 'Daily clinic summary';
    text = `Today's snapshot: ${JSON.stringify(payload)}`;
  }
  const to = jobRow.recipient;
  if (!to) return { delivered: false, reason: 'no_recipient' };
  mockProvider.send({
    tenantId: jobRow.tenant_id,
    appointmentId: jobRow.appointment_id,
    kind: jobRow.kind,
    channel: 'mock',
    recipient: to,
    payload,
  });
  if (process.env.REMINDER_DELIVERY_ENABLED === '1') {
    return deliverMail({ to, subject, text });
  }
  return { delivered: true, provider: 'mock', note: 'REMINDER_DELIVERY_ENABLED not set' };
}
