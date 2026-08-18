import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Payments', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'payments');
    await page.waitForTimeout(800);
  });

  test('shows payment summary stats', async ({ authedPage: page }) => {
    await expect(page.locator('h1.page-title').filter({ hasText: 'Payments' })).toBeVisible();
    await expect(page.locator('.stat-strip')).toBeVisible();
    await captureStep(page, 'payments-summary');
  });

  test('records a payment for first patient', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 8000 });
    await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible();

    const patientSelect = page.locator('.modal-overlay select').first();
    await patientSelect.selectOption({ index: 1 });

    await page.locator('input[inputmode="numeric"], input[type="number"]').first().fill('500');
    await captureStep(page, 'payments-record-form');

    await page.getByRole('button', { name: 'Save' }).click();
    await page.waitForTimeout(1500);
    await captureStep(page, 'payments-after-record');
  });
});
