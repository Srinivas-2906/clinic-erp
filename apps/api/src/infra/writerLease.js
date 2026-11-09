/**
 * GCS-backed writer lease with generation preconditions (atomic create / conditional update).
 * Used so at most one Cloud Run instance may run Litestream replicate against a bucket.
 *
 * Not a substitute for maintenance-window deploys when overlapping revisions exist; both layers
 * are recommended for production.
 */
import { Storage } from '@google-cloud/storage';

export const LEASE_OBJECT_PATH = '_meta/writer-lease.json';
export const DEFAULT_LEASE_TTL_MS = 60_000;
export const DEFAULT_RENEW_INTERVAL_MS = 20_000;

export function buildHolderId() {
  const revision = process.env.K_REVISION || 'local';
  const instance = process.env.HOSTNAME
    || process.env.K_INSTANCE
    || process.env.CLOUD_RUN_JOB
    || revision;
  return `${revision}:${instance}`;
}

export function parseLeasePayload(buf) {
  if (!buf || buf.length === 0) return null;
  try {
    const raw = JSON.parse(buf.toString('utf8'));
    return {
      holderId: String(raw.holderId || ''),
      fence: Number(raw.fence) || 0,
      acquiredAt: String(raw.acquiredAt || ''),
      expiresAt: String(raw.expiresAt || ''),
    };
  } catch {
    return null;
  }
}

export function leasePayload({ holderId, fence, now = new Date(), ttlMs = DEFAULT_LEASE_TTL_MS }) {
  const acquiredAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlMs).toISOString();
  return JSON.stringify({ holderId, fence, acquiredAt, expiresAt });
}

/**
 * Pure decision: may this holder acquire or renew?
 */
export function evaluateLeaseTransition(existing, holderId, nowMs = Date.now()) {
  if (!existing || !existing.holderId) {
    return { action: 'create', fence: 1 };
  }
  const expiresMs = Date.parse(existing.expiresAt);
  const expired = Number.isNaN(expiresMs) || expiresMs <= nowMs;
  if (existing.holderId === holderId) {
    return { action: 'renew', fence: existing.fence };
  }
  if (expired) {
    return { action: 'steal', fence: existing.fence + 1 };
  }
  return { action: 'deny', reason: 'held-by-other', holderId: existing.holderId, expiresAt: existing.expiresAt };
}

export class WriterLeaseClient {
  constructor({ bucket, objectPath = LEASE_OBJECT_PATH, ttlMs = DEFAULT_LEASE_TTL_MS } = {}) {
    if (!bucket) throw new Error('WriterLeaseClient requires bucket');
    this.bucket = bucket;
    this.objectPath = objectPath;
    this.ttlMs = ttlMs;
    this.storage = new Storage();
    this.file = this.storage.bucket(bucket).file(objectPath);
    this._heldFence = null;
    this._holderId = null;
  }

  async readLease() {
    try {
      const [buf] = await this.file.download();
      return parseLeasePayload(buf);
    } catch (err) {
      if (err.code === 404) return null;
      throw err;
    }
  }

  async acquire({ holderId = buildHolderId() } = {}) {
    this._holderId = holderId;
    const existing = await this.readLease();
    const decision = evaluateLeaseTransition(existing, holderId);

    if (decision.action === 'deny') {
      return { ok: false, ...decision };
    }

    const fence = decision.fence;
    const body = leasePayload({ holderId, fence, ttlMs: this.ttlMs });

    if (decision.action === 'create') {
      try {
        await this.file.save(body, {
          contentType: 'application/json',
          preconditionOpts: { ifGenerationMatch: 0 },
        });
        this._heldFence = fence;
        return { ok: true, action: 'create', holderId, fence };
      } catch (err) {
        if (err.code === 412) {
          return { ok: false, action: 'deny', reason: 'lost-race-on-create' };
        }
        throw err;
      }
    }

    const [meta] = await this.file.getMetadata();
    const generation = meta.generation;
    try {
      await this.file.save(body, {
        contentType: 'application/json',
        preconditionOpts: { ifGenerationMatch: String(generation) },
      });
      this._heldFence = fence;
      return { ok: true, action: decision.action, holderId, fence };
    } catch (err) {
      if (err.code === 412) {
        return { ok: false, action: 'deny', reason: 'lost-race-on-update' };
      }
      throw err;
    }
  }

  async renew() {
    if (!this._holderId || this._heldFence == null) {
      throw new Error('renew called before successful acquire on this client');
    }
    return this.acquire({ holderId: this._holderId });
  }

  async release() {
    if (!this._holderId || this._heldFence == null) {
      return { ok: true, skipped: true };
    }
    try {
      const existing = await this.readLease();
      if (!existing || existing.holderId !== this._holderId || existing.fence !== this._heldFence) {
        return { ok: true, skipped: true, reason: 'not-holder-or-fence-mismatch' };
      }
      const [meta] = await this.file.getMetadata();
      await this.file.delete({ ifGenerationMatch: meta.generation });
      this._heldFence = null;
      return { ok: true, released: true };
    } catch (err) {
      if (err.code === 404) return { ok: true, skipped: true };
      throw err;
    }
  }

  held() {
    return this._heldFence != null && !!this._holderId;
  }

  status() {
    return {
      held: this.held(),
      holderId: this._holderId,
      fence: this._heldFence,
    };
  }
}

export function writerLeaseRequiredFromEnv(env = process.env) {
  if (env.CLINIC_WRITER_LEASE_REQUIRED === '0') return false;
  if (env.CLINIC_WRITER_LEASE_REQUIRED === '1') return true;
  return Boolean(env.LITESTREAM_BUCKET) && env.NODE_ENV === 'production';
}
