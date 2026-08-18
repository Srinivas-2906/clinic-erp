import { getDb } from '../../db/index.js';
import { parseTimeToMinutes, normalizeTime } from './scheduleValidation.js';
import {
  assertDoctorBelongsToTenant,
  getDefaultDoctorId,
  getDoctorById,
  listDoctors,
} from '../providers/doctors.service.js';
import { listDoctorsForService } from '../providers/doctorServices.service.js';

const ACTIVE_BLOCK_STATUSES = ['requested', 'confirmed', 'arrived', 'visited'];

function dayOfWeekForDate(dateStr) {
  return new Date(`${dateStr}T12:00:00+05:30`).getDay();
}

function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatSlotLabel(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h > 12 ? h - 12 : h === 0 ? 12 : h;
  const min = m ? `:${String(m).padStart(2, '0')}` : '';
  return `${h12}${min} ${period}`;
}

function labelFromMinutes(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return formatSlotLabel(h, m);
}

function rangesOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

function datetimeToMinutesOnDate(iso, dateStr) {
  if (!iso) return null;
  const raw = String(iso);
  const datePart = raw.slice(0, 10);
  if (datePart !== dateStr) return null;
  if (raw.length >= 16 && raw[10] === 'T') {
    return parseTimeToMinutes(raw.slice(11, 16));
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const ist = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false });
  return parseTimeToMinutes(ist);
}

function getDoctorSessionsForDate(doctorId, tenantId, dateStr) {
  const dow = dayOfWeekForDate(dateStr);
  return getDb().prepare(`
    SELECT start_time, end_time, slot_duration_minutes
    FROM doctor_sessions
    WHERE doctor_id = ? AND tenant_id = ? AND day_of_week = ?
    ORDER BY start_time ASC
  `).all(doctorId, tenantId, dow);
}

function getDoctorTimeOffRanges(doctorId, tenantId, dateStr) {
  const dayStart = `${dateStr}T00:00:00`;
  const dayEnd = `${dateStr}T23:59:59`;
  const rows = getDb().prepare(`
    SELECT start_datetime, end_datetime FROM doctor_time_off
    WHERE doctor_id = ? AND tenant_id = ?
      AND start_datetime < ? AND end_datetime > ?
  `).all(doctorId, tenantId, dayEnd, dayStart);

  return rows.map((row) => {
    const start = datetimeToMinutesOnDate(row.start_datetime, dateStr) ?? 0;
    let end = datetimeToMinutesOnDate(row.end_datetime, dateStr);
    if (end == null) end = 24 * 60;
    if (String(row.end_datetime).slice(0, 10) > dateStr) end = 24 * 60;
    if (String(row.start_datetime).slice(0, 10) < dateStr) return { start: 0, end };
    return { start, end };
  });
}

function getBookedRanges(doctorId, tenantId, dateStr, excludeAppointmentId) {
  let sql = `
    SELECT id, scheduled_at, duration_min, assigned_doctor_id
    FROM appointments
    WHERE tenant_id = ? AND date(scheduled_at) = date(?)
      AND status NOT IN ('cancelled', 'no_show')
      AND (assigned_doctor_id = ? OR (assigned_doctor_id IS NULL AND ? = ?))
  `;
  const defaultDoctorId = getDefaultDoctorId(tenantId);
  const params = [tenantId, dateStr, doctorId, doctorId, defaultDoctorId];

  if (excludeAppointmentId) {
    sql += ' AND id != ?';
    params.push(excludeAppointmentId);
  }

  const rows = getDb().prepare(sql).all(...params);
  return rows.map((row) => {
    const start = datetimeToMinutesOnDate(row.scheduled_at, dateStr) ?? 0;
    const duration = Number(row.duration_min) || 30;
    return { start, end: start + duration, id: row.id };
  });
}

function isBlocked(startMin, durationMin, bookedRanges, timeOffRanges, sessionEndMin) {
  const endMin = startMin + durationMin;
  if (endMin > sessionEndMin) return true;

  for (const b of bookedRanges) {
    if (rangesOverlap(startMin, endMin, b.start, b.end)) return true;
  }
  for (const t of timeOffRanges) {
    if (rangesOverlap(startMin, endMin, t.start, t.end)) return true;
  }
  return false;
}

export function getSlotsForDoctor(tenantId, dateStr, doctorId, durationMin = 30, excludeAppointmentId) {
  assertDoctorBelongsToTenant(doctorId, tenantId);

  const sessions = getDoctorSessionsForDate(doctorId, tenantId, dateStr);
  if (!sessions.length) return [];

  const bookedRanges = getBookedRanges(doctorId, tenantId, dateStr, excludeAppointmentId);
  const timeOffRanges = getDoctorTimeOffRanges(doctorId, tenantId, dateStr);
  const slots = [];

  for (const session of sessions) {
    const startMin = parseTimeToMinutes(normalizeTime(session.start_time));
    const endMin = parseTimeToMinutes(normalizeTime(session.end_time));
    const step = Number(session.slot_duration_minutes) || 30;
    if (startMin == null || endMin == null || endMin <= startMin) continue;

    for (let cursor = startMin; cursor + durationMin <= endMin; cursor += step) {
      if (isBlocked(cursor, durationMin, bookedRanges, timeOffRanges, endMin)) continue;
      const time = minutesToTime(cursor);
      slots.push({
        label: labelFromMinutes(cursor),
        time,
        doctorId,
      });
    }
  }

  return slots;
}

function resolveEligibleDoctorIds(tenantId, { doctorId, serviceId, anyAvailable }) {
  if (doctorId) {
    assertDoctorBelongsToTenant(doctorId, tenantId);
    return [doctorId];
  }

  if (serviceId) {
    const ids = listDoctorsForService(tenantId, serviceId);
    return ids.filter((id) => {
      const doc = getDoctorById(id, tenantId);
      return doc && doc.isActive !== false;
    });
  }

  if (anyAvailable) {
    return listDoctors(tenantId).map((d) => d.id);
  }

  const defaultId = getDefaultDoctorId(tenantId);
  return defaultId ? [defaultId] : [];
}

/** Legacy fallback when tenant has no doctor records yet. */
function legacyTenantSlots(tenantId, dateStr, durationMin) {
  const row = getDb().prepare('SELECT settings FROM tenants WHERE id = ?').get(tenantId);
  let sessions = [{ start: 10, end: 15, slotMin: 30 }, { start: 17, end: 22, slotMin: 30 }];
  if (row) {
    try {
      const s = JSON.parse(row.settings || '{}');
      if (Array.isArray(s.clinicSessions) && s.clinicSessions.length) {
        sessions = s.clinicSessions;
      }
    } catch { /* defaults */ }
  }

  const booked = getDb().prepare(`
    SELECT scheduled_at, duration_min FROM appointments
    WHERE tenant_id = ? AND date(scheduled_at) = date(?)
    AND status NOT IN ('cancelled', 'no_show')
  `).all(tenantId, dateStr);

  const bookedRanges = booked.map((b) => {
    const start = datetimeToMinutesOnDate(b.scheduled_at, dateStr) ?? 0;
    const duration = Number(b.duration_min) || 30;
    return { start, end: start + duration };
  });

  const slots = [];
  for (const block of sessions) {
    for (let h = block.start; h < block.end; h++) {
      for (let m = 0; m < 60; m += block.slotMin || 30) {
        const startMin = h * 60 + m;
        const endMin = startMin + durationMin;
        if (endMin > block.end * 60) break;
        let blocked = false;
        for (const b of bookedRanges) {
          if (rangesOverlap(startMin, endMin, b.start, b.end)) { blocked = true; break; }
        }
        if (!blocked) {
          const time = minutesToTime(startMin);
          slots.push({ label: labelFromMinutes(startMin), time, doctorId: null, doctorName: '' });
        }
      }
    }
  }
  return slots;
}

export function getAvailableSlots(tenantId, dateStr, options = {}) {
  const {
    doctorId,
    serviceId,
    anyAvailable = false,
    durationMin = 30,
    excludeAppointmentId,
  } = options;

  const doctorIds = resolveEligibleDoctorIds(tenantId, { doctorId, serviceId, anyAvailable });

  let slotOptions = [];

  if (doctorIds.length) {
    for (const docId of doctorIds) {
      const doc = getDoctorById(docId, tenantId);
      const docSlots = getSlotsForDoctor(tenantId, dateStr, docId, durationMin, excludeAppointmentId);
      for (const slot of docSlots) {
        slotOptions.push({
          ...slot,
          doctorName: doc?.displayName || doc?.name || '',
        });
      }
    }
  } else {
    slotOptions = legacyTenantSlots(tenantId, dateStr, durationMin);
  }

  slotOptions.sort((a, b) => a.time.localeCompare(b.time) || (a.doctorName || '').localeCompare(b.doctorName || ''));

  const uniqueLabels = [];
  const seen = new Set();
  for (const s of slotOptions) {
    if (!seen.has(s.label)) {
      seen.add(s.label);
      uniqueLabels.push(s.label);
    }
  }

  const singleDoctor = doctorIds.length === 1 && !anyAvailable;
  const slots = singleDoctor
    ? slotOptions.map((s) => s.label)
    : uniqueLabels;

  return { slots, slotOptions };
}

export function isSlotAvailable(tenantId, dateStr, slotLabel, options = {}) {
  const result = getAvailableSlots(tenantId, dateStr, options);
  if (options.doctorId) {
    return result.slotOptions.some((s) => s.label === slotLabel && s.doctorId === options.doctorId);
  }
  return result.slotOptions.some((s) => s.label === slotLabel);
}

export function findSlotOption(tenantId, dateStr, slotLabel, options = {}) {
  const result = getAvailableSlots(tenantId, dateStr, options);
  if (options.doctorId) {
    return result.slotOptions.find((s) => s.label === slotLabel && s.doctorId === options.doctorId) || null;
  }
  if (options.anyAvailable) {
    return result.slotOptions.find((s) => s.label === slotLabel) || null;
  }
  return result.slotOptions.find((s) => s.label === slotLabel) || null;
}
