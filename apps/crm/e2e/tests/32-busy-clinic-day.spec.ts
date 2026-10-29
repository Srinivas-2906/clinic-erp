import { test, expect } from '@playwright/test';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { authHeaders, createPatientAndAppointment, setAppointmentStatus } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function dismissOnboarding(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

test.describe('Busy clinic day operations', () => {
  test('reception queue, consult, billing, reschedule, cancel, roles', async ({ page, request }) => {
    const ownerHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    const suffix = Date.now().toString().slice(-6);
    const patients = await Promise.all(
      [1, 2, 3].map(async (n) => {
        const label = `Busy ${suffix}-${n}`;
        const { patient, appointment } = await createPatientAndAppointment(request, API, ownerHeaders, {
          name: label,
          status: 'confirmed',
        });
        await setAppointmentStatus(request, API, ownerHeaders, appointment.id, 'arrived');
        return { label, patient, appointment };
      }),
    );

    await loginClinicApp(page, 'receptionist');
    await dismissOnboarding(page);
    await goToTab(page, 'today');
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    for (const p of patients) {
      await expect(page.getByText(p.label).first()).toBeVisible({ timeout: 20_000 });
    }

    const cancelTarget = patients[2];
    const cancelCard = page.locator('.appt-card, .board-card').filter({ hasText: cancelTarget.label }).first();
    await cancelCard.locator('button[title="Actions"], button.quick-action-btn').last().click();
    await page.getByRole('button', { name: /cancel appointment/i }).click();
    await expect(page.getByText(/cancelled/i).first()).toBeVisible({ timeout: 12_000 });

    const rescheduleTarget = patients[1];
    const resCard = page.locator('.appt-card, .board-card').filter({ hasText: rescheduleTarget.label }).first();
    await resCard.locator('button[title="Actions"], button.quick-action-btn').last().click();
    await page.getByRole('button', { name: /reschedule/i }).click();
    await expect(page.getByRole('heading', { name: /reschedule/i })).toBeVisible();
    const rescheduleModal = page.locator('.modal-overlay').filter({ has: page.getByRole('heading', { name: /reschedule/i }) });
    await expect(rescheduleModal.locator('input[type="date"]')).toBeVisible();
    const slotChip = rescheduleModal.locator('.time-chip').first();
    if (await slotChip.isVisible().catch(() => false)) {
      await slotChip.click();
    } else {
      await rescheduleModal.locator('input[type="time"]').fill('15:30');
    }
    const rescheduleSave = page.waitForResponse(
      (r) => r.url().includes('/api/appointments/') && r.request().method() === 'PATCH' && r.ok(),
      { timeout: 20_000 },
    );
    await rescheduleModal.getByRole('button', { name: /^save$/i }).click();
    await rescheduleSave;
    await expect(rescheduleModal).toBeHidden({ timeout: 15_000 });

    await logoutViaUi(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await dismissOnboarding(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    const consultTarget = patients[0];
    await advanceQueueToConsult(page, consultTarget.label);
    const consultModal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await consultModal.locator('#consult-complaint').fill('Busy day check');
    await consultModal.locator('#consult-diagnosis').fill('Stable');
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/consultation saved/i).first()).toBeVisible({ timeout: 12_000 });
    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 20_000 });

    await logoutViaUi(page);
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'today');
    await dismissOnboarding(page);
    const visitedCard = page.locator('.appt-card, .board-card').filter({ hasText: consultTarget.label }).first();
    await visitedCard.locator('button[title="Actions"], button.quick-action-btn').last().click();
    await page.getByRole('button', { name: /billing for this visit/i }).click();
    const handoff = page.getByTestId('visit-billing-handoff');
    if (await handoff.isVisible({ timeout: 5000 }).catch(() => false)) {
      await handoff.getByRole('button', { name: /create invoice/i }).click();
    }
    await page.getByPlaceholder('Description').fill('Busy day consult');
    await page.locator('.modal-overlay input.invoice-line-price').first().fill('800');
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.locator('.toast').filter({ hasText: /invoice ready|invoice created/i }).first()).toBeVisible({ timeout: 20_000 });
    const invoiceSheet = page.locator('.modal-overlay').filter({ hasText: 'Invoice ·' });
    await expect(invoiceSheet).toBeVisible({ timeout: 10_000 });
    await invoiceSheet.getByRole('button', { name: 'Close' }).click();
    await expect(invoiceSheet).toBeHidden({ timeout: 10_000 });
    const handoffOpen = page.getByTestId('visit-billing-handoff');
    if (await handoffOpen.isVisible().catch(() => false)) {
      await handoffOpen.getByRole('button', { name: /continue without billing/i }).click();
      await expect(handoffOpen).toBeHidden({ timeout: 10_000 });
    }

    await goToTab(page, 'payments');
    await page.getByRole('button', { name: /due now/i }).click();
    await expect(page.locator('.payment-list').getByText(/due/i).first()).toBeVisible({ timeout: 10_000 });

    await logoutViaUi(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'payments');
    await expect(page.getByText('Billing is handled by front desk staff.')).toBeVisible({ timeout: 10_000 });
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
