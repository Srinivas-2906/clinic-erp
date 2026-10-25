import { expect, type Page } from '@playwright/test';

/** Advance BookView after treatment — handles optional multi-doctor step. */
export async function continueBookAfterTreatment(page: Page, mode: 'walkin' | 'schedule') {
  const nextLabel = mode === 'walkin' ? /^(Review|Next)$/ : /^Next$/;
  await page.getByRole('button', { name: nextLabel }).click();

  const doctorStep = page.getByText('Choose doctor');
  if (await doctorStep.isVisible({ timeout: 2500 }).catch(() => false)) {
    const anyBtn = page.getByRole('button', { name: /any available doctor/i }).first();
    if (await anyBtn.isVisible().catch(() => false)) {
      await anyBtn.click();
    } else {
      await page.locator('.book-doctor-option').first().click();
    }
    await page.getByRole('button', { name: mode === 'walkin' ? 'Review' : 'Next' }).click();
  }
}

/** Pick first valid slot on schedule step — waits for API slot load. */
export async function pickFirstBookSlot(page: Page) {
  await expect(page.getByText('Pick a time')).toBeVisible({ timeout: 15_000 });
  const slotSelect = page.locator('#book-schedule-slot');
  await expect(slotSelect).toBeVisible();

  await expect.poll(async () => {
    const options = await slotSelect.locator('option').allTextContents();
    const usable = options.filter((o) => o.trim() && !/loading|no open slots/i.test(o));
    return usable.length;
  }, { timeout: 25_000, message: 'Wait for bookable slots' }).toBeGreaterThan(0);

  const options = await slotSelect.locator('option').allTextContents();
  const idx = options.findIndex((o, i) => i >= 0 && o.trim() && !/loading|no open slots/i.test(o));
  expect(idx).toBeGreaterThanOrEqual(0);
  await slotSelect.selectOption({ index: idx });
  return options[idx];
}

/** If today has no slots, try tomorrow on the date picker. */
export async function ensureBookableScheduleDate(page: Page) {
  const dateInput = page.locator('#book-schedule-date');
  await expect(dateInput).toBeVisible({ timeout: 10_000 });
  const slotSelect = page.locator('#book-schedule-slot');
  for (let offset = 0; offset <= 7; offset++) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const ymd = d.toISOString().slice(0, 10);
    await dateInput.fill(ymd);
    await page.waitForTimeout(1200);
    const options = await slotSelect.locator('option').allTextContents();
    const usable = options.filter((o) => o.trim() && !/loading|no open slots/i.test(o));
    if (usable.length > 0) return ymd;
  }
  throw new Error('No bookable slots in the next 7 days');
}

/** Match Today schedule calendar to appointment date (YYYY-MM-DD). */
export async function selectTodayCalendarDate(page: Page, ymd: string) {
  const day = Number(ymd.slice(8, 10));
  const showCal = page.getByRole('button', { name: /Show calendar/i });
  if (await showCal.isVisible().catch(() => false)) {
    await showCal.click();
  }
  await page.getByRole('gridcell', { name: new RegExp(`^${day}[,\\s]`) }).first().click();
  await page.waitForTimeout(600);
}
