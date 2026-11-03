import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadState,
  saveState,
  readyTasks,
  upsertTask,
  type OrchestratorTask,
} from './store.js';
import { DEFAULT_LIMITS, createWorktree, runCommandInWorktree } from './safety.js';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export function repoRootFromHere() {
  return path.resolve(__dirname, '../../..');
}

export async function runWorkersConcurrently(
  repoRoot: string,
  tasks: OrchestratorTask[],
  limits = DEFAULT_LIMITS,
) {
  const batch = tasks.slice(0, limits.maxConcurrentWorkers);
  const state = loadState(repoRoot);

  await Promise.all(
    batch.map(async (task) => {
      task.status = 'running';
      task.updatedAt = new Date().toISOString();
      upsertTask(state, task);
      saveState(repoRoot, state);

      const wtName = task.id.replace(/[^a-z0-9-]/gi, '-');
      const wtPath = createWorktree(repoRoot, wtName);
      const logPath = path.join(repoRoot, '.orchestrator', 'logs', `${task.id}.log`);

      const result = await runCommandInWorktree(
        wtPath,
        task.command,
        logPath,
        limits.maxTaskDurationMs,
      );

      task.logPath = logPath;
      task.updatedAt = new Date().toISOString();
      if (result.ok) {
        task.status = 'awaiting_approval';
      } else {
        task.retries += 1;
        task.failureClass = result.failureClass;
        task.status = task.retries >= task.maxRetries ? 'failed' : 'ready';
      }
      upsertTask(state, task);
      saveState(repoRoot, state);
    }),
  );

  return loadState(repoRoot);
}

/** Spawn isolated worker processes (true OS-level concurrency). */
export function spawnWorkerProcess(repoRoot: string, taskId: string): Promise<number> {
  const workerScript = path.join(repoRoot, 'packages/clinic-orchestrator/src/worker.ts');
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', workerScript, '--task', taskId],
      { cwd: repoRoot, stdio: 'inherit', env: process.env },
    );
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });
}

export function pickReadyBatch(repoRoot: string, role?: string) {
  const state = loadState(repoRoot);
  let ready = readyTasks(state);
  if (role) ready = ready.filter((t) => t.assignedRole === role);
  return ready;
}
