#!/usr/bin/env node
/**
 * Dev/test helper: hold lease and run API only (no Litestream). Production uses run-litestream-with-lease.mjs.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { superviseWriterLease } from './writerLeaseSupervisor.mjs';

const apiRoot = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(apiRoot, '..', 'src', 'index.js');

const result = await superviseWriterLease({
  startChild: (env) => spawn(process.execPath, [indexPath], { stdio: 'inherit', env }),
});

if (!result.ok) {
  console.error('[writer-lease] FATAL: cannot hold lease', JSON.stringify(result));
  process.exit(1);
}

process.on('SIGINT', () => result.child?.kill('SIGINT'));
process.on('SIGTERM', () => result.child?.kill('SIGTERM'));
