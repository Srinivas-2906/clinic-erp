import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { captureStep } from '../helpers/screenshot';

test.describe('Team access (owner)', () => {
  test('shows team page and pending requests', async ({ authedPage: page }) => {
    await goToTab(page, 'team');
    await expect(page.locator('.team-access-title')).toHaveText('Team');
    await captureStep(page, 'team-access-view');
  });

  test('submits access request via API and owner sees it', async ({ authedPage: page, request }) => {
    const email = `e2e-staff-${Date.now()}@dentacare.in`;
    const res = await request.post('http://localhost:3010/api/platform/tenant/dentacare/access-request', {
      data: { email, name: 'E2E Staff Request' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.ok()).toBeTruthy();

    await goToTab(page, 'team');
    await page.waitForTimeout(1000);
    await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });
    await captureStep(page, 'team-pending-request');

    const approveBtn = page.getByRole('button', { name: /approve/i }).first();
    await approveBtn.click();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/set password|invite|link/i).first()).toBeVisible({ timeout: 10_000 });
    await captureStep(page, 'team-approved-invite');
  });
});
