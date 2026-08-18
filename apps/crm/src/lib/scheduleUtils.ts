import type { DoctorSession } from '../types';

export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ScheduleBlock {
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

export interface DaySchedule {
  dayOfWeek: number;
  enabled: boolean;
  blocks: ScheduleBlock[];
}

export function parseTimeToMinutes(time: string): number | null {
  const raw = String(time || '').trim();
  const m = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

export function normalizeTime(time: string): string | null {
  const mins = parseTimeToMinutes(time);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function blocksOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

export function validateScheduleDraft(days: DaySchedule[]): string | null {
  for (const day of days) {
    if (!day.enabled) continue;
    const label = DAY_NAMES[day.dayOfWeek] ?? `Day ${day.dayOfWeek}`;
    if (!day.blocks.length) return `${label}: add at least one time block or turn off the day`;

    const sorted = [...day.blocks];
    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      const start = normalizeTime(b.startTime);
      const end = normalizeTime(b.endTime);
      if (!start || !end) return `${label}: use valid times like 10:00`;
      const startMin = parseTimeToMinutes(start)!;
      const endMin = parseTimeToMinutes(end)!;
      if (endMin <= startMin) return `${label}: end time must be after start time`;

      for (let j = i + 1; j < sorted.length; j++) {
        const o = sorted[j];
        const oStart = normalizeTime(o.startTime);
        const oEnd = normalizeTime(o.endTime);
        if (!oStart || !oEnd) continue;
        const oStartMin = parseTimeToMinutes(oStart)!;
        const oEndMin = parseTimeToMinutes(oEnd)!;
        if (blocksOverlap(startMin, endMin, oStartMin, oEndMin)) {
          return `${label}: overlapping hours`;
        }
      }
    }
  }
  return null;
}

export function sessionsToDaySchedules(
  sessions: DoctorSession[],
  defaultSlotMin = 30,
): DaySchedule[] {
  const byDay = new Map<number, ScheduleBlock[]>();
  for (const s of sessions) {
    const list = byDay.get(s.dayOfWeek) || [];
    list.push({
      startTime: s.startTime,
      endTime: s.endTime,
      slotDurationMinutes: s.slotDurationMinutes ?? defaultSlotMin,
    });
    byDay.set(s.dayOfWeek, list);
  }

  return DAY_ORDER.map((dow) => {
    const blocks = byDay.get(dow);
    return {
      dayOfWeek: dow,
      enabled: Boolean(blocks?.length),
      blocks: blocks?.length
        ? blocks
        : [{ startTime: '10:00', endTime: '15:00', slotDurationMinutes: defaultSlotMin }],
    };
  });
}

export function daySchedulesToSessions(days: DaySchedule[]): Omit<DoctorSession, 'id' | 'tenantId' | 'doctorId' | 'createdAt' | 'updatedAt'>[] {
  const out: Omit<DoctorSession, 'id' | 'tenantId' | 'doctorId' | 'createdAt' | 'updatedAt'>[] = [];
  for (const day of days) {
    if (!day.enabled) continue;
    for (const block of day.blocks) {
      out.push({
        dayOfWeek: day.dayOfWeek,
        startTime: normalizeTime(block.startTime) || block.startTime,
        endTime: normalizeTime(block.endTime) || block.endTime,
        slotDurationMinutes: block.slotDurationMinutes || 30,
      });
    }
  }
  return out;
}

/** Mon–Sat morning + evening blocks matching Denta Care defaults. */
export function standardClinicDaySchedules(defaultSlotMin = 30): DaySchedule[] {
  const workDays = [1, 2, 3, 4, 5, 6];
  return DAY_ORDER.map((dow) => ({
    dayOfWeek: dow,
    enabled: workDays.includes(dow),
    blocks: workDays.includes(dow)
      ? [
          { startTime: '10:00', endTime: '15:00', slotDurationMinutes: defaultSlotMin },
          { startTime: '17:00', endTime: '22:00', slotDurationMinutes: defaultSlotMin },
        ]
      : [{ startTime: '10:00', endTime: '15:00', slotDurationMinutes: defaultSlotMin }],
  }));
}

export function formatTime12(time: string) {
  const [hStr, mStr] = time.split(':');
  let h = Number(hStr);
  const m = Number(mStr || 0);
  const period = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return m ? `${h}:${String(m).padStart(2, '0')} ${period}` : `${h} ${period}`;
}

export function summarizeSchedule(sessions: DoctorSession[]) {
  if (!sessions.length) return 'No schedule set';
  const byDay = new Map<number, DoctorSession[]>();
  for (const s of sessions) {
    const list = byDay.get(s.dayOfWeek) || [];
    list.push(s);
    byDay.set(s.dayOfWeek, list);
  }
  const parts: string[] = [];
  for (const dow of DAY_ORDER) {
    const blocks = byDay.get(dow);
    if (!blocks?.length) continue;
    const label = DAY_NAMES[dow];
    const times = blocks.map((b) => `${formatTime12(b.startTime)}–${formatTime12(b.endTime)}`).join(', ');
    parts.push(`${label} ${times}`);
  }
  return parts.length ? parts.join(' · ') : 'No schedule set';
}
