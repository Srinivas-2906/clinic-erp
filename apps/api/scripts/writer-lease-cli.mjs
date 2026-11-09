#!/usr/bin/env node
import {
  WriterLeaseClient,
  buildHolderId,
  writerLeaseRequiredFromEnv,
} from '../src/infra/writerLease.js';

const cmd = process.argv[2] || 'acquire';
const bucket = process.env.CLINIC_WRITER_LEASE_BUCKET || process.env.LITESTREAM_BUCKET;

if (!bucket) {
  console.error('writer-lease-cli: LITESTREAM_BUCKET / CLINIC_WRITER_LEASE_BUCKET not set');
  process.exit(2);
}

if (cmd === 'check-required' && !writerLeaseRequiredFromEnv()) {
  console.log(JSON.stringify({ ok: true, skipped: true, reason: 'lease-not-required' }));
  process.exit(0);
}

const client = new WriterLeaseClient({ bucket });
const holderId = buildHolderId();

async function main() {
  if (cmd === 'acquire') {
    const result = await client.acquire({ holderId });
    console.log(JSON.stringify(result));
    process.exit(result.ok ? 0 : 1);
  }
  if (cmd === 'status') {
    const remote = await client.readLease();
    console.log(JSON.stringify({ holderId, remote, local: client.status() }));
    process.exit(0);
  }
  if (cmd === 'release') {
    // Best-effort acquire identity for release after replicate
    client._holderId = holderId;
    client._heldFence = 0;
    const result = await client.release();
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  console.error(`Unknown command: ${cmd}`);
  process.exit(2);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
