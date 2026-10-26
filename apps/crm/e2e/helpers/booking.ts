import { expect, type Page } from '@playwright/test';
import { clinicYmd } from './queue';

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
    const ymd = clinicYmd(d);
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
  const showCal = page.getByRole('button', { name: /Show calendar/i });
  if (await showCal.isVisible().catch(() => false)) {
    await showCal.click();
  }
  const target = page.locator(`button.calendar-cell[data-ymd="${ymd}"]`).first();
  async function tryNav(direction: 'next' | 'prev') {
    const label = direction === 'next' ? 'Next month' : 'Previous month';
    for (let i = 0; i < 14; i++) {
      if (await target.isVisible().catch(() => false)) {
        await target.scrollIntoViewIfNeeded();
        await target.click();
        await page.waitForTimeout(600);
        return true;
      }
      await page.getByRole('button', { name: label }).click();
      await page.waitForTimeout(250);
    }
    return false;
  }
  if (await tryNav('next')) {
    await assertCalendarDateSelected(page, ymd);
    await collapseTodayCalendarIfOpen(page);
    return;
  }
  if (await tryNav('prev')) {
    await assertCalendarDateSelected(page, ymd);
    await collapseTodayCalendarIfOpen(page);
    return;
  }
  await target.click({ timeout: 10_000 });
  await page.waitForTimeout(600);
  await assertCalendarDateSelected(page, ymd);
  await collapseTodayCalendarIfOpen(page);
}

async function assertCalendarDateSelected(page: Page, ymd: string) {
  const selected = page.locator(`button.calendar-cell-selected[data-ymd="${ymd}"]`);
  await expect(selected).toBeVisible({ timeout: 10_000 });
}

/** After calendar pick (often collapsed on mobile), verify schedule date via grid or page header. */
export async function expectTodayScheduleDate(page: Page, ymd: string) {
  const selected = page.locator(`button.calendar-cell-selected[data-ymd="${ymd}"]`);
  if (await selected.isVisible().catch(() => false)) {
    await expect(selected).toBeVisible();
    return;
  }
  const header = page.locator('.today-view h1.page-title');
  await expect(header).toBeVisible({ timeout: 10_000 });
  if (ymd === clinicYmd()) {
    await expect(header).toContainText('Today ·');
    return;
  }
  const label = new Date(`${ymd}T12:00:00+05:30`).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  await expect(header).toHaveText(label);
}

/** Mobile Today calendar can cover the queue — hide via the real toggle. */
export async function collapseTodayCalendarIfOpen(page: Page) {
  const hide = page.getByRole('button', { name: /Hide calendar/i });
  if (await hide.isVisible().catch(() => false)) {
    await hide.click();
    await page.waitForTimeout(300);
  }
}
