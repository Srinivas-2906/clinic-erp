import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Today board', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'today');
    await page.waitForTimeout(800);
  });

  test('shows today appointments and stat chips', async ({ authedPage: page }) => {
    await expect(page.getByRole('heading', { name: /Today/i }).first()).toBeVisible();
    await captureStep(page, 'today-board-default');
  });

  test('filters by status chips', async ({ authedPage: page }) => {
    const confirmChip = page.getByRole('button', { name: /confirm/i }).first();
    if (await confirmChip.isVisible()) {
      await confirmChip.click();
      await page.waitForTimeout(400);
      await captureStep(page, 'today-filter-confirm');
    }
    const allChip = page.getByRole('button', { name: /^all$/i }).first();
    if (await allChip.isVisible()) {
      await allChip.click();
    }
  });

  test('toggles list vs board view on desktop', async ({ authedPage: page }) => {
    const boardBtn = page.getByRole('button', { name: /board/i }).first();
    const listBtn = page.getByRole('button', { name: /list/i }).first();
    if (await boardBtn.isVisible()) {
      await boardBtn.click();
      await page.waitForTimeout(500);
      await captureStep(page, 'today-board-kanban');
    }
    if (await listBtn.isVisible()) {
      await listBtn.click();
      await page.waitForTimeout(500);
      await captureStep(page, 'today-list-view');
    }
  });

  test('refresh reloads today data', async ({ authedPage: page }) => {
    const refresh = page.getByRole('button', { name: 'Refresh' }).first();
    if (await refresh.isVisible()) {
      await refresh.click();
      await page.waitForTimeout(1000);
      await captureStep(page, 'today-after-refresh');
    }
  });
});
