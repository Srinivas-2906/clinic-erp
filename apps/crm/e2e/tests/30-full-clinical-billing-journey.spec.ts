import { test, expect } from '@playwright/test';
import { goToTab } from '../helpers/navigation';
import { advanceQueueToConsult } from '../helpers/queue';
import { loginClinicApp, ROLE_CREDENTIALS } from '../fixtures/roles.fixture';
import { E2E_CREDENTIALS } from '../fixtures/auth.fixture';
import { authHeaders } from '../helpers/clinicApi';

const API = process.env.E2E_API_URL || 'http://127.0.0.1:3010';
const TENANT = E2E_CREDENTIALS.tenant;

async function dismissPilotBanner(page: import('@playwright/test').Page) {
  const dismiss = page.getByRole('button', { name: 'Dismiss checklist' });
  if (await dismiss.isVisible().catch(() => false)) {
    await dismiss.click();
  }
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

async function openAddPatientDialog(page: import('@playwright/test').Page) {
  const headerBtn = page.locator('.patients-header-actions .add-patient-btn');
  if (await headerBtn.isVisible().catch(() => false)) {
    await headerBtn.click();
    return;
  }
  await page.locator('button.fab[aria-label="Add patient"]').click();
}

function appointmentCard(page: import('@playwright/test').Page, patientLabel: string) {
  return page.locator('.appt-card, .board-card').filter({ hasText: patientLabel }).first();
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

test.describe('Full clinical → billing journey', () => {
  test('register through payment with role handoffs', async ({ page, request }) => {
    const suffix = Date.now().toString().slice(-7);
    const name = `Journey ${suffix}`;
    const phone = `9${suffix.padStart(9, '0').slice(0, 9)}`;
    let patientId = '';
    let appointmentId = '';

    await loginClinicApp(page, 'receptionist');
    await dismissPilotBanner(page);

    await goToTab(page, 'patients');
    await openAddPatientDialog(page);
    await page.getByPlaceholder('Patient name').fill(name);
    await page.getByPlaceholder('10-digit mobile').fill(phone);
    await page.getByPlaceholder('e.g. 32').fill('30');
    const patientCreate = page.waitForResponse(
      (r) => r.url().includes('/api/patients') && r.request().method() === 'POST' && r.ok(),
      { timeout: 25_000 },
    );
    await page.locator('.modal-footer').getByRole('button', { name: 'Add patient' }).click();
    const patientRes = await patientCreate;
    patientId = (await patientRes.json()).id;
    expect(patientId).toBeTruthy();
    await expect(page.getByText(name).first()).toBeVisible({ timeout: 15_000 });

    await goToTab(page, 'book');
    const e2eDoctorLabel = await e2eLinkedDoctorLabel(request);
    const e2eDoctorPattern = new RegExp(escapeRegex(e2eDoctorLabel), 'i');
    await page.getByRole('tab', { name: /walk-in now/i }).click();
    await page.locator('#book-search').fill(phone);
    await expect(page.getByRole('button', { name: /continue booking/i })).toBeVisible({ timeout: 20_000 });
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
    const apptRes = await apptCreate;
    appointmentId = (await apptRes.json()).id;
    expect(appointmentId).toBeTruthy();

    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    const card = appointmentCard(page, name);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return card.isVisible();
    }, { timeout: 30_000 }).toBe(true);
    // Walk-in booking already sets status to arrived.

    await logoutClinic(page);
    await loginClinicApp(page, 'doctor');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return appointmentCard(page, name).isVisible();
    }, { timeout: 30_000 }).toBe(true);

    const encounterReady = page.waitForResponse(
      (r) => r.url().includes('/encounters') && ['POST', 'GET'].includes(r.request().method()) && r.ok(),
      { timeout: 25_000 },
    );
    await advanceQueueToConsult(page, name);
    await encounterReady;

    const consultModal = page.locator('.modal-overlay').filter({ has: page.locator('#consult-complaint') });
    await expect(consultModal.locator('#consult-complaint')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Loading consultation…')).toBeHidden({ timeout: 20_000 });

    await consultModal.locator('#consult-complaint').fill('Routine check');
    const saveDraft = consultModal.getByRole('button', { name: /save draft/i });
    await saveDraft.scrollIntoViewIfNeeded();
    await saveDraft.click();
    const errToast = page.locator('.toast-err');
    await expect(page.getByText(/consultation saved/i).or(errToast)).toBeVisible({ timeout: 20_000 });
    if (await errToast.isVisible().catch(() => false)) {
      throw new Error(`Save draft failed: ${(await errToast.innerText()).trim()}`);
    }

    await consultModal.locator('#consult-diagnosis').fill('Healthy');
    await consultModal.getByPlaceholder('Medicine').first().fill('Vitamin D');
    await consultModal.getByPlaceholder('Dose').first().fill('1 tab');
    const finalizeBtn = page.getByRole('button', { name: /finalize visit/i });
    await finalizeBtn.scrollIntoViewIfNeeded();
    await expect(finalizeBtn).toBeEnabled({ timeout: 10_000 });
    await finalizeBtn.click();
    await expect(page.locator('#consult-complaint')).toHaveCount(0, { timeout: 25_000 });
    const skipBilling = page.getByRole('button', { name: /continue without billing/i });
    if (await skipBilling.isVisible().catch(() => false)) {
      await skipBilling.click();
    }

    await logoutClinic(page);
    await loginClinicApp(page, 'receptionist');
    await goToTab(page, 'today');
    await dismissPilotBanner(page);
    await expect.poll(async () => {
      await page.getByRole('button', { name: 'Refresh' }).first().click();
      return appointmentCard(page, name).isVisible();
    }, { timeout: 30_000 }).toBe(true);

    const visitedCard = appointmentCard(page, name);
    await visitedCard.locator('button[title="Actions"], button.quick-action-btn').last().click();
    await page.getByRole('button', { name: /billing for this visit/i }).click();
    await expect(page.getByTestId('visit-billing-handoff')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /create invoice/i }).click();
    await page.getByPlaceholder('Description').fill('Consultation fee');
    await page.locator('.modal-overlay input.invoice-line-price').first().fill('1200');
    await page.getByRole('button', { name: /create invoice/i }).click();
    await expect(page.locator('.toast').filter({ hasText: /invoice ready|invoice created/i }).first()).toBeVisible({ timeout: 20_000 });

    const invoiceDetail = page.locator('.modal-overlay').filter({ hasText: 'Invoice' });
    await invoiceDetail.getByRole('button', { name: /record payment/i }).click();
    const paySheet = page.locator('.modal-overlay').filter({ has: page.getByRole('heading', { name: /pay invoice|record payment/i }) });
    await paySheet.locator('input[type="number"], input[inputmode="numeric"]').first().fill('1200');
    await paySheet.getByRole('button', { name: /^save$/i }).click();
    await expect(paySheet).toBeHidden({ timeout: 20_000 });

    const recvHeaders = await authHeaders(
      request,
      API,
      TENANT,
      ROLE_CREDENTIALS.receptionist.email,
      ROLE_CREDENTIALS.receptionist.password,
    );
    const detailRes = await request.get(`${API}/api/patients/${encodeURIComponent(patientId)}`, { headers: recvHeaders });
    expect(detailRes.ok()).toBeTruthy();
    const detail = await detailRes.json();
    const apptRow = (detail.appointments || []).find((a: { id: string }) => a.id === appointmentId);
    expect(apptRow?.status).toBe('visited');
    const enc = (detail.encounters || []).find((e: { appointmentId?: string; status: string }) => e.appointmentId === appointmentId);
    expect(enc?.status).toBe('finalized');

    const invList = await request.get(`${API}/api/clinic/invoices?patientId=${encodeURIComponent(patientId)}`, {
      headers: recvHeaders,
    });
    expect(invList.ok()).toBeTruthy();
    const invoices = (await invList.json()).invoices as { appointmentId?: string; status: string; balanceDue: number }[];
    const visitInv = invoices.find((i) => i.appointmentId === appointmentId);
    expect(visitInv).toBeTruthy();
    expect(visitInv!.status).toBe('paid');
    expect(visitInv!.balanceDue).toBe(0);
  });
});
