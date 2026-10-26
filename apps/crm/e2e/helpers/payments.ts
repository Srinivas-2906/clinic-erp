import { expect, type Page } from '@playwright/test';

/** Record payment dialog options are rendered as "{name} — {phone}". */
export async function selectPaymentPatientByName(page: Page, patientName: string) {
  const patientSelect = page.locator('.modal-overlay select').first();
  await expect(patientSelect).toBeVisible();
  const options = await patientSelect.locator('option').allTextContents();
  const label = options.find((o) => o.includes(patientName));
  if (!label) {
    throw new Error(`Payment dropdown missing patient matching "${patientName}"`);
  }
  await patientSelect.selectOption({ label });
}
