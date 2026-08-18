import { test, expect } from '@playwright/test';
import { captureStep } from '../helpers/screenshot';

const API = process.env.E2E_API_URL || 'http://localhost:3010';

function nextBookableDate(offsetDays = 3) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  while (d.getDay() === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

test.describe('Public booking API', () => {
  test('lists services without auth', async ({ request }) => {
    const res = await request.get(`${API}/api/platform/tenant/dentacare/booking/services`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.services?.length).toBeGreaterThan(0);
    expect(data.services[0].title).toBeTruthy();
  });

  test('lists available slots for a future date', async ({ request }) => {
    const date = nextBookableDate(2);
    const res = await request.get(`${API}/api/platform/tenant/dentacare/booking/slots?date=${date}`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data.slots)).toBeTruthy();
    expect(data.slots.length).toBeGreaterThan(0);
  });

  test('creates website booking', async ({ request, page }) => {
    const date = nextBookableDate(5);
    const slotsRes = await request.get(`${API}/api/platform/tenant/dentacare/booking/slots?date=${date}`);
    expect(slotsRes.ok()).toBeTruthy();
    const slotsData = await slotsRes.json();
    const slot = slotsData.slots?.find((s: string) => /AM|PM/i.test(s));
    test.skip(!slot, 'No slots available for test date');

    const phone = `9${Date.now().toString().slice(-9)}`;
    const bookRes = await request.post(`${API}/api/platform/tenant/dentacare/booking`, {
      data: {
        name: `Web E2E ${Date.now().toString().slice(-4)}`,
        phone,
        service: 'General Consultation',
        date,
        slot,
      },
    });

    if (!bookRes.ok()) {
      const err = await bookRes.json();
      throw new Error(`Booking failed (${bookRes.status()}): ${JSON.stringify(err)}`);
    }
    expect(bookRes.status()).toBe(201);
    const booked = await bookRes.json();
    expect(booked.appointmentId || booked.ok).toBeTruthy();

    await page.goto('/');
    await captureStep(page, 'api-public-booking-created');
  });
});
