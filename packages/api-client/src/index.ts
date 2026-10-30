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

export type ClinicDoctor = {
  id: string;
  name: string;
  displayName?: string;
  specialty?: string;
  isActive?: boolean;
};

export type SlotOption = {
  label: string;
  time?: string;
  doctorId?: string;
  doctorName?: string;
};

export type ClinicPatient = {
  id: string;
  name: string;
  phone?: string;
  chiefComplaint?: string;
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

export type InvoiceLineItem = {
  id?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  catalogItemId?: string | null;
};

export type PatientInvoice = {
  id: string;
  patientId: string;
  appointmentId?: string | null;
  encounterId?: string | null;
  status: 'open' | 'partial' | 'paid' | 'void';
  total: number;
  amountPaid: number;
  balanceDue: number;
  currency?: string;
  notes?: string;
  createdAt?: string;
  lineItems: InvoiceLineItem[];
};

export type CatalogItem = {
  id: string;
  title: string;
  priceNum?: number;
  price?: number | string;
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
    createPatient: (body: { name: string; phone: string; email?: string; chiefComplaint?: string }) =>
      request<ClinicPatient>(`/api/patients`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    appointmentSlots: (date: string, opts?: { doctorId?: string; anyAvailable?: boolean }) => {
      const q = new URLSearchParams({ date });
      if (opts?.doctorId) q.set('doctorId', opts.doctorId);
      if (opts?.anyAvailable) q.set('anyAvailable', '1');
      return request<{ date: string; slots: string[]; slotOptions?: SlotOption[] }>(
        `/api/appointments/slots?${q.toString()}`,
      );
    },
    doctors: () => request<{ doctors: ClinicDoctor[] }>(`/api/clinic/doctors`),
    createAppointment: (body: {
      patientId: string;
      scheduledAt: string;
      service?: string;
      status?: string;
      assignedDoctorId?: string;
    }) =>
      request<ClinicAppointment>(`/api/appointments`, {
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
    fetchCatalog: () =>
      request<{ items: CatalogItem[] } | CatalogItem[]>(`/api/catalog`),
    fetchInvoices: (opts?: { patientId?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (opts?.patientId) q.set('patientId', opts.patientId);
      if (opts?.status) q.set('status', opts.status);
      const qs = q.toString();
      return request<{ invoices: PatientInvoice[] }>(`/api/clinic/invoices${qs ? `?${qs}` : ''}`);
    },
    fetchInvoice: (id: string) => request<PatientInvoice>(`/api/clinic/invoices/${encodeURIComponent(id)}`),
    createInvoice: (body: {
      patientId: string;
      appointmentId?: string;
      encounterId?: string;
      notes?: string;
      lineItems: { description: string; quantity?: number; unitPrice: number; catalogItemId?: string }[];
    }) =>
      request<PatientInvoice>(`/api/clinic/invoices`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    voidInvoice: (id: string, reason?: string) =>
      request<PatientInvoice>(`/api/clinic/invoices/${encodeURIComponent(id)}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || '' }),
      }),
    recordPayment: (body: {
      patientId: string;
      amount: number;
      method?: string;
      reference?: string;
      notes?: string;
      invoiceId?: string;
      idempotencyKey?: string;
    }) =>
      request<{ id: string }>(`/api/clinic/payments`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  };
}

export type ClinicApiClient = ReturnType<typeof createClinicApiClient>;
