import { test, expect } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3010';
const TENANT = process.env.E2E_TENANT || 'dentacare';

function nextMonday(offsetWeeks = 1) {
  const d = new Date();
  d.setDate(d.getDate() + offsetWeeks * 7);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe('Multi-doctor slot API', () => {
  test('doctor-specific slots do not cross-block', async ({ request }) => {
    const date = nextMonday(2);

    const doctorsRes = await request.get(`${API}/api/platform/tenant/${TENANT}/public`);
    expect(doctorsRes.ok()).toBeTruthy();

    const loginRes = await request.post(`${API}/api/platform/login`, {
      headers: { 'x-tenant-slug': TENANT },
      data: {
        email: process.env.E2E_OWNER_EMAIL || 'e2e-owner@dentacare.in',
        password: process.env.E2E_OWNER_PASSWORD || 'E2eTest@2026',
      },
    });
    test.skip(!loginRes.ok(), 'E2E owner login unavailable');
    const { token } = await loginRes.json();

    const listRes = await request.get(`${API}/api/clinic/doctors`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
    });
    expect(listRes.ok()).toBeTruthy();
    const { doctors } = await listRes.json();
    test.skip((doctors?.length ?? 0) < 2, 'Need at least 2 doctors for multi-doctor slot test');

    const doctorA = doctors[0].id;
    const doctorB = doctors[1].id;

    const slotsA1 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorA}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
    });
    expect(slotsA1.ok()).toBeTruthy();
    const dataA1 = await slotsA1.json();
    const slot = dataA1.slots?.[0];
    test.skip(!slot, 'No slots for doctor A');

    const match = dataA1.slotOptions?.find((s: { label: string }) => s.label === slot);
    const scheduledAt = `${date}T${match?.time || '10:00'}:00`;

    const bookRes = await request.post(`${API}/api/appointments`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT, 'Content-Type': 'application/json' },
      data: {
        patientId: 'pat-demo-1',
        service: 'Check-up',
        scheduledAt,
        status: 'confirmed',
        assignedDoctorId: doctorA,
      },
    });
    expect(bookRes.ok()).toBeTruthy();

    const slotsA2 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorA}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
    });
    const slotsB = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorB}`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
    });
    const afterA = await slotsA2.json();
    const forB = await slotsB.json();

    expect(afterA.slots).not.toContain(slot);
    expect(forB.slots).toContain(slot);
  });
});
