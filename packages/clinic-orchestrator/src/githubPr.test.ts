import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadState, saveState } from './store.js';
import { linkTaskToPullRequest, tasksBlockedByIncompleteDependencies } from './githubPr.js';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-pr-'));

before(() => {
  saveState(tmp, {
    version: 1,
    integrationBranch: 'orchestrator/integration',
    goals: [],
    tasks: [
      {
        id: 't1',
        title: 'A',
        track: 'erp',
        dependsOn: [],
        assignedRole: 'backend',
        status: 'pending',
        command: 'echo a',
        retries: 0,
        maxRetries: 2,
        updatedAt: new Date().toISOString(),
      },
      {
        id: 't2',
        title: 'B',
        track: 'erp',
        dependsOn: ['t1'],
        assignedRole: 'qa',
        status: 'pending',
        command: 'echo b',
        retries: 0,
        maxRetries: 2,
        updatedAt: new Date().toISOString(),
      },
    ],
  });
});

after(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('githubPr association', () => {
  it('links PR number to task', () => {
    const linked = linkTaskToPullRequest(tmp, 't1', { prNumber: 64, headSha: 'abc123' });
    assert.ok(linked);
    assert.equal(linked?.githubPrNumber, 64);
    assert.equal(linked?.githubHeadSha, 'abc123');
    const state = loadState(tmp);
    assert.equal(state.tasks[0].githubPrNumber, 64);
  });

  it('reports dependency blockers', () => {
    const blockers = tasksBlockedByIncompleteDependencies(tmp);
    assert.ok(blockers.some((b) => b.id === 't2' && b.missing.includes('t1')));
  });
});
