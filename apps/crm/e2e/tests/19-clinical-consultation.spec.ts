import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function apiLogin(request: import('@playwright/test').APIRequestContext) {
  const res = await request.post(`${API}/api/platform/login`, {
    data: {
      email: E2E_CREDENTIALS.email,
      password: E2E_CREDENTIALS.password,
      tenantSlug: TENANT,
    },
    headers: { 'X-Tenant-Slug': TENANT },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  return body.token as string;
}

test.describe('Clinical consultation flow', () => {
  test('arrived → consult → draft → finalize → PDF → patient history', async ({ authedPage: page, request }) => {
    const token = await apiLogin(request);
    const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': TENANT };

    const phone = `9${String(Date.now()).slice(-9)}`;
    const patientRes = await request.post(`${API}/api/patients`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: 'E2E Clinical Patient', phone, chiefComplaint: 'Toothache' },
    });
    expect(patientRes.ok()).toBeTruthy();
    const patient = await patientRes.json();

    const slotRes = await request.get(`${API}/api/appointments/slots?date=${new Date().toISOString().slice(0, 10)}`, { headers });
    expect(slotRes.ok()).toBeTruthy();
    const slotsBody = await slotRes.json();
    const dateStr = new Date().toISOString().slice(0, 10);
    let scheduledAt: string;
    const first = slotsBody.slots?.[0];
    if (first && typeof first === 'object' && first.startsAt) {
      scheduledAt = first.startsAt;
    } else if (typeof first === 'string') {
      scheduledAt = `${dateStr}T${first.length <= 5 ? first : '10:00'}:00.000Z`;
    } else {
      scheduledAt = `${dateStr}T10:00:00.000Z`;
    }

    const apptRes = await request.post(`${API}/api/appointments`, {
      headers: { ...headers, 'Content-Type': 'application/json' },
      data: {
        patientId: patient.id,
        service: 'Consultation',
        scheduledAt,
        status: 'arrived',
      },
    });
    expect(apptRes.ok()).toBeTruthy();
    const appt = await apptRes.json();

    await goToTab(page, 'today');
    await page.getByRole('button', { name: /consult/i }).first().click({ timeout: 15_000 });

    await expect(page.getByRole('heading', { name: /consultation/i })).toBeVisible();
    await page.locator('#consult-complaint').fill('Sharp pain lower left');
    await page.locator('#consult-diagnosis').fill('Dental caries');
    await page.getByPlaceholder('Medicine').first().fill('Paracetamol');
    await page.getByPlaceholder('Dose').first().fill('500mg');

    await page.getByRole('button', { name: /save draft/i }).click();
    await expect(page.getByText(/consultation saved/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.getByText(/consultation finalized/i)).toBeVisible({ timeout: 15_000 });

    const encRes = await request.get(`${API}/api/clinic/patients/${patient.id}/encounters`, { headers });
    expect(encRes.ok()).toBeTruthy();
    const { encounters } = await encRes.json();
    expect(encounters?.length).toBeGreaterThan(0);
    expect(encounters[0].status).toBe('finalized');

    const encId = encounters[0].id;
    const pdfRes = await request.get(`${API}/api/clinic/encounters/${encId}/prescription.pdf`, { headers });
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()['content-type']).toContain('pdf');

    await goToTab(page, 'patients');
    await page.getByText('E2E Clinical Patient').click();
    await page.getByRole('button', { name: /Visits/i }).click();
    await expect(page.getByText(/finalized/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
