import { test, expect, loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Role-based access', () => {
  test('receptionist signs in and reaches schedule', async ({ page }) => {
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'today');
    await expect(page.locator('.today-view, .view').first()).toBeVisible();
  });

  test('doctor signs in and can open patients', async ({ page }) => {
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'patients');
    await expect(page.locator('h1.page-title').filter({ hasText: 'Patients' })).toBeVisible();
  });

  test('receptionist cannot open owner-only financial refunds UI', async ({ page }) => {
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'payments');
    await expect(page.locator('h1.page-title').filter({ hasText: 'Payments' })).toBeVisible();
    await expect(page.getByRole('button', { name: /refund/i })).toHaveCount(0);
  });

  test('platform admin login shows tenant console', async ({ page }) => {
    await page.goto('/platform');
    await page.getByPlaceholder('Platform admin email').fill(ROLE_CREDENTIALS.platform.email);
    await page.getByPlaceholder('Password').fill(ROLE_CREDENTIALS.platform.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('.platform-admin')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/tenant/i).first()).toBeVisible();
  });
});
