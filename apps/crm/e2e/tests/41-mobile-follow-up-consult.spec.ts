import { test, expect } from '@playwright/test';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { authHeaders, createPatientAndAppointment, setAppointmentStatus } from '../helpers/clinicApi';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
}

async function logoutViaUi(page: import('@playwright/test').Page) {
  const sidebarLogout = page.locator('.sidebar-logout-btn');
  if (await sidebarLogout.isVisible().catch(() => false)) {
    await sidebarLogout.click();
  } else {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: /log out/i }).click();
  }
  await expect(page.locator('.login-screen')).toBeVisible({ timeout: 15_000 });
}

async function waitForPatientOnToday(page: import('@playwright/test').Page, label: string) {
  await expect.poll(async () => {
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    return page.getByText(label).first().isVisible();
  }, { timeout: 30_000 }).toBe(true);
}

test.describe('Mobile follow-up from consultation', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile viewport only');
  });

  test('doctor recommends follow-up on finalize; receptionist schedules from Book tab', async ({
    page,
    request,
  }) => {
    const label = `Mobile FU ${Date.now()}`;
    const ownerHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    const { appointment } = await createPatientAndAppointment(request, API, ownerHeaders, {
      name: label,
      status: 'requested',
    });
    await setAppointmentStatus(request, API, ownerHeaders, appointment.id, 'confirmed');

    await loginClinicApp(page, 'receptionist');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await waitForPatientOnToday(page, label);

    const card = page.locator('.appt-card, .board-card').filter({ hasText: label }).first();
    const arrivedBtn = card.locator('button').filter({ hasText: /^Arrived$/i });
    if (await arrivedBtn.isVisible().catch(() => false)) {
      await arrivedBtn.click();
      await page.waitForTimeout(800);
    }

    await logoutViaUi(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await waitForPatientOnToday(page, label);
    await advanceQueueToConsult(page, label);

    const modal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await modal.locator('#consult-complaint').fill('Mobile follow-up E2E');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 3);
    const iso = tomorrow.toISOString().slice(0, 10);
    await modal.locator('input[type="date"]').fill(iso);
    await modal.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 20_000 });

    await logoutViaUi(page);
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'book');
    await expect(page.locator('.follow-ups-panel')).toBeVisible({ timeout: 15_000 });
    const row = page.locator('.follow-ups-row').filter({ hasText: label });
    await expect.poll(async () => row.count(), { timeout: 25_000 }).toBeGreaterThan(0);
    await row.first().locator('.follow-ups-schedule-btn').click();
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 10_000 });
  });
});
