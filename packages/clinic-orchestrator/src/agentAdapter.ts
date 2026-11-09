import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type AgentRuntimeKind = 'fixture' | 'external_cli' | 'none';

export type AgentRunResult = {
  ok: boolean;
  runtime: AgentRuntimeKind;
  commitSha?: string;
  log: string;
  failureClass?: string;
};

export type AgentTaskSpec = {
  id: string;
  title: string;
  instructions: string;
  verifyCommand: string;
  worktreePath: string;
  logFile: string;
};

/** Discover external coding-agent CLIs (best-effort; no fabrication). */
export async function discoverAgentRuntimes(): Promise<string[]> {
  const candidates = [
    process.env.CLINIC_ORCH_AGENT_CMD,
    'cursor-agent',
    'cursor',
    'claude',
    'aider',
  ].filter(Boolean) as string[];
  const found: string[] = [];
  for (const bin of candidates) {
    try {
      await execFileAsync('bash', ['-lc', `command -v ${bin.split(' ')[0]}`]);
      found.push(bin);
    } catch {
      /* not installed */
    }
  }
  return found;
}

/**
 * Run a coding task. Uses external CLI when configured and found; otherwise deterministic fixture adapter for CI.
 * Fixture writes a marker file and commits — proves adapter contract without claiming real LLM coding.
 */
export async function runCodingAgentTask(spec: AgentTaskSpec): Promise<AgentRunResult> {
  const runtimes = await discoverAgentRuntimes();
  const external = process.env.CLINIC_ORCH_AGENT_CMD || runtimes[0];

  if (external && process.env.CLINIC_ORCH_USE_FIXTURE_AGENT !== '1') {
    return runExternalAgent(external, spec);
  }

  return runFixtureAgent(spec);
}

async function runFixtureAgent(spec: AgentTaskSpec): Promise<AgentRunResult> {
  const marker = path.join(spec.worktreePath, '.orchestrator-agent-fixture.txt');
  const log: string[] = [`[fixture-agent] ${spec.id}`, spec.instructions];
  try {
    fs.writeFileSync(marker, `task=${spec.id}\n${new Date().toISOString()}\n`, 'utf8');
    await execFileAsync('git', ['add', marker], { cwd: spec.worktreePath });
    await execFileAsync('git', ['commit', '-m', `orch(fixture): ${spec.id}`], { cwd: spec.worktreePath });
    const sha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: spec.worktreePath })).stdout.trim();
    const verify = await runShell(spec.verifyCommand, spec.worktreePath);
    fs.appendFileSync(spec.logFile, log.join('\n') + '\n' + verify.log);
    return {
      ok: verify.ok,
      runtime: 'fixture',
      commitSha: sha,
      log: log.join('\n'),
      failureClass: verify.ok ? undefined : 'verify_failed',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    fs.appendFileSync(spec.logFile, log.join('\n') + '\n' + msg);
    return { ok: false, runtime: 'fixture', log: msg, failureClass: 'fixture_error' };
  }
}

async function runExternalAgent(command: string, spec: AgentTaskSpec): Promise<AgentRunResult> {
  const log: string[] = [`[external-agent] cmd=${command}`, spec.instructions];
  const prompt = [
    'You are an autonomous coding agent. Work only in the current directory.',
    `Task: ${spec.title}`,
    spec.instructions,
    'Run tests if applicable. Do not access production secrets.',
  ].join('\n');

  const verify = await runShell(
    `${command} ${JSON.stringify(prompt)}`,
    spec.worktreePath,
    spec.logFile,
  );
  let commitSha: string | undefined;
  try {
    const out = await execFileAsync('git', ['status', '--porcelain'], { cwd: spec.worktreePath });
    if (out.stdout.trim()) {
      await execFileAsync('git', ['add', '-A'], { cwd: spec.worktreePath });
      await execFileAsync('git', ['commit', '-m', `orch(agent): ${spec.id}`], { cwd: spec.worktreePath });
      commitSha = (await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: spec.worktreePath })).stdout.trim();
    }
  } catch {
    /* no changes */
  }

  const test = await runShell(spec.verifyCommand, spec.worktreePath);
  fs.appendFileSync(spec.logFile, log.join('\n') + '\n' + verify.log + '\n' + test.log);

  return {
    ok: verify.ok && test.ok,
    runtime: 'external_cli',
    commitSha,
    log: verify.log,
    failureClass: verify.ok && test.ok ? undefined : 'agent_or_verify_failed',
  };
}

function runShell(command: string, cwd: string, logFile?: string): Promise<{ ok: boolean; log: string }> {
  return new Promise((resolve) => {
    const chunks: string[] = [];
    const child = spawn('bash', ['-lc', command], { cwd, env: { ...process.env, CI: '1' } });
    child.stdout.on('data', (d) => chunks.push(String(d)));
    child.stderr.on('data', (d) => chunks.push(String(d)));
    child.on('close', (code) => {
      const log = chunks.join('');
      if (logFile) fs.appendFileSync(logFile, log);
      resolve({ ok: code === 0, log });
    });
  });
}
