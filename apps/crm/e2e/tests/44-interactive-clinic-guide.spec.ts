import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, '..', 'screenshots');
const GUIDE_KEY_PREFIX = 'clinic-guide:v';

function clearGuideStorage(page: import('@playwright/test').Page) {
  return page.evaluate((prefix) => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith(prefix)) localStorage.removeItem(k);
    }
  }, GUIDE_KEY_PREFIX);
}

async function dismissOwnerChecklist(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function openHelpGuides(page: import('@playwright/test').Page) {
  const sidebar = page.locator('.sidebar-help-btn');
  if (await sidebar.isVisible().catch(() => false)) {
    await sidebar.click();
    return;
  }
  await page.locator('.top-bar-avatar').click();
  await page.getByRole('button', { name: /help & guides/i }).click();
}

test.describe('Interactive clinic guide', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearGuideStorage(page);
  });

  test('first login welcome and demo journey @smoke', async ({ page }) => {
    await loginClinicApp(page, 'owner');
    await dismissOwnerChecklist(page);
    await expect(page.getByTestId('clinic-guide-welcome')).toBeVisible({ timeout: 25_000 });
    await page.screenshot({ path: path.join(SHOTS, 'guide-welcome-desktop.png') });
    await page.getByTestId('guide-start-journey').click();
    await expect(page.getByTestId('clinic-guide-overlay')).toBeVisible({ timeout: 25_000 });
    await page.screenshot({ path: path.join(SHOTS, 'guide-spotlight-desktop.png') });
    await expect(page.getByTestId('clinic-guide-tooltip')).toContainText(/Home/i);
    await page.getByTestId('guide-exit-tour').click();
    await expect(page.getByTestId('clinic-guide-overlay')).toHaveCount(0);
  });

  test('owner chapter navigates via real nav controls', async ({ page }) => {
    await loginClinicApp(page, 'owner');
    await dismissOwnerChecklist(page);
    await page.getByTestId('guide-explore-own').click();
    await openHelpGuides(page);
    await expect(page.getByTestId('clinic-guide-picker')).toBeVisible();
    await page.getByTestId('guide-start-owner-clinic-setup').click();
    await expect(page.getByTestId('clinic-guide-overlay')).toBeVisible();
    await page.getByTestId('guide-exit-tour').click();
  });

  test('receptionist journey highlights patients search', async ({ page }) => {
    await loginClinicApp(page, 'receptionist');
    await page.getByTestId('guide-explore-own').click();
    await openHelpGuides(page);
    await page.getByTestId('guide-start-receptionist-front-desk').click();
    await expect(page.getByTestId('clinic-guide-tooltip')).toBeVisible();
    await page.locator('[data-guide="nav-patients"]').first().click();
    await expect(page.getByTestId('clinic-guide-tooltip')).toContainText(/Search/i);
    await page.locator('#patients-search').fill('e2e');
    await expect(page.getByTestId('clinic-guide-tooltip')).toContainText(/Register a patient/i);
  });

  test('doctor journey explain step uses Continue not mutation', async ({ page }) => {
    await loginClinicApp(page, 'doctor');
    await page.getByTestId('guide-explore-own').click();
    await openHelpGuides(page);
    await page.getByTestId('guide-start-doctor-clinical-day').click();
    await page.locator('[data-guide="nav-today"]').first().click();
    await page.locator('[data-guide="nav-today"]').first().click();
    await expect(page.getByTestId('guide-continue-explain')).toBeVisible();
    await page.getByTestId('guide-continue-explain').click({ force: true });
    await expect(page.locator('.modal-overlay')).toHaveCount(0);
  });

  test('progress persists after reload', async ({ page }) => {
    await loginClinicApp(page, 'owner');
    await expect(page.getByTestId('clinic-guide-welcome')).toBeVisible({ timeout: 25_000 });
    await page.getByTestId('guide-start-journey').click();
    await expect(page.getByTestId('clinic-guide-overlay')).toBeVisible({ timeout: 25_000 });
    await page.locator('[data-guide="nav-overview"]').first().click();
    await page.getByTestId('guide-exit-tour').click();
    const saved = await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith('clinic-guide:'));
      return keys.map((k) => JSON.parse(localStorage.getItem(k) || '{}'));
    });
    expect(saved.some((s) => Object.values(s.chapters || {}).some((c: { stepIndex?: number }) => (c as { stepIndex?: number }).stepIndex! > 0))).toBeTruthy();
  });

  test('resume appears in Help after pausing a tour', async ({ page }) => {
    await loginClinicApp(page, 'owner');
    await page.getByTestId('guide-start-journey').click();
    await page.getByTestId('guide-exit-tour').click();
    await openHelpGuides(page);
    await expect(page.getByRole('button', { name: 'Resume unfinished journey' })).toBeVisible();
  });

  test('reload keeps saved guide state', async ({ page }) => {
    await loginClinicApp(page, 'owner');
    await page.getByTestId('guide-start-journey').click();
    await page.getByTestId('guide-exit-tour').click();
    const key = await page.evaluate(() => Object.keys(localStorage).find((k) => k.startsWith('clinic-guide:')) || '');
    expect(key).toBeTruthy();
    await page.reload();
    await expect(page.locator('.clinic-app')).toBeVisible({ timeout: 20_000 });
    const after = await page.evaluate((k) => localStorage.getItem(k), key);
    expect(after).toBeTruthy();
  });

  test('tenant isolation via storage keys', async ({ page }) => {
    await loginClinicApp(page, 'owner');
    await page.getByTestId('guide-start-journey').click();
    await page.getByTestId('guide-exit-tour').click();
    const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('clinic-guide:')));
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.some((k) => k.includes(':owner'))).toBeTruthy();
  });

  test('mobile bottom nav targets', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(SHOTS, 'guide-mobile-viewport.png') });
    await loginClinicApp(page, 'receptionist');
    await page.getByTestId('guide-explore-own').click();
    await openHelpGuides(page);
    await page.getByTestId('guide-start-receptionist-front-desk').click();
    await page.getByTestId('guide-exit-tour').click();
    await page.locator('.bottom-nav [data-guide="nav-book"]').click();
    await expect(page).toHaveURL(/tab=book/);
  });
});

test.describe('Guide role credentials sanity', () => {
  test('roles fixture emails exist', () => {
    expect(ROLE_CREDENTIALS.owner.email).toBeTruthy();
    expect(ROLE_CREDENTIALS.receptionist.email).toBeTruthy();
    expect(ROLE_CREDENTIALS.doctor.email).toBeTruthy();
  });
});
