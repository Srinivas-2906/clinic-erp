import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

test.describe('Appointment reschedule and cancel', () => {
  test('cancels a confirmed appointment from Today actions', async ({ authedPage: page, request }) => {
    const login = await request.post(`${API}/api/platform/login`, {
      data: { email: E2E_CREDENTIALS.email, password: E2E_CREDENTIALS.password, tenantSlug: E2E_CREDENTIALS.tenant },
      headers: { 'X-Tenant-Slug': E2E_CREDENTIALS.tenant },
    });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).token as string;
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': E2E_CREDENTIALS.tenant };

    const label = `Cancel E2E ${Date.now().toString().slice(-5)}`;
    const phone = `9${Date.now().toString().slice(-9)}`;
    const patientRes = await request.post(`${API}/api/patients`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: label, phone, chiefComplaint: 'Test cancel' },
    });
    const patient = await patientRes.json();
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const slotRes = await request.get(`${API}/api/appointments/slots?date=${dateStr}`, { headers });
    const slotsBody = await slotRes.json();
    const first = slotsBody.slots?.[0];
    const scheduledAt =
      typeof first === 'object' && first?.startsAt
        ? first.startsAt
        : `${dateStr}T11:00:00.000Z`;

    const apptRes = await request.post(`${API}/api/appointments`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: {
        patientId: patient.id,
        service: 'Consultation',
        scheduledAt,
        status: 'confirmed',
      },
    });
    expect(apptRes.ok()).toBeTruthy();

    await goToTab(page, 'today');
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 20_000 });

    const card = page.locator('.appt-card, .board-card').filter({ hasText: label }).first();
    await card.locator('button.quick-action-btn[title="Actions"]').click();
    await expect(page.getByRole('heading', { name: /appointment actions/i })).toBeVisible();
    await page.getByRole('button', { name: /cancel appointment/i }).click();
    await expect(page.getByText(/cancelled|appointment cancelled/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('reschedules a confirmed appointment from Today actions', async ({ authedPage: page, request }) => {
    const login = await request.post(`${API}/api/platform/login`, {
      data: { email: E2E_CREDENTIALS.email, password: E2E_CREDENTIALS.password, tenantSlug: E2E_CREDENTIALS.tenant },
      headers: { 'X-Tenant-Slug': E2E_CREDENTIALS.tenant },
    });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).token as string;
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': E2E_CREDENTIALS.tenant };

    const label = `Resched E2E ${Date.now().toString().slice(-5)}`;
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
      typeof first === 'object' && first?.startsAt ? first.startsAt : `${dateStr}T10:00:00.000Z`;

    await request.post(`${API}/api/appointments`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { patientId: patient.id, service: 'Consultation', scheduledAt, status: 'confirmed' },
    });

    await goToTab(page, 'today');
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 20_000 });

    const card = page.locator('.appt-card, .board-card').filter({ hasText: label }).first();
    await card.locator('button.quick-action-btn[title="Actions"]').click();
    await page.getByRole('button', { name: /^reschedule$/i }).click();
    await expect(page.getByRole('heading', { name: /^reschedule$/i })).toBeVisible();

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextDate = tomorrow.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    await page.locator('.modal-overlay input[type="date"]').fill(nextDate);
    const slotChip = page.locator('.modal-overlay .time-chip').first();
    if (await slotChip.isVisible({ timeout: 5000 }).catch(() => false)) {
      await slotChip.click();
    } else {
      await page.locator('.modal-overlay input[type="time"]').fill('11:30');
    }
    await page.locator('.modal-overlay').getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/rescheduled/i).first()).toBeVisible({ timeout: 15_000 });
  });
});
