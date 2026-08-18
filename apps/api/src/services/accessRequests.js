import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { createRateLimiter } from '../utils/rateLimiter.js';

const INVITE_EXPIRY_DAYS = Number(process.env.INVITE_EXPIRY_DAYS || 7);

const checkAccessRequestRateLimit = createRateLimiter({
  max: Number(process.env.ACCESS_REQUEST_RATE_MAX || 5),
  windowMs: Number(process.env.ACCESS_REQUEST_RATE_WINDOW_MS || 15 * 60 * 1000),
});

export { checkAccessRequestRateLimit };

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function rowToRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name || '',
    status: row.status,
    requestedAt: row.requested_at,
    reviewedBy: row.reviewed_by || null,
    reviewedAt: row.reviewed_at || null,
    reviewNote: row.review_note || '',
  };
}

export function submitAccessRequest(tenantId, body = {}) {
  const db = getDb();
  const email = normalizeEmail(body.email);
  const name = String(body.name || '').trim();

  if (!email || !isValidEmail(email)) {
    throw new Error('Enter a valid email address');
  }
  if (!name) {
    throw new Error('Enter your name');
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    throw new Error('This email already has clinic access. Sign in or contact the clinic owner.');
  }

  const pending = db.prepare(`
    SELECT id FROM access_requests
    WHERE tenant_id = ? AND email = ? AND status = 'pending'
  `).get(tenantId, email);
  if (pending) {
    return { request: rowToRequest(db.prepare('SELECT * FROM access_requests WHERE id = ?').get(pending.id)), alreadyPending: true };
  }

  const id = nanoid(12);
  db.prepare(`
    INSERT INTO access_requests (id, tenant_id, email, name, status)
    VALUES (?, ?, ?, ?, 'pending')
  `).run(id, tenantId, email, name);

  return { request: rowToRequest(db.prepare('SELECT * FROM access_requests WHERE id = ?').get(id)), alreadyPending: false };
}

export function listAccessRequests(tenantId, { status } = {}) {
  const db = getDb();
  let rows;
  if (status) {
    rows = db.prepare(`
      SELECT * FROM access_requests
      WHERE tenant_id = ? AND status = ?
      ORDER BY datetime(requested_at) DESC
    `).all(tenantId, status);
  } else {
    rows = db.prepare(`
      SELECT * FROM access_requests
      WHERE tenant_id = ?
      ORDER BY datetime(requested_at) DESC
      LIMIT 100
    `).all(tenantId);
  }
  return rows.map(rowToRequest);
}

function createInviteToken(userId) {
  const db = getDb();
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITE_EXPIRY_DAYS);

  db.prepare(`
    INSERT INTO user_invite_tokens (id, user_id, token_hash, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(nanoid(12), userId, tokenHash, expiresAt.toISOString());

  return rawToken;
}

function buildSetPasswordUrl(token) {
  const base = (process.env.CLINIC_CRM_URL || 'http://localhost:5185').replace(/\/$/, '');
  return `${base}/?set-password=${encodeURIComponent(token)}`;
}

export function approveAccessRequest(requestId, tenantId, reviewerId, { note } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM access_requests WHERE id = ? AND tenant_id = ?').get(requestId, tenantId);
  if (!row) throw new Error('Request not found');
  if (row.status !== 'pending') throw new Error('Request is no longer pending');

  const email = normalizeEmail(row.email);
  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existingUser) {
    throw new Error('This email already has clinic access');
  }

  const userId = `user-${nanoid(10)}`;
  const placeholderHash = bcrypt.hashSync(crypto.randomBytes(24).toString('hex'), 10);
  const displayName = String(row.name || email.split('@')[0]).trim() || 'Staff';

  db.prepare(`
    INSERT INTO users (id, tenant_id, username, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, NULL, ?, ?, ?, 'staff', 0)
  `).run(userId, tenantId, email, placeholderHash, displayName);

  const rawToken = createInviteToken(userId);
  const now = new Date().toISOString();

  db.prepare(`
    UPDATE access_requests
    SET status = 'approved', reviewed_by = ?, reviewed_at = ?, review_note = ?
    WHERE id = ?
  `).run(reviewerId, now, String(note || '').trim(), requestId);

  const request = rowToRequest(db.prepare('SELECT * FROM access_requests WHERE id = ?').get(requestId));
  const setPasswordUrl = buildSetPasswordUrl(rawToken);

  return {
    request,
    user: { id: userId, email, name: displayName, role: 'staff' },
    setPasswordUrl,
    expiresInDays: INVITE_EXPIRY_DAYS,
  };
}

export function rejectAccessRequest(requestId, tenantId, reviewerId, { note } = {}) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM access_requests WHERE id = ? AND tenant_id = ?').get(requestId, tenantId);
  if (!row) throw new Error('Request not found');
  if (row.status !== 'pending') throw new Error('Request is no longer pending');

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE access_requests
    SET status = 'rejected', reviewed_by = ?, reviewed_at = ?, review_note = ?
    WHERE id = ?
  `).run(reviewerId, now, String(note || '').trim(), requestId);

  return { request: rowToRequest(db.prepare('SELECT * FROM access_requests WHERE id = ?').get(requestId)) };
}

export function validateInviteToken(rawToken) {
  const db = getDb();
  if (!rawToken || rawToken.length < 20) return { valid: false, error: 'Invalid link' };

  const tokenHash = hashToken(rawToken);
  const invite = db.prepare(`
    SELECT t.*, u.email, u.name, u.tenant_id
    FROM user_invite_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token_hash = ?
  `).get(tokenHash);

  if (!invite) return { valid: false, error: 'This link is invalid or has expired' };
  if (invite.used_at) return { valid: false, error: 'This link has already been used' };
  if (new Date(invite.expires_at) < new Date()) {
    return { valid: false, error: 'This link has expired. Ask the clinic owner for a new invite.' };
  }

  return {
    valid: true,
    email: invite.email,
    name: invite.name || '',
  };
}

export function completePasswordSetup(rawToken, password) {
  const db = getDb();
  const check = validateInviteToken(rawToken);
  if (!check.valid) throw new Error(check.error);

  const pwd = String(password || '');
  if (pwd.length < 8) throw new Error('Password must be at least 8 characters');

  const tokenHash = hashToken(rawToken);
  const invite = db.prepare('SELECT * FROM user_invite_tokens WHERE token_hash = ?').get(tokenHash);
  if (!invite || invite.used_at) throw new Error('Invalid or used link');

  const hash = bcrypt.hashSync(pwd, 10);
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, invite.user_id);
  db.prepare('UPDATE user_invite_tokens SET used_at = ? WHERE id = ?').run(now, invite.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(invite.user_id);
  return {
    email: user.email,
    name: user.name,
  };
}
