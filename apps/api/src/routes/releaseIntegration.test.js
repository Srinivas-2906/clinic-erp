/**
 * Focused HTTP integration smoke for release candidates (#24 + #25).
 * Synthetic data only; no external providers.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-int-'));
const RUN = Date.now();
process.env.DATABASE_PATH = path.join(tmpDir, 'release.db');
process.env.DATA_DIR = tmpDir;
process.env.SKIP_DEMO_SEED = '1';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'release-integration-secret';
process.env.CLINIC_PROVISIONING_API_KEY = 'test-provisioning-key';
process.env.REMINDER_DELIVERY_ENABLED = '0';
process.env.CLINIC_FILES_STORAGE = 'memory';

const { createApiApp } = await import('../appFactory.js');
const { initDatabase, getDb } = await import('../db/index.js');
const { initReminderInfrastructure, enqueueReminder, processDueReminders } = await import('../services/reminders/index.js');
const { createDoctor } = await import('../modules/providers/doctors.service.js');
const {
  createMemoryUploadStorage,
  setUploadStorageBackendForTests,
  resetUploadStorageBackendForTests,
} = await import('../services/uploadStorage.js');

const TENANT = `t-release-${RUN}`;
const SLUG = `release-clinic-${RUN}`;
const PASS = 'ReleaseTest@1';

let app;
let ownerToken;
let receptionistToken;
let doctorToken;
let platformToken;
let patientId;
let appointmentId;

function createApp() {
  return createApiApp();
}

async function http(method, url, { token, body, headers = {}, tenantSlug = SLUG } = {}) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = text; }
    return { status: res.status, json };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

before(() => {
  setUploadStorageBackendForTests(createMemoryUploadStorage());
  initDatabase();
  initReminderInfrastructure();
  const db = getDb();
  const hash = bcrypt.hashSync(PASS, 4);
  db.prepare(`
    INSERT INTO tenants (id, slug, name, plan, status, subscription_status, settings)
    VALUES (?, ?, 'Release Clinic', 'professional', 'active', 'active', '{"timezone":"Asia/Kolkata"}')
  `).run(TENANT, SLUG);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, 'Owner', 'owner', 0)
  `).run(`owner-${RUN}`, TENANT, `owner-${RUN}@release.test`, hash);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, 'Recv', 'receptionist', 0)
  `).run(`recv-${RUN}`, TENANT, `recv-${RUN}@release.test`, hash);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, ?, ?, ?, 'Doc', 'doctor', 0)
  `).run(`doc-${RUN}`, TENANT, `doc-${RUN}@release.test`, hash);
  db.prepare(`
    INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
    VALUES (?, NULL, ?, ?, 'Platform', 'owner', 1)
  `).run(`plat-${RUN}`, `platform-${RUN}@release.test`, hash);

  const doc = createDoctor(
    TENANT,
    { sub: `owner-${RUN}`, tenantId: TENANT, role: 'owner', isPlatformAdmin: false },
    { name: 'Dr Release' },
  );
  db.prepare(`UPDATE doctors SET user_id = ? WHERE id = ?`).run(`doc-${RUN}`, doc.id);

  app = createApp();
});

after(() => {
  resetUploadStorageBackendForTests();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('release integration (HTTP)', () => {
  it('1–2 clinic owner and staff login + permissions', async () => {
    const ownerLogin = await http('POST', '/api/platform/login', {
      body: { email: `owner-${RUN}@release.test`, password: PASS, tenantSlug: SLUG },
      tenantSlug: null,
    });
    assert.equal(ownerLogin.status, 200);
    ownerToken = ownerLogin.json.token;
    assert.ok(ownerToken);

    const me = await http('GET', '/api/platform/me', { token: ownerToken });
    assert.equal(me.status, 200);
    assert.equal(me.json.user?.role, 'owner');

    const recvLogin = await http('POST', '/api/platform/login', {
      body: { email: `recv-${RUN}@release.test`, password: PASS, tenantSlug: SLUG },
      tenantSlug: null,
    });
    receptionistToken = recvLogin.json.token;
    const docLogin = await http('POST', '/api/platform/login', {
      body: { email: `doc-${RUN}@release.test`, password: PASS, tenantSlug: SLUG },
      tenantSlug: null,
    });
    doctorToken = docLogin.json.token;

    const doctorPay = await http('POST', '/api/clinic/payments', {
      token: doctorToken,
      body: { patientId: 'x', amount: 1, method: 'cash' },
    });
    assert.equal(doctorPay.status, 403);

    const recvExport = await http('GET', '/api/clinic/export', { token: receptionistToken });
    assert.equal(recvExport.status, 403);
  });

  it('3 patient registration and booking', async () => {
    const created = await http('POST', '/api/patients', {
      token: receptionistToken,
      body: { name: 'Release Patient', phone: '9876543210' },
    });
    assert.equal(created.status, 201);
    patientId = created.json.id;

    const scheduledAt = new Date(Date.now() + 86400000).toISOString();
    const appt = await http('POST', '/api/appointments', {
      token: receptionistToken,
      body: { patientId, scheduledAt, service: 'Consult', status: 'confirmed' },
    });
    assert.equal(appt.status, 201);
    appointmentId = appt.json.id;
  });

  it('4 consultation create and finalize (doctor)', async () => {
    const enc = await http('POST', `/api/clinic/patients/${patientId}/encounters`, {
      token: doctorToken,
      body: { appointmentId },
    });
    assert.equal(enc.status, 201, JSON.stringify(enc.json));
    const encId = enc.json.encounter?.id || enc.json.id;
    const fin = await http('POST', `/api/clinic/encounters/${encId}/finalize`, {
      token: doctorToken,
      body: {},
    });
    assert.equal(fin.status, 200, JSON.stringify(fin.json));
    assert.equal(fin.json.encounter?.status || fin.json.status, 'finalized');
  });

  it('5–6 invoice, partial payment, refund, outstanding', async () => {
    const inv = await http('POST', '/api/clinic/invoices', {
      token: receptionistToken,
      body: {
        patientId,
        lineItems: [{ description: 'Treatment', unitPrice: 1000, quantity: 1 }],
      },
    });
    assert.equal(inv.status, 201);
    const invoiceId = inv.json.id;

    const p1 = await http('POST', '/api/clinic/payments', {
      token: receptionistToken,
      body: { patientId, amount: 400, method: 'cash', invoiceId, idempotencyKey: 'rel-p1' },
    });
    assert.equal(p1.status, 201);
    const got = await http('GET', `/api/clinic/invoices/${invoiceId}`, { token: ownerToken });
    assert.equal(got.json.status, 'partial');
    assert.equal(got.json.balanceDue, 600);

    const p2 = await http('POST', '/api/clinic/payments', {
      token: receptionistToken,
      body: { patientId, amount: 600, method: 'cash', invoiceId, idempotencyKey: 'rel-p2' },
    });
    assert.equal(p2.status, 201);
    const paid = await http('GET', `/api/clinic/invoices/${invoiceId}`, { token: ownerToken });
    assert.equal(paid.json.status, 'paid');

    const standalone = await http('POST', '/api/clinic/payments', {
      token: receptionistToken,
      body: { patientId, amount: 200, method: 'cash', idempotencyKey: 'rel-ref' },
    });
    assert.equal(standalone.status, 201);
    const refund = await http('POST', `/api/clinic/payments/${standalone.json.id}/refund`, {
      token: ownerToken,
      body: { amount: 50, idempotencyKey: 'rel-r1' },
    });
    assert.equal(refund.status, 201);
  });

  it('7–8 platform admin login, tenant list; clinic user denied', async () => {
    const platLogin = await http('POST', '/api/platform/login', {
      body: { email: `platform-${RUN}@release.test`, password: PASS },
      tenantSlug: null,
    });
    assert.equal(platLogin.status, 200);
    assert.equal(platLogin.json.user?.isPlatformAdmin, true);
    platformToken = platLogin.json.token;

    const list = await http('GET', '/api/platform/admin/tenants?search=release', {
      token: platformToken,
      tenantSlug: null,
    });
    assert.equal(list.status, 200);
    assert.ok(list.json.tenants?.some((t) => t.slug === SLUG));

    const denied = await http('GET', '/api/platform/admin/tenants', { token: ownerToken });
    assert.equal(denied.status, 403);
  });

  it('9 owner entitlements and export', async () => {
    const ent = await http('GET', '/api/clinic/entitlements', { token: ownerToken });
    assert.equal(ent.status, 200);
    assert.ok(ent.json.planId);

    const exp = await http('GET', '/api/clinic/export', { token: ownerToken });
    assert.equal(exp.status, 200);
    assert.equal(exp.json.tenant?.slug, SLUG);
    assert.ok(Array.isArray(exp.json.patients));
  });

  it('10 reminder processing (mock) and cancel on appointment', async () => {
    const db = getDb();
    const emailJob = enqueueReminder({
      tenantId: TENANT,
      appointmentId: null,
      kind: 'payment_receipt',
      recipient: `owner-${RUN}@release.test`,
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
      payload: { amount: 100 },
    });
    assert.ok(emailJob);

    const internal = await http('POST', '/api/platform/internal/process-reminders', {
      body: { limit: 10 },
      headers: { 'x-clinic-provisioning-key': 'test-provisioning-key' },
      tenantSlug: null,
    });
    assert.equal(internal.status, 200);
    const row = db.prepare(`SELECT status FROM reminder_jobs WHERE id = ?`).get(emailJob);
    assert.equal(row.status, 'delivered');

    const cancelAppt = await http('POST', '/api/appointments', {
      token: receptionistToken,
      body: {
        patientId,
        scheduledAt: new Date(Date.now() + 172800000).toISOString(),
        service: 'Consult',
        status: 'confirmed',
      },
    });
    assert.equal(cancelAppt.status, 201);
    const cancelApptId = cancelAppt.json.id;

    db.prepare(`
      INSERT INTO reminder_jobs (id, tenant_id, appointment_id, kind, channel, recipient, payload, scheduled_at, status)
      VALUES ('pending-cancel-test', ?, ?, 'appointment_reminder', 'mock', '9876543210', '{}', datetime('now'), 'pending')
    `).run(TENANT, cancelApptId);

    await http('PATCH', `/api/appointments/${cancelApptId}`, {
      token: receptionistToken,
      body: { status: 'cancelled' },
    });
    const pending = db.prepare(`
      SELECT status FROM reminder_jobs WHERE id = 'pending-cancel-test'
    `).get();
    assert.equal(pending.status, 'cancelled');
  });
});
