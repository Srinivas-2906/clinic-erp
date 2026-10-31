import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Mobile billing & overview layout', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile viewport only');
  });

  test('payments stat strip and filters are usable', async ({ authedPage: page }) => {
    await goToTab(page, 'payments');
    await expect(page.locator('.payments-view .stat-strip')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Due now' })).toBeVisible();
    const outstanding = page.locator('.payments-view .stat-card').filter({ hasText: 'Outstanding' });
    await expect(outstanding).toBeVisible();
  });

  test('overview home shows stat strip', async ({ authedPage: page }) => {
    await goToTab(page, 'overview');
    await expect(page.locator('.overview-view .stat-strip')).toBeVisible();
    await expect(page.locator('.overview-greeting-title')).toBeVisible();
  });
});
