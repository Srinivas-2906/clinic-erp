import { describe, it, after, mock } from 'node:test';
import assert from 'node:assert/strict';

const envSnapshot = { ...process.env };

describe('emailDelivery', () => {
  after(() => {
    Object.assign(process.env, envSnapshot);
  });

  it('console provider delivers without exposing link in return value', async () => {
    process.env.CLINIC_EMAIL_PROVIDER = 'console';
    const { deliverPasswordResetEmail } = await import('./emailDelivery.js');
    const r = await deliverPasswordResetEmail({
      to: 'staff@test.invalid',
      name: 'Staff',
      resetUrl: 'https://crm.example/?reset-password=abc123secret',
      expiresMinutes: 60,
    });
    assert.equal(r.delivered, true);
    assert.equal(r.provider, 'console');
  });

  it('resend provider sends via API when configured', async () => {
    process.env.CLINIC_EMAIL_PROVIDER = 'resend';
    process.env.CLINIC_RESEND_API_KEY = 're_test_key';
    process.env.CLINIC_EMAIL_FROM = 'Clinic Desk <onboarding@resend.dev>';

    const calls = [];
    mock.method(globalThis, 'fetch', async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200, text: async () => '' };
    });

    const { deliverMail } = await import('./emailDelivery.js');
    const r = await deliverMail({
      to: 'ops@test.invalid',
      subject: 'Test',
      text: 'Hello',
    });

    assert.equal(r.delivered, true);
    assert.equal(r.provider, 'resend');
    assert.equal(calls.length, 1);
    assert.match(String(calls[0].url), /api\.resend\.com/);
    const body = JSON.parse(calls[0].init.body);
    assert.deepEqual(body.to, ['ops@test.invalid']);
    assert.equal(body.text, 'Hello');
    assert.equal(calls[0].init.headers.Authorization, 'Bearer re_test_key');
    assert.ok(!body.text.includes('re_test_key'));

    mock.restoreAll();
  });

  it('resend returns failure when API key missing', async () => {
    process.env.CLINIC_EMAIL_PROVIDER = 'resend';
    delete process.env.CLINIC_RESEND_API_KEY;
    process.env.CLINIC_EMAIL_FROM = 'Clinic Desk <noreply@example.com>';

    const { deliverMail } = await import('./emailDelivery.js');
    const r = await deliverMail({ to: 'a@b.invalid', subject: 'S', text: 'T' });
    assert.equal(r.delivered, false);
    assert.equal(r.reason, 'resend_not_configured');
  });

  it('smtp reports not configured when host missing', async () => {
    process.env.CLINIC_EMAIL_PROVIDER = 'smtp';
    delete process.env.CLINIC_SMTP_HOST;
    process.env.CLINIC_EMAIL_FROM = 'noreply@example.com';

    const { deliverMail } = await import('./emailDelivery.js');
    const r = await deliverMail({ to: 'a@b.invalid', subject: 'S', text: 'T' });
    assert.equal(r.delivered, false);
    assert.equal(r.reason, 'smtp_not_configured');
  });
});
