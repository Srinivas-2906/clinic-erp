import path from 'node:path';
import { execFileSync } from 'node:child_process';

export function ensureIntegrationBranch(repoRoot: string, branchName: string): void {
  try {
    execFileSync('git', ['rev-parse', '--verify', branchName], { cwd: repoRoot, stdio: 'ignore' });
  } catch {
    execFileSync('git', ['branch', branchName, 'HEAD'], { cwd: repoRoot, stdio: 'inherit' });
  }
}

export function mergeWorktreeIntoIntegration(
  repoRoot: string,
  worktreePath: string,
  integrationBranch: string,
  message: string,
): void {
  ensureIntegrationBranch(repoRoot, integrationBranch);
  execFileSync('git', ['-C', worktreePath, 'rev-parse', '--abbrev-ref', 'HEAD'], { stdio: 'pipe' });
  execFileSync(
    'git',
    ['-C', repoRoot, 'merge', '--no-ff', '-m', message, worktreePath],
    { stdio: 'inherit' },
  );
}

export function integrationBranchPath(repoRoot: string, branchName: string) {
  return path.join(repoRoot, '.orchestrator', 'branches', branchName.replace(/\//g, '_'));
}
