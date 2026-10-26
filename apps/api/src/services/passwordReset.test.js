import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

process.env.CLINIC_PASSWORD_RESET_EXPOSE_TOKEN = '1';
process.env.CLINIC_ALLOW_RESET_TOKEN_EXPOSE = '1';
process.env.NODE_ENV = 'test';
process.env.CLINIC_EMAIL_PROVIDER = 'console';

const tmpDb = path.join(os.tmpdir(), `pwd-reset-${Date.now()}.db`);
process.env.DATABASE_PATH = tmpDb;
process.env.SKIP_DEMO_SEED = '1';

const { initDatabase, getDb } = await import('../db/index.js');
const {
  requestPasswordReset,
  validateResetToken,
  completePasswordReset,
  buildResetPasswordUrl,
  checkForgotPasswordRateLimit,
} = await import('./passwordReset.js');
const { loginUser, verifyToken } = await import('../middleware/auth.js');

before(() => {
  initDatabase();
  const db = getDb();
  db.prepare(`
    INSERT INTO tenants (id, slug, name, status) VALUES ('t1', 'demo', 'Demo', 'active')
  `).run();
  const hash = bcrypt.hashSync('OldPass@123', 10);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, session_version)
    VALUES ('u1', 't1', 'staff@test.invalid', ?, 'Staff', 'staff', 0)
  `).run(hash);
});

after(() => {
  try { fs.unlinkSync(tmpDb); } catch { /* ok */ }
});

describe('passwordReset', () => {
  it('returns generic message for unknown email', () => {
    const r = requestPasswordReset('t1', 'nobody@test.invalid');
    assert.equal(r.ok, true);
    assert.ok(r.message.includes('If an account exists'));
    assert.equal(r.resetUrl, undefined);
  });

  it('issues single-use token and invalidates old sessions after reset', () => {
    const before = loginUser('staff@test.invalid', 'OldPass@123', { tenantSlug: 'demo' });
    assert.ok(before.token);

    const req = requestPasswordReset('t1', 'staff@test.invalid');
    assert.ok(req.resetUrl);
    const token = req.devToken;
    assert.ok(token);

    const v = validateResetToken(token);
    assert.equal(v.valid, true);
    assert.equal(v.email, 'staff@test.invalid');

    completePasswordReset(token, 'NewPass@456');
    assert.throws(() => completePasswordReset(token, 'NewPass@456'));

    const afterLogin = loginUser('staff@test.invalid', 'NewPass@456', { tenantSlug: 'demo' });
    assert.ok(afterLogin.token);

    const payload = verifyToken(before.token);
    const row = getDb().prepare('SELECT session_version FROM users WHERE id = ?').get('u1');
    assert.notEqual(payload.sv ?? 0, row.session_version);
  });

  it('buildResetPasswordUrl uses CLINIC_CRM_URL and query param', () => {
    process.env.CLINIC_CRM_URL = 'https://kaana-clinic-staging.example.run.app';
    const url = buildResetPasswordUrl('tok_en_abc');
    assert.equal(url, 'https://kaana-clinic-staging.example.run.app/?reset-password=tok_en_abc');
  });

  it('rejects expired and reused tokens', () => {
    const req = requestPasswordReset('t1', 'staff@test.invalid');
    const token = req.devToken;
    const db = getDb();
    db.prepare(`
      UPDATE password_reset_tokens SET expires_at = '2000-01-01T00:00:00.000Z'
      WHERE token_hash = ?
    `).run(crypto.createHash('sha256').update(token).digest('hex'));
    const expired = validateResetToken(token);
    assert.equal(expired.valid, false);
    assert.match(expired.error, /expired/i);

    const req2 = requestPasswordReset('t1', 'staff@test.invalid');
    const token2 = req2.devToken;
    completePasswordReset(token2, 'AnotherPass1');
    const reused = validateResetToken(token2);
    assert.equal(reused.valid, false);
    assert.match(reused.error, /already been used/i);
  });

  it('rate limits forgot-password by client ip', () => {
    const req = { headers: {}, ip: '203.0.113.99', socket: {} };
    for (let i = 0; i < 5; i += 1) {
      assert.equal(checkForgotPasswordRateLimit(req), true, `attempt ${i + 1}`);
    }
    assert.equal(checkForgotPasswordRateLimit(req), false);
  });
});
