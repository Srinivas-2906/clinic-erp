#!/usr/bin/env node
/**
 * Non-secret environment readiness check for Clinic API (stdout JSON, exit 1 if pilot blockers).
 */
const tier = process.argv.includes('--commercial') ? 'commercial' : (process.argv.includes('--pilot') ? 'pilot' : 'local');

const checks = [];

function add(id, level, ok, detail) {
  checks.push({ id, level, ok, detail });
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

add('JWT_SECRET', 'pilot', !isProd || (process.env.JWT_SECRET && process.env.JWT_SECRET !== 'clinic-dev-secret-change-in-production'),
  isProd ? 'Must set strong JWT_SECRET in production' : 'Dev default acceptable locally');

add('DATABASE_PATH', 'local', !!process.env.DATABASE_PATH || true, 'Defaults under apps/api/data');

const storage = process.env.CLINIC_FILES_STORAGE || 'local';
if (tier === 'pilot' || tier === 'commercial') {
  add('CLINIC_FILES_BUCKET', 'pilot', storage !== 'gcs' || !!process.env.CLINIC_FILES_BUCKET,
    'GCS mode requires CLINIC_FILES_BUCKET');
  add('LITESTREAM_BUCKET', 'pilot', !!process.env.LITESTREAM_BUCKET || !isProd,
    'Pilot/staging should set LITESTREAM_BUCKET for durable SQLite');
}

if (tier === 'pilot' || tier === 'commercial') {
  const emailProvider = process.env.CLINIC_EMAIL_PROVIDER || 'console';
  const smtpOk = !!(process.env.CLINIC_SMTP_HOST && process.env.CLINIC_EMAIL_FROM);
  const resendOk = !!(process.env.CLINIC_RESEND_API_KEY && process.env.CLINIC_EMAIL_FROM);
  add('EMAIL_DELIVERY', 'pilot', emailProvider === 'console' || smtpOk || resendOk,
    'Pilot staff need SMTP or Resend + CLINIC_EMAIL_FROM for password reset');
  add('CLINIC_CRM_URL', 'pilot', !!process.env.CLINIC_CRM_URL,
    'Password reset links require public CRM base URL');
}

if (tier === 'commercial') {
  add('PAYMENT_GATEWAY', 'commercial', false, 'paymentGateway.js not configured — manual plan changes only');
  add('REMINDER_DELIVERY', 'commercial', process.env.REMINDER_DELIVERY_ENABLED !== '1',
    'Live reminders require explicit REMINDER_DELIVERY_ENABLED=1 approval');
}

const blockers = checks.filter((c) => !c.ok && (c.level === tier || (tier === 'commercial' && c.level === 'pilot')));
const ok = blockers.length === 0;

console.log(JSON.stringify({ tier, ok, checks, blockers: blockers.map((b) => b.id) }, null, 2));
process.exit(ok ? 0 : 1);
