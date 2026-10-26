/**
 * Transactional email — configure via env or use console delivery for staging/dev.
 *
 * CLINIC_EMAIL_PROVIDER: unset | console | smtp | resend
 * SMTP: CLINIC_SMTP_HOST, CLINIC_SMTP_PORT, CLINIC_SMTP_USER, CLINIC_SMTP_PASS, CLINIC_EMAIL_FROM
 * Resend: CLINIC_RESEND_API_KEY (Secret Manager), CLINIC_EMAIL_FROM (verified sender)
 */

function resolveProvider() {
  const explicit = (process.env.CLINIC_EMAIL_PROVIDER || '').trim().toLowerCase();
  if (explicit) return explicit;
  return process.env.NODE_ENV === 'production' ? '' : 'console';
}

export async function deliverPasswordResetEmail({ to, name, resetUrl, expiresMinutes }) {
  const subject = 'Reset your Clinic Desk password';
  const text = [
    `Hello${name ? ` ${name}` : ''},`,
    '',
    'We received a request to reset your password.',
    `Use this link within ${expiresMinutes} minutes (single use):`,
    resetUrl,
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  return deliverMail({ to, subject, text });
}

export async function deliverMail({ to, subject, text }) {
  if (!to) return { delivered: false, reason: 'no_recipient' };

  const provider = resolveProvider();

  if (provider === 'console' || provider === 'log') {
    console.info('[clinic-email:console]', JSON.stringify({
      to,
      subject,
      bodyBytes: text.length,
      note: 'Reset link omitted from logs',
    }));
    return { delivered: true, provider: 'console' };
  }

  if (provider === 'resend') {
    const apiKey = process.env.CLINIC_RESEND_API_KEY?.trim();
    const from = process.env.CLINIC_EMAIL_FROM?.trim();
    if (!apiKey || !from) {
      console.warn('[clinic-email] Resend not fully configured (need CLINIC_RESEND_API_KEY and CLINIC_EMAIL_FROM)');
      return { delivered: false, reason: 'resend_not_configured' };
    }
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[clinic-email] Resend send failed', res.status, body.slice(0, 200));
        return { delivered: false, reason: 'resend_error' };
      }
      return { delivered: true, provider: 'resend' };
    } catch (err) {
      console.error('[clinic-email] Resend request failed', err?.message || err);
      return { delivered: false, reason: 'resend_error' };
    }
  }

  if (provider === 'smtp') {
    const host = process.env.CLINIC_SMTP_HOST?.trim();
    const from = process.env.CLINIC_EMAIL_FROM?.trim();
    if (!host || !from) {
      console.warn('[clinic-email] SMTP not fully configured; password reset email not sent');
      return { delivered: false, reason: 'smtp_not_configured' };
    }
    try {
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        host,
        port: Number(process.env.CLINIC_SMTP_PORT || 587),
        secure: process.env.CLINIC_SMTP_SECURE === '1',
        auth: process.env.CLINIC_SMTP_USER ? {
          user: process.env.CLINIC_SMTP_USER,
          pass: process.env.CLINIC_SMTP_PASS || '',
        } : undefined,
      });
      await transporter.sendMail({ from, to, subject, text });
      return { delivered: true, provider: 'smtp' };
    } catch (err) {
      console.error('[clinic-email] SMTP send failed', err?.message || err);
      return { delivered: false, reason: 'smtp_error' };
    }
  }

  console.warn('[clinic-email] No email provider configured (set CLINIC_EMAIL_PROVIDER=console or smtp)');
  return { delivered: false, reason: 'provider_not_configured' };
}

export function getEmailProviderStatus() {
  const provider = resolveProvider() || 'none';
  return {
    provider,
    smtpConfigured: !!(process.env.CLINIC_SMTP_HOST && process.env.CLINIC_EMAIL_FROM),
    resendConfigured: !!(process.env.CLINIC_RESEND_API_KEY && process.env.CLINIC_EMAIL_FROM),
  };
}
