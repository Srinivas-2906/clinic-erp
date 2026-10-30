import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scheduledAtFromDateAndSlot, slotTimeFromOption } from './slots';

describe('slots', () => {
  it('parses AM/PM labels', () => {
    assert.equal(slotTimeFromOption({ label: '2:30 PM' }), '14:30');
    assert.equal(slotTimeFromOption({ label: '10:00 AM' }), '10:00');
  });

  it('builds scheduledAt with clinic offset', () => {
    const iso = scheduledAtFromDateAndSlot('2026-10-30', { label: '11:00 AM', time: '11:00' });
    assert.equal(iso, '2026-10-30T11:00:00+05:30');
  });
});
