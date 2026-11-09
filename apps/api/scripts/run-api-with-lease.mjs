#!/usr/bin/env node
/**
 * Child process for: litestream replicate -exec "node run-api-with-lease.mjs"
 * Renews GCS writer lease while the API runs; releases on shutdown.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WriterLeaseClient,
  buildHolderId,
  DEFAULT_RENEW_INTERVAL_MS,
  writerLeaseRequiredFromEnv,
} from '../src/infra/writerLease.js';
import { verifyProcessOwnsRemoteLease } from '../src/middleware/writerLeaseGuard.js';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(apiRoot, '..', 'src', 'index.js');
const bucket = process.env.CLINIC_WRITER_LEASE_BUCKET || process.env.LITESTREAM_BUCKET;
const leaseRequired = writerLeaseRequiredFromEnv();

let client = null;
let renewTimer = null;
let child = null;

function stopRenewal() {
  if (renewTimer) {
    clearInterval(renewTimer);
    renewTimer = null;
  }
}

async function shutdown(code) {
  stopRenewal();
  if (client?.held()) {
    try {
      await client.release();
    } catch (err) {
      console.error('[writer-lease] release failed', err.message || err);
    }
  }
  process.exit(code);
}

async function start() {
  if (leaseRequired && bucket) {
    client = new WriterLeaseClient({ bucket });
    const holderId = process.env.CLINIC_WRITER_LEASE_HOLDER || buildHolderId();
    const acquired = await client.acquire({ holderId });
    if (!acquired.ok) {
      console.error('[writer-lease] FATAL: cannot hold lease', JSON.stringify(acquired));
      process.exit(1);
    }
    process.env.CLINIC_WRITER_LEASE_HELD = '1';
    process.env.CLINIC_WRITER_LEASE_FENCE = String(acquired.fence);
    process.env.CLINIC_WRITER_LEASE_HOLDER = holderId;

    const onLeaseLoss = (detail) => {
      console.error('[writer-lease] FATAL ownership lost — terminating replicate child', detail);
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
    // Keep timer eligible for CPU while instance is running (do not unref).
  }

  child = spawn(process.execPath, [indexPath], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code, signal) => {
    void shutdown(signal ? 1 : code ?? 1);
  });
}

process.on('SIGINT', () => child?.kill('SIGINT'));
process.on('SIGTERM', () => child?.kill('SIGTERM'));

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
