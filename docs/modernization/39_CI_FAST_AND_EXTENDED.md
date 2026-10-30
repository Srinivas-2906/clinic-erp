# CI: fast merge gate + extended regression

## Problem

Waiting for the full Playwright desktop+mobile suite (~15–25 min) on every PR blocks the next feature. Healthcare and billing checks must stay strict; long UI regression can run asynchronously.

## Workflows

| Workflow | When | Merge gate? |
|----------|------|-------------|
| **CI** (`ci.yml`) | PR + push to `main` | **Yes** — configure branch protection on these job names |
| **Playwright extended regression** (`playwright-regression.yml`) | PR (informational), push to `main`, nightly, manual | **No** — triage failures before release |
| **Android Maestro verify (manual)** | `workflow_dispatch` | Pre-launch only |

## Mandatory PR checks (CI)

| Job | Typical duration | Notes |
|-----|------------------|--------|
| API unit tests | ~2–4 min | Includes billing API smoke + release preflight |
| CRM unit tests | ~2 min | |
| Mobile typecheck + unit | ~2 min | Always (fast) |
| CRM production build | ~2 min | |
| Docker build (no push) | ~3–5 min | |
| **Playwright fast (smoke + auth)** | ~5–12 min | `@smoke` desktop **and** mobile; role + API contract specs |
| Android APK build | ~8–15 min | **Skipped** on web-only PRs (path filter); runs on `main` push and mobile/package changes |

**Removed from PR gate:** `Playwright regression (desktop + mobile)` full suite (~15–25 min).

## Extended regression (async)

- Full `test:e2e:full` (desktop then mobile).
- Triggers: **nightly** (01:30 UTC), **push to main**, **pull_request** (parallel, non-blocking), **workflow_dispatch**.
- Artifacts: `playwright-regression-report-<run_id>` on failure (14 days).

**Release gate (staging/prod):** Require a green extended regression on the release candidate commit + manual approval workflows — do not auto-deploy.

## Android APK path filter

APK job runs when PR touches:

- `apps/mobile/**`
- shared packages / lockfile / root `package.json`

Pure CRM/API PRs skip APK (**Skipped** status). Do **not** list **Android APK build** as a required check if you want web-only PRs to merge without waiting; **do** require it for mobile PRs (GitHub cannot path-filter required checks natively — use team policy: mobile PRs wait for APK job).

## Branch protection (GitHub Settings → Branches)

**Require (fast CI):**

- API unit tests  
- CRM unit tests  
- Mobile typecheck + unit  
- CRM production build  
- Docker build (no push)  
- Playwright fast (smoke + auth)  

**Do not require (optional / async):**

- Playwright extended regression  
- Android APK build (unless mobile change — verify manually)  
- Native Android Maestro  

Remove legacy required check name **Playwright regression (desktop + mobile)** if still listed.

## Parallel development process

1. Finish feature → focused local tests (`36_DEV_SPEED.md`).
2. Open PR → **CI (fast)** runs; **extended regression** runs in parallel (informational on PR).
3. Start **next feature on a new branch** without waiting for extended regression.
4. Merge when **fast CI green** + approval; rebase next branch on `main`.
5. Before release: confirm **extended regression green** on target SHA.

## Expected savings

| Scenario | Before | After (typical web PR) |
|----------|--------|-------------------------|
| PR wait for merge gate | ~25–40 min | ~12–20 min |
| Idle agent waiting on full regression | Common | Avoid — use async workflow |

No tests removed; full suite moved to async workflow.
