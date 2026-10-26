import { test, expect } from '../fixtures/auth.fixture';
import { goToTab, closePatientDetailIfOpen, closeConsultModalIfOpen, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { advanceQueueToConsult, reopenConsultation } from '../helpers/queue';
import { expectPatientVisible } from '../helpers/patients';
import {
  continueBookAfterTreatment,
  pickFirstBookSlot,
  ensureBookableScheduleDate,
  selectTodayCalendarDate,
} from '../helpers/booking';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'https://clinic-api-staging-339065153036.asia-south1.run.app';
const UNIQUE = `Pilot QA ${Date.now()}`;

function uniquePhone() {
  return `9${String(Date.now()).slice(-9)}`;
}

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  for (let i = 0; i < 3; i++) {
    const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
    if (!(await dismiss.isVisible().catch(() => false))) break;
    await dismiss.click({ force: true });
    await page.waitForTimeout(400);
  }
}

test.describe('Staging pilot journey (real UI)', () => {
  test.beforeAll(async ({ request }) => {
    test.skip(!process.env.E2E_STAGING, 'Set E2E_STAGING=1 for staging browser QA');
    const login = await request.post(`${API}/api/platform/login`, {
      data: {
        email: E2E_CREDENTIALS.email,
        password: E2E_CREDENTIALS.password,
        tenantSlug: E2E_CREDENTIALS.tenant,
      },
      headers: { 'X-Tenant-Slug': E2E_CREDENTIALS.tenant },
    });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).token as string;
    const me = await request.get(`${API}/api/platform/me`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': E2E_CREDENTIALS.tenant },
    });
    expect(me.ok()).toBeTruthy();
    const body = await me.json();
    expect(body.user?.canSignClinical).toBe(true);
    expect(body.user?.clinicianDoctorId).toBe('doc-denta-care-default');
    expect(body.tenant?.slug).toBe('dentacare');
  });

  test('login → register → book → queue → consult → PDF → payment → logout', async ({ page }) => {
    test.skip(!process.env.E2E_STAGING, 'Set E2E_STAGING=1 for staging browser QA');

    await page.addInitScript(() => {
      localStorage.setItem('pilot-setup-dismissed', '1');
    });
    await page.goto('/');
    await page.locator('#lUser').fill(E2E_CREDENTIALS.email);
    await page.locator('#lPass').fill(E2E_CREDENTIALS.password);
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.locator('.clinic-app')).toBeVisible({ timeout: 30_000 });
    await dismissPilotBanner(page);

    const phone = uniquePhone();
    await goToTab(page, 'book');
    await page.getByRole('tab', { name: /walk-in now/i }).click();
    await page.locator('#book-search').fill(phone);
    await expect(page.getByRole('button', { name: /register new patient/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /register new patient/i }).click();
    await page.getByPlaceholder('Patient name').fill(UNIQUE);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('.form-select').first().selectOption({ index: 0 });
    await continueBookAfterTreatment(page, 'walkin');
    await page.getByRole('button', { name: /save walk-in/i }).click();
    await expect(page.locator('.today-view, .overview-view, .book-view')).toBeVisible({ timeout: 20_000 });

    await goToTab(page, 'patients');
    const search = page.locator('#patients-search');
    if (await search.isVisible().catch(() => false)) {
      await search.fill(phone.slice(-6));
      await expect(page.locator('.patients-view').filter({ hasText: UNIQUE })).toBeVisible({ timeout: 15_000 });
    } else {
      await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 20_000 });
    }

    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await closeBlockingModalsIfOpen(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 25_000 });

    await advanceQueueToConsult(page, UNIQUE);

    await expect(page.locator('#consult-complaint')).toBeVisible({ timeout: 25_000 });
    await page.locator('#consult-complaint').fill('Staging browser QA complaint');
    await page.locator('#consult-diagnosis').fill('Staging test diagnosis');
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/consultation saved/i)).toBeVisible({ timeout: 15_000 });

    await closeConsultModalIfOpen(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 25_000 });
    await reopenConsultation(page, UNIQUE);
    await expect.poll(() => page.locator('#consult-complaint').inputValue(), { timeout: 20_000 })
      .toBe('Staging browser QA complaint');

    await page.getByRole('button', { name: /finalize visit/i }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.getByText(/finalized/i)).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press('Escape');
    await goToTab(page, 'overview');
    await goToTab(page, 'patients');
    const patientCard = await expectPatientVisible(page, UNIQUE, phone);
    await patientCard.click();
    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 20_000 });
    await page.locator('.detail-tab').filter({ hasText: /^Visits/i }).click();
    await expect(page.getByText(/finalized|visit/i).first()).toBeVisible({ timeout: 15_000 });

    const pdfBtn = page.getByRole('button', { name: /prescription pdf|rx pdf/i }).first();
    if (await pdfBtn.isVisible().catch(() => false)) {
      const popup = page.waitForEvent('popup', { timeout: 15_000 }).catch(() => null);
      await pdfBtn.click();
      await popup;
    }

    await closePatientDetailIfOpen(page);
    await goToTab(page, 'payments');
    await page.getByRole('button', { name: '+ Add' }).click();
    await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible();
    const patientSelect = page.locator('.modal-overlay select').first();
    await patientSelect.selectOption({ label: new RegExp(UNIQUE.slice(0, 12)) }).catch(async () => {
      await patientSelect.selectOption({ index: 1 });
    });
    await page.locator('input[inputmode="numeric"], input[type="number"]').first().fill('100');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('.modal-overlay')).toHaveCount(0, { timeout: 15_000 });

    const sidebarLogout = page.locator('.sidebar-logout-btn');
    if (await sidebarLogout.isVisible()) {
      await sidebarLogout.click();
    } else {
      await page.getByRole('button', { name: 'Account menu' }).click();
      await page.getByRole('button', { name: /log out/i }).click();
    }
    await expect(page.locator('.login-screen')).toBeVisible({ timeout: 15_000 });
  });

  test('scheduled booking → check-in → consult', async ({ authedPage: page }) => {
    test.skip(!process.env.E2E_STAGING, 'Set E2E_STAGING=1 for staging browser QA');
    await page.evaluate(() => localStorage.setItem('pilot-setup-dismissed', '1'));
    await dismissPilotBanner(page);
    const phone = uniquePhone();
    const name = `Sched ${Date.now().toString().slice(-5)}`;
    await goToTab(page, 'book');
    await page.getByRole('tab', { name: /schedule/i }).click();
    await page.locator('#book-search').fill(phone);
    await expect(page.getByRole('button', { name: /register new patient/i })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /register new patient/i }).click();
    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('28');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.locator('.form-select').first().selectOption({ index: 0 });
    await continueBookAfterTreatment(page, 'schedule');
    const bookDate = await ensureBookableScheduleDate(page);
    await pickFirstBookSlot(page);
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: /book appointment/i }).click();
    await expect(page.locator('.book-view, .today-view, .overview-view')).toBeVisible({ timeout: 20_000 });

    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await closeBlockingModalsIfOpen(page);
    await selectTodayCalendarDate(page, bookDate);
    await expect(page.locator(`button.calendar-cell-selected[data-ymd="${bookDate}"]`)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 25_000 });
    await advanceQueueToConsult(page, name);
    await expect(page.locator('#consult-complaint')).toBeVisible({ timeout: 25_000 });
    await page.locator('#consult-complaint').fill('Scheduled visit QA');
    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/consultation saved/i)).toBeVisible({ timeout: 15_000 });
  });
});
