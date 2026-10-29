import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Invoices and partial payment', () => {
  test('owner creates invoice with line items', async ({ authedPage: page }) => {
    await goToTab(page, 'payments');
    await page.getByRole('button', { name: '+ Invoice' }).click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 10_000 });

    await page.locator('.modal-overlay select').first().selectOption({ index: 1 });
    await page.getByPlaceholder('Description').fill('E2E consultation fee');
    await page.locator('.modal-overlay input.invoice-line-price').first().fill('1000');
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.getByText(/invoice created/i)).toBeVisible({ timeout: 15_000 });
  });

  test('owner records partial payment and ledger refund', async ({ authedPage: page }) => {
    await goToTab(page, 'payments');
    await page.getByRole('button', { name: '+ Payment' }).click();
    await expect(page.getByRole('heading', { name: /record payment/i })).toBeVisible();
    await page.locator('.modal-overlay select').first().selectOption({ index: 1 });
    await page.locator('.modal-overlay input[type="number"], .modal-overlay input[inputmode="numeric"]').first().fill('500');
    await page.locator('.modal-overlay form').getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/recorded|payment/i).first()).toBeVisible({ timeout: 15_000 });

    const refundBtn = page.getByRole('button', { name: /record refund/i }).first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });
    await refundBtn.click();
    await page.locator('.modal-overlay input[type="number"]').first().fill('100');
    await page.locator('.modal-overlay form').getByRole('button', { name: /^record refund$/i }).click();
    await expect(page.getByText(/refund|ledger/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
