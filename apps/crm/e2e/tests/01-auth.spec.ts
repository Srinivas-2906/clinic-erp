import { test, expect } from '@playwright/test';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { captureStep } from '../helpers/screenshot';

test.describe('Authentication', () => {
  test('shows login screen and demo hint', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.login-screen')).toBeVisible();
    await expect(page.locator('#lUser')).toBeVisible();
    await expect(page.locator('#lPass')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Denta Care Dental Clinic' })).toBeVisible();
    await captureStep(page, 'auth-login-screen');
  });

  test('rejects invalid credentials', async ({ page }) => {
    await page.goto('/');
    await page.locator('#lUser').fill('wrong@example.com');
    await page.locator('#lPass').fill('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('.login-error')).toBeVisible({ timeout: 10_000 });
    await captureStep(page, 'auth-invalid-login');
  });

  test('logs in with E2E credentials', async ({ page }) => {
    await page.goto('/');
    await page.locator('#lUser').fill(E2E_CREDENTIALS.email);
    await page.locator('#lPass').fill(E2E_CREDENTIALS.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('.clinic-app')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /Home|Today|Patients/i }).first()).toBeVisible();
    await captureStep(page, 'auth-success-login');
  });

  test('access request form opens and validates', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /need access/i }).click();
    await expect(page.locator('#reqName')).toBeVisible();
    await expect(page.locator('#reqEmail')).toBeVisible();
    await page.getByRole('button', { name: /request access/i }).click();
    await expect(page.locator('.login-error')).toBeVisible();
    await captureStep(page, 'auth-access-request-form');
  });
});
