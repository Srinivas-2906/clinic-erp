import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Logic mirrored from writerLeaseGuard (no GCS)
function localMatchesRemote(localHolder, localFence, remote) {
  if (!remote) return { ok: false, reason: 'remote-lease-missing' };
  if (remote.holderId !== localHolder || remote.fence !== localFence) {
    return { ok: false, reason: 'lease-ownership-lost' };
  }
  const expiresMs = Date.parse(remote.expiresAt);
  if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
    return { ok: false, reason: 'lease-expired' };
  }
  return { ok: true };
}

describe('writerLeaseGuard ownership', () => {
  it('stale owner after takeover fails', () => {
    const local = { holder: 'rev-old:inst-1', fence: 2 };
    const remote = {
      holderId: 'rev-new:inst-2',
      fence: 3,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const v = localMatchesRemote(local.holder, local.fence, remote);
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'lease-ownership-lost');
  });

  it('valid holder matches', () => {
    const holder = 'rev-a:i1';
    const remote = {
      holderId: holder,
      fence: 5,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    assert.equal(localMatchesRemote(holder, 5, remote).ok, true);
  });

  it('expired remote fails even if holder matches', () => {
    const holder = 'rev-a:i1';
    const remote = {
      holderId: holder,
      fence: 5,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    };
    const v = localMatchesRemote(holder, 5, remote);
    assert.equal(v.ok, false);
    assert.equal(v.reason, 'lease-expired');
  });
});
