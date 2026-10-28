import { test, expect } from '../fixtures/auth.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Route coverage — settings & activity @smoke', () => {
  test('owner can open settings and activity tabs', async ({ authedPage: page }) => {
    await closeBlockingModalsIfOpen(page);
    const sidebar = page.locator('.clinic-sidebar');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#clinicName, .settings-form').first()).toBeVisible({ timeout: 15_000 });
    await captureStep(page, 'route-settings');

    await sidebar.getByRole('button', { name: 'Activity' }).click();
    await expect(page.locator('.audit-view').first()).toBeVisible({ timeout: 10_000 });
    await captureStep(page, 'route-audit');
  });

  test('deep-link tab query loads patients list', async ({ authedPage: page }) => {
    await page.goto('/?tab=patients');
    await expect(page.locator('h1.page-title').filter({ hasText: 'Patients' })).toBeVisible();
    await goToTab(page, 'overview');
    await expect(page.locator('.overview-view')).toBeVisible();
  });
});
