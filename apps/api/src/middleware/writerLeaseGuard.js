import { WriterLeaseClient, writerLeaseRequiredFromEnv, buildHolderId } from '../infra/writerLease.js';

let client = null;

function getClient() {
  const bucket = process.env.CLINIC_WRITER_LEASE_BUCKET || process.env.LITESTREAM_BUCKET;
  if (!bucket) return null;
  if (!client) client = new WriterLeaseClient({ bucket });
  return client;
}

/**
 * Returns whether this process still owns the remote lease (holder + fence).
 * Does not fence Litestream itself; stops API writes when ownership is lost.
 */
export async function verifyProcessOwnsRemoteLease() {
  if (!writerLeaseRequiredFromEnv()) return { ok: true, skipped: true };
  const localHolder = process.env.CLINIC_WRITER_LEASE_HOLDER || buildHolderId();
  const localFence = Number(process.env.CLINIC_WRITER_LEASE_FENCE);
  if (!localHolder || Number.isNaN(localFence)) {
    return { ok: false, reason: 'local-lease-state-missing' };
  }
  const c = getClient();
  if (!c) return { ok: false, reason: 'no-lease-client' };
  const remote = await c.readLease();
  if (!remote) return { ok: false, reason: 'remote-lease-missing' };
  if (remote.holderId !== localHolder || remote.fence !== localFence) {
    return {
      ok: false,
      reason: 'lease-ownership-lost',
      localHolder,
      localFence,
      remoteHolder: remote.holderId,
      remoteFence: remote.fence,
    };
  }
  const expiresMs = Date.parse(remote.expiresAt);
  if (!Number.isNaN(expiresMs) && expiresMs <= Date.now()) {
    return { ok: false, reason: 'lease-expired' };
  }
  return { ok: true, holderId: localHolder, fence: localFence };
}

export function writerLeaseGuardMiddleware() {
  return async (req, res, next) => {
    if (!writerLeaseRequiredFromEnv()) return next();
    try {
      const v = await verifyProcessOwnsRemoteLease();
      if (!v.ok) {
        console.error('[writer-lease] request blocked', JSON.stringify(v));
        return res.status(503).json({ error: 'writer-lease-invalid', reason: v.reason });
      }
      return next();
    } catch (err) {
      console.error('[writer-lease] verify error', err.message || err);
      return res.status(503).json({ error: 'writer-lease-verify-failed' });
    }
  };
}
