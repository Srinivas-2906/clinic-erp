import { expect, type Page } from '@playwright/test';
import { closePatientDetailIfOpen } from './navigation';

/** Find patient in list or card grid (mobile defaults to table rows). */
export async function expectPatientVisible(page: Page, name: string, searchQuery?: string) {
  await closePatientDetailIfOpen(page);
  const search = page.locator('#patients-search');
  if (searchQuery && (await search.isVisible().catch(() => false))) {
    await search.fill(searchQuery);
  }
  const row = page.locator('.patient-card, .patient-row').filter({
    has: page.locator('.patient-card-name, .patient-name').filter({ hasText: name }),
  });
  await expect(row.first()).toBeVisible({ timeout: 30_000 });
  return row.first();
}
