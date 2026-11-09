import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('patient payment intent (mock)', () => {
  test('reception collects invoice via test online pay', async ({ authedPage: page }) => {
    await goToTab(page, 'payments');
    await page.getByRole('button', { name: '+ Invoice' }).click();
    await page.locator('.modal-overlay input[type="search"], .modal-overlay select').first().waitFor();
    const patientPick = page.locator('.modal-overlay select').first();
    await patientPick.selectOption({ index: 1 });
    await page.locator('.modal-overlay input.invoice-line-desc').first().fill('Mock checkout line');
    await page.locator('.modal-overlay input.invoice-line-price').first().fill('350');
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.locator('.toast').filter({ hasText: /invoice/i }).first()).toBeVisible({ timeout: 20_000 });

    const row = page.locator('.payment-list li').filter({ hasText: '350' }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();
    const testPay = page.getByTestId('invoice-test-online-pay');
    await expect(testPay).toBeVisible({ timeout: 10_000 });
    await testPay.click();
    await expect(page.locator('.toast').filter({ hasText: /online payment recorded/i }).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.payment-list').filter({ hasText: /razorpay|paid/i }).first()).toBeVisible({ timeout: 15_000 });
  });
});
