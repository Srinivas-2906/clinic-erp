# M7 — Closure report

**Date:** 2026-10-22 (updated 2026-10-24)  
**Canonical repo:** [Srinivas-2906/clinic-erp](https://github.com/Srinivas-2906/clinic-erp)

## PR #6

| Item | Result |
|------|--------|
| PR | [#6](https://github.com/Srinivas-2906/clinic-erp/pull/6) **merged** (squash → `9f9d412`) |
| CI | Green on `feature/m7-saas-foundation` before merge |
| Branch protection | None configured on `main` (404 from GitHub API) |
| M7 scope on `main` | Entitlements, audit list/export, reminder jobs + mock worker, staging Cloud Build URL wiring, `13_M7_DATABASE_DECISION.md` |

## GitHub staging deploy

| Run | Outcome | Notes |
|-----|---------|--------|
| [39677266949](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39677266949) | Failed | GitHub WIF SA could not write to `clinic-erp-staging_cloudbuild` |
| [39727596876](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39727596876) | Failed | IAM fixed; still failed (bucket access) |
| [39728762897](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39728762897) | Failed (GHA poll) | Cloud Build **SUCCESS** `a200bd31` — GHA got HTTP **429** while polling build status (concurrent local submit) |
| [39731216613](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39731216613) | **Success** | `main` @ `bbfe1b9` (PR #7); Cloud Build **`8112cb7b`**; async poll fix verified |

**Root cause:** `github-clinic-erp-staging@…` lacked Cloud Build default bucket + `serviceusage.serviceUsageConsumer` (and related) permissions. **Fix applied in GCP** and codified in `infra/staging/provision.sh`. PR [#7](https://github.com/Srinivas-2906/clinic-erp/pull/7) merged: async Cloud Build submit + retry polling, audit export rate limit, reminder job claim lock.

## Deployed staging (validated)

| Service | URL |
|---------|-----|
| `clinic-api-staging` | `https://clinic-api-staging-ofczrxs2ca-el.a.run.app` |
| `kaana-clinic-staging` | `https://kaana-clinic-staging-ofczrxs2ca-el.a.run.app/?tenant=dentacare` |

**Source commit:** `bbfe1b9` via GHA deploy [39731216613](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39731216613).  
**Cloud Build:** `8112cb7b-fadf-47b9-a5bf-4a6b4ce8c06c` ([console](https://console.cloud.google.com/cloud-build/builds/8112cb7b-fadf-47b9-a5bf-4a6b4ce8c06c?project=339065153036)).  
**Revisions:** see Cloud Run console (revision names rotate each deploy; latest ready revision matches build `8112cb7b` image tag).  
**Env (API):** `PUBLIC_URL` and `CLINIC_CRM_URL` set dynamically; `REMINDER_DELIVERY_ENABLED=0`; demo seed via `CLINIC_ALLOW_DEMO_SEED=1` + Secret Manager password only.

**Scaling:** `max-instances=1` target on both services (SQLite safety).

## Authenticated staging evidence

Script: `scripts/staging-validate.mjs` — password from `STAGING_DEMO_PASSWORD` or Secret Manager `clinic-staging-demo-password` (never printed).

Checks passed (2026-10-22, pre-`8112cb7b`): health, owner login, entitlements, patients, doctors, audit + CSV, slots, CRM.

**Re-run after deploy:** `gcloud auth login` (or export `STAGING_DEMO_PASSWORD`) then `node scripts/staging-validate.mjs`.

**Not fully automated in script (manual / next):** staff approve/reject E2E, binary file upload + GET, reminder job timing, Litestream restore drill, Playwright responsive CRM.

## Security / reliability fixes (PR #7 on `main`)

- Audit CSV export: per-tenant/user rate limit (`AUDIT_EXPORT_RATE_*`), existing 1000-row cap.
- Reminder worker: `pending` → `processing` claim before send (reduces duplicate delivery on overlapping polls).
- Staging demo: production requires `CLINIC_ALLOW_DEMO_SEED=1` + secret password (no default password in prod).

## GCP budget

Attempted `$10/month` budget on billing account `017956-7B909E-A19606` scoped to project `339065153036`. **Blocked:** `gcloud billing budgets create` → `INVALID_ARGUMENT`; listing budgets requires Billing Budget API on quota project and billing account permissions. **Minimum human action:** Billing Admin creates budget in Console or grants `billing.budgets.create` + enables `billingbudgets.googleapis.com` on a project with billing quota.

## GitHub environment

- Environment **`staging`** exists; repo variables `GCP_STAGING_*` and `GCP_WIF_PROVIDER` set (no secrets in variables).
- **Deployment protection rules:** empty (`protection_rules: []`). Required reviewers typically need GitHub Team/Enterprise; not available on current plan — mitigation: manual `workflow_dispatch` with `confirm=deploy-staging` + private repo.

## Production

**Unchanged** — `crucial-accord-505607-g9` not modified.

## Remaining blockers

1. **Billing budget** — Billing Admin (see above).
2. Optional: branch protection on `main` (require CI before merge).
3. E2E Playwright against staging URL; Litestream backup/restore drill on staging bucket only.
4. Local **gcloud re-auth** to re-run `scripts/staging-validate.mjs` against build `8112cb7b` (HTTP health checks OK as of 2026-10-24).

## M8 — recommended batch (no live Razorpay)

See `12_IMPLEMENTATION_ROADMAP.md`. Summary:

1. **After DB decision (SQLite OK for now):** tenant provisioning API + admin-only clinic create (no public signup yet).
2. **Self-serve signup wizard (CRM)** → calls provisioning; synthetic staging tenants only.
3. **Subscription lifecycle** — plan status fields, webhook endpoints, Razorpay **sandbox** only after explicit approval.
4. **Clinical value (parallel once tenant id stable):** structured visit notes → prescriptions (structured + PDF) → link to existing reminders.
5. **Doctor/staff onboarding** — extends existing access-request + entitlements (already partially shipped).

**Do together safely:** provisioning API + admin create + entitlements enforcement tests.  
**Needs Postgres path first (defer):** multi-branch Enterprise, heavy analytics, cross-tenant reporting.
