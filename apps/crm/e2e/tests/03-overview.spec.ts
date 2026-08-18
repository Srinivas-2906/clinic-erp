import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Home / Overview', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'overview');
  });

  test('shows greeting and today stats', async ({ authedPage: page }) => {
    await expect(page.locator('.overview-view')).toBeVisible();
    await expect(page.getByText(/Good (morning|afternoon|evening)/i)).toBeVisible();
    await captureStep(page, 'overview-home');
  });

  test('can navigate to Today from overview', async ({ authedPage: page }) => {
    const todayLink = page.getByRole('button', { name: /today|see all/i }).first();
    if (await todayLink.isVisible()) {
      await todayLink.click();
      await expect(page.locator('.today-view, .view')).toBeVisible();
      await captureStep(page, 'overview-go-today');
    }
  });

  test('can open global search', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'Search' }).first().click();
    await expect(page.locator('.search-overlay')).toBeVisible({ timeout: 8000 });
    await captureStep(page, 'overview-global-search');
    await page.keyboard.press('Escape');
  });
});
