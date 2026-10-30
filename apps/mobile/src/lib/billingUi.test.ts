import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatRs, invoiceStatusLabel, newIdempotencyKey } from './billingUi.js';

describe('billingUi', () => {
  it('formats rupees', () => {
    assert.match(formatRs(1500), /₹/);
  });

  it('labels invoice status', () => {
    assert.equal(invoiceStatusLabel('partial'), 'Partial');
    assert.equal(invoiceStatusLabel('open'), 'Unpaid');
  });

  it('builds idempotency keys', () => {
    const k = newIdempotencyKey('pay');
    assert.ok(k.startsWith('pay-'));
  });
});
