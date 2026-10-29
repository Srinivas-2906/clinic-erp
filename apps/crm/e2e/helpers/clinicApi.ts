import { expect, type APIRequestContext } from '@playwright/test';

const CLINIC_TZ = 'Asia/Kolkata';

export function clinicTodayYmd(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

export async function authHeaders(request: APIRequestContext, apiBase: string, tenant: string, email: string, password: string) {
  const login = await request.post(`${apiBase}/api/platform/login`, {
    data: { email, password, tenantSlug: tenant },
    headers: { 'X-Tenant-Slug': tenant },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).token as string;
  return { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': tenant };
}

/** First available slot today in clinic timezone (API canonical startsAt). */
export async function pickTodayScheduledAt(
  request: APIRequestContext,
  apiBase: string,
  headers: Record<string, string>,
) {
  const dateStr = clinicTodayYmd();
  const slotRes = await request.get(`${apiBase}/api/appointments/slots?date=${dateStr}`, { headers });
  expect(slotRes.ok()).toBeTruthy();
  const body = await slotRes.json();
  const slots = body.slots ?? [];
  const first = slots[0];
  if (first && typeof first === 'object' && first.startsAt) {
    return { dateStr, scheduledAt: first.startsAt as string };
  }
  if (typeof first === 'string') {
    return { dateStr, scheduledAt: `${dateStr}T${first}:00+05:30` };
  }
  const last = slots[slots.length - 1];
  if (last && typeof last === 'object' && last.startsAt) {
    return { dateStr, scheduledAt: last.startsAt as string };
  }
  if (typeof last === 'string') {
    return { dateStr, scheduledAt: `${dateStr}T${last}:00+05:30` };
  }
  return { dateStr, scheduledAt: `${dateStr}T18:30:00+05:30` };
}

export async function createPatientAndAppointment(
  request: APIRequestContext,
  apiBase: string,
  headers: Record<string, string>,
  opts: { name: string; phone?: string; status?: string; service?: string },
) {
  const phone = opts.phone ?? `9${Date.now().toString().slice(-9)}`;
  const patientRes = await request.post(`${apiBase}/api/patients`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: { name: opts.name, phone, chiefComplaint: '' },
  });
  expect(patientRes.ok()).toBeTruthy();
  const patient = await patientRes.json();

  const docRes = await request.get(`${apiBase}/api/clinic/doctors`, { headers });
  const docBody = await docRes.json();
  const doctors = docBody.doctors ?? docBody;
  const doctorId = Array.isArray(doctors) ? doctors[0]?.id : undefined;

  const { dateStr, scheduledAt } = await pickTodayScheduledAt(request, apiBase, headers);
  const apptRes = await request.post(`${apiBase}/api/appointments`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: {
      patientId: patient.id,
      service: opts.service ?? 'Consultation',
      scheduledAt,
      status: opts.status ?? 'requested',
      ...(doctorId ? { assignedDoctorId: doctorId } : {}),
    },
  });
  expect(apptRes.ok()).toBeTruthy();

  return { patient, dateStr, scheduledAt, headers };
}
