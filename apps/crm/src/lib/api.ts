import { authHeaders, clearToken } from './auth';
import type { Appointment, Patient, TodayStats, Payment, PaymentSummary, PatientInvoice, CatalogItem, Doctor, DoctorSession, DoctorTimeOff, Encounter, PrescriptionItemInput, VitalInput } from '../types';
import { resolveTenantSlug } from './tenant';

const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    const tenantSlug = resolveTenantSlug();
    res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        ...authHeaders(),
        ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch {
    throw new Error(
      'Cannot reach server. Start clinic-api.',
    );
  }
  if (res.status === 401) throw new Error('Unauthorized');
  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error || res.statusText;
    if (/tenant access required/i.test(msg)) {
      clearToken();
      throw new Error('Session expired or wrong clinic account. Sign in again.');
    }
    throw new Error(msg);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function fetchToday() {
  return request<TodayStats>('/clinic/today');
}

export function fetchPatients(search?: string) {
  const q = search ? `?search=${encodeURIComponent(search)}` : '';
  return request<Patient[]>(`/patients${q}`);
}

export function fetchPatient(id: string) {
  return request<{ patient: Patient; appointments: Appointment[]; encounters?: Encounter[] }>(`/patients/${id}`);
}

export function createPatient(data: Partial<Patient> & { name: string; phone: string }) {
  return request<Patient>('/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updatePatient(id: string, patch: Partial<Patient> & { note?: string }) {
  return request<Patient>(`/patients/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function createAppointment(data: {
  patientId?: string;
  patientName?: string;
  phone?: string;
  service: string;
  serviceId?: string;
  scheduledAt: string;
  status?: string;
  source?: string;
  assignedDoctorId?: string;
}) {
  return request<Appointment>('/appointments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateAppointment(id: string, patch: Partial<Appointment>) {
  return request<Appointment>(`/appointments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function fetchAppointments(params?: {
  date?: string;
  from?: string;
  to?: string;
  status?: string;
  patientId?: string;
}) {
  const q = new URLSearchParams();
  if (params?.date) q.set('date', params.date);
  if (params?.from) q.set('from', params.from);
  if (params?.to) q.set('to', params.to);
  if (params?.status) q.set('status', params.status);
  if (params?.patientId) q.set('patientId', params.patientId);
  const qs = q.toString();
  return request<Appointment[]>(`/appointments${qs ? `?${qs}` : ''}`);
}

export function fetchClient() {
  return request<{
    name: string;
    emoji: string;
    slug?: string;
    agentPhone?: string;
    city?: string;
    doctorName?: string;
    doctors?: Pick<Doctor, 'id' | 'name' | 'displayName' | 'specialty' | 'appointmentColor' | 'isActive'>[];
    timezone?: string;
  }>('/client');
}

export function fetchDoctors(includeInactive = false) {
  const q = includeInactive ? '?includeInactive=1' : '';
  return request<{ doctors: Doctor[] }>(`/clinic/doctors${q}`);
}

export function fetchDoctor(id: string) {
  return request<Doctor>(`/clinic/doctors/${encodeURIComponent(id)}`);
}

export function createDoctor(data: Partial<Doctor> & { name: string }) {
  return request<Doctor>('/clinic/doctors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function updateDoctor(id: string, patch: Partial<Doctor>) {
  return request<Doctor>(`/clinic/doctors/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function fetchDoctorSessions(doctorId: string) {
  return request<{ sessions: DoctorSession[] }>(`/clinic/doctors/${encodeURIComponent(doctorId)}/sessions`);
}

export function saveDoctorSessions(doctorId: string, sessions: Omit<DoctorSession, 'id' | 'tenantId' | 'doctorId' | 'createdAt' | 'updatedAt'>[]) {
  return request<{ sessions: DoctorSession[] }>(`/clinic/doctors/${encodeURIComponent(doctorId)}/sessions`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessions }),
  });
}

export function fetchDoctorTimeOff(doctorId: string) {
  return request<{ timeOff: DoctorTimeOff[] }>(`/clinic/doctors/${encodeURIComponent(doctorId)}/time-off`);
}

export function createDoctorTimeOff(doctorId: string, data: { startDatetime: string; endDatetime: string; reason?: string }) {
  return request<DoctorTimeOff>(`/clinic/doctors/${encodeURIComponent(doctorId)}/time-off`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function deleteDoctorTimeOff(doctorId: string, offId: string) {
  return request<{ ok: boolean }>(`/clinic/doctors/${encodeURIComponent(doctorId)}/time-off/${encodeURIComponent(offId)}`, {
    method: 'DELETE',
  });
}

export function fetchDoctorServices(doctorId: string) {
  return request<{ catalogItemIds: string[] }>(`/clinic/doctors/${encodeURIComponent(doctorId)}/services`);
}

export function saveDoctorServices(doctorId: string, catalogItemIds: string[]) {
  return request<{ catalogItemIds: string[] }>(`/clinic/doctors/${encodeURIComponent(doctorId)}/services`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ catalogItemIds }),
  });
}

export function fetchMe() {
  return request<{
    user: {
      id: string;
      name?: string;
      email?: string;
      username?: string;
      role?: string;
      effectiveRole?: string;
      isPlatformAdmin?: boolean;
      canSignClinical?: boolean;
      clinicianDoctorId?: string | null;
      capabilities?: {
        managePatients?: boolean;
        manageAppointments?: boolean;
        recordPayments?: boolean;
        manageFinancials?: boolean;
        manageSettings?: boolean;
      };
    };
    tenant?: { slug?: string; name?: string };
  }>('/platform/me');
}

export function createEncounter(patientId: string, body: Record<string, unknown>) {
  return request<Encounter>(`/clinic/patients/${encodeURIComponent(patientId)}/encounters`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function fetchEncounter(encounterId: string) {
  return request<Encounter>(`/clinic/encounters/${encodeURIComponent(encounterId)}`);
}

export function updateEncounter(encounterId: string, body: {
  chiefComplaint?: string;
  historySummary?: string;
  clinicalNote?: string;
  vitals?: VitalInput[];
  diagnoses?: { description: string; isPrimary?: boolean; code?: string }[];
  prescriptionItems?: PrescriptionItemInput[];
}) {
  return request<Encounter>(`/clinic/encounters/${encodeURIComponent(encounterId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function finalizeEncounter(encounterId: string) {
  return request<Encounter>(`/clinic/encounters/${encodeURIComponent(encounterId)}/finalize`, {
    method: 'POST',
  });
}

export function amendEncounter(encounterId: string, body: {
  reason: string;
  patch: { clinicalNote?: string; historySummary?: string };
}) {
  return request<Encounter>(`/clinic/encounters/${encodeURIComponent(encounterId)}/amendments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function regeneratePrescriptionPdf(encounterId: string) {
  return request<Encounter>(`/clinic/encounters/${encodeURIComponent(encounterId)}/prescription/regenerate`, {
    method: 'POST',
  });
}

export function scheduleEncounterFollowUp(encounterId: string, body: { dueDate: string; instructions?: string; phone?: string }) {
  return request<{ id: string }>(`/clinic/encounters/${encodeURIComponent(encounterId)}/follow-up`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function fetchPatientAllergies(patientId: string) {
  return request<{ allergies: { id: string; substance: string; severity?: string; notes?: string }[] }>(
    `/clinic/patients/${encodeURIComponent(patientId)}/allergies`,
  );
}

export function addPatientAllergy(patientId: string, body: { substance: string; severity?: string; notes?: string }) {
  return request<{ id: string; substance: string }>(`/clinic/patients/${encodeURIComponent(patientId)}/allergies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function updatePatientAllergy(patientId: string, allergyId: string, body: { substance?: string; severity?: string; notes?: string }) {
  return request<{ id: string; substance: string }>(
    `/clinic/patients/${encodeURIComponent(patientId)}/allergies/${encodeURIComponent(allergyId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
}

export function deletePatientAllergy(patientId: string, allergyId: string) {
  return request<{ ok: boolean }>(
    `/clinic/patients/${encodeURIComponent(patientId)}/allergies/${encodeURIComponent(allergyId)}`,
    { method: 'DELETE' },
  );
}

export async function openPrescriptionPdf(encounterId: string) {
  const tenantSlug = resolveTenantSlug();
  const res = await fetch(`${API}/clinic/encounters/${encodeURIComponent(encounterId)}/prescription.pdf`, {
    headers: {
      ...authHeaders(),
      ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Could not load PDF');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function fetchPayments(patientId?: string) {
  const q = patientId ? `?patientId=${encodeURIComponent(patientId)}` : '';
  return request<{ summary: PaymentSummary; payments: Payment[] }>(`/clinic/payments${q}`);
}

export function fetchPatientPayments(patientId: string) {
  return fetchPayments(patientId);
}

export function fetchAvailableSlots(date: string, options?: {
  doctorId?: string;
  serviceId?: string;
  anyAvailable?: boolean;
  durationMin?: number;
  excludeAppointmentId?: string;
}) {
  const params = new URLSearchParams({ date });
  if (options?.doctorId) params.set('doctorId', options.doctorId);
  if (options?.serviceId) params.set('serviceId', options.serviceId);
  if (options?.anyAvailable) params.set('anyAvailable', '1');
  if (options?.durationMin) params.set('durationMin', String(options.durationMin));
  if (options?.excludeAppointmentId) params.set('excludeAppointmentId', options.excludeAppointmentId);
  return request<{
    date: string;
    slots: string[];
    slotOptions?: Array<{ label: string; time: string; doctorId: string; doctorName: string }>;
  }>(`/appointments/slots?${params.toString()}`);
}

export function fetchCatalog() {
  return request<{ items: CatalogItem[] } | CatalogItem[]>('/catalog');
}

export function fetchClinicReport(from: string, to: string) {
  return request<{
    from: string;
    to: string;
    appointments: Appointment[];
    payments: Payment[];
    summary: PaymentSummary & { total: number };
  }>(`/clinic/report?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}

export function recordPayment(data: {
  patientId: string;
  amount: number;
  method?: string;
  reference?: string;
  notes?: string;
  appointmentId?: string;
  invoiceId?: string;
  idempotencyKey?: string;
}) {
  return request<Payment>('/clinic/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function fetchInvoices(options?: { patientId?: string; status?: string }) {
  const params = new URLSearchParams();
  if (options?.patientId) params.set('patientId', options.patientId);
  if (options?.status) params.set('status', options.status);
  const q = params.toString() ? `?${params.toString()}` : '';
  return request<{ invoices: PatientInvoice[] }>(`/clinic/invoices${q}`);
}

export function fetchInvoice(id: string) {
  return request<PatientInvoice>(`/clinic/invoices/${encodeURIComponent(id)}`);
}

export function createInvoice(data: {
  patientId: string;
  appointmentId?: string;
  encounterId?: string;
  notes?: string;
  lineItems: { description: string; quantity?: number; unitPrice: number; catalogItemId?: string }[];
}) {
  return request<PatientInvoice>('/clinic/invoices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function voidInvoice(id: string, reason?: string) {
  return request<PatientInvoice>(`/clinic/invoices/${encodeURIComponent(id)}/void`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: reason || '' }),
  });
}

export function refundPayment(paymentId: string, body?: { amount?: number; notes?: string; idempotencyKey?: string }) {
  return request<Payment>(`/clinic/payments/${encodeURIComponent(paymentId)}/refund`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export function updatePayment(id: string, patch: Partial<Payment> & { amount?: number }) {
  return request<Payment>(`/clinic/payments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function fetchAccessRequests(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return request<{ requests: import('../types').AccessRequest[] }>(`/clinic/access-requests${q}`);
}

export function approveAccessRequest(id: string, body?: { role?: string; note?: string; doctorId?: string }) {
  return request<{
    request: import('../types').AccessRequest;
    user: { id: string; email: string; name: string; role: string };
    setPasswordUrl: string;
    expiresInDays: number;
    emailDelivery?: string;
  }>(`/clinic/access-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

export function fetchClinicSettings() {
  return request<{
    tenantId: string;
    name: string;
    slug: string;
    settings: { timezone?: string; phone?: string; email?: string; address?: string };
  }>('/clinic/settings');
}

export function updateClinicSettings(patch: Record<string, string>) {
  return request<Awaited<ReturnType<typeof fetchClinicSettings>>>('/clinic/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

export function rejectAccessRequest(id: string) {
  return request<{ request: import('../types').AccessRequest }>(`/clinic/access-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export function fetchEntitlements() {
  return request<{
    planId: string;
    planLabel: string;
    status?: string;
    subscriptionStatus?: string;
    subscription?: {
      status: string;
      trialEndsAt?: string | null;
      canWrite?: boolean;
    };
    limits: { maxDoctors: number | null; maxStaff: number | null };
    usage: { doctors: number; staff: number };
    features: { auditExport: boolean; multiBranch: boolean };
  }>('/clinic/entitlements');
}

export function getPaymentGatewayConfig() {
  return request<{ provider: string | null; configured: boolean; note?: string }>('/clinic/billing/gateway');
}

export async function downloadTenantExport() {
  const tenantSlug = resolveTenantSlug();
  const API = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';
  const res = await fetch(`${API}/clinic/export`, {
    headers: {
      ...authHeaders(),
      ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Export failed');
  }
  const data = await res.json();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clinic-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function fetchAuditLog(params: {
  limit?: number;
  offset?: number;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
}) {
  const q = new URLSearchParams();
  if (params.limit) q.set('limit', String(params.limit));
  if (params.offset) q.set('offset', String(params.offset));
  if (params.action) q.set('action', params.action);
  if (params.entityType) q.set('entityType', params.entityType);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return request<{
    items: Array<{
      id: string;
      action: string;
      entityType: string | null;
      entityId: string | null;
      userEmail?: string | null;
      userName?: string | null;
      createdAt: string;
      detail: Record<string, unknown>;
    }>;
    total: number;
    limit: number;
    offset: number;
  }>(`/clinic/audit${qs ? `?${qs}` : ''}`);
}

export async function downloadAuditExport(params: { action?: string; entityType?: string; from?: string; to?: string }) {
  const q = new URLSearchParams();
  if (params.action) q.set('action', params.action);
  if (params.entityType) q.set('entityType', params.entityType);
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const tenantSlug = resolveTenantSlug();
  const res = await fetch(`${API}/clinic/audit/export?${q.toString()}`, {
    headers: {
      ...authHeaders(),
      ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'clinic-audit.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export type { AccessRequest } from '../types';

const platformBase = () => {
  const raw = import.meta.env.VITE_CLINIC_API || import.meta.env.VITE_WHATSAPP_API || '/api';
  return raw.replace(/\/api$/, '') || '';
};

export type SignupPlanId = 'essential' | 'professional' | 'enterprise';

export async function checkSignupSlugAvailable(slug: string) {
  const res = await fetch(`${platformBase()}/api/platform/signup/slug-available?slug=${encodeURIComponent(slug)}`);
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Could not check URL');
  return data as { available: boolean; slug: string; error?: string };
}

export async function submitClinicSignup(body: {
  clinicName: string;
  slug: string;
  planId: SignupPlanId;
  ownerName: string;
  ownerEmail: string;
  idempotencyKey: string;
}) {
  const res = await fetch(`${platformBase()}/api/platform/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': body.idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error || 'Signup failed');
  return data as {
    tenant: { slug: string; name: string };
    invite: { setPasswordUrl: string };
    idempotentReplay?: boolean;
  };
}
