#!/usr/bin/env node
/**
 * Staging-only: disposable tenant + patient write, lease evidence, optional SQLite restore check.
 * Does not touch production.
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = 'clinic-erp-staging';
const REGION = 'asia-south1';
const ALLOWED_PROJECT = 'clinic-erp-staging';

function assertStagingOnly() {
  if (process.env.GCP_STAGING_PROJECT_ID && process.env.GCP_STAGING_PROJECT_ID !== ALLOWED_PROJECT) {
    throw new Error(`Refusing project ${process.env.GCP_STAGING_PROJECT_ID}`);
  }
}

function apiUrl() {
  return (
    process.env.STAGING_API_URL?.trim()
    || execSync(
      `gcloud run services describe clinic-api-staging --project=${PROJECT} --region=${REGION} --format='value(status.url)'`,
      { encoding: 'utf8' },
    ).trim()
  );
}

async function json(API, method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  return { status: res.status, data };
}

async function main() {
  assertStagingOnly();
  const API = apiUrl();
  const stamp = Date.now();
  const marker = `SW-PERSIST-${stamp}`;
  const slug = `sw-persist-${stamp}`;
  const ownerEmail = `${slug}@clinic-erp-staging.invalid`;
  const evidence = { api: API, marker, slug, steps: [] };

  const health0 = await json(API, 'GET', '/api/health');
  evidence.steps.push({
    step: 'health-pre',
    ok: health0.data?.ok === true,
    writerLease: health0.data?.writerLease || null,
  });

  const password = `Pw-${randomUUID().slice(0, 12)}!aA1`;
  const signup = await json(API, 'POST', '/api/platform/signup', {
    body: {
      clinicName: `Persistence Verify ${marker}`,
      slug,
      ownerEmail,
      ownerName: 'Persistence Bot',
      planId: 'essential',
    },
    headers: { 'Idempotency-Key': `sw-persist-${stamp}` },
  });
  if (signup.status !== 201 && signup.status !== 200) {
    evidence.steps.push({ step: 'signup', ok: false, status: signup.status, data: signup.data });
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }
  const tenantSlug = signup.data?.tenant?.slug || slug;
  const inviteUrl = signup.data?.invite?.setPasswordUrl || '';
  const inviteToken = inviteUrl.includes('set-password=')
    ? decodeURIComponent(inviteUrl.split('set-password=')[1].split('&')[0])
    : '';
  const setPw = await json(API, 'POST', '/api/platform/set-password', {
    body: { token: inviteToken, password },
  });
  evidence.steps.push({
    step: 'signup',
    ok: true,
    tenantId: signup.data?.tenant?.id,
    slug: tenantSlug,
  });
  evidence.steps.push({ step: 'set-password', ok: setPw.status === 200, status: setPw.status });
  if (setPw.status !== 200) {
    console.log(JSON.stringify(evidence, null, 2));
    process.exit(1);
  }

  const login = await json(API, 'POST', '/api/platform/login', {
    body: { email: ownerEmail, password, tenantSlug },
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  const token = login.data?.token;
  evidence.steps.push({ step: 'login', ok: login.status === 200 && !!token, status: login.status });

  const phone = `8${String(stamp).slice(-9)}`;
  const created = await json(API, 'POST', '/api/patients', {
    token,
    headers: { 'X-Tenant-Slug': tenantSlug },
    body: { name: marker, phone, notes: `disposable verify ${stamp}` },
  });
  const patientId = created.data?.id;
  evidence.steps.push({
    step: 'create-patient',
    ok: (created.status === 200 || created.status === 201) && !!patientId,
    status: created.status,
    patientId,
  });

  const readById = await json(API, 'GET', `/api/patients/${patientId}`, {
    token,
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  const readSearch = await json(API, 'GET', `/api/patients?search=${encodeURIComponent(marker)}`, {
    token,
    headers: { 'X-Tenant-Slug': tenantSlug },
  });
  const found = Array.isArray(readSearch.data)
    && readSearch.data.some((p) => p.id === patientId && p.name === marker);
  evidence.steps.push({
    step: 'read-after-write',
    ok: (readById.status === 200 || found) && found,
    byIdStatus: readById.status,
    searchCount: Array.isArray(readSearch.data) ? readSearch.data.length : 0,
  });

  const dentaLogin = await json(API, 'POST', '/api/platform/login', {
    body: {
      email: 'staging-owner@clinic-erp.invalid',
      password: execSync(
        `gcloud secrets versions access latest --secret=clinic-staging-demo-password --project=${PROJECT}`,
        { encoding: 'utf8' },
      ).trim(),
      tenantSlug: 'dentacare',
    },
  });
  const cross = await json(API, 'GET', `/api/patients/${patientId}`, {
    token: dentaLogin.data?.token,
    headers: { 'X-Tenant-Slug': 'dentacare' },
  });
  evidence.steps.push({
    step: 'tenant-isolation',
    ok: cross.status === 404 || cross.status === 403,
    status: cross.status,
  });

  const leaseRaw = execSync(
    `gcloud storage cat gs://clinic-erp-staging-clinic-db/_meta/writer-lease.json --project=${PROJECT}`,
    { encoding: 'utf8' },
  );
  evidence.lease = JSON.parse(leaseRaw);
  evidence.testRecord = { marker, slug, patientId, phone };

  const outPath = process.env.STAGING_PERSISTENCE_EVIDENCE
    || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.staging-evidence', `persistence-${stamp}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: evidence.steps.every((s) => s.ok), evidencePath: outPath, ...evidence }, null, 2));
  if (!evidence.steps.every((s) => s.ok)) process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
