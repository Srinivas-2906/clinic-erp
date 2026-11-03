import fs from 'node:fs';
import path from 'node:path';

export type TaskStatus =
  | 'pending'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'failed'
  | 'completed'
  | 'awaiting_approval';

export type WorkerRole = 'coordinator' | 'backend' | 'frontend' | 'qa';

export type OrchestratorTask = {
  id: string;
  title: string;
  track: 'erp' | 'orchestrator';
  goalRef?: string;
  dependsOn: string[];
  assignedRole: WorkerRole;
  status: TaskStatus;
  taskType?: 'verify' | 'agent';
  command: string;
  agentInstructions?: string;
  verifyCommand?: string;
  worktreeBranch?: string;
  retries: number;
  maxRetries: number;
  logPath?: string;
  failureClass?: string;
  updatedAt: string;
};

export type OrchestratorState = {
  version: 1;
  integrationBranch: string;
  tasks: OrchestratorTask[];
  goals: { id: string; title: string; status: string }[];
};

const DEFAULT_STATE: OrchestratorState = {
  version: 1,
  integrationBranch: 'orchestrator/integration',
  tasks: [],
  goals: [],
};

export function getStatePath(root: string) {
  return path.join(root, '.orchestrator', 'state.json');
}

export function loadState(root: string): OrchestratorState {
  const p = getStatePath(root);
  if (!fs.existsSync(p)) return structuredClone(DEFAULT_STATE);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as OrchestratorState;
}

export function saveState(root: string, state: OrchestratorState) {
  const dir = path.dirname(getStatePath(root));
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getStatePath(root), JSON.stringify(state, null, 2));
}

export function upsertTask(state: OrchestratorState, task: OrchestratorTask) {
  const idx = state.tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) state.tasks[idx] = task;
  else state.tasks.push(task);
}

export function readyTasks(state: OrchestratorState): OrchestratorTask[] {
  const done = new Set(state.tasks.filter((t) => t.status === 'completed').map((t) => t.id));
  return state.tasks.filter((t) => {
    if (t.status !== 'pending' && t.status !== 'ready') return false;
    return t.dependsOn.every((d) => done.has(d));
  });
}
