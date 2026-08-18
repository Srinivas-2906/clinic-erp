import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

const TABS = ['overview', 'today', 'patients', 'book', 'payments', 'reports', 'doctors', 'team'] as const;

test.describe('Navigation — all main tabs', () => {
  test('loads every section with screenshot', async ({ authedPage: page }) => {
    for (const tab of TABS) {
      await goToTab(page, tab);
      await page.waitForTimeout(600);
      if (tab === 'team') {
        await expect(page.locator('.team-access-view')).toBeVisible({ timeout: 10_000 });
      } else if (tab === 'doctors') {
        await expect(page.locator('.doctors-view')).toBeVisible({ timeout: 10_000 });
      } else if (tab === 'overview') {
        await expect(page.locator('.overview-view')).toBeVisible();
      } else if (tab === 'today') {
        await expect(page.locator('.today-view, .view')).toBeVisible();
      } else if (tab === 'patients') {
        await expect(page.locator('h1.page-title').filter({ hasText: 'Patients' })).toBeVisible();
      } else if (tab === 'book') {
        await expect(page.locator('.book-view, .book-card').first()).toBeVisible();
      } else if (tab === 'payments') {
        await expect(page.locator('h1.page-title').filter({ hasText: 'Payments' })).toBeVisible();
      } else if (tab === 'reports') {
        await expect(page.getByRole('button', { name: /load report/i })).toBeVisible();
      }
      await captureStep(page, `nav-${tab}`);
    }
  });
});
