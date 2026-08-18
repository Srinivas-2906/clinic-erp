import { getCatalogItems } from '../db/index.js';
import { createAppointment, getAvailableSlots } from './clinicStore.js';
import { findSlotOption } from '../modules/scheduling/slotEngine.js';
import { logAudit } from './clinicAudit.js';
import { createRateLimiter } from '../utils/rateLimiter.js';

const checkBookingRateLimit = createRateLimiter({
  max: Number(process.env.BOOKING_RATE_MAX || 20),
  windowMs: Number(process.env.BOOKING_RATE_WINDOW_MS || 60 * 60 * 1000),
});

export { checkBookingRateLimit };

function normalizePhoneDigits(input) {
  const digits = String(input ?? '').replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return null;
}

export function parseSlotLabel(label) {
  const m = String(label).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || '0');
  const period = (m[3] || '').toUpperCase();
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function buildScheduledAt(dateStr, slotLabel) {
  const time = parseSlotLabel(slotLabel);
  if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return `${dateStr}T${time}:00`;
}

function clinicLocalDate() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function isSunday(dateStr) {
  const d = new Date(`${dateStr}T12:00:00+05:30`);
  return d.getDay() === 0;
}

function isPastDate(dateStr) {
  return dateStr < clinicLocalDate();
}

export function listPublicServices(tenantId) {
  return getCatalogItems(tenantId)
    .filter((item) => {
      const status = String(item.status || '').toLowerCase();
      return !status || !['inactive', 'disabled', 'archived'].includes(status);
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      subtitle: item.subtitle || '',
      category: item.category || '',
    }));
}

export function listPublicSlots(tenantId, dateStr, options = {}) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Valid date required (YYYY-MM-DD)');
  }
  if (isSunday(dateStr)) return { date: dateStr, slots: [], slotOptions: [], closed: true };
  if (isPastDate(dateStr)) throw new Error('Cannot book a past date');
  const result = getAvailableSlots(tenantId, dateStr, {
    doctorId: options.doctorId,
    serviceId: options.serviceId,
    anyAvailable: options.anyAvailable ?? !options.doctorId,
    durationMin: options.durationMin,
    returnDetails: true,
  });
  return { date: dateStr, slots: result.slots, slotOptions: result.slotOptions, closed: false };
}

export function submitPublicBooking(tenantId, body) {
  const honeypot = String(body?._hp ?? body?.website ?? '').trim();
  if (honeypot) {
    throw new Error('Invalid submission');
  }

  const name = String(body?.name ?? '').trim();
  const phone = normalizePhoneDigits(body?.phone);
  const service = String(body?.service ?? body?.reason ?? '').trim();
  const date = String(body?.date ?? '').trim();
  const slot = String(body?.slot ?? body?.time ?? '').trim();
  const notes = String(body?.notes ?? body?.msg ?? '').trim();

  if (!name || name.length < 2) throw new Error('Name is required');
  if (!phone) throw new Error('Valid 10-digit phone number required');
  if (!service) throw new Error('Please select a reason for visit');
  if (!date) throw new Error('Preferred date is required');
  if (isSunday(date)) throw new Error('Clinic is closed on Sundays');
  if (isPastDate(date)) throw new Error('Cannot book a past date');

  const scheduledAt = slot ? buildScheduledAt(date, slot) : `${date}T10:00:00`;
  if (!scheduledAt) throw new Error('Please pick a valid time slot');

  let assignedDoctorId;
  if (slot) {
    const match = findSlotOption(tenantId, date, slot, { anyAvailable: true });
    if (!match) throw new Error('That time slot is no longer available');
    assignedDoctorId = match.doctorId;
  }

  const appt = createAppointment(tenantId, {
    phone,
    patientName: name,
    service,
    scheduledAt,
    notes: notes || undefined,
    status: 'requested',
    source: 'Website',
    chiefComplaint: service,
    assignedDoctorId: slot ? assignedDoctorId : undefined,
  });

  logAudit(tenantId, null, 'create', 'appointment', appt.id, {
    source: 'website-booking',
    service,
    scheduledAt,
  });

  return {
    ok: true,
    appointmentId: appt.id,
    scheduledAt: appt.scheduledAt,
    message: 'Request received. The clinic will confirm your appointment shortly.',
  };
}
