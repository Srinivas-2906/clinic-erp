import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Pilot layout (viewport)', () => {
  test('Today and patient detail fit without horizontal overflow', async ({ authedPage: page }) => {
    await goToTab(page, 'today');
    const todayOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
    expect(todayOverflow).toBe(false);

    await goToTab(page, 'patients');
    const firstPatient = page.locator('.patient-row, .patients-list li, [data-testid="patient-row"]').first();
    if (await firstPatient.count()) {
      await firstPatient.click();
      const patientOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2);
      expect(patientOverflow).toBe(false);
    }
  });
});
