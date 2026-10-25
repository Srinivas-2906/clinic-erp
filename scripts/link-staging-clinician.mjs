#!/usr/bin/env node
/**
 * Link the synthetic staging owner account to a clinic doctor (for clinical finalize QA).
 * Idempotent: safe to re-run; re-applies same userId link.
 */
import { execSync } from 'node:child_process';

const ALLOWED_PROJECTS = new Set(['clinic-erp-staging']);
const PROJECT = process.env.GCP_STAGING_PROJECT_ID || 'clinic-erp-staging';
const REGION = process.env.GCP_STAGING_REGION || 'asia-south1';
const TENANT = process.env.STAGING_TENANT_SLUG || 'dentacare';
const OWNER_EMAIL = process.env.STAGING_OWNER_EMAIL || 'staging-owner@clinic-erp.invalid';

if (!ALLOWED_PROJECTS.has(PROJECT)) {
  console.error(`Refusing: GCP project must be ${[...ALLOWED_PROJECTS].join(' or ')}`);
  process.exit(1);
}
if (!OWNER_EMAIL.includes('@clinic-erp.invalid') && process.env.STAGING_ALLOW_NON_SYNTHETIC !== '1') {
  console.error('Refusing: use synthetic staging-owner@clinic-erp.invalid or set STAGING_ALLOW_NON_SYNTHETIC=1');
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
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const API = resolveApiUrl();
  const password = secretPassword();

  const login = await json('POST', API, '/api/platform/login', {
    body: { email: OWNER_EMAIL, password, tenantSlug: TENANT },
  });
  if (login.status !== 200 || !login.data?.token) {
    console.error('Login failed', login.status, login.data);
    process.exit(1);
  }
  const token = login.data.token;

  const meBefore = await json('GET', API, '/api/platform/me', { token });
  const userId = meBefore.data?.user?.id;
  if (!userId) {
    console.error('Could not resolve user id from /me');
    process.exit(1);
  }

  let doctorId = process.env.STAGING_DOCTOR_ID?.trim();
  if (!doctorId) {
    const doctors = await json('GET', API, '/api/clinic/doctors', { token });
    const list = doctors.data?.doctors || doctors.data || [];
    const first = Array.isArray(list) ? list.find((d) => d.isActive !== false) || list[0] : null;
    if (!first?.id) {
      console.error('No doctor record found on staging tenant');
      process.exit(1);
    }
    doctorId = first.id;
  }

  if (meBefore.data?.user?.canSignClinical && meBefore.data?.user?.clinicianDoctorId === doctorId) {
    console.log(JSON.stringify({
      api: API,
      tenant: TENANT,
      project: PROJECT,
      idempotent: true,
      doctorId,
      userId,
      canSignClinical: true,
    }, null, 2));
    return;
  }

  const patch = await json('PATCH', API, `/api/clinic/doctors/${doctorId}`, {
    token,
    body: { userId },
  });
  if (patch.status !== 200) {
    console.error('Doctor link failed', patch.status, patch.data);
    process.exit(1);
  }

  const verify = await json('GET', API, '/api/platform/me', { token });
  const canSign = verify.data?.user?.canSignClinical === true;
  if (!canSign) {
    console.error('Link applied but canSignClinical is still false — staging API may not include PR #13 auth/clinical yet.', verify.data?.user);
    process.exit(1);
  }
  console.log(JSON.stringify({
    api: API,
    tenant: TENANT,
    project: PROJECT,
    ownerEmail: OWNER_EMAIL,
    doctorId,
    userId,
    canSignClinical: true,
    clinicianDoctorId: verify.data?.user?.clinicianDoctorId ?? null,
  }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
