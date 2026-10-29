import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

test.describe('Queue transitions', () => {
  test('Confirm → Arrived → Consult opens consultation sheet', async ({ authedPage: page, request }) => {
    const login = await request.post(`${API}/api/platform/login`, {
      data: { email: E2E_CREDENTIALS.email, password: E2E_CREDENTIALS.password, tenantSlug: E2E_CREDENTIALS.tenant },
      headers: { 'X-Tenant-Slug': E2E_CREDENTIALS.tenant },
    });
    const token = (await login.json()).token as string;
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': E2E_CREDENTIALS.tenant };

    const label = `Queue ${Date.now().toString().slice(-5)}`;
    const phone = `9${Date.now().toString().slice(-9)}`;
    const patient = await (
      await request.post(`${API}/api/patients`, {
        headers: { ...headers, 'Content-Type': 'application/json' },
        data: { name: label, phone },
      })
    ).json();

    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const slotRes = await request.get(`${API}/api/appointments/slots?date=${dateStr}`, { headers });
    const slotsBody = await slotRes.json();
    const first = slotsBody.slots?.[0];
    const scheduledAt =
      typeof first === 'object' && first?.startsAt
        ? first.startsAt
        : `${dateStr}T10:30:00.000Z`;

    await request.post(`${API}/api/appointments`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: {
        patientId: patient.id,
        service: 'Consultation',
        scheduledAt,
        status: 'requested',
      },
    });

    await goToTab(page, 'today');
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 20_000 });
    await advanceQueueToConsult(page, label);
    await expect(page.locator('#consult-complaint')).toBeVisible();
  });
});
