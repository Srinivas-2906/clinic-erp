#!/usr/bin/env node
/**
 * Authenticated staging smoke (synthetic tenant only). Password from Secret Manager — never logged.
 */
import { execSync } from 'node:child_process';

const API = process.env.STAGING_API_URL || 'https://clinic-api-staging-ofczrxs2ca-el.a.run.app';
const CRM = process.env.STAGING_CRM_URL || 'https://kaana-clinic-staging-ofczrxs2ca-el.a.run.app';
const TENANT = 'dentacare';
const OWNER_EMAIL = 'staging-owner@clinic-erp.invalid';

function secretPassword() {
  const fromEnv = process.env.STAGING_DEMO_PASSWORD?.trim();
  if (fromEnv) return fromEnv;

  try {
    return execSync(
      'gcloud secrets versions access latest --secret=clinic-staging-demo-password --project=clinic-erp-staging',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch (err) {
    const stderr = String(err.stderr || err.message || '');
    const account = execSync('gcloud config get-value account 2>/dev/null', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();

    console.error('Could not read clinic-staging-demo-password from Secret Manager.');
    if (account) console.error(`Active gcloud account: ${account}`);
    if (/PERMISSION_DENIED|secretmanager\.versions\.access/i.test(stderr)) {
      console.error(`
Fix (pick one):
  1) Project owner runs:
     gcloud secrets add-iam-policy-binding clinic-staging-demo-password \\
       --project=clinic-erp-staging \\
       --member="user:YOUR_EMAIL" \\
       --role="roles/secretmanager.secretAccessor"
  2) Use an account that already has staging access:
     gcloud config set account OWNER_ACCOUNT && gcloud auth login
  3) Pass password without printing it in shell history (prefer 1Password paste):
     STAGING_DEMO_PASSWORD='…' node scripts/staging-validate.mjs
`);
    } else if (/Reauthentication|auth/i.test(stderr)) {
      console.error('Run: gcloud auth login');
    }
    process.exit(1);
  }
}

async function json(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Tenant-Slug': TENANT,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: res.status, data, headers: res.headers };
}

const checks = [];

function ok(name, cond, detail = '') {
  checks.push({ name, pass: !!cond, detail });
  if (!cond) console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const password = secretPassword();
  ok('API health', (await json('GET', '/')).status === 200);

  const login = await json('POST', '/api/platform/login', {
    body: { email: OWNER_EMAIL, password },
  });
  ok('Owner login', login.status === 200 && login.data?.token, `status=${login.status}`);
  const token = login.data?.token;
  if (!token) {
    printSummary();
    process.exit(1);
  }

  const ent = await json('GET', '/api/clinic/entitlements', { token });
  ok('Entitlements', ent.status === 200 && ent.data?.planId, JSON.stringify(ent.data?.limits || {}));

  const patientPhone = `9${String(Date.now()).slice(-9)}`;
  const created = await json('POST', '/api/patients', {
    token,
    body: { name: 'Staging Test Patient', phone: patientPhone },
  });
  ok('Create patient', created.status === 200 || created.status === 201, `status=${created.status}`);

  const patients = await json('GET', '/api/patients?search=Staging', { token });
  ok('List patients', patients.status === 200 && Array.isArray(patients.data));

  const doctors = await json('GET', '/api/clinic/doctors', { token });
  ok('List doctors', doctors.status === 200);

  const audit = await json('GET', '/api/clinic/audit?limit=5', { token });
  ok('Audit list', audit.status === 200 && Array.isArray(audit.data?.items));

  const auditCsv = await fetch(`${API}/api/clinic/audit/export?limit=10`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': TENANT },
  });
  const csvText = await auditCsv.text();
  ok('Audit CSV export', auditCsv.status === 200 && csvText.startsWith('createdAt'));

  const slots = await json('GET', `/api/appointments/slots?date=${new Date().toISOString().slice(0, 10)}`, { token });
  ok('Slots', slots.status === 200);

  const payments = await json('GET', '/api/clinic/payments', { token });
  ok('List payments', payments.status === 200 && Array.isArray(payments.data?.payments));

  if (created.data?.id) {
    const pay = await json('POST', '/api/clinic/payments', {
      token,
      body: { patientId: created.data.id, amount: 100, method: 'cash', notes: 'staging-smoke' },
    });
    ok('Record payment', pay.status === 200 || pay.status === 201, `status=${pay.status}`);
  }

  const accessReq = await json('GET', '/api/clinic/access-requests', { token });
  ok('Access requests (owner)', accessReq.status === 200 && Array.isArray(accessReq.data?.requests));

  const profile = await json('GET', '/api/platform/me', { token });
  ok(
    'Session / me',
    profile.status === 200
      && profile.data?.user?.email === OWNER_EMAIL
      && profile.data?.tenant?.slug === TENANT,
    profile.status !== 200 ? `status=${profile.status}` : '',
  );

  const wrongTenant = await json('GET', '/api/patients', {
    token,
    headers: { 'X-Tenant-Slug': 'nonexistent-tenant-slug' },
  });
  ok('Tenant scoping (JWT wins)', wrongTenant.status === 200 && Array.isArray(wrongTenant.data));

  ok('CRM reachable', (await fetch(CRM)).status === 200, CRM);
  ok('CRM tenant query', (await fetch(`${CRM}/?tenant=${TENANT}`)).status === 200);

  printSummary();
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

function printSummary() {
  console.log(JSON.stringify({ api: API, crm: CRM, checks }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
