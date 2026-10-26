import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { createRateLimiter } from '../utils/rateLimiter.js';
import { deliverPasswordResetEmail } from './emailDelivery.js';
const RESET_EXPIRY_MINUTES = Number(process.env.PASSWORD_RESET_EXPIRY_MINUTES || 60);

export const checkForgotPasswordRateLimit = createRateLimiter({
  max: Number(process.env.FORGOT_PASSWORD_RATE_MAX || 5),
  windowMs: Number(process.env.FORGOT_PASSWORD_RATE_WINDOW_MS || 15 * 60 * 1000),
});

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function genericSuccess() {
  return {
    ok: true,
    message: 'If an account exists for that email, you will receive password reset instructions shortly.',
  };
}

export function buildResetPasswordUrl(token) {
  const base = (process.env.CLINIC_CRM_URL || 'http://localhost:5185').replace(/\/$/, '');
  return `${base}/?reset-password=${encodeURIComponent(token)}`;
}

export function requestPasswordReset(tenantId, emailRaw) {
  const db = getDb();
  const email = normalizeEmail(emailRaw);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address');
  }

  const user = db.prepare(`
    SELECT id, email, name, tenant_id FROM users
    WHERE email = ? AND tenant_id = ?
  `).get(email, tenantId);

  if (!user) {
    return genericSuccess();
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_EXPIRY_MINUTES * 60 * 1000).toISOString();

  db.prepare(`
    UPDATE password_reset_tokens SET used_at = datetime('now')
    WHERE user_id = ? AND used_at IS NULL
  `).run(user.id);

  db.prepare(`
    INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(nanoid(12), user.id, tokenHash, expiresAt);

  const resetUrl = buildResetPasswordUrl(rawToken);
  void deliverPasswordResetEmail({
    to: user.email,
    name: user.name,
    resetUrl,
    expiresMinutes: RESET_EXPIRY_MINUTES,
  }).then((result) => {
    if (result && !result.delivered) {
      console.warn('[password-reset] email not delivered', { reason: result.reason || 'unknown' });
    }
  }).catch((err) => {
    console.error('[password-reset] email delivery error', err?.message || err);
  });

  const out = genericSuccess();
  const allowDevExpose = process.env.CLINIC_PASSWORD_RESET_EXPOSE_TOKEN === '1'
    && process.env.NODE_ENV !== 'production'
    && process.env.CLINIC_ALLOW_RESET_TOKEN_EXPOSE === '1';
  if (allowDevExpose) {
    out.resetUrl = resetUrl;
    out.devToken = rawToken;
  }
  return out;
}

export function validateResetToken(rawToken) {
  const db = getDb();
  if (!rawToken || rawToken.length < 20) return { valid: false, error: 'Invalid link' };

  const tokenHash = hashToken(rawToken);
  const row = db.prepare(`
    SELECT t.*, u.email, u.name, u.tenant_id
    FROM password_reset_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
  `).get(tokenHash);

  if (!row) return { valid: false, error: 'This link is invalid or has expired' };
  if (row.used_at) return { valid: false, error: 'This link has already been used' };
  if (new Date(row.expires_at) < new Date()) {
    return { valid: false, error: 'This link has expired. Request a new reset link.' };
  }

  return {
    valid: true,
    email: row.email,
    name: row.name || '',
    purpose: 'reset',
  };
}

export function completePasswordReset(rawToken, password) {
  const db = getDb();
  const check = validateResetToken(rawToken);
  if (!check.valid) throw new Error(check.error);

  const pwd = String(password || '');
  if (pwd.length < 8) throw new Error('Password must be at least 8 characters');

  const tokenHash = hashToken(rawToken);
  const row = db.prepare('SELECT * FROM password_reset_tokens WHERE token_hash = ?').get(tokenHash);
  if (!row || row.used_at) throw new Error('Invalid or used link');

  const hash = bcrypt.hashSync(pwd, 10);
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET password_hash = ?, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?')
    .run(hash, row.user_id);
  db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now, row.id);

  const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(row.user_id);
  return { email: user.email, name: user.name };
}
