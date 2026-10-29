import { test as base, expect, type Page } from '@playwright/test';
import { captureStep } from '../helpers/screenshot';

export const E2E_CREDENTIALS = {
  email: process.env.E2E_EMAIL || 'e2e-owner@dentacare.in',
  password: process.env.E2E_PASSWORD || 'E2eTest@2026',
  tenant: process.env.E2E_TENANT || 'dentacare',
};

export const test = base.extend<{ authedPage: Page }>({
  authedPage: async ({ page }, use) => {
    await page.goto('/');
    await page.locator('#lUser').fill(E2E_CREDENTIALS.email);
    await page.locator('#lPass').fill(E2E_CREDENTIALS.password);
    const loginWait = page.waitForResponse(
      (r) => r.url().includes('/api/platform/login') && r.request().method() === 'POST',
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /sign in/i }).click();
    const loginRes = await loginWait;
    expect(loginRes.ok(), `login failed: ${loginRes.status()}`).toBeTruthy();
    await expect(page.locator('.clinic-app')).toBeVisible({ timeout: 20_000 });
    await captureStep(page, '01-logged-in');
    await use(page);
  },
});

export { expect };
