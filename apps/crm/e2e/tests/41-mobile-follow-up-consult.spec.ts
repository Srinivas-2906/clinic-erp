import { test, expect } from '@playwright/test';
import { loginClinicApp } from '../fixtures/roles.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { authHeaders, createPatientAndAppointment } from '../helpers/clinicApi';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

test.describe('Mobile follow-up from consultation', () => {
  test('doctor recommends follow-up on finalize; receptionist schedules from Book tab', async ({
    page,
    request,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile viewport only');

    const label = `Mobile FU ${Date.now()}`;
    const ownerHeaders = await authHeaders(
      request,
      API,
      TENANT,
      process.env.E2E_EMAIL || 'e2e-owner@dentacare.in',
      process.env.E2E_PASSWORD || 'E2eTest@2026',
    );
    const { appointment } = await createPatientAndAppointment(request, API, ownerHeaders, {
      name: label,
      status: 'confirmed',
    });

    await loginClinicApp(page, 'doctor');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'today');
    await expect.poll(async () => page.getByText(label).first().isVisible(), { timeout: 25_000 }).toBe(true);
    await advanceQueueToConsult(page, label);

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await modal.locator('#consult-complaint').fill('Mobile follow-up E2E');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const iso = tomorrow.toISOString().slice(0, 10);
    await modal.locator('input[type="date"]').fill(iso);
    await modal.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 15_000 });

    await page.locator('.sidebar-logout-btn').click().catch(async () => {
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /log out/i }).click();
    });
    await expect(page.locator('.login-screen')).toBeVisible({ timeout: 15_000 });

    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'book');
    await expect(page.locator('.follow-ups-panel')).toBeVisible({ timeout: 15_000 });
    const row = page.locator('.follow-ups-row').filter({ hasText: label });
    await expect.poll(async () => row.count()).toBeGreaterThan(0);
    await row.first().locator('.follow-ups-schedule-btn').click();
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 10_000 });
  });
});
