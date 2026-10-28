import { test as base, expect, type Page } from '@playwright/test';

export const ROLE_CREDENTIALS = {
  owner: {
    email: process.env.E2E_EMAIL || 'e2e-owner@dentacare.in',
    password: process.env.E2E_PASSWORD || 'E2eTest@2026',
  },
  receptionist: {
    email: process.env.E2E_RECEPTIONIST_EMAIL || 'e2e-receptionist@dentacare.in',
    password: process.env.E2E_PASSWORD || 'E2eTest@2026',
  },
  doctor: {
    email: process.env.E2E_DOCTOR_EMAIL || 'e2e-doctor@dentacare.in',
    password: process.env.E2E_PASSWORD || 'E2eTest@2026',
  },
  platform: {
    email: process.env.E2E_PLATFORM_EMAIL || 'e2e-platform@clinic-erp.invalid',
    password: process.env.E2E_PASSWORD || 'E2eTest@2026',
  },
} as const;

export type ClinicRole = keyof typeof ROLE_CREDENTIALS;

export async function loginAs(page: Page, role: ClinicRole, opts?: { tenantPath?: string }) {
  const basePath = opts?.tenantPath ?? '/';
  await page.goto(basePath);
  const creds = ROLE_CREDENTIALS[role];
  await page.locator('#lUser').fill(creds.email);
  await page.locator('#lPass').fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

export async function loginClinicApp(page: Page, role: ClinicRole) {
  await loginAs(page, role);
  await expect(page.locator('.clinic-app')).toBeVisible({ timeout: 20_000 });
}

export async function loginPlatformAdmin(page: Page) {
  await page.goto('/platform');
  const creds = ROLE_CREDENTIALS.platform;
  await page.locator('input[type="email"], #lUser').first().fill(creds.email);
  await page.locator('input[type="password"], #lPass').first().fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('.platform-admin')).toBeVisible({ timeout: 20_000 });
}

export const test = base;
export { expect };
