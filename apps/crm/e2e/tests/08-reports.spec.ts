import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Reports', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'reports');
    await page.waitForTimeout(500);
  });

  test('loads report for last 7 days', async ({ authedPage: page }) => {
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 7);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(fmt(from));
    await page.locator('input[type="date"]').nth(1).fill(fmt(today));

    await captureStep(page, 'reports-before-load');
    await page.getByRole('button', { name: /load report/i }).click();
    await page.waitForTimeout(2000);

    await expect(page.locator('.reports-view')).toBeVisible();
    await captureStep(page, 'reports-loaded');
  });

  test('quick range presets work', async ({ authedPage: page }) => {
    const weekBtn = page.getByRole('button', { name: /7 days|week/i }).first();
    if (await weekBtn.isVisible()) {
      await weekBtn.click();
      await page.getByRole('button', { name: /load report/i }).click();
      await page.waitForTimeout(1500);
      await captureStep(page, 'reports-week-preset');
    }
  });
});
