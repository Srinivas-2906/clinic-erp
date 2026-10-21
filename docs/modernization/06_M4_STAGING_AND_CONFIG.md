# M4 — Production baseline finalization & staging preparation

**Date:** 2026-10-21

## Task 1 — Baseline

| Item | Status |
|------|--------|
| PR #2 | **Merged** → `main` @ `0ccc566` |
| Revisions re-verified | `clinic-api-00018-4c5`, `kaana-clinic-00009-hgd` on `crucial-accord-505607-g9` |
| Secrets / patient data in repo | **None** in baseline PR (docs + capture script only) |
| Production deploy triggered | **No** |

## Task 2 — Deployment configuration

| File | Change |
|------|--------|
| `cloudbuild.yaml` | Prod bucket + SA → `crucial-accord-505607-g9-*` |
| `cloudbuild.staging.yaml` | Staging-only; **fails** if `$PROJECT_ID` is production project |
| `deploy-production.yml` | Uses `vars.GCP_PROD_PROJECT_ID`; rejects display name `kaana-prod` |
| `deploy-staging.yml` | Uses `vars.GCP_STAGING_PROJECT_ID`; **blocks** production project id |
| `infra/gcp-projects.md` | Documents prod vs staging project IDs |

**Safety:** No workflow runs on `push`/`pull_request` for deploy. Production requires Environment `production` + confirmation string.

## Task 3 — Staging architecture

See **`infra/staging/ARCHITECTURE.md`** — separate GCP project (proposed `clinic-erp-staging`), WIF, AR, Secret Manager, SQLite+Litestream synthetic data.

## Task 4 — Database recommendation

| Option | Verdict |
|--------|---------|
| **A. SQLite + Litestream for staging** | **Recommended for M4/M5 staging** — matches production runtime; lowest cutover risk. |
| **B. PostgreSQL now** | **Defer** — `kaana-clinic` has Drizzle `schema.js` + `migrate-pg.js` experiments, but `clinic-erp` `apps/api` remains **better-sqlite3** production path; PG is not wired end-to-end in canonical repo. |

Revisit Postgres when planning multi-tenant SaaS scale (post-staging validation), importing lessons from `Demos/kaana-clinic` incrementally.

## Approvals before provisioning staging

1. Create GCP project + billing link  
2. Budget alert threshold  
3. Staging project ID registered in GitHub vars  
4. WIF pool + staging deployer SA  
5. Human gate on GitHub `staging` environment  
6. Confirm **no** DNS change to prod hosts until explicit milestone  

## Next milestone (M5)

Provision staging project (terraform or scripted), run first manual `deploy-staging`, smoke tests with synthetic tenant, then plan production cutover workflow from `clinic-erp` only.
