# Engineering orchestrator (local state — not clinic runtime)

**Package:** `packages/clinic-orchestrator` (not deployed with Clinic ERP).

## Architecture

| Component | Role |
|-----------|------|
| Coordinator | Dependency-aware scheduling, concurrent worker spawn, integration branch name |
| Workers (`backend`, `frontend`, `qa`) | Separate **Node child processes**, each with its own **git worktree** |
| Persistent store | `.orchestrator/state.json` — tasks, goals, statuses, log paths |
| Safety | Blocked destructive shell patterns, timeouts, retry budget, no production secrets |

## Agent runtime (actual)

| Mode | Purpose |
|------|---------|
| **verify** (`taskType: verify`) | Runs shell verification commands in an isolated worktree — not a coding agent. |
| **agent** (`taskType: agent`) | Invokes `runCodingAgentTask` via configurable adapter. |
| **fixture agent** (`CLINIC_ORCH_USE_FIXTURE_AGENT=1` or no CLI found) | Writes a marker file + git commit to prove worktree/commit/verify contract — **not** real LLM coding. |
| **external CLI** (`CLINIC_ORCH_AGENT_CMD`) | Used when installed and fixture mode off. |

Discovery checks `CLINIC_ORCH_AGENT_CMD`, `cursor-agent`, `cursor`, `claude`, `aider` via `command -v`. **Cursor CLI was not available** in the development environment used to build this package; demos used verify workers and/or fixture agent only unless you configure an external command.

Do not label verify-only workers as coding agents in runbooks.

## Demonstration

```bash
npm install
npm run orchestrator:demo
```

Evidence produced:

- `.orchestrator/state.json` updated task statuses
- `.orchestrator/logs/*.log` per worker
- Two concurrent workers on independent worktrees (backend + frontend), then QA task after dependencies

## Human approval

Tasks ending in `awaiting_approval` are **not** merged to `main`. Integration branch name defaults to `orchestrator/integration` (coordinator-managed; manual merge policy).

## Limits

See `DEFAULT_LIMITS` in `src/safety.ts` (concurrency, duration, retries).

## CI monitoring

Coordinator can be extended with `gh pr checks` polling (not required for clinic runtime). ERP CI remains GitHub Actions Fast + extended Playwright.
