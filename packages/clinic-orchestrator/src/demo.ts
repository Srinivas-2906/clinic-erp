#!/usr/bin/env node
/**
 * End-to-end orchestration demo — two worker processes in parallel, separate worktrees.
 * Agent runtime: Node worker subprocess executing verification commands (Cursor CLI not required).
 * Optional: set CLINIC_ORCH_AGENT_CMD for external coding agents.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, saveState, upsertTask, type OrchestratorState } from './store.js';
import { repoRootFromHere, spawnWorkerProcess } from './coordinator.js';
import { DEFAULT_LIMITS } from './safety.js';

const repoRoot = repoRootFromHere();

function seedDemo(state: OrchestratorState): OrchestratorState {
  const now = new Date().toISOString();
  const tasks = [
    {
      id: 'demo-backend-billing',
      title: 'Verify API billing tests',
      track: 'erp' as const,
      goalRef: 'subscription-management',
      dependsOn: [],
      assignedRole: 'backend' as const,
      status: 'ready' as const,
      command: 'npm run test:api:file -- src/modules/billing/paymentGateway.test.js',
      retries: 0,
      maxRetries: DEFAULT_LIMITS.maxRetries,
      updatedAt: now,
    },
    {
      id: 'demo-frontend-crm-unit',
      title: 'Verify CRM unit tests',
      track: 'erp' as const,
      goalRef: 'desktop-mobile-parity',
      dependsOn: [],
      assignedRole: 'frontend' as const,
      status: 'ready' as const,
      command: 'npm run test:crm',
      retries: 0,
      maxRetries: DEFAULT_LIMITS.maxRetries,
      updatedAt: now,
    },
    {
      id: 'demo-qa-orchestrator',
      title: 'Verify orchestrator store',
      track: 'orchestrator' as const,
      dependsOn: ['demo-backend-billing', 'demo-frontend-crm-unit'],
      assignedRole: 'qa' as const,
      status: 'pending' as const,
      command: 'node --import tsx packages/clinic-orchestrator/src/store.test.ts',
      retries: 0,
      maxRetries: DEFAULT_LIMITS.maxRetries,
      updatedAt: now,
    },
  ];
  state.tasks = tasks;
  state.goals = [
    { id: 'subscription-management', title: 'SaaS subscription management', status: 'partial' },
    { id: 'orchestrator-mvp', title: 'Engineering orchestrator MVP', status: 'in_progress' },
  ];
  return state;
}

async function main() {
  let state = loadState(repoRoot);
  state = seedDemo(state);
  saveState(repoRoot, state);

  const parallel = state.tasks.filter((t) => t.dependsOn.length === 0);
  console.log('[demo] Spawning', parallel.length, 'workers concurrently…');
  const codes = await Promise.all(parallel.map((t) => spawnWorkerProcess(repoRoot, t.id)));
  console.log('[demo] Worker exit codes:', codes);

  state = loadState(repoRoot);
  const qa = state.tasks.find((t) => t.id === 'demo-qa-orchestrator');
  if (qa && qa.status === 'pending') {
    qa.status = 'ready';
    upsertTask(state, qa);
    saveState(repoRoot, state);
    const qaCode = await spawnWorkerProcess(repoRoot, qa.id);
    console.log('[demo] QA worker exit:', qaCode);
  }

  state = loadState(repoRoot);
  console.log('[demo] Final task statuses:', state.tasks.map((t) => ({ id: t.id, status: t.status, log: t.logPath })));
  const failed = state.tasks.some((t) => t.status === 'failed');
  process.exit(failed ? 1 : 0);
}

main();
