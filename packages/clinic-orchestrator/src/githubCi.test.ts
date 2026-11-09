import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ciGateAllowsMerge, fetchCiSnapshot } from './githubCi.js';

describe('githubCi', () => {
  it('reads fixture and enforces six-check gate', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-ci-'));
    const fixture = {
      sha: 'abc',
      state: 'success',
      checks: [
        { name: 'API unit tests', conclusion: 'success', status: 'completed' },
        { name: 'CRM unit tests', conclusion: 'success', status: 'completed' },
        { name: 'CRM production build', conclusion: 'success', status: 'completed' },
        { name: 'Docker build (no push)', conclusion: 'success', status: 'completed' },
        { name: 'Playwright fast (smoke + auth)', conclusion: 'success', status: 'completed' },
        { name: 'Playwright regression (desktop + mobile)', conclusion: 'success', status: 'completed' },
      ],
      fetchedAt: '',
    };
    fs.mkdirSync(path.join(dir, '.orchestrator'), { recursive: true });
    fs.writeFileSync(path.join(dir, '.orchestrator', 'ci-fixture.json'), JSON.stringify(fixture));
    const snap = await fetchCiSnapshot(dir, 'deadbeef');
    assert.equal(snap.sha, 'deadbeef');
    assert.equal(ciGateAllowsMerge(snap), true);
    assert.equal(ciGateAllowsMerge({ ...snap, checks: snap.checks.slice(0, 3) }), false);
  });
});
