import { loadState, saveState, upsertTask, type OrchestratorTask } from './store.js';

export function linkTaskToPullRequest(
  repoRoot: string,
  taskId: string,
  { prNumber, headSha }: { prNumber: number; headSha?: string },
): OrchestratorTask | null {
  const state = loadState(repoRoot);
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) return null;
  task.githubPrNumber = prNumber;
  if (headSha) task.githubHeadSha = headSha;
  task.updatedAt = new Date().toISOString();
  upsertTask(state, task);
  saveState(repoRoot, state);
  return task;
}

export function tasksBlockedByIncompleteDependencies(repoRoot: string) {
  const state = loadState(repoRoot);
  const done = new Set(state.tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  return state.tasks
    .filter((t) => t.status === 'pending' || t.status === 'ready' || t.status === 'blocked')
    .map((t) => ({
      id: t.id,
      title: t.title,
      missing: t.dependsOn.filter((d) => !done.has(d)),
    }))
    .filter((x) => x.missing.length > 0);
}
