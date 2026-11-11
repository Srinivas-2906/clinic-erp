#!/usr/bin/env node
/**
 * Production entry when LITESTREAM_BUCKET is set: hold writer lease *before* starting Litestream.
 */
import { spawn } from 'node:child_process';
import { superviseWriterLease } from './writerLeaseSupervisor.mjs';

const dbPath = process.env.DATABASE_PATH || '/data/clinic.db';
const bucket = process.env.LITESTREAM_BUCKET;
const replicaUrl = bucket ? `gcs://${bucket}/clinic.db` : null;
const apiEntry = process.env.CLINIC_API_ENTRY || '/app/apps/api/src/index.js';

if (!replicaUrl) {
  console.error('[writer-lease] LITESTREAM_BUCKET required for run-litestream-with-lease.mjs');
  process.exit(1);
}

const result = await superviseWriterLease({
  startChild: (env) => spawn(
    'litestream',
    ['replicate', '-exec', `node ${apiEntry}`, dbPath, replicaUrl],
  {
    stdio: 'inherit',
    env,
  }),
});

if (!result.ok) {
  console.error('[writer-lease] FATAL: cannot hold lease before Litestream', JSON.stringify(result));
  process.exit(1);
}

process.on('SIGINT', () => result.child?.kill('SIGINT'));
process.on('SIGTERM', () => result.child?.kill('SIGTERM'));
