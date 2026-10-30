import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Mobile reports & activity tables', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile viewport only');
  });

  test('reports preview uses labeled stacked rows', async ({ authedPage: page }) => {
    await goToTab(page, 'reports');
    const today = new Date();
    const from = new Date(today);
    from.setDate(from.getDate() - 7);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    await page.locator('input[type="date"]').first().fill(fmt(from));
    await page.locator('input[type="date"]').nth(1).fill(fmt(today));
    await page.getByRole('button', { name: /load report/i }).click();
    await expect(page.locator('.reports-summary-card')).toBeVisible({ timeout: 15_000 });

    const labeledCell = page.locator('.reports-table td[data-label]').first();
    if (await labeledCell.count()) {
      await expect(labeledCell).toBeVisible();
      await expect(labeledCell).toHaveAttribute('data-label', /.+/);
    } else {
      await expect(page.locator('.reports-empty-card')).toBeVisible();
    }
  });

  test('activity log table cells expose row labels', async ({ authedPage: page }) => {
    await goToTab(page, 'audit');
    await expect(page.locator('.audit-view')).toBeVisible({ timeout: 10_000 });
    const loading = page.getByText(/loading activity/i);
    if (await loading.isVisible()) {
      await expect(loading).toBeHidden({ timeout: 15_000 });
    }
    const row = page.locator('.audit-table td[data-label="Action"]').first();
    if (await row.count()) {
      await expect(row).toBeVisible();
    } else {
      await expect(page.getByText(/no activity recorded/i)).toBeVisible();
    }
  });
});
