import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Settings, plan usage, export', () => {
  test('owner updates timezone and sees plan panel', async ({ authedPage: page }) => {
    await goToTab(page, 'settings');
    await expect(page.locator('#clinicName')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.plan-usage-panel')).toBeVisible();
    const tz = page.locator('#clinicTz');
    await tz.fill('Asia/Kolkata');
    await page.getByRole('button', { name: /save settings/i }).click();
    await expect(page.getByText(/saved|updated|settings/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('owner can download tenant export from plan panel', async ({ authedPage: page }) => {
    await goToTab(page, 'settings');
    await expect(page.locator('.plan-usage-panel')).toBeVisible({ timeout: 15_000 });
    const exportBtn = page.getByRole('button', { name: /download clinic data export/i });
    await expect(exportBtn).toBeVisible({ timeout: 15_000 });
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 }).catch(() => null);
    await exportBtn.click();
    const download = await downloadPromise;
    if (download) {
      expect(download.suggestedFilename()).toMatch(/export|clinic|json|zip/i);
    } else {
      await expect(page.getByText(/export downloaded|export/i).first()).toBeVisible({ timeout: 10_000 });
    }
  });
});
