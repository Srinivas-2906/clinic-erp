/**
 * Integrated MVP outpatient day — manual billing only (no Razorpay checkout).
 * Runs against isolated E2E tenant (dentacare fixture) with desktop + mobile projects.
 */
import { test, expect } from '@playwright/test';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { authHeaders, clinicTodayYmd } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) await dismiss.click();
}

async function logoutClinic(page: import('@playwright/test').Page) {
  const sidebarLogout = page.locator('.sidebar-logout-btn');
  if (await sidebarLogout.isVisible().catch(() => false)) {
    await sidebarLogout.click();
  } else {
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('button', { name: /log out/i }).click();
  }
  await expect(page.locator('.login-screen')).toBeVisible({ timeout: 15_000 });
}

function appointmentCard(page: import('@playwright/test').Page, label: string) {
  return page.locator('.appt-card, .board-card').filter({ hasText: label }).first();
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function e2eLinkedDoctorLabel(request: import('@playwright/test').APIRequestContext) {
  const headers = await authHeaders(
    request,
    API,
    TENANT,
    ROLE_CREDENTIALS.receptionist.email,
    ROLE_CREDENTIALS.receptionist.password,
  );
  const res = await request.get(`${API}/api/clinic/doctors`, { headers });
  expect(res.ok()).toBeTruthy();
  const doctors = (await res.json()).doctors as { userId?: string | null; displayName?: string; name: string }[];
  const linked = doctors.find((d) => d.userId === 'user-e2e-doctor') ?? doctors[0];
  expect(linked).toBeTruthy();
  return linked.displayName || linked.name;
}

test.describe('MVP clinic day @mvp', () => {
  test('full day: queue → consult → manual pay → follow-up → owner report → survives re-login', async ({
    page,
    request,
    browser,
  }) => {
    const suffix = Date.now().toString().slice(-7);
    const patientName = `MVP Day ${suffix}`;
    const phone = `9${suffix.padStart(9, '0').slice(0, 9)}`;
    let patientId = '';
    let appointmentId = '';

    await loginClinicApp(page, 'receptionist');
    await dismissPilotBanner(page);

    await goToTab(page, 'patients');
    const addBtn = page.locator('.patients-header-actions .add-patient-btn');
    if (await addBtn.isVisible().catch(() => false)) await addBtn.click();
    else await page.locator('button.fab[aria-label="Add patient"]').click();
    await expect(page.locator('.modal-overlay')).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder('Patient name').fill(patientName);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('30');
    const patientCreate = page.waitForResponse(
      (r) => r.url().includes('/api/patients') && r.request().method() === 'POST' && r.ok(),
      { timeout: 25_000 },
    );
    const addPatientBtn = page.locator('.modal-footer').getByRole('button', { name: 'Add patient' });
    await addPatientBtn.scrollIntoViewIfNeeded();
    await addPatientBtn.click();
    const patientRes = await patientCreate;
    patientId = (await patientRes.json()).id;
    expect(patientId).toBeTruthy();

    await goToTab(page, 'book');
    const e2eDoctorLabel = await e2eLinkedDoctorLabel(request);
    const e2eDoctorPattern = new RegExp(escapeRegex(e2eDoctorLabel), 'i');
    await page.getByRole('tab', { name: /walk-in now/i }).click();
    await page.locator('#book-search').fill(phone);
    await page.getByRole('button', { name: /continue booking/i }).click();
    await page.locator('.form-select').first().selectOption({ index: 0 });
    await page.getByRole('button', { name: /^(Review|Next)$/ }).click();
    if (await page.getByText('Choose doctor').isVisible({ timeout: 2500 }).catch(() => false)) {
      const namedDoctor = page.getByRole('button', { name: e2eDoctorPattern }).first();
      if (await namedDoctor.isVisible().catch(() => false)) {
        await namedDoctor.click();
      } else {
        await page.locator('.book-doctor-option').filter({ hasText: e2eDoctorPattern }).first().click();
      }
      await page.getByRole('button', { name: /^Review$/ }).click();
    }
    if (await page.getByRole('button', { name: /^Review$/ }).isVisible().catch(() => false)) {
      await page.getByRole('button', { name: /^Review$/ }).click();
    }
    const apptCreate = page.waitForResponse(
      (r) => r.url().includes('/api/appointments') && r.request().method() === 'POST' && r.ok(),
      { timeout: 25_000 },
    );
    await page.getByRole('button', { name: /save walk-in/i }).click();
    appointmentId = (await (await apptCreate).json()).id;

    await goToTab(page, 'today');
    const card = appointmentCard(page, patientName);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return card.isVisible();
    }, { timeout: 30_000 }).toBe(true);

    await logoutClinic(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    const encounterReady = page.waitForResponse(
      (r) => r.url().includes('/encounters') && ['POST', 'GET'].includes(r.request().method()) && r.ok(),
      { timeout: 25_000 },
    );
    await advanceQueueToConsult(page, patientName);
    await encounterReady;

    const consultModal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await expect(consultModal.locator('#consult-complaint')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Loading consultation…')).toBeHidden({ timeout: 20_000 });

    await consultModal.locator('#consult-complaint').fill('MVP visit complaint');
    const saveDraft = consultModal.getByRole('button', { name: /save draft/i });
    await saveDraft.scrollIntoViewIfNeeded();
    await saveDraft.click();
    const errToast = page.locator('.toast-err');
    await expect(page.getByText(/consultation saved/i).or(errToast)).toBeVisible({ timeout: 20_000 });
    if (await errToast.isVisible().catch(() => false)) {
      throw new Error(`Save draft failed: ${(await errToast.innerText()).trim()}`);
    }

    await consultModal.locator('#consult-diagnosis').fill('Stable');
    await consultModal.getByPlaceholder('Medicine').first().fill('Paracetamol');
    await consultModal.getByPlaceholder('Dose').first().fill('500mg');
    const finalizeBtn = consultModal.getByRole('button', { name: /finalize visit/i });
    await finalizeBtn.scrollIntoViewIfNeeded();
    await expect(finalizeBtn).toBeEnabled({ timeout: 10_000 });
    await finalizeBtn.click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 25_000 });
    const skipBilling = page.getByRole('button', { name: /continue without billing/i });
    if (await skipBilling.isVisible().catch(() => false)) {
      await skipBilling.click();
    }

    const doctorHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.doctor.email,
      ROLE_CREDENTIALS.doctor.password,
    );
    const timeline = await request.get(`${API}/api/patients/${patientId}`, { headers: doctorHeaders });
    expect(timeline.ok()).toBeTruthy();
    let enc: { id: string; status: string } | undefined;
    await expect.poll(async () => {
      const tl = await request.get(`${API}/api/patients/${patientId}`, { headers: doctorHeaders });
      const body = await tl.json();
      enc = (body.encounters ?? []).find((e: { appointmentId?: string }) => e.appointmentId === appointmentId);
      return enc?.status === 'finalized';
    }, { timeout: 30_000 }).toBe(true);
    if (!enc) throw new Error('encounter missing after finalize');
    await request.post(`${API}/api/clinic/encounters/${enc.id}/follow-up`, {
      headers: { ...doctorHeaders, 'Content-Type': 'application/json' },
      data: { dueDate: clinicTodayYmd(), instructions: 'MVP follow-up' },
    });

    await logoutClinic(page);
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'payments');
    await page.getByRole('button', { name: '+ Invoice' }).click();
    const invoiceModal = page.locator('.modal-overlay').filter({ hasText: /invoice/i });
    const patientSelect = invoiceModal.locator('select').first();
    await patientSelect.selectOption({ index: 0 }).catch(() => {});
    const options = await patientSelect.locator('option').allTextContents();
    const idx = Math.max(0, options.findIndex((t) => t.includes(patientName)));
    await patientSelect.selectOption({ index: idx });
    await invoiceModal.locator('input.invoice-line-desc').first().fill('Consultation');
    await invoiceModal.locator('input.invoice-line-price').first().fill('1000');
    await invoiceModal.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.locator('.toast').filter({ hasText: /invoice/i }).first()).toBeVisible({ timeout: 20_000 });

    const dueRow = page.locator('.payment-list li').filter({ hasText: patientName }).first();
    await dueRow.click();
    const detail = page.locator('.modal-overlay').filter({ hasText: 'Invoice' });
    await detail.getByRole('button', { name: /record payment/i }).click();
    const paySheet = page.locator('.modal-overlay').filter({ has: page.getByRole('heading', { name: /pay invoice|record payment/i }) });
    await paySheet.locator('select').selectOption({ label: 'UPI' });
    await paySheet.locator('input[type="number"], input[inputmode="numeric"]').first().fill('400');
    await paySheet.getByPlaceholder('UPI txn ID').fill(`UPI-MVP-${suffix}`);
    await paySheet.getByRole('button', { name: /^save$/i }).click();
    await expect(paySheet).toBeHidden({ timeout: 20_000 });

    await detail.getByRole('button', { name: /record payment/i }).click();
    const pay2 = page.locator('.modal-overlay').filter({ has: page.getByRole('heading', { name: /pay invoice|record payment/i }) });
    await pay2.locator('select').selectOption({ label: 'Cash' });
    await pay2.locator('input[type="number"], input[inputmode="numeric"]').first().fill('600');
    await pay2.getByRole('button', { name: /^save$/i }).click();
    await expect(pay2).toBeHidden({ timeout: 20_000 });

    await logoutClinic(page);
    await loginClinicApp(page, 'owner');
    await goToTab(page, 'reports');
    const last7 = page.getByRole('button', { name: /last 7 days/i });
    if (await last7.isVisible().catch(() => false)) await last7.click();
    await expect(page.locator('.reports-summary-big, .reports-preview, .reports-toolbar')).toBeVisible({ timeout: 25_000 });

    const ownerHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.owner.email,
      ROLE_CREDENTIALS.owner.password,
    );
    const cross = await request.get(`${API}/api/patients/${patientId}`, {
      headers: { ...ownerHeaders, 'X-Tenant-Slug': 'not-an-e2e-tenant' },
    });
    expect([403, 404]).toContain(cross.status());

    const fresh = await browser.newPage();
    await loginClinicApp(fresh, 'receptionist');
    await goToTab(fresh, 'patients');
    await fresh.locator('#patient-search, input[type="search"]').first().fill(patientName);
    await expect(fresh.getByText(patientName).first()).toBeVisible({ timeout: 20_000 });

    const recvHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.receptionist.email,
      ROLE_CREDENTIALS.receptionist.password,
    );
    const invRes = await request.get(`${API}/api/clinic/invoices?patientId=${encodeURIComponent(patientId)}`, {
      headers: recvHeaders,
    });
    const invoices = (await invRes.json()).invoices as { status: string; balanceDue: number }[];
    expect(invoices.some((i) => i.status === 'paid' && i.balanceDue === 0)).toBeTruthy();
    await fresh.close();
  });
});
