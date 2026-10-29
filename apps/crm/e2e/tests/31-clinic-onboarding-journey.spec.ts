import { test, expect } from '@playwright/test';
import { goToTab } from '../helpers/navigation';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const PASS = process.env.E2E_PASSWORD || 'E2eTest@2026';
const CRM = process.env.E2E_BASE_URL || 'http://127.0.0.1:5185';

async function provisionOwner(request: import('@playwright/test').APIRequestContext) {
  const slug = `onb-${Date.now().toString(36)}`;
  const ownerEmail = `owner-${slug}@clinic-erp.invalid`;
  const signup = await request.post(`${API}/api/platform/signup`, {
    data: {
      clinicName: `Onboarding Clinic ${slug}`,
      slug,
      ownerName: 'Onboarding Owner',
      ownerEmail,
      planId: 'professional',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const body = await signup.json();
  const setPasswordUrl = String(body.invite?.setPasswordUrl || '');
  expect(setPasswordUrl).toBeTruthy();
  return { slug, ownerEmail, setPasswordUrl };
}

async function completeSetPassword(page: import('@playwright/test').Page, setPasswordUrl: string) {
  await page.goto(setPasswordUrl.startsWith('http') ? setPasswordUrl : `${CRM}${setPasswordUrl}`);
  await page.locator('#setPass').fill(PASS);
  await page.locator('#setPassConfirm').fill(PASS);
  await page.getByRole('button', { name: /set password/i }).click();
  await expect(page.getByText(/password set|sign in/i).first()).toBeVisible({ timeout: 20_000 });
}

async function loginOwner(page: import('@playwright/test').Page, slug: string, email: string) {
  await page.goto(`/?tenant=${encodeURIComponent(slug)}`);
  await page.locator('#lUser').fill(email);
  await page.locator('#lPass').fill(PASS);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('.clinic-app')).toBeVisible({ timeout: 25_000 });
}

test.describe('Clinic onboarding journey', () => {
  test('new tenant signup through first appointment', async ({ page, request }) => {
    const { slug, ownerEmail, setPasswordUrl } = await provisionOwner(request);
    await completeSetPassword(page, setPasswordUrl);
    await loginOwner(page, slug, ownerEmail);

    await expect(page.getByTestId('clinic-onboarding-checklist')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/professional|trial/i).first()).toBeVisible();

    await page.getByTestId('clinic-onboarding-checklist').getByRole('button', { name: 'Settings' }).first().click();
    await expect(page.locator('#clinicAddress')).toBeVisible({ timeout: 10_000 });
    await page.locator('#clinicTz').fill('Asia/Kolkata');
    await page.locator('#clinicAddress').click();
    await page.locator('#clinicAddress').fill('12 Clinic Lane, Bengaluru');
    await page.locator('#clinicPhone').click();
    await page.locator('#clinicPhone').fill('9876543210');
    const saveSettings = page.waitForResponse(
      (r) => r.url().includes('/clinic/settings') && r.request().method() === 'PATCH' && r.ok(),
      { timeout: 20_000 },
    );
    await page.getByRole('button', { name: /save settings/i }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: /save settings/i }).click();
    await saveSettings;
    await expect(page.getByText(/clinic settings saved/i)).toBeVisible({ timeout: 15_000 });

    await goToTab(page, 'doctors');
    await page.getByRole('button', { name: /link my login/i }).first().click();
    await expect(page.locator('.toast').filter({ hasText: /linked/i }).first()).toBeVisible({ timeout: 15_000 });

    const staffEmail = `recv-${slug}@clinic-erp.invalid`;
    const accessReq = await request.post(`${API}/api/platform/tenant/${encodeURIComponent(slug)}/access-request`, {
      data: { email: staffEmail, name: 'Onboarding Reception' },
    });
    expect(accessReq.ok()).toBeTruthy();

    await goToTab(page, 'team');
    await expect(page.getByText(staffEmail)).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /approve/i }).first().click();
    await expect(page.getByText(/setup link|set password/i).first()).toBeVisible({ timeout: 15_000 });

    await goToTab(page, 'patients');
    const headerBtn = page.locator('.patients-header-actions .add-patient-btn');
    if (await headerBtn.isVisible().catch(() => false)) {
      await headerBtn.click();
    } else {
      await page.locator('button.fab[aria-label="Add patient"]').click();
    }
    const patientName = `First Patient ${slug}`;
    await page.getByPlaceholder('Patient name').fill(patientName);
    await page.getByPlaceholder('10-digit mobile').fill(`9${String(Date.now()).slice(-9)}`);
    await page.getByPlaceholder('e.g. 32').fill('30');
    await page.locator('.modal-footer').getByRole('button', { name: /add patient/i }).click();
    await expect(page.getByText(patientName).first()).toBeVisible({ timeout: 15_000 });

    await goToTab(page, 'book');
    await page.locator('#book-search').fill(patientName);
    await expect(page.getByRole('button', { name: /continue booking/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /continue booking/i }).click();
    await page.locator('.form-select').first().selectOption({ index: 0 });
    await page.getByRole('button', { name: /^(Review|Next)$/ }).click();
    if (await page.getByText('Choose doctor').isVisible({ timeout: 2500 }).catch(() => false)) {
      await page.locator('.book-doctor-option').first().click();
      await page.getByRole('button', { name: /^(Review|Next)$/ }).click();
    }
    if (await page.getByRole('button', { name: /^Review$/ }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /^Review$/ }).click();
    }
    const apptCreate = page.waitForResponse(
      (r) => r.url().includes('/api/appointments') && r.request().method() === 'POST' && r.ok(),
      { timeout: 25_000 },
    );
    await page.getByRole('button', { name: /^(Book appointment|Save walk-in)$/i }).click();
    await apptCreate;

    await goToTab(page, 'overview');
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click().catch(() => {});
      const checklist = page.getByTestId('clinic-onboarding-checklist');
      return !(await checklist.isVisible().catch(() => false));
    }, { timeout: 30_000 }).toBe(true);

    await page.reload();
    await expect(page.locator('.clinic-app')).toBeVisible();
    await expect(page.getByTestId('clinic-onboarding-checklist')).toHaveCount(0);
  });
});
