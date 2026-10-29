import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

test.describe('Queue transitions', () => {
  test('Confirm → Arrived → Consult opens consultation sheet', async ({ authedPage: page, request }) => {
    const label = `Queue E2E ${Date.now()}`;
    const headers = await authHeaders(request, API, E2E_CREDENTIALS.tenant, E2E_CREDENTIALS.email, E2E_CREDENTIALS.password);
    await createPatientAndAppointment(request, API, headers, { name: label, status: 'requested' });

    await goToTab(page, 'today');
    const allDoctors = page.getByRole('button', { name: /^All doctors/i });
    if (await allDoctors.isVisible().catch(() => false)) {
      await allDoctors.click();
    }
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return page.locator('.board-card-name, button.appt-name').filter({ hasText: label }).first().isVisible();
    }, { timeout: 25_000 }).toBe(true);
    await advanceQueueToConsult(page, label);
    await expect(page.locator('#consult-complaint')).toBeVisible();
  });
});
