import { expect, type Page } from '@playwright/test';

function localYmd(d: Date) {
  return d.toLocaleDateString('en-CA');
}

/** Advance Today queue until Consult opens (list + board layouts). */
export async function advanceQueueToConsult(page: Page, patientLabel: string) {
  const card = () => page.locator('.appt-card, .board-card').filter({ hasText: patientLabel }).first();
  for (let i = 0; i < 4; i++) {
    await expect(card()).toBeVisible({ timeout: 20_000 });
    const btn = card().locator(
      'button.board-card-advance, button.action-done, button.action-btn.action-confirm, button.action-btn.action-arrived, button.action-btn.action-done',
    ).first();
    await btn.scrollIntoViewIfNeeded();
    const label = (await btn.innerText()).trim();
    if (/^Consult$/i.test(label)) {
      await btn.click();
      return;
    }
    if (/^Confirm$/i.test(label) || /^Arrived$/i.test(label)) {
      await btn.click();
      await page.waitForTimeout(700);
      continue;
    }
    break;
  }
  throw new Error(`Could not reach Consult for ${patientLabel}`);
}

export { localYmd };
