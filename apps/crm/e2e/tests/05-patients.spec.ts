import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Patients', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'patients');
    await page.waitForTimeout(600);
  });

  test('lists patients and shows filters', async ({ authedPage: page }) => {
    await expect(page.locator('h1.page-title').filter({ hasText: 'Patients' })).toBeVisible();
    await captureStep(page, 'patients-list');
  });

  test('creates a new patient via dialog', async ({ authedPage: page }) => {
    const suffix = Date.now().toString().slice(-7);
    const name = `E2E Patient ${suffix}`;
    const phone = `9${suffix.padStart(9, '0').slice(0, 9)}`;

    await page.locator('.patients-header-actions').getByRole('button', { name: 'Add patient' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 8000 });

    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('30');

    await captureStep(page, 'patients-add-form-filled');

    await page.locator('.modal-footer').getByRole('button', { name: 'Add patient' }).click();
    await page.waitForTimeout(1500);

    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });
    await captureStep(page, 'patients-after-create');
  });

  test('opens patient detail from list', async ({ authedPage: page }) => {
    const card = page.locator('.patient-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await card.click({ position: { x: 20, y: 20 } });

    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 10_000 });
    await captureStep(page, 'patients-detail-open');
    // Desktop hides mobile back button — navigate away via sidebar
    await page.locator('.clinic-sidebar').getByRole('button', { name: 'Home' }).click();
  });
});
