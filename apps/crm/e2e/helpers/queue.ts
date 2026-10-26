import { expect, type Page } from '@playwright/test';

function localYmd(d: Date) {
  return d.toLocaleDateString('en-CA');
}

function cardForPatient(page: Page, patientLabel: string) {
  const nameMatch = page.getByRole('button', { name: patientLabel, exact: true });
  return page.locator('.appt-card, .board-card').filter({ has: nameMatch });
}

async function dismissToasts(page: Page) {
  const closes = page.locator('.toast-close');
  const n = await closes.count();
  for (let i = 0; i < n; i++) {
    await closes.nth(i).click().catch(() => {});
  }
}

async function waitTodayListSettled(page: Page) {
  await page.getByText('Loading…').waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(350);
}

/** Advance Today queue until Consult opens (list + board layouts). */
export async function advanceQueueToConsult(page: Page, patientLabel: string) {
  await dismissToasts(page);
  await waitTodayListSettled(page);

  for (let i = 0; i < 6; i++) {
    let clickedConsult = false;

    await expect(async () => {
      const card = cardForPatient(page, patientLabel);
      await expect(card.first()).toBeVisible({ timeout: 5000 });

      const consult = card.first().getByRole('button', { name: /^Consult$/i });
      if (await consult.isVisible().catch(() => false)) {
        await consult.click({ timeout: 5000 });
        clickedConsult = true;
        return;
      }

      const confirm = card.first().getByRole('button', { name: /^Confirm$/i });
      const arrived = card.first().getByRole('button', { name: /^Arrived$/i });
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click({ timeout: 5000 });
        return;
      }
      if (await arrived.isVisible().catch(() => false)) {
        await arrived.click({ timeout: 5000 });
        return;
      }

      throw new Error(`No queue action on card for ${patientLabel}`);
    }).toPass({ timeout: 25_000 });

    if (clickedConsult) return;
    await waitTodayListSettled(page);
  }

  throw new Error(`Could not reach Consult for ${patientLabel}`);
}

export { localYmd };
