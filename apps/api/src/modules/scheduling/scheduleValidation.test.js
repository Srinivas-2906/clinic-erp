import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDoctorSessions, parseTimeToMinutes, normalizeTime } from '../scheduling/scheduleValidation.js';

describe('scheduleValidation', () => {
  it('normalizes time strings', () => {
    assert.equal(normalizeTime('9:00'), '09:00');
    assert.equal(parseTimeToMinutes('10:30'), 630);
  });

  it('accepts valid non-overlapping sessions', () => {
    const result = validateDoctorSessions([
      { dayOfWeek: 1, startTime: '10:00', endTime: '15:00', slotDurationMinutes: 30 },
      { dayOfWeek: 1, startTime: '17:00', endTime: '22:00', slotDurationMinutes: 30 },
    ]);
    assert.equal(result.length, 2);
  });

  it('rejects overlapping sessions on same day', () => {
    assert.throws(
      () => validateDoctorSessions([
        { dayOfWeek: 1, startTime: '10:00', endTime: '14:00' },
        { dayOfWeek: 1, startTime: '13:00', endTime: '18:00' },
      ]),
      /overlapping/i,
    );
  });

  it('rejects end before start', () => {
    assert.throws(
      () => validateDoctorSessions([
        { dayOfWeek: 2, startTime: '15:00', endTime: '10:00' },
      ]),
      /after start/i,
    );
  });

  it('allows same time slot on different days', () => {
    const result = validateDoctorSessions([
      { dayOfWeek: 1, startTime: '10:00', endTime: '15:00' },
      { dayOfWeek: 2, startTime: '10:00', endTime: '15:00' },
    ]);
    assert.equal(result.length, 2);
  });
});
