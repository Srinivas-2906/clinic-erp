import { test, expect } from '../fixtures/auth.fixture';
import { closeBlockingModalsIfOpen } from '../helpers/navigation';

test.describe('Mobile owner account menu @smoke', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('owner reaches settings and activity from account menu', async ({ authedPage: page }) => {
    await closeBlockingModalsIfOpen(page);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.locator('#clinicName, .settings-form').first()).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: 'Activity' }).click();
    await expect(page.locator('.audit-view').first()).toBeVisible({ timeout: 10_000 });
  });
});
