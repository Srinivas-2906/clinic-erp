import { test, expect } from '@playwright/test';
import crypto from 'crypto';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { goToTab, closeBlockingModalsIfOpen } from '../helpers/navigation';
import { authHeaders } from '../helpers/clinicApi';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;
const WEBHOOK_SECRET = process.env.CLINIC_RAZORPAY_WEBHOOK_SECRET || 'e2e-webhook-secret-do-not-use-live';

test.describe('Owner subscription sandbox (web)', () => {
  test('owner sees plan panel and sandbox checkout creates order', async ({ page, request }) => {
    const ownerHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );

    await loginClinicApp(page, 'owner');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'settings');
    await expect(page.getByText('Plan & subscription')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Sandbox billing|sandbox/i).first()).toBeVisible();

    const checkoutRes = await request.post(`${API}/api/clinic/billing/checkout`, {
      headers: { ...ownerHeaders, 'Content-Type': 'application/json' },
      data: { planId: 'professional', idempotencyKey: `e2e-${Date.now()}` },
    });
    expect(checkoutRes.ok()).toBeTruthy();
    const checkout = await checkoutRes.json();
    expect(checkout.orderId).toBeTruthy();

    const payload = {
      event: 'payment.captured',
      event_id: `evt_e2e_${Date.now()}`,
      payload: {
        payment: {
          entity: {
            id: `pay_e2e_${Date.now()}`,
            order_id: checkout.orderId,
            status: 'captured',
          },
        },
      },
    };
    const raw = JSON.stringify(payload);
    const sig = crypto.createHmac('sha256', WEBHOOK_SECRET).update(raw).digest('hex');
    const wh = await request.post(`${API}/api/platform/webhooks/razorpay-subscription`, {
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig },
      data: raw,
    });
    expect(wh.ok()).toBeTruthy();

    await page.reload();
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'settings');
    await expect(page.getByText(/professional/i).first()).toBeVisible({ timeout: 15_000 });
  });

  test('mobile browser owner can open subscription settings', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-mobile', 'Mobile viewport only');
    await loginClinicApp(page, 'owner');
    await closeBlockingModalsIfOpen(page);
    await goToTab(page, 'settings');
    await expect(page.getByText('Plan & subscription')).toBeVisible({ timeout: 15_000 });
  });
});
