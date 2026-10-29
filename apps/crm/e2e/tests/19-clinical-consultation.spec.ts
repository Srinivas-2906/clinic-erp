import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
}

test.describe('Clinical consultation flow', () => {
  test('Today → Consult → draft → reopen → finalize → PDF → visit history', async ({ authedPage: page, request }) => {
    const uniqueLabel = `E2E UI ${Date.now()}`;
    const headers = await authHeaders(request, API, TENANT, E2E_CREDENTIALS.email, E2E_CREDENTIALS.password);
    const { patient } = await createPatientAndAppointment(request, API, headers, {
      name: uniqueLabel,
      status: 'arrived',
    });

    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(uniqueLabel).first()).toBeVisible({ timeout: 20_000 });
    const card = page.locator('.appt-card, .board-card').filter({ hasText: uniqueLabel }).first();
    await card.locator('button.board-card-advance, button.action-done').filter({ hasText: /^Consult$/i }).click();
    await expect(page.locator('#consult-complaint')).toBeVisible({ timeout: 20_000 });

    await page.locator('#consult-complaint').fill('Sharp pain lower left');
    await page.locator('#consult-diagnosis').fill('Dental caries');
    await page.getByPlaceholder('Medicine').first().fill('Paracetamol');
    await page.getByPlaceholder('Dose').first().fill('500mg');

    const saveResp = page.waitForResponse((r) => r.url().includes('/encounters/') && r.request().method() === 'PATCH' && r.ok());
    await page.getByRole('button', { name: /save draft/i }).click();
    const savedBody = await (await saveResp).json();
    expect(savedBody.chiefComplaint).toBe('Sharp pain lower left');
    await expect(page.getByText(/consultation saved/i)).toBeVisible({ timeout: 10_000 });

    await page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') }).locator('button.modal-close').click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await advanceQueueToConsult(page, uniqueLabel);
    await expect.poll(async () => page.locator('#consult-complaint').inputValue(), { timeout: 20_000 })
      .toBe('Sharp pain lower left');

    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.getByText(/consultation finalized/i)).toBeVisible({ timeout: 20_000 });

    await page.goto(`/?tenant=${TENANT}&tab=patients&patient=${patient.id}`);
    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Visits/i }).click();
    await expect(page.getByText(/finalized/i).first()).toBeVisible({ timeout: 10_000 });

    const pdfPagePromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Rx PDF/i }).click();
    const pdfPage = await pdfPagePromise;
    await expect(pdfPage).toHaveURL(/blob:|about:blank/);
  });
});
