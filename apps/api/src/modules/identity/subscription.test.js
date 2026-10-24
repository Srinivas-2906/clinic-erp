import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSubscriptionTransition,
  SUBSCRIPTION_STATUS,
  canWriteTenantSubscription,
} from './subscription.js';

describe('subscription lifecycle', () => {
  it('allows trialing to active', () => {
    assert.equal(
      assertSubscriptionTransition(SUBSCRIPTION_STATUS.TRIALING, SUBSCRIPTION_STATUS.ACTIVE),
      SUBSCRIPTION_STATUS.ACTIVE,
    );
  });

  it('rejects canceled to past_due', () => {
    assert.throws(
      () => assertSubscriptionTransition(SUBSCRIPTION_STATUS.CANCELED, SUBSCRIPTION_STATUS.PAST_DUE),
      (err) => err.code === 'INVALID_SUBSCRIPTION_TRANSITION',
    );
  });

  it('past_due is not writable', () => {
    assert.equal(canWriteTenantSubscription(SUBSCRIPTION_STATUS.PAST_DUE), false);
  });
});
