import { test, expect } from '../fixtures/auth.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';

const TENANT = process.env.E2E_TENANT || 'dentacare';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

test.describe('Consultation amendments', () => {
  test('desktop: doctor amends finalized note and history appears', async ({ page, request }) => {
    test.skip(test.info().project.name !== 'chromium-desktop', 'Desktop viewport only');
    const uniqueName = `Amend E2E ${Date.now()}`;
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
    });

    const docRes = await request.get(`${API}/api/clinic/doctors`, { headers: doctorHeaders });
    const doctors = (await docRes.json()).doctors ?? [];
    const doctorRow = Array.isArray(doctors) ? doctors.find((d: { userId?: string }) => d.userId === 'user-e2e-doctor') ?? doctors[0] : undefined;
    const doctorId = doctorRow?.id as string | undefined;

    const encRes = await request.post(`${API}/api/clinic/patients/${patient.id}/encounters`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: { appointmentId: appointment.id, doctorId },
    });
    const enc = await encRes.json();
    await request.patch(`${API}/api/clinic/encounters/${enc.id}`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: {
        clinicalNote: 'Initial E2E note',
        prescriptionItems: [{ drugName: 'Paracetamol', dose: '500mg' }],
      },
    });
    await request.post(`${API}/api/clinic/encounters/${enc.id}/finalize`, { headers: doctorHeaders });

    await loginClinicApp(page, 'doctor');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'patients');
    await page.locator('.patient-card, .patient-row').filter({ hasText: uniqueName }).first().click();
    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /visits/i }).click();

    const amendBtn = page.getByRole('button', { name: /^Amend$/ }).first();
    await expect(amendBtn).toBeVisible({ timeout: 15_000 });
    await amendBtn.click();
    await page.locator('#amend-reason').fill('Corrected note after supervisor review');
    await page.locator('textarea').first().fill('Amended E2E clinical note');
    await page.getByRole('button', { name: /save amendment/i }).click();

    await expect(
      page.locator('.encounter-amendments-reason').filter({ hasText: /supervisor review/i }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('mobile: amendment history visible on visit history', async ({ page, request }) => {
    test.skip(test.info().project.name !== 'chromium-mobile', 'Mobile viewport only');

    const uniqueName = `AmendMobile ${Date.now()}`;
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
    });
    const docRes = await request.get(`${API}/api/clinic/doctors`, { headers: doctorHeaders });
    const doctors = (await docRes.json()).doctors ?? [];
    const doctorRow = Array.isArray(doctors)
      ? doctors.find((d: { userId?: string }) => d.userId === 'user-e2e-doctor') ?? doctors[0]
      : undefined;
    const doctorId = doctorRow?.id as string | undefined;
    const encRes = await request.post(`${API}/api/clinic/patients/${patient.id}/encounters`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: { appointmentId: appointment.id, doctorId },
    });
    const enc = await encRes.json();
    await request.patch(`${API}/api/clinic/encounters/${enc.id}`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: { clinicalNote: 'Mobile seed note', prescriptionItems: [{ drugName: 'B', dose: '1' }] },
    });
    await request.post(`${API}/api/clinic/encounters/${enc.id}/finalize`, { headers: doctorHeaders });
    const amendRes = await request.post(`${API}/api/clinic/encounters/${enc.id}/amendments`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: {
        reason: 'Mobile history visibility test',
        patch: { clinicalNote: 'Mobile amended note' },
      },
    });
    expect(amendRes.ok()).toBeTruthy();

    await loginClinicApp(page, 'doctor');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'patients');
    await page.locator('.patient-card, .patient-row').filter({ hasText: uniqueName }).first().click();
    await page.getByRole('button', { name: /visits/i }).click();
    await expect(page.getByTestId(`encounter-amendments-${enc.id}`)).toBeVisible({ timeout: 15_000 });
  });
});
