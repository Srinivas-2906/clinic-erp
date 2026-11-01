import { test, expect } from '../fixtures/auth.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';

const TENANT = process.env.E2E_TENANT || 'dentacare';
const API = process.env.E2E_API_BASE || process.env.PLAYWRIGHT_API_BASE || 'http://127.0.0.1:3001';

test.describe('Follow-up journey', () => {
  test('receptionist schedules return visit from pending follow-up', async ({ page, request }) => {
    const uniqueName = `FollowUp E2E ${Date.now()}`;
    const doctorHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.doctor.email,
      ROLE_CREDENTIALS.doctor.password,
    );
    const { patient, appointment } = await createPatientAndAppointment(request, API, doctorHeaders, {
      name: uniqueName,
      status: 'arrived',
      service: 'Consultation',
    });

    const docRes = await request.get(`${API}/api/clinic/doctors`, { headers: doctorHeaders });
    const doctors = (await docRes.json()).doctors ?? (await docRes.json());
    const doctorRow = Array.isArray(doctors)
      ? doctors.find((d: { userId?: string }) => d.userId === 'user-e2e-doctor') ?? doctors[0]
      : undefined;
    const doctorId = doctorRow?.id as string | undefined;

    const encRes = await request.post(`${API}/api/clinic/patients/${patient.id}/encounters`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: { appointmentId: appointment.id, doctorId },
    });
    expect(encRes.ok()).toBeTruthy();
    const enc = await encRes.json();

    const patchRes = await request.patch(`${API}/api/clinic/encounters/${enc.id}`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: {
        chiefComplaint: 'Follow-up E2E',
        prescriptionItems: [{ drugName: 'Vitamin D', dose: '1 tab' }],
      },
    });
    expect(patchRes.ok()).toBeTruthy();

    const finRes = await request.post(`${API}/api/clinic/encounters/${enc.id}/finalize`, {
      headers: doctorHeaders,
    });
    expect(finRes.ok()).toBeTruthy();

    const due = new Date();
    due.setDate(due.getDate() + 14);
    const dueStr = due.toISOString().slice(0, 10);
    const fuRes = await request.post(`${API}/api/clinic/encounters/${enc.id}/follow-up`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: { dueDate: dueStr, instructions: 'Review progress' },
    });
    expect(fuRes.ok()).toBeTruthy();

    await loginClinicApp(page, 'receptionist');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'book');
    await expect(page.locator('.follow-ups-panel')).toBeVisible({ timeout: 15_000 });

    const row = page.locator('.follow-ups-panel').filter({ hasText: uniqueName });
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.locator('.follow-ups-schedule-btn').click();
    await expect(page.getByText('Follow-up visit').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(uniqueName).first()).toBeVisible({ timeout: 10_000 });
  });
});
