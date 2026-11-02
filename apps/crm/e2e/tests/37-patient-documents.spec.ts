import { test, expect } from '../fixtures/auth.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';

const TENANT = process.env.E2E_TENANT || 'dentacare';
const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function openPatientByName(page: import('@playwright/test').Page, name: string) {
  await goToTab(page, 'patients');
  await page.waitForTimeout(600);
  const card = page.locator('.patient-card, .patient-row').filter({ hasText: name }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.click();
  await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 10_000 });
}

test.describe('Patient clinical documents', () => {
  test('desktop: upload and list document on patient profile', async ({ authedPage: page, request }) => {
    const uniqueName = `DocUpload E2E ${Date.now()}`;
    const headers = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    await createPatientAndAppointment(request, API, headers, { name: uniqueName });

    await closeBlockingModalsIfOpen(page);
    await openPatientByName(page, uniqueName);

    const panel = page.getByTestId('patient-documents-panel');
    await expect(panel).toBeVisible({ timeout: 10_000 });
    await page.locator('#doc-title').fill('E2E lab scan');

    const input = page.getByTestId('patient-documents-file-input');
    await input.setInputFiles({
      name: 'e2e-clinical.png',
      mimeType: 'image/png',
      buffer: TINY_PNG,
    });

    await expect(panel.locator('.patient-documents-card-title').filter({ hasText: 'E2E lab scan' })).toBeVisible({
      timeout: 20_000,
    });
  });

  test('mobile: documents panel and cards are usable', async ({ page, request }) => {
    test.skip(test.info().project.name !== 'chromium-mobile', 'Mobile viewport only');

    const uniqueName = `DocMobile E2E ${Date.now()}`;
    const headers = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.receptionist.email,
      ROLE_CREDENTIALS.receptionist.password,
    );
    const { patient } = await createPatientAndAppointment(request, API, headers, { name: uniqueName });

    const post = await request.post(`${API}/api/clinic/patients/${patient.id}/documents`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: {
        data: TINY_PNG.toString('base64'),
        contentType: 'image/png',
        title: 'Mobile listed doc',
      },
    });
    expect(post.ok()).toBeTruthy();

    await loginClinicApp(page, 'receptionist');
    await closeBlockingModalsIfOpen(page);
    await openPatientByName(page, uniqueName);

    const panel = page.getByTestId('patient-documents-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('.patient-documents-card-title').filter({ hasText: 'Mobile listed doc' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(panel.locator('.patient-documents-upload-btn')).toBeVisible();
  });
});
