import type { Payment } from '../types';
import type { ClinicProfile } from './clinicBranding';
import { patientFirstName } from './clinicBranding';

function formatRs(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

function formatReceiptDate(iso?: string): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatPaymentReceiptMessage(
  payment: Payment,
  patientName: string,
  clinic: ClinicProfile,
): string {
  const greeting = patientFirstName(patientName);
  const amount = formatRs(payment.amount || 0);
  const date = formatReceiptDate(payment.createdAt);

  const lines: string[] = [];

  lines.push(`*${clinic.name}*`);
  if (clinic.doctorName) {
    lines.push(`${clinic.doctorName}${clinic.city ? ` · ${clinic.city}` : ''}`);
  }
  lines.push('');
  lines.push(`Dear ${greeting},`);
  lines.push('');
  lines.push('Thank you for visiting us today. Here is your payment receipt:');
  lines.push('');
  lines.push(`*Amount paid:* ${amount}`);
  lines.push(`*Method:* ${payment.method || '—'}`);
  if (date) lines.push(`*Date:* ${date}`);
  if (payment.notes?.trim()) lines.push(`*Treatment / note:* ${payment.notes.trim()}`);
  if (payment.reference?.trim()) lines.push(`*Reference:* ${payment.reference.trim()}`);

  lines.push('');
  if (clinic.googleReviewUrl?.trim()) {
    lines.push('If you were happy with your visit, please leave us a Google review:');
    lines.push(clinic.googleReviewUrl.trim());
    lines.push('');
  }
  if (clinic.phone) {
    lines.push(`For any help, call or WhatsApp: ${clinic.phone}`);
  }
  if (clinic.addressShort) {
    lines.push(`📍 ${clinic.addressShort}`);
  }
  if (clinic.website) {
    lines.push(`🌐 ${clinic.website.replace(/^https?:\/\//, '')}`);
  }
  lines.push('');
  lines.push(clinic.closingLine);
  lines.push(`— ${clinic.signOffName}`);

  return lines.join('\n');
}

/** Plain-text preview for the dialog (strips WhatsApp bold markers). */
export function formatPaymentReceiptPreview(message: string): string {
  return message.replace(/\*([^*]+)\*/g, '$1');
}

/** Message body only — header shown separately in the bubble UI. */
export function formatPaymentReceiptPreviewBody(message: string): string {
  const plain = formatPaymentReceiptPreview(message);
  const idx = plain.indexOf('Dear ');
  return idx >= 0 ? plain.slice(idx) : plain;
}
