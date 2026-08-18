import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { continueBookAfterTreatment, pickFirstBookSlot } from '../helpers/booking';

function uniquePhone() {
  return `9${Date.now().toString().slice(-9)}`;
}

test.describe('Phase 1 regression smoke', () => {
  test('core tabs load after login', async ({ authedPage: page }) => {
    for (const tab of ['overview', 'today', 'patients', 'book', 'doctors'] as const) {
      await goToTab(page, tab);
      await expect(page.locator('.clinic-app')).toBeVisible();
    }
  });

  test('doctors management remains accessible', async ({ authedPage: page }) => {
    await goToTab(page, 'doctors');
    await expect(page.locator('.doctors-view')).toBeVisible();
    await expect(page.locator('.doctor-card').first()).toBeVisible({ timeout: 10_000 });
  });

  test('scheduled booking still works with optional doctor step', async ({ authedPage: page }) => {
    const phone = uniquePhone();
    const name = `Regression ${Date.now().toString().slice(-5)}`;

    await goToTab(page, 'book');
    await page.getByRole('tab', { name: /schedule/i }).click();
    await page.locator('#book-search').fill(phone);
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /register new patient/i }).click();
    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('29');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.locator('.form-select').first().selectOption({ index: 0 });
    await continueBookAfterTreatment(page, 'schedule');

    const slotSelect = page.locator('.form-select').last();
    if (await slotSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await pickFirstBookSlot(page);
      await page.getByRole('button', { name: 'Review' }).click();
    }

    await page.getByRole('button', { name: /book appointment/i }).click();
    await page.waitForTimeout(1500);
    await expect(page.locator('.clinic-app')).toBeVisible();
  });

  test('patient visit history tab loads', async ({ authedPage: page }) => {
    await goToTab(page, 'patients');
    await page.waitForTimeout(800);

    const row = page.locator('.patient-card, .patient-row').first();
    await row.click();
    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /visits/i }).click();
    await page.waitForTimeout(400);

    await expect(page.locator('.panel-title').filter({ hasText: 'Visit history' })).toBeVisible();
    const badge = page.locator('.mini-appt-doctor .tag-doctor').first();
    if (await badge.count()) {
      await expect(badge).toBeVisible();
    }
  });

  test('today view loads stat chips and optional doctor filter', async ({ authedPage: page }) => {
    await goToTab(page, 'today');
    await expect(page.getByRole('heading', { name: /Today/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /all/i }).first()).toBeVisible();

    const doctorFilter = page.getByRole('toolbar', { name: /filter by doctor/i });
    if (await doctorFilter.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expect(page.getByRole('button', { name: /all doctors/i })).toBeVisible();
    }
  });
});
