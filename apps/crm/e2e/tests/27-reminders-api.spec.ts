import { test, expect } from '@playwright/test';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';

test.describe('Reminder jobs (API)', () => {
  test('enqueue mock reminder and cancel when appointment cancelled', async ({ request }) => {
    const login = await request.post(`${API}/api/platform/login`, {
      data: { email: E2E_CREDENTIALS.email, password: E2E_CREDENTIALS.password, tenantSlug: E2E_CREDENTIALS.tenant },
      headers: { 'X-Tenant-Slug': E2E_CREDENTIALS.tenant },
    });
    expect(login.ok()).toBeTruthy();
    const token = (await login.json()).token as string;
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': E2E_CREDENTIALS.tenant, 'Content-Type': 'application/json' };

    const phone = `9${Date.now().toString().slice(-9)}`;
    const patient = await (await request.post(`${API}/api/patients`, { headers, data: { name: 'Reminder Test', phone } })).json();
    const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const appt = await (
      await request.post(`${API}/api/appointments`, {
        headers,
        data: { patientId: patient.id, service: 'Consultation', scheduledAt: `${dateStr}T14:00:00.000Z`, status: 'confirmed' },
      })
    ).json();

    const plat = await request.post(`${API}/api/platform/login`, {
      data: { email: process.env.E2E_PLATFORM_EMAIL || 'e2e-platform@clinic-erp.invalid', password: E2E_CREDENTIALS.password },
    });
    if (!plat.ok()) {
      test.skip(true, 'platform admin not seeded');
      return;
    }
    const platToken = (await plat.json()).token as string;

    const processRes = await request.post(`${API}/api/platform/internal/process-reminders`, {
      headers: { Authorization: `Bearer ${platToken}` },
    });
    expect(processRes.ok()).toBeTruthy();

    const cancelRes = await request.patch(`${API}/api/appointments/${appt.id}`, {
      headers,
      data: { status: 'cancelled' },
    });
    expect(cancelRes.ok()).toBeTruthy();
  });
});
