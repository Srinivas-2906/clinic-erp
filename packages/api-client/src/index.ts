import {
  parseApiError,
  type MeResponse,
  type PrescriptionLineInput,
  type ClinicalVitalInput,
} from '@clinic-erp/contracts';

export type AuthTransport = {
  getToken: () => string | null;
  getTenantSlug: () => string | null;
  onUnauthorized?: () => void;
};

export type ClinicApiClientOptions = {
  baseUrl: string;
  auth: AuthTransport;
};

export type ClinicAppointment = {
  id: string;
  patientId: string;
  patientName?: string;
  patientPhone?: string;
  scheduledAt: string;
  status: string;
  service?: string;
  assignedDoctorId?: string | null;
  assignedDoctor?: string;
  encounterId?: string | null;
  notes?: string;
};

export type TodayStats = {
  date: string;
  appointments: ClinicAppointment[];
  total?: number;
  confirmed?: number;
  arrived?: number;
  unconfirmedToday?: number;
};

export type EncounterDetail = {
  id: string;
  patientId: string;
  doctorId: string;
  appointmentId?: string | null;
  status: 'draft' | 'finalized';
  chiefComplaint?: string;
  historySummary?: string;
  clinicalNote?: string;
  diagnoses?: { description: string; isPrimary?: boolean; code?: string }[];
  vitals?: ClinicalVitalInput[];
  prescription?: {
    items?: {
      drugName: string;
      dose?: string;
      frequency?: string;
      duration?: string;
      instructions?: string;
    }[];
  } | null;
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
    today: () => request<TodayStats>(`/api/clinic/today`),
    appointments: (params?: { date?: string; patientId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.date) q.set('date', params.date);
      if (params?.patientId) q.set('patientId', params.patientId);
      if (params?.status) q.set('status', params.status);
      const qs = q.toString();
      return request<ClinicAppointment[]>(`/api/appointments${qs ? `?${qs}` : ''}`);
    },
    patients: (search?: string) =>
      request<unknown[]>(`/api/patients${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    patient: (id: string) =>
      request<{ patient: unknown; appointments: unknown[]; encounters?: unknown[] }>(`/api/patients/${id}`),
    updateAppointment: (id: string, patch: { status?: string; scheduledAt?: string }) =>
      request<ClinicAppointment>(`/api/appointments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    createPatient: (body: { name: string; phone: string; email?: string }) =>
      request<{ id: string }>(`/api/patients`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    appointmentSlots: (date: string) =>
      request<{ slots: string[]; slotOptions?: unknown[] }>(
        `/api/appointments/slots?date=${encodeURIComponent(date)}&anyAvailable=1`,
      ),
    createAppointment: (body: { patientId: string; scheduledAt: string; service?: string; status?: string }) =>
      request<{ id: string }>(`/api/appointments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    listEncounters: (patientId: string) =>
      request<{ encounters: unknown[] }>(`/api/clinic/patients/${encodeURIComponent(patientId)}/encounters`),
    createEncounter: (
      patientId: string,
      body: {
        appointmentId?: string;
        doctorId?: string;
        chiefComplaint?: string;
        historySummary?: string;
        clinicalNote?: string;
        vitals?: ClinicalVitalInput[];
        diagnoses?: { description: string; isPrimary?: boolean; code?: string }[];
        prescriptionItems?: PrescriptionLineInput[];
      },
    ) =>
      request<EncounterDetail>(`/api/clinic/patients/${encodeURIComponent(patientId)}/encounters`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    fetchEncounter: (encounterId: string) =>
      request<EncounterDetail>(`/api/clinic/encounters/${encodeURIComponent(encounterId)}`),
    updateEncounter: (
      encounterId: string,
      body: {
        chiefComplaint?: string;
        historySummary?: string;
        clinicalNote?: string;
        vitals?: ClinicalVitalInput[];
        diagnoses?: { description: string; isPrimary?: boolean; code?: string }[];
        prescriptionItems?: PrescriptionLineInput[];
      },
    ) =>
      request<EncounterDetail>(`/api/clinic/encounters/${encodeURIComponent(encounterId)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    finalizeEncounter: (encounterId: string) =>
      request<EncounterDetail>(`/api/clinic/encounters/${encodeURIComponent(encounterId)}/finalize`, {
        method: 'POST',
      }),
    patientAllergies: (patientId: string) =>
      request<{ allergies: { substance: string; severity?: string }[] }>(
        `/api/clinic/patients/${encodeURIComponent(patientId)}/allergies`,
      ),
  };
}

export type ClinicApiClient = ReturnType<typeof createClinicApiClient>;
