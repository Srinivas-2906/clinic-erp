#!/usr/bin/env node
/**
 * Human approval gate — marks awaiting_approval tasks as completed (or rejects).
 * Usage: approve.ts --task <id> [--reject reason]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadState, saveState, upsertTask } from './store.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function parseArgs() {
  const args = process.argv.slice(2);
  const taskIdx = args.indexOf('--task');
  const rejectIdx = args.indexOf('--reject');
  return {
    taskId: taskIdx >= 0 ? args[taskIdx + 1] : null,
    rejectReason: rejectIdx >= 0 ? args.slice(rejectIdx + 1).join(' ') || 'rejected' : null,
  };
}

function main() {
  const { taskId, rejectReason } = parseArgs();
  if (!taskId) {
    console.error('Usage: approve.ts --task <id> [--reject reason]');
    process.exit(1);
  }
  const state = loadState(repoRoot);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) {
    console.error('Task not found', taskId);
    process.exit(1);
  }
  if (task.status !== 'awaiting_approval') {
    console.error('Task is not awaiting approval:', task.status);
    process.exit(1);
  }
  task.updatedAt = new Date().toISOString();
  if (rejectReason) {
    task.status = 'failed';
    task.failureClass = 'human_rejected';
    task.logPath = `${task.logPath || ''}\nRejected: ${rejectReason}`;
  } else {
    task.status = 'completed';
  }
  upsertTask(state, task);
  saveState(repoRoot, state);
  console.log(`Task ${taskId} → ${task.status}`);
}

main();
