import { test, expect } from '@playwright/test';

const API = process.env.E2E_API_URL || 'http://localhost:3010';
const TENANT = process.env.E2E_TENANT || 'dentacare';
const E2E_SECOND_DOCTOR_ID = 'doc-e2e-second';

/** Next Monday at least `minWeeks` weeks ahead (stable future date, clinic week starts Monday). */
function nextMondayIso(minWeeks = 3) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + minWeeks * 7);
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
    const headers = { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT };

    const listRes = await request.get(`${API}/api/clinic/doctors`, { headers });
    expect(listRes.ok()).toBeTruthy();
    const { doctors } = await listRes.json();
    const doctorB = (doctors ?? []).find((d: { id: string }) => d.id === E2E_SECOND_DOCTOR_ID);
    const doctorA =
      (doctors ?? []).find((d: { userId?: string | null }) => d.userId === 'user-e2e-doctor')
      ?? (doctors ?? []).find((d: { id: string }) => d.id !== E2E_SECOND_DOCTOR_ID);
    expect(doctorA, 'E2E primary doctor missing — re-seed with CLINIC_E2E_MODE=1').toBeTruthy();
    expect(doctorB, `${E2E_SECOND_DOCTOR_ID} missing — seed-e2e-local should mirror sessions`).toBeTruthy();

    const date = nextMondayIso(3);
    const slotsA1 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorA!.id}`, { headers });
    const slotsB1 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorB!.id}`, { headers });
    expect(slotsA1.ok()).toBeTruthy();
    expect(slotsB1.ok()).toBeTruthy();
    const match = findOverlappingSlot(await slotsA1.json(), await slotsB1.json());
    expect(match, `No overlapping slot on ${date} for mirrored E2E doctors`).toBeTruthy();

    const slot = match!.label ?? match!.time;
    const scheduledAt = match!.startsAt
      || (match!.time ? `${date}T${match!.time}:00+05:30` : `${date}T10:00:00+05:30`);

    const patientRes = await request.post(`${API}/api/patients`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: `SlotIso ${Date.now()}`, phone: `9${Date.now().toString().slice(-9)}` },
    });
    expect(patientRes.ok()).toBeTruthy();
    const patient = await patientRes.json();

    const bookRes = await request.post(`${API}/api/appointments`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: {
        patientId: patient.id,
        service: 'Check-up',
        scheduledAt,
        status: 'confirmed',
        assignedDoctorId: doctorA!.id,
      },
    });
    expect(bookRes.ok()).toBeTruthy();

    const slotsA2 = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorA!.id}`, { headers });
    const slotsB = await request.get(`${API}/api/appointments/slots?date=${date}&doctorId=${doctorB!.id}`, { headers });
    const afterA = await slotsA2.json();
    const forB = await slotsB.json();

    expect(forB.slots?.length, 'Doctor B should still publish slots on test date').toBeGreaterThan(0);
    expect(afterA.slots).not.toContain(slot);
    const slotTime = match!.time;
    const bHasParallelSlot =
      forB.slots?.includes(slot)
      || (slotTime && forB.slotOptions?.some((o: { time?: string; label?: string }) => o.time === slotTime || o.label === slot));
    expect(bHasParallelSlot).toBeTruthy();
  });
});
