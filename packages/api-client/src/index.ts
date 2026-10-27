import { parseApiError, type MeResponse } from '@clinic-erp/contracts';

export type AuthTransport = {
  getToken: () => string | null;
  getTenantSlug: () => string | null;
  onUnauthorized?: () => void;
};

export type ClinicApiClientOptions = {
  baseUrl: string;
  auth: AuthTransport;
};

export function createClinicApiClient({ baseUrl, auth }: ClinicApiClientOptions) {
  const root = baseUrl.replace(/\/$/, '');

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = auth.getToken();
    const tenant = auth.getTenantSlug();
    const res = await fetch(`${root}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(tenant ? { 'x-tenant-slug': tenant } : {}),
        ...(init.headers || {}),
      },
    });
    if (res.status === 401) {
      auth.onUnauthorized?.();
      throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(parseApiError(data, res.statusText));
    return data as T;
  }

  return {
    login: (email: string, password: string, tenantSlug: string) =>
      request<{ token: string }>(`/api/platform/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password, tenantSlug }),
      }),
    me: () => request<MeResponse>(`/api/platform/me`),
    today: () => request<{ appointments: unknown[] }>(`/api/clinic/today`),
    patients: (search?: string) =>
      request<unknown[]>(`/api/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    patient: (id: string) =>
      request<{ patient: unknown; appointments: unknown[]; encounters?: unknown[] }>(`/api/patients/${id}`),
    updateAppointment: (id: string, patch: { status?: string; scheduledAt?: string }) =>
      request<unknown>(`/api/appointments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
  };
}

export type ClinicApiClient = ReturnType<typeof createClinicApiClient>;
