import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';
import { continueBookAfterTreatment, pickFirstBookSlot } from '../helpers/booking';

function uniquePhone() {
  const n = Date.now().toString().slice(-9);
  return `9${n}`;
}

test.describe('Book appointment', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'book');
    await page.waitForTimeout(500);
  });

  test('walk-in books a new patient end-to-end', async ({ authedPage: page }) => {
    const phone = uniquePhone();
    const name = `Walkin E2E ${Date.now().toString().slice(-5)}`;

    await page.getByRole('tab', { name: /walk-in now/i }).click();
    await page.locator('#book-search').fill(phone);
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /register new patient/i }).click();
    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByRole('button', { name: 'Next' }).click();

    await page.locator('.form-select').first().selectOption({ index: 0 });
    await continueBookAfterTreatment(page, 'walkin');

    await captureStep(page, 'book-walkin-confirm');
    await page.getByRole('button', { name: /save walk-in/i }).click();

    await page.waitForTimeout(2000);
    await expect(page.locator('.overview-view, .today-view, .book-view')).toBeVisible();
    await captureStep(page, 'book-walkin-done');
  });

  test('scheduled booking for new patient', async ({ authedPage: page }) => {
    const phone = uniquePhone();
    const name = `Schedule E2E ${Date.now().toString().slice(-5)}`;

    await page.getByRole('tab', { name: /schedule/i }).click();
    await page.locator('#book-search').fill(phone);
    await page.waitForTimeout(1200);

    await page.getByRole('button', { name: /register new patient/i }).click();
    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('28');
    await page.getByRole('button', { name: 'Next' }).click();

    await page.locator('.form-select').first().selectOption({ index: 0 });
    await continueBookAfterTreatment(page, 'schedule');

    await pickFirstBookSlot(page);
    await page.getByRole('button', { name: 'Review' }).click();
    await captureStep(page, 'book-schedule-confirm');

    await page.getByRole('button', { name: /book appointment/i }).click();
    await page.waitForTimeout(2000);
    await captureStep(page, 'book-schedule-done');
  });
});
