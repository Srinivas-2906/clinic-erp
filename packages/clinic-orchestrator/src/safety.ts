import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BLOCKED_SHELL = /\b(rm\s+-rf\s+\/|git\s+push\s+.*--force|DROP\s+TABLE|curl.*production)\b/i;

export type SafetyLimits = {
  maxConcurrentWorkers: number;
  maxTaskDurationMs: number;
  maxRetries: number;
};

export const DEFAULT_LIMITS: SafetyLimits = {
  maxConcurrentWorkers: 2,
  maxTaskDurationMs: 15 * 60 * 1000,
  maxRetries: 2,
};

export function assertSafeCommand(cmd: string) {
  if (BLOCKED_SHELL.test(cmd)) {
    throw new Error(`Blocked command pattern: ${cmd}`);
  }
}

export function createWorktree(repoRoot: string, name: string, baseRef?: string) {
  const wtRoot = path.join(repoRoot, '.orchestrator', 'worktrees', `${name}-${process.pid}`);
  fs.mkdirSync(path.dirname(wtRoot), { recursive: true });
  const base =
    baseRef ||
    process.env.CLINIC_ORCH_BASE_REF ||
    execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim();
  execFileSync('git', ['worktree', 'add', '-b', `orch/${name}-${Date.now()}`, wtRoot, base], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return wtRoot;
}

export function removeWorktree(repoRoot: string, name: string) {
  const wtRoot = path.join(repoRoot, '.orchestrator', 'worktrees', name);
  if (!fs.existsSync(wtRoot)) return;
  execFileSync('git', ['worktree', 'remove', '--force', wtRoot], { cwd: repoRoot, stdio: 'inherit' });
}

export function runCommandInWorktree(
  worktreePath: string,
  command: string,
  logFile: string,
  timeoutMs: number,
): Promise<{ ok: boolean; code: number | null; failureClass?: string }> {
  assertSafeCommand(command);
  fs.mkdirSync(path.dirname(logFile), { recursive: true });
  const logStream = fs.createWriteStream(logFile, { flags: 'a' });
  return new Promise((resolve) => {
    const child = spawn('bash', ['-lc', command], {
      cwd: worktreePath,
      env: { ...process.env, CI: '1', CLINIC_RAZORPAY_MOCK: '1' },
    });
    child.stdout.pipe(logStream);
    child.stderr.pipe(logStream);
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolve({ ok: false, code: null, failureClass: 'timeout' });
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      logStream.end();
      resolve({
        ok: code === 0,
        code,
        failureClass: code === 0 ? undefined : 'command_failed',
      });
    });
  });
}
