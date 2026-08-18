import { test, expect } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3010';
const TENANT = process.env.E2E_TENANT || 'dentacare';

function nextMonday(offsetWeeks = 2) {
  const d = new Date();
  d.setDate(d.getDate() + offsetWeeks * 7);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

async function ownerToken(request: import('@playwright/test').APIRequestContext) {
  const loginRes = await request.post(`${API}/api/platform/login`, {
    headers: { 'x-tenant-slug': TENANT },
    data: {
      email: process.env.E2E_OWNER_EMAIL || 'e2e-owner@dentacare.in',
      password: process.env.E2E_OWNER_PASSWORD || 'E2eTest@2026',
    },
  });
  if (!loginRes.ok()) return null;
  const { token } = await loginRes.json();
  return token as string;
}

test.describe('Phase 1 API regression', () => {
  test('authenticated slots support doctorId and anyAvailable', async ({ request }) => {
    const token = await ownerToken(request);
    test.skip(!token, 'E2E owner login unavailable');

    const headers = { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT };
    const date = nextMonday();

    const doctorsRes = await request.get(`${API}/api/clinic/doctors`, { headers });
    expect(doctorsRes.ok()).toBeTruthy();
    const { doctors } = await doctorsRes.json();
    expect(Array.isArray(doctors)).toBeTruthy();
    expect(doctors.length).toBeGreaterThan(0);

    const doctorId = doctors[0].id;
    const scopedRes = await request.get(
      `${API}/api/appointments/slots?date=${date}&doctorId=${doctorId}`,
      { headers },
    );
    expect(scopedRes.ok()).toBeTruthy();
    const scoped = await scopedRes.json();
    expect(Array.isArray(scoped.slots)).toBeTruthy();

    if (doctors.length >= 2) {
      const anyRes = await request.get(
        `${API}/api/appointments/slots?date=${date}&anyAvailable=1`,
        { headers },
      );
      expect(anyRes.ok()).toBeTruthy();
      const anyData = await anyRes.json();
      expect(Array.isArray(anyData.slotOptions)).toBeTruthy();
      if (anyData.slotOptions.length > 0) {
        expect(anyData.slotOptions[0].doctorId).toBeTruthy();
        expect(anyData.slotOptions[0].doctorName).toBeTruthy();
      }
    }
  });

  test('patient timeline includes assigned doctor fields', async ({ request }) => {
    const token = await ownerToken(request);
    test.skip(!token, 'E2E owner login unavailable');

    const headers = { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT };
    const patientsRes = await request.get(`${API}/api/patients`, { headers });
    expect(patientsRes.ok()).toBeTruthy();
    const patients = await patientsRes.json();
    test.skip(!Array.isArray(patients) || patients.length === 0, 'No patients for timeline test');

    const patientId = patients[0].id;
    const timelineRes = await request.get(`${API}/api/patients/${patientId}`, { headers });
    expect(timelineRes.ok()).toBeTruthy();
    const timeline = await timelineRes.json();
    expect(timeline.patient?.id).toBe(patientId);
    expect(Array.isArray(timeline.appointments)).toBeTruthy();

    for (const appt of timeline.appointments) {
      expect(appt).toHaveProperty('assignedDoctorId');
      if (appt.assignedDoctorId) {
        expect(appt.assignedDoctor).toBeTruthy();
      }
    }
  });

  test('public booking slots accept anyAvailable', async ({ request }) => {
    const date = nextMonday();
    const res = await request.get(
      `${API}/api/platform/tenant/${TENANT}/booking/slots?date=${date}&anyAvailable=1`,
    );
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.slots)).toBeTruthy();
    if (data.slotOptions?.length) {
      expect(data.slotOptions[0].doctorId).toBeTruthy();
    }
  });

  test('doctors endpoint requires authentication', async ({ request }) => {
    const res = await request.get(`${API}/api/clinic/doctors`, {
      headers: { 'x-tenant-slug': TENANT },
    });
    expect(res.status()).toBe(401);
  });
});
