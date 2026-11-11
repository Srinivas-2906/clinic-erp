/**
 * Acquire GCS writer lease before any SQLite/Litestream side effects, then supervise a child.
 */
import {
  WriterLeaseClient,
  buildHolderId,
  DEFAULT_RENEW_INTERVAL_MS,
  writerLeaseRequiredFromEnv,
} from '../src/infra/writerLease.js';
import { verifyProcessOwnsRemoteLease } from '../src/middleware/writerLeaseGuard.js';

/**
 * @param {{ startChild: (env: NodeJS.ProcessEnv) => import('node:child_process').ChildProcess, bucket?: string, leaseRequired?: boolean }} opts
 */
export async function superviseWriterLease({
  startChild,
  bucket = process.env.CLINIC_WRITER_LEASE_BUCKET || process.env.LITESTREAM_BUCKET,
  leaseRequired = writerLeaseRequiredFromEnv(),
} = {}) {
  let client = null;
  let renewTimer = null;
  let child = null;

  const stopRenewal = () => {
    if (renewTimer) {
      clearInterval(renewTimer);
      renewTimer = null;
    }
  };

  const env = { ...process.env };

  const shutdown = async (code) => {
    stopRenewal();
    if (client?.held()) {
      try {
        await client.release();
      } catch (err) {
        console.error('[writer-lease] release failed', err.message || err);
      }
    }
    process.exit(code);
  };

  if (leaseRequired && bucket) {
    client = new WriterLeaseClient({ bucket });
    const holderId = process.env.CLINIC_WRITER_LEASE_HOLDER || buildHolderId();
    const acquired = await client.acquire({ holderId });
    if (!acquired.ok) {
      return { ok: false, phase: 'acquire', detail: acquired };
    }
    env.CLINIC_WRITER_LEASE_HELD = '1';
    env.CLINIC_WRITER_LEASE_FENCE = String(acquired.fence);
    env.CLINIC_WRITER_LEASE_HOLDER = holderId;
    process.env.CLINIC_WRITER_LEASE_HELD = env.CLINIC_WRITER_LEASE_HELD;
    process.env.CLINIC_WRITER_LEASE_FENCE = env.CLINIC_WRITER_LEASE_FENCE;
    process.env.CLINIC_WRITER_LEASE_HOLDER = env.CLINIC_WRITER_LEASE_HOLDER;

    const onLeaseLoss = (detail) => {
      console.error('[writer-lease] FATAL ownership lost — stopping supervised child', detail);
      child?.kill('SIGTERM');
      setTimeout(() => process.exit(1), 3000).unref?.();
    };

    renewTimer = setInterval(() => {
      client.renew().then(async (r) => {
        if (!r.ok) {
          onLeaseLoss(JSON.stringify(r));
          return;
        }
        const v = await verifyProcessOwnsRemoteLease();
        if (!v.ok) onLeaseLoss(JSON.stringify(v));
      }).catch((err) => {
        onLeaseLoss(err.message || String(err));
      });
    }, DEFAULT_RENEW_INTERVAL_MS);
  }

  child = startChild(env);
  child.on('exit', (code, signal) => {
    void shutdown(signal ? 1 : code ?? 1);
  });

  return { ok: true, child };
}
