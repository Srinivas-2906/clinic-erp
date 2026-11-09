import fs from 'node:fs';
import path from 'node:path';

export type CiCheckSnapshot = {
  sha: string;
  state: 'success' | 'failure' | 'pending' | 'unknown';
  checks: { name: string; conclusion: string | null; status: string }[];
  fetchedAt: string;
};

/** Read CI status from fixture (default) or optional gh CLI when CLINIC_ORCH_GH_REPO is set. */
export async function fetchCiSnapshot(repoRoot: string, headSha: string): Promise<CiCheckSnapshot> {
  const fixturePath =
    process.env.CLINIC_ORCH_CI_FIXTURE ||
    path.join(repoRoot, '.orchestrator', 'ci-fixture.json');
  if (fs.existsSync(fixturePath)) {
    const raw = JSON.parse(fs.readFileSync(fixturePath, 'utf8')) as CiCheckSnapshot;
    return { ...raw, sha: headSha, fetchedAt: new Date().toISOString() };
  }

  const repo = process.env.CLINIC_ORCH_GH_REPO;
  if (!repo || process.env.CLINIC_ORCH_USE_GH_CLI !== '1') {
    return {
      sha: headSha,
      state: 'unknown',
      checks: [],
      fetchedAt: new Date().toISOString(),
    };
  }

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['api', `repos/${repo}/commits/${headSha}/check-runs`, '-q', '.check_runs'],
      { env: process.env },
    );
    const runs = JSON.parse(stdout) as { name: string; status: string; conclusion: string | null }[];
    const checks = runs.map((r) => ({
      name: r.name,
      status: r.status,
      conclusion: r.conclusion,
    }));
    const failed = checks.some((c) => c.conclusion === 'failure');
    const pending = checks.some((c) => c.status !== 'completed');
    const state: CiCheckSnapshot['state'] = failed ? 'failure' : pending ? 'pending' : checks.length ? 'success' : 'unknown';
    return { sha: headSha, state, checks, fetchedAt: new Date().toISOString() };
  } catch {
    return { sha: headSha, state: 'unknown', checks: [], fetchedAt: new Date().toISOString() };
  }
}

export function ciGateAllowsMerge(snapshot: CiCheckSnapshot, required = 6): boolean {
  if (snapshot.state !== 'success') return false;
  const completed = snapshot.checks.filter((c) => c.conclusion === 'success');
  return completed.length >= required;
}
