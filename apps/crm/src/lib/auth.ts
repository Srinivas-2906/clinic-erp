import { resolveTenantSlug } from './tenant';

const TOKEN_KEY = 'clinic_token';
const LEGACY_TOKEN_KEY = 'kaana_token';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
  localStorage.removeItem('kaana_user');
  localStorage.removeItem('kaana_tenant');
}

export function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function isAuthenticated() {
  return !!getAuthToken();
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function logout() {
  clearToken();
  window.location.reload();
}

function apiBase() {
  const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';
  return API.replace(/\/api$/, '') || '';
}

export async function loginWithCredentials(identifier: string, password: string) {
  const base = apiBase();
  const tenantSlug = resolveTenantSlug();
  const res = await fetch(`${base}/api/platform/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
    },
    body: JSON.stringify({ identifier, password, tenantSlug }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid login');
  if (!data.token) throw new Error('No token returned');
  return data.token as string;
}

export async function submitAccessRequest(email: string, name: string) {
  const base = apiBase();
  const tenantSlug = resolveTenantSlug();
  if (!tenantSlug) throw new Error('Clinic workspace not found');
  const res = await fetch(`${base}/api/platform/tenant/${encodeURIComponent(tenantSlug)}/access-request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-tenant-slug': tenantSlug },
    body: JSON.stringify({ email, name }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not submit request');
  return data as { request: { email: string; name: string }; alreadyPending?: boolean };
}

export async function validateInviteToken(token: string) {
  const base = apiBase();
  const res = await fetch(`${base}/api/platform/set-password/validate?token=${encodeURIComponent(token)}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Invalid link');
  return data as { email: string; name: string };
}

export async function completePasswordSetup(token: string, password: string) {
  const base = apiBase();
  const res = await fetch(`${base}/api/platform/set-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not set password');
  return data as { ok: boolean; email: string; name: string };
}
