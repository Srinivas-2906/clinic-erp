#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRootFromHere } from './coordinator.js';
import { fetchCiSnapshot, ciGateAllowsMerge } from './githubCi.js';

const repoRoot = repoRootFromHere();
const sha = process.argv[2] || process.env.GITHUB_SHA || 'local';

async function main() {
  const snap = await fetchCiSnapshot(repoRoot, sha);
  console.log(JSON.stringify({ ...snap, mergeReady: ciGateAllowsMerge(snap) }, null, 2));
  process.exit(snap.state === 'success' ? 0 : 1);
}

main();
