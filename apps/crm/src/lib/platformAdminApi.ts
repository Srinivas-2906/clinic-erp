import { authHeaders } from './auth';

const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';

async function platformRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || res.statusText);
  return data as T;
}

export type PlatformTenantRow = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  planLabel?: string;
  status: string;
  subscriptionStatus: string;
  trialEndsAt?: string | null;
  usage?: { doctors: number; staff: number };
  limits?: { maxDoctors: number | null; maxStaff: number | null };
  canWrite?: boolean;
};

export function fetchPlatformTenants(params?: { search?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params?.search) q.set('search', params.search);
  if (params?.status) q.set('status', params.status);
  const qs = q.toString() ? `?${q.toString()}` : '';
  return platformRequest<{ tenants: PlatformTenantRow[] }>(`/platform/admin/tenants${qs}`);
}

export function fetchPlatformTenantDetail(tenantId: string) {
  return platformRequest<{
    tenant: Record<string, unknown>;
    entitlements: Record<string, unknown>;
    onboarding: { steps: { id: string; done: boolean; label: string }[]; completed: number; total: number };
    operations: { pendingReminderJobs: number; failedReminderJobs: number };
  }>(`/platform/admin/tenants/${encodeURIComponent(tenantId)}`);
}

export function patchPlatformTenant(tenantId: string, body: {
  planId?: string;
  subscriptionStatus?: string;
  confirmNote: string;
}) {
  return platformRequest(`/platform/admin/tenants/${encodeURIComponent(tenantId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function loginPlatformAdmin(email: string, password: string) {
  const res = await fetch(`${API}/platform/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  if (!data.user?.isPlatformAdmin) throw new Error('Not a platform administrator account');
  return data.token as string;
}
