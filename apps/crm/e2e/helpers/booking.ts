import type { Page } from '@playwright/test';

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

/** Pick first valid slot on schedule step when present. */
export async function pickFirstBookSlot(page: Page) {
  const slotSelect = page.locator('.form-select').last();
  await slotSelect.waitFor({ state: 'visible', timeout: 10_000 });
  const options = await slotSelect.locator('option').allTextContents();
  let validSlot = options.find((o) => /AM|PM|\d{1,2}:\d{2}/i.test(o));
  if (validSlot) {
    await slotSelect.selectOption({ label: validSlot });
  } else {
    const idx = options.findIndex((o, i) => i > 0 && o.trim() && !/choose|select/i.test(o));
    if (idx > 0) {
      await slotSelect.selectOption({ index: idx });
      validSlot = options[idx];
    }
  }
  return validSlot;
}
