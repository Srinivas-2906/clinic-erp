import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';

test.describe('Doctor filter on Today/Home', () => {
  test('shows doctor filter chips when multiple doctors exist', async ({ authedPage: page, request }) => {
    const API = process.env.E2E_API_URL || 'http://localhost:3010';
    const TENANT = process.env.E2E_TENANT || 'dentacare';

    const loginRes = await request.post(`${API}/api/platform/login`, {
      headers: { 'x-tenant-slug': TENANT },
      data: {
        email: process.env.E2E_OWNER_EMAIL || 'e2e-owner@dentacare.in',
        password: process.env.E2E_OWNER_PASSWORD || 'E2eTest@2026',
      },
    });
    test.skip(!loginRes.ok(), 'E2E owner login unavailable');
    const { token } = await loginRes.json();

    const listRes = await request.get(`${API}/api/clinic/doctors`, {
      headers: { Authorization: `Bearer ${token}`, 'x-tenant-slug': TENANT },
    });
    test.skip(!listRes.ok(), 'Doctors API unavailable');
    const { doctors } = await listRes.json();
    test.skip((doctors?.length ?? 0) < 2, 'Need at least 2 doctors for doctor filter test');

    await goToTab(page, 'overview');
    await page.waitForTimeout(800);

    await expect(page.getByRole('toolbar', { name: /filter by doctor/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /all doctors/i })).toBeVisible();

    await goToTab(page, 'today');
    await page.waitForTimeout(500);
    await expect(page.getByRole('toolbar', { name: /filter by doctor/i })).toBeVisible();

    const firstDoctor = doctors[0].displayName || doctors[0].name;
    const doctorChip = page.getByRole('button', { name: new RegExp(firstDoctor, 'i') }).first();
    if (await doctorChip.isVisible()) {
      await doctorChip.click();
      await page.waitForTimeout(400);
      await doctorChip.click();
    }
  });
});
