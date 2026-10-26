import { afterEach, describe, expect, it, vi } from 'vitest';
import { clinicNowIsoLocal, clinicTodayYmd } from './appointmentDisplay';

/** Test helper — clinic calendar date for a UTC instant (same TZ as production). */
function clinicYmdFromInstant(isoUtc: string) {
  return new Date(isoUtc).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

describe('clinic timezone helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('clinicNowIsoLocal date matches clinicTodayYmd for the same instant', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15T20:30:00.000Z')); // 02:00 IST on 16th
    const iso = clinicNowIsoLocal();
    expect(iso).toMatch(/^2026-03-16T02:00:00$/);
    expect(iso.slice(0, 10)).toBe(clinicTodayYmd());
  });

  it('IST midnight boundary: UTC evening maps to next clinic calendar day', () => {
    expect(clinicYmdFromInstant('2026-01-15T18:29:59.000Z')).toBe('2026-01-15');
    expect(clinicYmdFromInstant('2026-01-15T18:30:00.000Z')).toBe('2026-01-16');
  });

  it('walk-in style timestamp has no timezone suffix (SQLite date() stable)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T00:15:00.000Z'));
    const iso = clinicNowIsoLocal();
    expect(iso).not.toMatch(/Z|[+-]\d{2}:/);
    expect(iso).toBe('2026-07-01T05:45:00');
  });
});
