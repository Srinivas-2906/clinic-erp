# CI: web SaaS merge gate + async regression

## Workflows

| Workflow | When | Merge gate? |
|----------|------|-------------|
| **CI** (`ci.yml`) | PR + push to `main` | **Yes** — web/API/CRM only |
| **Playwright extended regression** (`playwright-regression.yml`) | PR (informational), push to `main`, nightly, manual | **No** — triage before **web release** |
| **Native Android verify (manual)** (`native-android-verify.yml`) | `workflow_dispatch` | **No** — deferred native cycle |
| **Android Maestro verify (manual)** | `workflow_dispatch` | **No** — pre-native-launch only |

Native workflows **never** run on `pull_request` or `push` automatically.

## Mandatory PR checks (CI)

| Job | Typical duration |
|-----|------------------|
| API unit tests | ~2–4 min |
| CRM unit tests | ~2 min |
| CRM production build | ~2 min |
| Docker build (no push) | ~3–5 min |
| **Playwright fast (smoke + auth)** | ~3–8 min |

**Removed from web PR CI (2026-10-31):** Detect changed areas (Android), Mobile typecheck + unit, Android APK build.

**Removed earlier:** Full Playwright regression in `ci.yml`.

## Extended regression (async)

- Full `test:e2e:full` (desktop then mobile browser projects).
- Triggers: nightly, push to `main`, PR, manual.
- Concurrency `cancel-in-progress: true` on PR branches — superseded runs cancelled.
- Artifacts on failure: `playwright-regression-report-<run_id>`.

## Branch protection (GitHub Settings → Branches)

**Require:**

- API unit tests  
- CRM unit tests  
- CRM production build  
- Docker build (no push)  
- Playwright fast (smoke + auth)  

**Remove if still listed:**

- Mobile typecheck + unit  
- Android APK build  
- Detect changed areas  
- Playwright regression (desktop + mobile) — use async workflow only  
- Legacy **Playwright smoke (local, no GCP)**  

**Do not require:** Native Android verify, Maestro, extended regression (enforce at release via process).

## Expected duration

| Scenario | Wall clock (typical) |
|----------|----------------------|
| Web PR fast CI | **~4–8 min** |
| Extended regression (async) | ~15–25 min |

## Parallel development

1. Focused local tests → open PR → fast CI.  
2. Next branch off `main` without waiting for extended regression.  
3. Merge when fast CI green + approval.  
4. Before web release: extended regression green on release SHA.
