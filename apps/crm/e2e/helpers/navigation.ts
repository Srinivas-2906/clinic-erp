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

/** Navigate via desktop sidebar (1280px viewport). */
export async function goToTab(page: Page, tab: TabId) {
  const label = TAB_LABELS[tab];
  const sidebar = page.locator('.clinic-sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.getByRole('button', { name: label }).click();
  } else {
    await page.locator('.bottom-nav').getByRole('button', { name: label }).click();
  }
  await page.waitForTimeout(400);
}

export async function openGlobalSearch(page: Page) {
  await page.getByRole('button', { name: 'Search' }).first().click();
  await page.locator('.global-search-dialog, [class*="search"]').first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
}
