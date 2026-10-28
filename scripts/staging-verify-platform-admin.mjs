#!/usr/bin/env node
/** Platform admin HTTP smoke (no password logged). */
import { execSync } from 'node:child_process';

const PROJECT = process.env.GCP_STAGING_PROJECT_ID || 'clinic-erp-staging';
const API = process.env.STAGING_API_URL?.trim()
  || 'https://clinic-api-staging-339065153036.asia-south1.run.app';
const EMAIL = process.env.PLATFORM_ADMIN_EMAIL || 'staging-platform-admin@clinic-erp.invalid';
const PWD_SECRET = process.env.PLATFORM_ADMIN_PASSWORD_SECRET || 'clinic-staging-platform-admin-password';

function password() {
  const env = process.env.PLATFORM_ADMIN_PASSWORD?.trim();
  if (env) return env;
  return execSync(
    `gcloud secrets versions access latest --secret=${PWD_SECRET} --project=${PROJECT}`,
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

async function main() {
  const pw = password();
  const login = await fetch(`${API}/api/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: pw }),
  });
  const body = await login.json().catch(() => ({}));
  const token = body.token;
  const okLogin = login.status === 200 && body.user?.isPlatformAdmin === true && token;
  if (!okLogin) {
    console.error(JSON.stringify({ ok: false, step: 'login', status: login.status }));
    process.exit(1);
  }
  const list = await fetch(`${API}/api/platform/admin/tenants?search=denta`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const tenants = await list.json().catch(() => ({}));
  const okList = list.status === 200 && Array.isArray(tenants.tenants);
  console.log(JSON.stringify({
    ok: okLogin && okList,
    email: EMAIL,
    tenantCount: okList ? tenants.tenants.length : 0,
    dentacarePresent: okList ? tenants.tenants.some((t) => t.slug === 'dentacare') : false,
  }));
  process.exit(okLogin && okList ? 0 : 1);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
