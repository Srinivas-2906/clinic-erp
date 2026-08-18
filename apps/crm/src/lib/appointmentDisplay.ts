const CLINIC_TZ = 'Asia/Kolkata';

export function clinicTodayYmd(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

export function apptDayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function isApptToday(iso: string): boolean {
  return apptDayKey(iso) === clinicTodayYmd();
}

export function isApptTomorrow(iso: string): boolean {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return apptDayKey(iso) === d.toLocaleDateString('en-CA', { timeZone: CLINIC_TZ });
}

export function isSameYmd(a: string, b: string): boolean {
  return a === b;
}

export function ymdFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthStartYmd(year: number, monthIndex: number): string {
  return ymdFromParts(year, monthIndex + 1, 1);
}

export function monthEndYmd(year: number, monthIndex: number): string {
  const last = new Date(year, monthIndex + 1, 0).getDate();
  return ymdFromParts(year, monthIndex + 1, last);
}

/** Monday-first month grid cells (null = padding). */
export function buildMonthGrid(year: number, monthIndex: number): (string | null)[] {
  const first = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const startPad = (first.getDay() + 6) % 7;
  const cells: (string | null)[] = [];
  for (let i = 0; i < startPad; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(ymdFromParts(year, monthIndex + 1, d));
  }
  return cells;
}

export function formatMonthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
    timeZone: CLINIC_TZ,
  });
}

export function formatScheduleHeader(ymd: string): string {
  if (ymd === clinicTodayYmd()) {
    return `Today · ${formatTodayHeader()}`;
  }
  const d = new Date(`${ymd}T12:00:00`);
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: CLINIC_TZ,
  });
}

export function formatDateFull(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: CLINIC_TZ,
  });
}

export function formatDateTimeFull(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CLINIC_TZ,
  });
}

/** Short day label — Today, Tomorrow, or Wed 30 Jul */
export function formatApptDayLabel(iso: string): string {
  if (isApptToday(iso)) return 'Today';
  if (isApptTomorrow(iso)) return 'Tomorrow';
  return new Date(iso).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

export function formatApptTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: CLINIC_TZ,
  });
}

/** Day + time for lists — e.g. "Tomorrow · 10:00 AM" */
export function formatApptWhen(iso: string): string {
  return `${formatApptDayLabel(iso)} · ${formatApptTime(iso)}`;
}

export function formatTodayHeader(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: CLINIC_TZ,
  });
}
