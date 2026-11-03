import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readyTasks, upsertTask, type OrchestratorState } from './store.js';

describe('orchestrator store', () => {
  it('schedules tasks when dependencies complete', () => {
    const state: OrchestratorState = {
      version: 1,
      integrationBranch: 'orch/integration',
      goals: [],
      tasks: [
        {
          id: 'a',
          title: 'A',
          track: 'erp',
          dependsOn: [],
          assignedRole: 'backend',
          status: 'completed',
          command: 'true',
          retries: 0,
          maxRetries: 2,
          updatedAt: '',
        },
        {
          id: 'b',
          title: 'B',
          track: 'erp',
          dependsOn: ['a'],
          assignedRole: 'frontend',
          status: 'pending',
          command: 'true',
          retries: 0,
          maxRetries: 2,
          updatedAt: '',
        },
      ],
    };
    upsertTask(state, state.tasks[1]);
    const ready = readyTasks(state);
    assert.equal(ready.length, 1);
    assert.equal(ready[0].id, 'b');
  });
});
