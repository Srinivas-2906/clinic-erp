#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, saveState, upsertTask } from './store.js';
import { createWorktree, runCommandInWorktree, DEFAULT_LIMITS } from './safety.js';
import { runCodingAgentTask } from './agentAdapter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../..');

function parseArgs() {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf('--task');
  return { taskId: taskIdx >= 0 ? args[taskIdx + 1] : null };
}

async function main() {
  const { taskId } = parseArgs();
  if (!taskId) {
    console.error('Usage: worker.ts --task <id>');
    process.exit(1);
  }
  const state = loadState(repoRoot);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error('Task not found', taskId);
    process.exit(1);
  }

  task.status = 'running';
  task.updatedAt = new Date().toISOString();
  upsertTask(state, task);
  saveState(repoRoot, state);

  const wtName = `${task.assignedRole}-${taskId}`;
  const wtPath = createWorktree(repoRoot, wtName);
  const logPath = path.join(repoRoot, '.orchestrator', 'logs', `${taskId}-${process.pid}.log`);

  let result: { ok: boolean; failureClass?: string };
  if (task.taskType === 'agent') {
    const agentResult = await runCodingAgentTask({
      id: taskId,
      title: task.title,
      instructions: task.agentInstructions || task.title,
      verifyCommand: task.verifyCommand || task.command,
      worktreePath: wtPath,
      logFile: logPath,
    });
    result = { ok: agentResult.ok, failureClass: agentResult.failureClass };
  } else {
    result = await runCommandInWorktree(
      wtPath,
      task.command,
      logPath,
      DEFAULT_LIMITS.maxTaskDurationMs,
    );
  }

  const fresh = loadState(repoRoot);
  const current = fresh.tasks.find((t) => t.id === taskId);
  if (!current) {
    process.exit(result.ok ? 0 : 1);
    return;
  }
  current.logPath = logPath;
  current.updatedAt = new Date().toISOString();
  if (result.ok) current.status = 'awaiting_approval';
  else {
    current.retries += 1;
    current.failureClass = result.failureClass;
    current.status = current.retries >= current.maxRetries ? 'failed' : 'ready';
  }
  upsertTask(fresh, current);
  saveState(repoRoot, fresh);
  process.exit(result.ok ? 0 : 1);
}

main();
