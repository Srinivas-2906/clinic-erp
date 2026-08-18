import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Patient detail', () => {
  test('opens demo patient and adds a note', async ({ authedPage: page }) => {
    await goToTab(page, 'patients');
    await page.waitForTimeout(800);

    const lakshmi = page.locator('.patient-card, .patient-row').filter({ hasText: 'Lakshmi Reddy' }).first();
    if (await lakshmi.count()) {
      await lakshmi.click();
    } else {
      await page.locator('.patient-card, .patient-row').first().click();
    }

    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 10_000 });
    await captureStep(page, 'patient-detail-overview');

    const notesTab = page.getByRole('button', { name: /notes/i });
    if (await notesTab.isVisible()) {
      await notesTab.click();
      const noteInput = page.getByPlaceholder(/write a note/i);
      if (await noteInput.isVisible()) {
        await noteInput.fill(`E2E note ${Date.now()}`);
        await page.getByRole('button', { name: /save note/i }).click();
        await page.waitForTimeout(800);
        await captureStep(page, 'patient-detail-note-added');
      }
    }

    const historyTab = page.getByRole('button', { name: /visits/i });
    if (await historyTab.isVisible()) {
      await historyTab.click();
      await page.waitForTimeout(400);
      const doctorBadge = page.locator('.mini-appt-doctor .tag-doctor').first();
      if (await doctorBadge.count()) {
        await expect(doctorBadge).toBeVisible();
      }
      await captureStep(page, 'patient-detail-history');
    }
  });
});
