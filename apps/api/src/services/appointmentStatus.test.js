import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertAppointmentStatusTransition } from './appointmentStatus.js';

describe('appointment status transitions', () => {
  it('allows queue progression', () => {
    assert.doesNotThrow(() => assertAppointmentStatusTransition('requested', 'confirmed'));
    assert.doesNotThrow(() => assertAppointmentStatusTransition('confirmed', 'arrived'));
    assert.doesNotThrow(() => assertAppointmentStatusTransition('arrived', 'visited'));
  });

  it('blocks skipping arrived', () => {
    assert.throws(
      () => assertAppointmentStatusTransition('confirmed', 'visited'),
      (e) => e.status === 409,
    );
  });

  it('blocks reopening terminal states', () => {
    assert.throws(
      () => assertAppointmentStatusTransition('visited', 'arrived'),
      (e) => e.status === 409,
    );
  });
});
