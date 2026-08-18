import { authHeaders, clearToken } from './auth';
import type { Appointment, Patient, TodayStats, Payment, PaymentSummary, CatalogItem, Doctor, DoctorSession, DoctorTimeOff } from '../types';
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
  return request<{ patient: Patient; appointments: Appointment[] }>(`/patients/${id}`);
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
  return request<{ user: { id: string; name?: string; email?: string; username?: string; role?: string; isPlatformAdmin?: boolean } }>('/platform/me');
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
}) {
  return request<Payment>('/clinic/payments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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

export function approveAccessRequest(id: string) {
  return request<{
    request: import('../types').AccessRequest;
    user: { id: string; email: string; name: string; role: string };
    setPasswordUrl: string;
    expiresInDays: number;
  }>(`/clinic/access-requests/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export function rejectAccessRequest(id: string) {
  return request<{ request: import('../types').AccessRequest }>(`/clinic/access-requests/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
}

export type { AccessRequest } from '../types';
