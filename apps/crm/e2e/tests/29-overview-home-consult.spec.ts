import { test, expect } from '@playwright/test';
import { goToTab } from '../helpers/navigation';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { authHeaders, createPatientAndAppointment, setAppointmentStatus } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
}

test.describe('Home overview clinical queue', () => {
  test('Overview → Consult opens consultation (not complete-without-chart)', async ({ page, request }) => {
    const uniqueLabel = `E2E Home ${Date.now()}`;
    const headers = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    const { appointment } = await createPatientAndAppointment(request, API, headers, {
      name: uniqueLabel,
      status: 'confirmed',
    });
    await setAppointmentStatus(request, API, headers, appointment.id, 'arrived');

    await loginClinicApp(page, 'owner');
    await goToTab(page, 'overview');
    await dismissPilotBanner(page);

    const row = page.locator('.overview-appt-row').filter({ hasText: uniqueLabel });
    await expect.poll(async () => row.count(), { timeout: 25_000 }).toBeGreaterThan(0);

    const encounterReady = page.waitForResponse(
      (r) => r.url().includes('/encounters') && ['POST', 'GET'].includes(r.request().method()) && r.ok(),
      { timeout: 25_000 },
    );
    await row.getByRole('button', { name: 'Consult' }).click();
    await encounterReady;

    await expect(page.locator('#consult-complaint')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Loading consultation…')).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /finalize visit/i })).toBeVisible();
  });
});
