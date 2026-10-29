import { test, expect } from '@playwright/test';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
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

test.describe('Clinical consultation flow', () => {
  test('Today → Consult → draft → reopen → finalize → PDF → visit history', async ({ page, request }) => {
    const uniqueLabel = `E2E UI ${Date.now()}`;
    const headers = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    const { patient, appointment } = await createPatientAndAppointment(request, API, headers, {
      name: uniqueLabel,
      status: 'requested',
    });
    await setAppointmentStatus(request, API, headers, appointment.id, 'confirmed');
    await setAppointmentStatus(request, API, headers, appointment.id, 'arrived');

    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return page.getByText(uniqueLabel).first().isVisible();
    }, { timeout: 25_000 }).toBe(true);

    const encounterReady = page.waitForResponse(
      (r) => r.url().includes('/encounters') && ['POST', 'GET'].includes(r.request().method()) && r.ok(),
      { timeout: 25_000 },
    );
    await advanceQueueToConsult(page, uniqueLabel);
    await encounterReady;

    const consultModal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await expect(consultModal.locator('#consult-complaint')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Loading consultation…')).toBeHidden({ timeout: 20_000 });

    await consultModal.locator('#consult-complaint').fill('Sharp pain lower left');
    const saveDraft = consultModal.getByRole('button', { name: /save draft/i });
    await saveDraft.scrollIntoViewIfNeeded();
    await saveDraft.click();
    const errToast = page.locator('.toast-err');
    await expect(page.getByText(/consultation saved/i).or(errToast)).toBeVisible({ timeout: 20_000 });
    if (await errToast.isVisible().catch(() => false)) {
      throw new Error(`Save draft failed: ${(await errToast.innerText()).trim()}`);
    }

    await consultModal.locator('button.modal-close').click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 10_000 });

    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await advanceQueueToConsult(page, uniqueLabel);
    await expect.poll(async () => page.locator('#consult-complaint').inputValue(), { timeout: 20_000 })
      .toBe('Sharp pain lower left');

    await page.locator('#consult-diagnosis').fill('Dental caries');
    await page.getByPlaceholder('Medicine').first().fill('Paracetamol');
    await page.getByPlaceholder('Dose').first().fill('500mg');

    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 25_000 });

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
