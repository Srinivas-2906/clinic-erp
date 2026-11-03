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

- **Default:** workers execute **verification commands** (`npm test`, etc.) inside isolated worktrees — real OS-level concurrency via `child_process.spawn`.
- **Optional:** set `CLINIC_ORCH_AGENT_CMD` to an external coding-agent binary when installed (Cursor CLI was **not** present in the development environment; orchestrator does not fake agent calls).
- Workers are **not** sequential prompts renamed as agents; parallel tasks use **parallel processes**.

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
