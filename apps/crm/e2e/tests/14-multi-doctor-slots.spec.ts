import { test, expect } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3010';
const TENANT = process.env.E2E_TENANT || 'dentacare';

function nextMonday(offsetWeeks = 1) {
  const d = new Date();
  d.setDate(d.getDate() + offsetWeeks * 7);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

type SlotOption = { time?: string; label?: string; startsAt?: string };

function findOverlappingSlot(dataA: { slotOptions?: SlotOption[] }, dataB: { slotOptions?: SlotOption[] }) {
  const bTimes = new Set(
    (dataB.slotOptions ?? []).map((o) => o.time || o.label).filter(Boolean),
  );
  return (dataA.slotOptions ?? []).find((s) => bTimes.has(s.time) || bTimes.has(s.label));
}

test.describe('Multi-doctor slot API', () => {
  test('doctor-specific slots do not cross-block', async ({ request }) => {
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

    let date = '';
    let match: SlotOption | undefined;
    for (let week = 2; week <= 6 && !match; week++) {
      date = nextMonday(week);
      const slotsA1 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorA}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
      });
      const slotsB1 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorB}`, {
        headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
      });
      if (!slotsA1.ok() || !slotsB1.ok()) continue;
      match = findOverlappingSlot(await slotsA1.json(), await slotsB1.json());
    }
    test.skip(!match, 'No overlapping slot for both doctors in upcoming weeks');

    const slot = match.label ?? match.time;
    const scheduledAt = match.startsAt
      || (match.time ? `${date}T${match.time}:00+05:30` : `${date}T10:00:00+05:30`);

    const patientRes = await request.post(`${API}/api/patients`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT, 'Content-Type': 'application/json' },
      data: { name: `SlotIso ${Date.now()}`, phone: `9${Date.now().toString().slice(-9)}` },
    });
    expect(patientRes.ok()).toBeTruthy();
    const patient = await patientRes.json();

    const bookRes = await request.post(`${API}/api/appointments`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT, 'Content-Type': 'application/json' },
      data: {
        patientId: patient.id,
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

    test.skip(!forB.slots?.length, 'Doctor B has no slots on test date');
    expect(afterA.slots).not.toContain(slot);
    const slotTime = match.time;
    const bHasParallelSlot =
      forB.slots?.includes(slot)
      || (slotTime && forB.slotOptions?.some((o: { time?: string; label?: string }) => o.time === slotTime || o.label === slot));
    expect(bHasParallelSlot).toBeTruthy();
  });
});
