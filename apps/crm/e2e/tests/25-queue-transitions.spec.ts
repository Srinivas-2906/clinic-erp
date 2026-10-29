import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

test.describe('Queue transitions', () => {
  test('Confirm → Arrived → Consult opens consultation sheet', async ({ authedPage: page, request }) => {
    const label = `Queue ${Date.now().toString().slice(-5)}`;
    const headers = await authHeaders(request, API, E2E_CREDENTIALS.tenant, E2E_CREDENTIALS.email, E2E_CREDENTIALS.password);
    await createPatientAndAppointment(request, API, headers, { name: label, status: 'requested' });

    await goToTab(page, 'today');
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return page.getByText(label).first().isVisible();
    }, { timeout: 25_000 }).toBe(true);
    await advanceQueueToConsult(page, label);
    await expect(page.locator('#consult-complaint')).toBeVisible();
  });
});
