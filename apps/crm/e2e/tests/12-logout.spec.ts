import { test, expect } from '../fixtures/auth.fixture';
import { captureStep } from '../helpers/screenshot';

test.describe('Logout', () => {
  test('logs out from sidebar', async ({ authedPage: page }) => {
    const sidebarLogout = page.locator('.sidebar-logout-btn');
    if (await sidebarLogout.isVisible()) {
      await sidebarLogout.click();
    } else {
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /log out/i }).click();
    }
    await expect(page.locator('.login-screen')).toBeVisible({ timeout: 10_000 });
    await captureStep(page, 'logout-success');
  });
});
