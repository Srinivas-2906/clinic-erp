import type { Page } from '@playwright/test';

type TabId = 'overview' | 'today' | 'patients' | 'book' | 'payments' | 'reports' | 'doctors' | 'team';

const TAB_LABELS: Record<TabId, string> = {
  overview: 'Home',
  today: 'Today',
  patients: 'Patients',
  book: 'Book',
  payments: 'Payments',
  reports: 'Reports',
  doctors: 'Doctors',
  team: 'Team',
};

/** Close full-screen patient detail (mobile hides bottom nav while open). */
export async function closePatientDetailIfOpen(page: Page) {
  const back = page.locator('.top-bar-back, .detail-back').first();
  if (await back.isVisible().catch(() => false)) {
    await back.click();
    await page.waitForTimeout(400);
  }
}

/** Close consultation modal if still open. */
export async function closeConsultModalIfOpen(page: Page) {
  const overlay = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
  if (await overlay.isVisible().catch(() => false)) {
    await overlay.locator('button.modal-close').click();
    await page.waitForTimeout(300);
  }
}

async function dismissMobileKeyboard(page: Page) {
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement) el.blur();
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(150);
}

export async function goToTab(page: Page, tab: TabId) {
  await closeConsultModalIfOpen(page);
  await closePatientDetailIfOpen(page);
  const label = TAB_LABELS[tab];
  const sidebar = page.locator('.clinic-sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('button', { name: label }).click();
  } else {
    await dismissMobileKeyboard(page);
    const nav = page.locator('.bottom-nav');
    await nav.waitFor({ state: 'visible', timeout: 10_000 });
    await nav.getByRole('button', { name: label, exact: true }).click();
  }
  await page.waitForTimeout(400);
}

export async function openGlobalSearch(page: Page) {
  await page.getByRole('button', { name: 'Search' }).first().click();
  await page.locator('.global-search-dialog, [class*="search"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}
