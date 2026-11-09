import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeaseTransition } from './writerLease.js';

describe('writerLease fault scenarios', () => {
  const base = '2026-06-01T12:00:00.000Z';
  const now = Date.parse(base);

  it('simultaneous acquire — second holder denied while valid', () => {
    const existing = {
      holderId: 'rev-a:i1',
      fence: 2,
      expiresAt: '2026-06-01T12:02:00.000Z',
    };
    const d = evaluateLeaseTransition(existing, 'rev-b:i2', now);
    assert.equal(d.action, 'deny');
  });

  it('renewal failure — steal after TTL (clock at expiry boundary)', () => {
    const existing = {
      holderId: 'rev-a:i1',
      fence: 5,
      expiresAt: base,
    };
    const d = evaluateLeaseTransition(existing, 'rev-b:i2', now);
    assert.equal(d.action, 'steal');
    assert.equal(d.fence, 6);
  });

  it('clock skew — holder thinks time is early, remote already expired at real now', () => {
    const skewedNow = Date.parse('2026-06-01T11:59:00.000Z');
    const existing = {
      holderId: 'rev-a:i1',
      fence: 1,
      expiresAt: base,
    };
    const d = evaluateLeaseTransition(existing, 'rev-a:i1', skewedNow);
    assert.equal(d.action, 'renew');
  });

  it('stale owner steal uses higher fence', () => {
    const existing = {
      holderId: 'old:i1',
      fence: 10,
      expiresAt: '2026-06-01T11:00:00.000Z',
    };
    const d = evaluateLeaseTransition(existing, 'new:i2', now);
    assert.equal(d.fence, 11);
  });
});
