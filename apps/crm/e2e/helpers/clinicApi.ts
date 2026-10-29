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

type SlotOption = { label?: string; time?: string; doctorId?: string; doctorName?: string };

function slotOptionToScheduledAt(dateStr: string, opt: SlotOption) {
  const time = opt.time?.trim();
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  return `${dateStr}T${time}:00+05:30`;
}

/** Next available slot today in clinic timezone (canonical ISO scheduledAt). */
export async function pickTodayScheduledAt(
  request: APIRequestContext,
  apiBase: string,
  headers: Record<string, string>,
  doctorId?: string,
) {
  const dateStr = clinicTodayYmd();
  const doctorQ = doctorId ? `&doctorId=${encodeURIComponent(doctorId)}` : '';
  const slotRes = await request.get(`${apiBase}/api/appointments/slots?date=${dateStr}${doctorQ}`, { headers });
  expect(slotRes.ok()).toBeTruthy();
  const body = await slotRes.json();
  const options = (body.slotOptions ?? []) as SlotOption[];
  const nowMs = Date.now();

  for (const opt of options) {
    const scheduledAt = slotOptionToScheduledAt(dateStr, opt);
    if (scheduledAt && new Date(scheduledAt).getTime() > nowMs - 60_000) {
      return { dateStr, scheduledAt, doctorId: opt.doctorId };
    }
  }

  const last = options[options.length - 1];
  const fallback = last ? slotOptionToScheduledAt(dateStr, last) : null;
  if (fallback) {
    return { dateStr, scheduledAt: fallback, doctorId: last?.doctorId };
  }
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: CLINIC_TZ, hour: 'numeric', hour12: false }).format(new Date()),
  );
  const slotHour = Math.min(Math.max(hour + 1, 10), 18);
  return { dateStr, scheduledAt: `${dateStr}T${String(slotHour).padStart(2, '0')}:00:00+05:30` };
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
  const clinician =
    Array.isArray(doctors)
      ? doctors.find((d: { userId?: string | null }) => d.userId === 'user-e2e-doctor') ?? doctors[0]
      : undefined;
  const doctorId = clinician?.id as string | undefined;

  const { dateStr, scheduledAt, doctorId: slotDoctorId } = await pickTodayScheduledAt(
    request,
    apiBase,
    headers,
    doctorId,
  );
  const assignedDoctorId = doctorId ?? slotDoctorId;
  const apptRes = await request.post(`${apiBase}/api/appointments`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
    data: {
      patientId: patient.id,
      service: opts.service ?? 'Consultation',
      scheduledAt,
      status: opts.status ?? 'requested',
      ...(assignedDoctorId ? { assignedDoctorId } : {}),
    },
  });
  expect(apptRes.ok()).toBeTruthy();

  return { patient, dateStr, scheduledAt, headers };
}
