import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeaseTransition } from './writerLease.js';

describe('writerLease concurrent ownership claims', () => {
  const t0 = Date.parse('2026-01-15T10:00:00.000Z');

  it('two simultaneous holders — exactly one may transition to hold (second denied)', () => {
    const existing = {
      holderId: 'rev-a:inst-1',
      fence: 7,
      expiresAt: '2026-01-15T10:02:00.000Z',
    };
    const holderA = evaluateLeaseTransition(existing, 'rev-a:inst-1', t0);
    const holderB = evaluateLeaseTransition(existing, 'rev-b:inst-2', t0);
    assert.equal(holderA.action, 'renew');
    assert.equal(holderB.action, 'deny');
    assert.equal(holderB.reason, 'held-by-other');
  });

  it('empty lease — both see create; GCS ifGenerationMatch:0 ensures one 412 loser', () => {
    const a = evaluateLeaseTransition(null, 'rev-a:i1', t0);
    const b = evaluateLeaseTransition(null, 'rev-b:i2', t0);
    assert.equal(a.action, 'create');
    assert.equal(b.action, 'create');
    assert.equal(a.fence, 1);
    assert.equal(b.fence, 1);
  });
});
