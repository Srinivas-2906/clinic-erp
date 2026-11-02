import { test, expect } from '@playwright/test';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
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

test.describe('Mobile clinical queue journey', () => {
  test.beforeEach(({ }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile viewport only');
  });

  test('reception check-in → doctor consult → finalize → reception sees completed state', async ({
    page,
    request,
  }) => {
    const uniqueLabel = `MobileClinical ${Date.now()}`;
    const ownerHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    const { appointment } = await createPatientAndAppointment(request, API, ownerHeaders, {
      name: uniqueLabel,
      status: 'requested',
    });
    await setAppointmentStatus(request, API, ownerHeaders, appointment.id, 'confirmed');

    await loginClinicApp(page, 'receptionist');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return page.getByText(uniqueLabel).first().isVisible();
    }, { timeout: 25_000 }).toBe(true);

    const card = page.locator('.appt-card, .board-card').filter({ hasText: uniqueLabel }).first();
    const arrivedBtn = card.locator('button').filter({ hasText: /^Arrived$/i });
    if (await arrivedBtn.isVisible().catch(() => false)) {
      await arrivedBtn.click();
      await page.waitForTimeout(800);
    }

    await logoutViaUi(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return page.getByText(uniqueLabel).first().isVisible();
    }, { timeout: 25_000 }).toBe(true);

    await advanceQueueToConsult(page, uniqueLabel);
    const consultModal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await consultModal.locator('#consult-complaint').fill('Mobile E2E complaint');
    await consultModal.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.getByText(/consultation finalized/i).first()).toBeVisible({
      timeout: 20_000,
    });

    await logoutViaUi(page);
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    const doneCard = page.locator('.appt-card, .board-card').filter({ hasText: uniqueLabel }).first();
    await expect(doneCard.locator('.tag-success, .tag-muted').filter({ hasText: /completed|visited/i })).toBeVisible({
      timeout: 20_000,
    });
  });
});
