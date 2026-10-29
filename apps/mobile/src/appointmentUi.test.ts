import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { queueActionLabel, QUEUE_NEXT, statusLabel } from './appointmentUi';

describe('appointmentUi', () => {
  it('maps queue actions for reception check-in', () => {
    assert.equal(queueActionLabel('requested'), 'Confirm');
    assert.equal(queueActionLabel('confirmed'), 'Check in');
    assert.equal(QUEUE_NEXT.confirmed, 'arrived');
  });

  it('labels appointment statuses', () => {
    assert.equal(statusLabel('arrived'), 'Arrived');
    assert.equal(statusLabel('no_show'), 'No show');
  });
});
