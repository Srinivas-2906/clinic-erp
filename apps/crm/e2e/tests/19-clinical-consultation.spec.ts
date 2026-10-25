import { test, expect } from '../fixtures/auth.fixture';
import { goToTab } from '../helpers/navigation';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;
const UNIQUE = `E2E UI ${Date.now()}`;

function clinicLocalYmd() {
  return new Date().toLocaleDateString('en-CA');
}

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
}

/** Fixture setup only — clinical actions run in the CRM UI. */
async function seedArrivedAppointment(request: import('@playwright/test').APIRequestContext) {
  const login = await request.post(`${API}/api/platform/login`, {
    data: {
      email: E2E_CREDENTIALS.email,
      password: E2E_CREDENTIALS.password,
      tenantSlug: TENANT,
    },
    headers: { 'X-Tenant-Slug': TENANT },
  });
  expect(login.ok()).toBeTruthy();
  const token = (await login.json()).token as string;
  const headers = { Authorization: `Bearer ${token}`, 'X-Tenant-Slug': TENANT };

  const phone = `9${String(Date.now()).slice(-9)}`;
  const patientRes = await request.post(`${API}/api/patients`, {
    headers: { ...headers, 'Content-Type': 'application/json' },
      data: { name: UNIQUE, phone, chiefComplaint: '' },
  });
  expect(patientRes.ok()).toBeTruthy();
  const patient = await patientRes.json();

  const docRes = await request.get(`${API}/api/clinic/doctors`, { headers });
  const docBody = await docRes.json();
  const doctors = docBody.doctors || docBody;
  const doctorId = Array.isArray(doctors) ? doctors[0]?.id : undefined;
  expect(doctorId).toBeTruthy();

  const dateStr = clinicLocalYmd();
  const slotRes = await request.get(`${API}/api/appointments/slots?date=${dateStr}`, { headers });
  const slotsBody = await slotRes.json();
  const first = slotsBody.slots?.[0];
  let scheduledAt: string;
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
      assignedDoctorId: doctorId,
    },
  });
  expect(apptRes.ok()).toBeTruthy();

  return { patient, headers, token, dateStr, doctorId };
}

test.describe('Clinical consultation flow', () => {
  test('Today → Consult → draft → reopen → finalize → PDF → visit history', async ({ authedPage: page, request }) => {
    const { patient, headers, dateStr } = await seedArrivedAppointment(request);

    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(page.getByText(UNIQUE).first()).toBeVisible({ timeout: 20_000 });

    const card = page.locator('.appt-card, .board-card').filter({ hasText: UNIQUE }).first();
    await card.locator('button.board-card-advance, button.action-done').filter({ hasText: /^Consult$/i }).click();

    await expect(page.locator('#consult-complaint')).toBeVisible({ timeout: 20_000 });
    await page.locator('#consult-complaint').click();
    await page.locator('#consult-complaint').fill('Sharp pain lower left');
    await page.locator('#consult-diagnosis').fill('Dental caries');
    await page.getByPlaceholder('Medicine').first().fill('Paracetamol');
    await page.getByPlaceholder('Dose').first().fill('500mg');
    await expect(page.locator('#consult-complaint')).toHaveValue('Sharp pain lower left');
    await expect(page.locator('#consult-diagnosis')).toHaveValue('Dental caries');

    const saveResp = page.waitForResponse((r) => r.url().includes('/encounters/') && r.request().method() === 'PATCH' && r.ok());
    await page.getByRole('button', { name: /save draft/i }).click();
    const savedBody = await (await saveResp).json();
    expect(savedBody.chiefComplaint).toBe('Sharp pain lower left');
    expect(savedBody.diagnoses?.[0]?.description).toBe('Dental caries');
    await expect(page.getByText(/consultation saved/i)).toBeVisible({ timeout: 10_000 });

    await page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') }).locator('button.modal-close').click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 10_000 });
    await expect.poll(async () => {
      const res = await request.get(`${API}/api/appointments?date=${dateStr}`, { headers });
      if (!res.ok()) return null;
      const body = await res.json();
      const list = Array.isArray(body) ? body : (body.appointments || []);
      const hit = list.find((a: { patientId?: string }) => a.patientId === patient.id);
      return hit?.encounterId || null;
    }, { timeout: 20_000 }).toBeTruthy();

    await page.getByRole('button', { name: 'Refresh' }).first().click();
    const card2 = page.locator('.appt-card, .board-card').filter({ hasText: UNIQUE }).first();
    await card2.locator('button.board-card-advance, button.action-done').filter({ hasText: /^Consult$/i }).click();
    await expect(page.getByText('Loading consultation…')).toHaveCount(0, { timeout: 15_000 });
    await expect.poll(async () => page.locator('#consult-complaint').inputValue(), { timeout: 20_000 })
      .toBe('Sharp pain lower left');
    await expect.poll(async () => page.locator('#consult-diagnosis').inputValue(), { timeout: 10_000 })
      .toBe('Dental caries');

    await page.getByRole('button', { name: /finalize visit/i }).click();
    await expect(page.getByText(/consultation finalized/i)).toBeVisible({ timeout: 20_000 });

    await page.goto(`/?tenant=${TENANT}&tab=patients&patient=${patient.id}`);
    await expect(page.locator('.patient-detail')).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: /Visits/i }).click();
    await expect(page.getByText(/finalized/i).first()).toBeVisible({ timeout: 10_000 });

    const pdfPagePromise = page.waitForEvent('popup');
    await page.getByRole('button', { name: /Rx PDF/i }).click();
    const pdfPage = await pdfPagePromise;
    await expect(pdfPage).toHaveURL(/blob:|about:blank/);
  });
});
