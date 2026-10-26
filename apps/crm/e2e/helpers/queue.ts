import { expect, type Locator, type Page } from '@playwright/test';

const CLINIC_TZ = 'Asia/Kolkata';

/** YYYY-MM-DD in clinic timezone (matches API / Today calendar). */
export function clinicYmd(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

/** @deprecated use clinicYmd — kept for existing imports */
export function localYmd(d: Date) {
  return clinicYmd(d);
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nameLocator(page: Page, patientLabel: string) {
  const exact = new RegExp(`^\\s*${escapeRegex(patientLabel)}\\s*$`);
  return page.locator('button.appt-name, .board-card-name').filter({ hasText: exact });
}

function appointmentCardsForPatient(page: Page, patientLabel: string) {
  return page.locator('.appt-card, .board-card').filter({ has: nameLocator(page, patientLabel) });
}

/** Prefer a card that still has queue actions (avoids Completed-column cards). */
async function pickQueueCard(page: Page, patientLabel: string): Promise<Locator> {
  const cards = appointmentCardsForPatient(page, patientLabel);
  await expect(cards.first()).toBeVisible({ timeout: 20_000 });
  const n = await cards.count();
  for (let i = 0; i < n; i++) {
    const card = cards.nth(i);
    const btn = queueActionButton(card);
    if (await btn.isVisible().catch(() => false)) return card;
  }
  return cards.first();
}

/** Queue advance control only — excludes phone/WhatsApp icon buttons on the card. */
function queueActionButton(card: Locator) {
  return card.locator(
    'button.board-card-advance, button.action-btn.action-confirm, button.action-btn.action-arrived, button.action-btn.action-done',
  ).filter({ hasText: /^(Consult|Confirm|Arrived)$/i });
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
}

/** Advance Today queue until Consult opens (list + board layouts). */
export async function advanceQueueToConsult(page: Page, patientLabel: string) {
  await dismissToasts(page);
  await waitTodayListSettled(page);

  for (let i = 0; i < 6; i++) {
    const card = await pickQueueCard(page, patientLabel);
    await card.scrollIntoViewIfNeeded();

    const consult = queueActionButton(card).filter({ hasText: /^Consult$/i });
    if (await consult.isVisible().catch(() => false)) {
      await consult.click();
      return;
    }

    const btn = queueActionButton(card);
    await expect(btn).toBeVisible({ timeout: 10_000 });
    const label = (await btn.innerText()).trim();
    if (/^Confirm$/i.test(label) || /^Arrived$/i.test(label)) {
      await btn.click();
      await waitTodayListSettled(page);
      continue;
    }
    break;
  }
  throw new Error(`Could not reach Consult for ${patientLabel}`);
}

/**
 * Re-open consultation after a saved draft (patient already arrived; do not re-run Confirm/Arrived).
 */
export async function reopenConsultation(page: Page, patientLabel: string) {
  await dismissToasts(page);
  await waitTodayListSettled(page);

  const card = await pickQueueCard(page, patientLabel);
  await card.scrollIntoViewIfNeeded();

  const statusTag = card.locator('.tag-success').filter({ hasText: /^Completed$/i });
  const consult = queueActionButton(card).filter({ hasText: /^Consult$/i });

  if (await statusTag.isVisible().catch(() => false) && !(await consult.isVisible().catch(() => false))) {
    throw new Error(
      `${patientLabel} is already marked completed on Today — draft reopen requires status arrived (finalize only after draft check).`,
    );
  }

  await expect(consult).toBeVisible({ timeout: 20_000 });
  await consult.click();
}
