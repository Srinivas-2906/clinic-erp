import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

function uniquePhone() {
  const n = Date.now().toString().slice(-9);
  return `9${n}`;
}

test.describe('Multi-doctor booking UI', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'book');
    await page.waitForTimeout(500);
  });

  test('shows doctor step and any-available slots when multiple doctors', async ({ authedPage: page, request }) => {
    const API = process.env.E2E_API_URL || 'http://localhost:3010';
    const TENANT = process.env.E2E_TENANT || 'dentacare';

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
    test.skip(!listRes.ok(), 'Doctors API unavailable');
    const { doctors } = await listRes.json();
    test.skip((doctors?.length ?? 0) < 2, 'Need at least 2 doctors for multi-doctor booking UI test');

    const phone = uniquePhone();
    const name = `MultiDoc E2E ${Date.now().toString().slice(-5)}`;

    await page.getByRole('tab', { name: /schedule/i }).click();
    await page.locator('#book-search').fill(phone);
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /register new patient/i }).click();
    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('30');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.locator('.form-select').first().selectOption({ index: 0 });
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByText('Choose doctor')).toBeVisible();
    await page.getByRole('button', { name: /any available doctor/i }).click();
    await page.getByRole('button', { name: 'Next' }).click();

    const slotSelect = page.locator('.form-select').last();
    await expect(slotSelect).toBeEnabled({ timeout: 10_000 });
    const options = await slotSelect.locator('option').allTextContents();
    const validSlot = options.find((o) => /AM|PM/i.test(o));
    test.skip(!validSlot, 'No slots available for any-available booking');

    await slotSelect.selectOption({ index: options.indexOf(validSlot) });
    await page.getByRole('button', { name: 'Review' }).click();

    await expect(page.getByText('Doctor')).toBeVisible();
    await page.getByRole('button', { name: /book appointment/i }).click();
    await page.waitForTimeout(2000);
  });
});
