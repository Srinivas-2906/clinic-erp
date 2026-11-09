import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeaseTransition, parseLeasePayload } from './writerLease.js';

describe('writerLease.evaluateLeaseTransition', () => {
  const now = Date.parse('2026-01-01T12:00:00.000Z');

  it('creates when no lease', () => {
    const d = evaluateLeaseTransition(null, 'rev-a:inst-1', now);
    assert.equal(d.action, 'create');
    assert.equal(d.fence, 1);
  });

  it('renews same holder', () => {
    const existing = {
      holderId: 'rev-a:inst-1',
      fence: 3,
      expiresAt: '2026-01-01T12:05:00.000Z',
    };
    const d = evaluateLeaseTransition(existing, 'rev-a:inst-1', now);
    assert.equal(d.action, 'renew');
    assert.equal(d.fence, 3);
  });

  it('denies different holder while lease valid', () => {
    const existing = {
      holderId: 'rev-a:inst-1',
      fence: 3,
      expiresAt: '2026-01-01T12:05:00.000Z',
    };
    const d = evaluateLeaseTransition(existing, 'rev-b:inst-2', now);
    assert.equal(d.action, 'deny');
    assert.equal(d.reason, 'held-by-other');
  });

  it('steals after expiry with incremented fence', () => {
    const existing = {
      holderId: 'rev-a:inst-1',
      fence: 3,
      expiresAt: '2026-01-01T11:00:00.000Z',
    };
    const d = evaluateLeaseTransition(existing, 'rev-b:inst-2', now);
    assert.equal(d.action, 'steal');
    assert.equal(d.fence, 4);
  });
});

describe('writerLease.parseLeasePayload', () => {
  it('parses valid JSON', () => {
    const p = parseLeasePayload(Buffer.from(JSON.stringify({
      holderId: 'x:y',
      fence: 2,
      acquiredAt: 't1',
      expiresAt: 't2',
    })));
    assert.equal(p.holderId, 'x:y');
    assert.equal(p.fence, 2);
  });
});
