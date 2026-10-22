# M7 — Delivery report

**Date:** 2026-10-22

## Phase 1 — Staging blockers

| Item | Status |
|------|--------|
| PR #5 merged | Done |
| Cloud Build SA in GHA | Fixed on `main` |
| Staging deploy (M7 code) | Cloud Build **SUCCESS** `1c0c5446` (submit from `feature/m7-saas-foundation`) |
| GitHub `deploy-staging` on `main` | Failed run [39677266949](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39677266949) — `main` lacks M7 until PR #6 merges |
| PUBLIC_URL / CLINIC_CRM_URL | Dynamic in `cloudbuild.staging.yaml` |
| Demo login | `staging-owner@clinic-erp.invalid` + password in Secret Manager `clinic-staging-demo-password` only |
| PR #6 | **Merge required** |
| GitHub `staging` environment | Repo admin |
| $10 budget | Billing admin / Console |
| Production | `clinic-api-00018-4c5` verified |

**URLs:** API `https://clinic-api-staging-ofczrxs2ca-el.a.run.app` · CRM `https://kaana-clinic-staging-ofczrxs2ca-el.a.run.app/?tenant=dentacare`

## Phase 2 — Database

`13_M7_DATABASE_DECISION.md` — keep SQLite + Litestream for now.

## Phase 3 — Shipped in branch

Entitlements, audit API + CRM Activity, reminder jobs + mock provider.

## Tests

56/56 API unit tests.

## Next

Merge PR #6, re-run `deploy-staging`, verify login with secret password in Console.
