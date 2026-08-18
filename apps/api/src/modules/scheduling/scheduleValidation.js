/** Parse HH:MM or H:MM to minutes since midnight. */
export function parseTimeToMinutes(time) {
  const raw = String(time || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function normalizeTime(time) {
  const mins = parseTimeToMinutes(time);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function blocksOverlap(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Validate session list before save.
 * @throws Error with message
 */
export function validateDoctorSessions(sessions) {
  if (!Array.isArray(sessions)) throw new Error('sessions array required');

  const byDay = new Map();

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const dow = Number(s.dayOfWeek);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) {
      throw new Error(`Session ${i + 1}: dayOfWeek must be 0–6`);
    }

    const startTime = normalizeTime(s.startTime);
    const endTime = normalizeTime(s.endTime);
    if (!startTime || !endTime) {
      throw new Error(`Session ${i + 1}: use valid times like 10:00`);
    }

    const startMin = parseTimeToMinutes(startTime);
    const endMin = parseTimeToMinutes(endTime);
    if (endMin <= startMin) {
      const day = DAY_NAMES[dow] ?? `Day ${dow}`;
      throw new Error(`${day}: end time must be after start time (${startTime}–${endTime})`);
    }

    const slotMin = Number(s.slotDurationMinutes ?? 30);
    if (!Number.isFinite(slotMin) || slotMin < 5 || slotMin > 240) {
      throw new Error(`Session ${i + 1}: slot duration must be 5–240 minutes`);
    }

    const block = { startMin, endMin, startTime, endTime, index: i };
    const list = byDay.get(dow) || [];
    for (const other of list) {
      if (blocksOverlap(block.startMin, block.endMin, other.startMin, other.endMin)) {
        const day = DAY_NAMES[dow] ?? `Day ${dow}`;
        throw new Error(`${day}: overlapping hours (${other.startTime}–${other.endTime} and ${startTime}–${endTime})`);
      }
    }
    list.push(block);
    byDay.set(dow, list);
  }

  return sessions.map((s) => ({
    dayOfWeek: Number(s.dayOfWeek),
    startTime: normalizeTime(s.startTime),
    endTime: normalizeTime(s.endTime),
    slotDurationMinutes: Number(s.slotDurationMinutes ?? 30),
    locationId: s.locationId || null,
  }));
}
