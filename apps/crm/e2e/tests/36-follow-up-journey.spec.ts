import { test, expect } from '../fixtures/auth.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';

test.describe('Follow-up journey', () => {
  test('doctor recommends follow-up and receptionist schedules return visit', async ({ page }) => {
    await loginClinicApp(page, 'receptionist');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'today');
    await page.getByRole('button', { name: 'Refresh' }).first().click();

    const arrivedCard = page.locator('.appt-card, .board-card').filter({ hasText: /./ }).first();
    const patientLabel = await arrivedCard.locator('.appt-name, .board-card-name, strong').first().textContent();
    if (!patientLabel?.trim()) {
      test.skip(true, 'No arrived appointments in seed data');
    }

    await logoutViaUi(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await closeBlockingModalsIfOpen(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await advanceQueueToConsult(page, patientLabel!.trim().split('\n')[0].trim());

    const consultModal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await consultModal.locator('#consult-complaint').fill('Follow-up E2E');
    const due = new Date();
    due.setDate(due.getDate() + 14);
    const dueStr = due.toISOString().slice(0, 10);
    await consultModal.locator('input[type="date"]').fill(dueStr);
    await consultModal.getByRole('textbox', { name: 'Follow-up note' }).fill('Review progress');
    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.getByText(/follow-up recommendation saved|consultation finalized/i).first()).toBeVisible({ timeout: 15_000 });

    await logoutViaUi(page);
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'book');
    await expect(page.locator('.follow-ups-panel')).toBeVisible({ timeout: 10_000 });
    const scheduleBtn = page.locator('.follow-ups-schedule-btn').first();
    await expect(scheduleBtn).toBeVisible({ timeout: 10_000 });
    await scheduleBtn.click();
    await expect(page.getByText('Follow-up visit').first()).toBeVisible({ timeout: 5000 });
  });
});

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
