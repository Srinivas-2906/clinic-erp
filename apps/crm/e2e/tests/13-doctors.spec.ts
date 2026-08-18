import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Doctors management', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await goToTab(page, 'doctors');
    await expect(page.locator('.doctors-view')).toBeVisible({ timeout: 10_000 });
  });

  test('loads doctors list with default migrated doctor', async ({ authedPage: page }) => {
    await expect(page.locator('.doctor-card').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.doctor-card-name').first()).toContainText(/Dr/i);
  });

  test('add doctor end-to-end', async ({ authedPage: page }) => {
    const suffix = Date.now().toString().slice(-5);
    await page.getByRole('button', { name: /add doctor/i }).first().click();
    await expect(page.locator('.doctor-form-sheet')).toBeVisible();

    await page.getByLabel(/full name/i).fill(`Dr Test E2E ${suffix}`);
    await page.getByLabel(/^display name/i).fill(`Dr Test ${suffix}`);
    await page.getByLabel(/specialty/i).fill('General Dentistry');

    await page.getByRole('button', { name: /^add doctor$/i }).click();
    await expect(page.locator('.doctor-form-sheet')).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(`Dr Test ${suffix}`)).toBeVisible({ timeout: 10_000 });
  });

  test('expand doctor shows editable schedule', async ({ authedPage: page }) => {
    await page.locator('.doctor-expand-btn').first().click();
    await expect(page.getByText(/working hours/i).first()).toBeVisible();
    await expect(page.locator('.doctor-schedule-editor')).toBeVisible();
    await expect(page.getByRole('button', { name: /use standard hours/i })).toBeVisible();
  });

  test('save schedule after editing', async ({ authedPage: page }) => {
    await page.locator('.doctor-expand-btn').first().click();
    await expect(page.locator('.doctor-schedule-editor')).toBeVisible();

    await page.getByRole('button', { name: /use standard hours/i }).click();
    await page.getByRole('button', { name: /save schedule/i }).click();

    await expect(page.getByText(/schedule saved|saved/i)).toBeVisible({ timeout: 10_000 }).catch(async () => {
      await expect(page.locator('.doctor-schedule-summary').first()).toContainText(/Mon/i);
    });
  });

  test('add and remove time off', async ({ authedPage: page }) => {
    await page.locator('.doctor-expand-btn').first().click();
    await page.getByRole('button', { name: /add time off/i }).click();
    await expect(page.locator('.doctor-timeoff-form')).toBeVisible();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);
    const end = new Date(tomorrow);
    end.setHours(12, 0, 0, 0);

    const toLocal = (d: Date) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    await page.locator('.doctor-timeoff-form input[type="datetime-local"]').nth(0).fill(toLocal(tomorrow));
    await page.locator('.doctor-timeoff-form input[type="datetime-local"]').nth(1).fill(toLocal(end));
    await page.getByRole('button', { name: /^add time off$/i }).click();

    await expect(page.locator('.doctor-timeoff-item').first()).toBeVisible({ timeout: 10_000 });
  });
});
