#!/usr/bin/env node
/**
 * Authenticated staging clinical smoke (synthetic tenant only).
 * Requires: staging-validate credentials + link-staging-clinician (once).
 */
import { execSync } from 'node:child_process';

const ALLOWED_PROJECTS = new Set(['clinic-erp-staging']);
const PROJECT = process.env.GCP_STAGING_PROJECT_ID || 'clinic-erp-staging';
const REGION = process.env.GCP_STAGING_REGION || 'asia-south1';
const TENANT = process.env.STAGING_TENANT_SLUG || 'dentacare';
const OWNER_EMAIL = process.env.STAGING_OWNER_EMAIL || 'staging-owner@clinic-erp.invalid';

if (!ALLOWED_PROJECTS.has(PROJECT)) {
  console.error(`Refusing to run: GCP project must be one of ${[...ALLOWED_PROJECTS].join(', ')}`);
  process.exit(1);
}
if (!OWNER_EMAIL.includes('@clinic-erp.invalid') && process.env.STAGING_ALLOW_NON_SYNTHETIC !== '1') {
  console.error('Refusing: owner email must be synthetic (@clinic-erp.invalid) unless STAGING_ALLOW_NON_SYNTHETIC=1');
  process.exit(1);
}

function resolveApiUrl() {
  if (process.env.STAGING_API_URL?.trim()) return process.env.STAGING_API_URL.trim();
  try {
    return execSync(
      `gcloud run services describe clinic-api-staging --project=${PROJECT} --region=${REGION} --format=value(status.url)`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ).trim();
  } catch {
    return 'https://clinic-api-staging-339065153036.asia-south1.run.app';
  }
}

function secretPassword() {
  const fromEnv = process.env.STAGING_DEMO_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  return execSync(
    `gcloud secrets versions access latest --secret=clinic-staging-demo-password --project=${PROJECT}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

async function json(method, api, path, { token, body } = {}) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'X-Tenant-Slug': TENANT,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

const checks = [];

function ok(name, pass, detail = '') {
  checks.push({ name, pass: !!pass, detail });
  if (!pass) console.error(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const API = resolveApiUrl();
  const password = secretPassword();

  const login = await json('POST', API, '/api/platform/login', {
    body: { email: OWNER_EMAIL, password, tenantSlug: TENANT },
  });
  ok('Owner login', login.status === 200 && login.data?.token);
  const token = login.data?.token;
  if (!token) {
    console.log(JSON.stringify({ api: API, checks }, null, 2));
    process.exit(1);
  }

  const me = await json('GET', API, '/api/platform/me', { token });
  ok('canSignClinical', me.data?.user?.canSignClinical === true, JSON.stringify(me.data?.user || {}));

  const phone = `9${String(Date.now()).slice(-9)}`;
  const patient = await json('POST', API, '/api/patients', {
    token,
    body: { name: 'Staging Clinical QA', phone },
  });
  ok('Create patient', patient.status === 200 || patient.status === 201);
  const patientId = patient.data?.id;

  const doctors = await json('GET', API, '/api/clinic/doctors', { token });
  const docList = doctors.data?.doctors || doctors.data || [];
  const doctorId = Array.isArray(docList) ? docList[0]?.id : null;
  ok('Doctor available', !!doctorId);

  if (!patientId || !doctorId) {
    console.log(JSON.stringify({ api: API, checks }, null, 2));
    process.exit(1);
  }

  const enc = await json('POST', API, `/api/clinic/patients/${patientId}/encounters`, {
    token,
    body: { doctorId },
  });
  ok('Create encounter', enc.status === 201 || enc.status === 200);
  const encId = enc.data?.id;

  const patch = await json('PATCH', API, `/api/clinic/encounters/${encId}`, {
    token,
    body: {
      prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
      diagnoses: [{ description: 'Staging test', isPrimary: true }],
    },
  });
  ok('Update draft', patch.status === 200);

  const fin = await json('POST', API, `/api/clinic/encounters/${encId}/finalize`, { token });
  ok('Finalize', fin.status === 200 && fin.data?.status === 'finalized', fin.status !== 200 ? JSON.stringify(fin.data) : '');

  const pdf = await fetch(`${API}/api/clinic/encounters/${encId}/prescription.pdf`, {
    headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': TENANT },
  });
  const pdfCt = pdf.headers.get('content-type') || '';
  ok('Prescription PDF', pdf.status === 200 && pdfCt.includes('pdf'), `status=${pdf.status} ct=${pdfCt}`);

  console.log(JSON.stringify({ api: API, tenant: TENANT, project: PROJECT, checks }, null, 2));
  process.exit(checks.every((c) => c.pass) ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
