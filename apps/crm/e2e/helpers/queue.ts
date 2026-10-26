import { expect, type Page } from '@playwright/test';

function localYmd(d: Date) {
  return d.toLocaleDateString('en-CA');
}

function patientCard(page: Page, patientLabel: string) {
  return page.locator('.appt-card, .board-card').filter({ hasText: patientLabel }).first();
}

/** Queue advance control only — excludes phone/WhatsApp icon buttons on the card. */
function queueActionButton(card: ReturnType<typeof patientCard>) {
  return card.locator(
    'button.board-card-advance, button.action-done, button.action-btn.action-confirm, button.action-btn.action-arrived, button.action-btn.action-done',
  ).filter({ hasText: /^(Consult|Confirm|Arrived)$/i });
}

async function dismissToasts(page: Page) {
  const closes = page.locator('.toast-close');
  const n = await closes.count();
  for (let i = 0; i < n; i++) {
    await closes.nth(i).click().catch(() => {});
  }
}

/** Advance Today queue until Consult opens (list + board layouts). */
export async function advanceQueueToConsult(page: Page, patientLabel: string) {
  await dismissToasts(page);
  for (let i = 0; i < 5; i++) {
    const card = patientCard(page, patientLabel);
    await expect(card).toBeVisible({ timeout: 20_000 });
    await card.scrollIntoViewIfNeeded();

    const consult = card.getByRole('button', { name: /^Consult$/i });
    if (await consult.isVisible().catch(() => false)) {
      await consult.click();
      return;
    }

    const btn = queueActionButton(card);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const label = (await btn.innerText()).trim();
    if (/^Confirm$/i.test(label) || /^Arrived$/i.test(label)) {
      await btn.click();
      await page.waitForTimeout(800);
      continue;
    }
    break;
  }
  throw new Error(`Could not reach Consult for ${patientLabel}`);
}

export { localYmd };
