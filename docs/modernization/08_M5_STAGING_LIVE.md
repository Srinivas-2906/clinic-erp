# M5 — Staging live (evidence)

**Status:** Staging provisioned and deployed (2026-10-22). Production unchanged.

## GCP project and billing

| Item | Value |
|------|--------|
| Project ID | `clinic-erp-staging` |
| Project number | `339065153036` |
| Display name | Clinic ERP Staging |
| Org | `schoolofinterest.com` (`48286339910`) |
| Billing account | `017956-7B909E-A19606` (My Billing Account, OPEN) |
| Region | `asia-south1` |

**Auth used:** `navya-teja@schoolofinterest.com` (project Owner on staging).

## URLs (synthetic QA only)

| Service | URL |
|---------|-----|
| API | https://clinic-api-staging-339065153036.asia-south1.run.app |
| CRM | https://kaana-clinic-staging-339065153036.asia-south1.run.app |
| CRM with tenant | https://kaana-clinic-staging-339065153036.asia-south1.run.app/?tenant=dentacare |

**Note:** Org policy blocks `allUsers` `run.invoker`; services use `--no-invoker-iam-check` (same pattern as production `run.googleapis.com/invoker-iam-disabled`).

## Infrastructure created

| Resource | Name / detail |
|----------|----------------|
| APIs | Run, Cloud Build, Artifact Registry, Secret Manager, Storage, IAM, IAM Credentials, Logging, Monitoring, Cloud Billing, Billing Budgets |
| Artifact Registry | `asia-south1-docker.pkg.dev/clinic-erp-staging/clinic/` |
| GCS bucket | `gs://clinic-erp-staging-clinic-db` (Litestream `clinic.db/`, uploads `clinic-files-staging/`) |
| Secret | `clinic-staging-jwt-secret` (new random, not copied from prod) |
| Service accounts | `clinic-staging-runner`, `clinic-staging-cloudbuild`, `github-clinic-erp-staging` |
| WIF | Pool `github`, provider `github-provider`, repo `Srinivas-2906/clinic-erp` |
| Cloud Run | `clinic-api-staging` (512Mi, min 0, max 1), `kaana-clinic-staging` (256Mi, min 0, max 1) |
| Provision script | `infra/staging/provision.sh` |

### GitHub configuration

Repo variables set (verified via `gh variable list`):

- `GCP_STAGING_PROJECT_ID` = `clinic-erp-staging`
- `GCP_STAGING_DEPLOYER_SA` = `github-clinic-erp-staging@clinic-erp-staging.iam.gserviceaccount.com`
- `GCP_WIF_PROVIDER` = `projects/339065153036/locations/global/workloadIdentityPools/github/providers/github-provider`

**Blockers / follow-ups:**

1. **GitHub `staging` environment** — API returned 403 (needs repo admin). Create environment `staging` in GitHub UI if you want protection rules on `deploy-staging.yml`.
2. **$10 budget alerts** — `gcloud billing budgets create` failed: Billing Budget API not enabled on default project + likely needs Billing Admin on `017956-7B909E-A19606`. Create budget in [Cloud Console → Billing → Budgets](https://console.cloud.google.com/billing/budgets) scoped to `clinic-erp-staging`.
3. **Workflow deploy** — First GHA run failed (wrong Cloud Build SA). Fix on branch `feature/m5-staging-live` (use `clinic-staging-cloudbuild@…` for `gcloud builds submit`). Local `gcloud builds submit` succeeded for API; CRM deploy completed after IAM fix.

## Deployment

| Method | Result |
|--------|--------|
| Local `gcloud builds submit` | Build `77003efd-ae67-43a9-bc3f-23c13b70ea71` — API OK; CRM failed until compute SA `actAs` granted |
| Manual `gcloud run deploy` | CRM `kaana-clinic-staging-00001-fr2`; API revisions through `clinic-api-staging-00003-l9l` |
| GHA `deploy-staging` run [39661570427](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39661570427) | Failed (bucket access / wrong build SA) — retry after merge |

**Images (example):** `clinic-api-staging:77003efd-…`, `clinic-crm-staging:77003efd-…`

**Env (staging):** `SKIP_DEMO_SEED=0`, tenant slug `dentacare`, demo users from `apps/api/src/db/index.js` (synthetic).

## Functional verification (API, 2026-10-22)

| Check | Evidence |
|-------|----------|
| API health | `GET /api/health` → `{"ok":true,"service":"clinic-api","standalone":true}` |
| CRM shell | `GET /` → HTTP 200 |
| Login | `POST /api/platform/login` (demo owner, `tenantSlug=dentacare`) → JWT |
| Patient create | `POST /api/patients` → `Staging Test Patient` id `55tYhQVqZ4Jz` |
| Doctors | `GET /api/clinic/doctors` → default doctor migrated |
| Slots / appointment | `GET /api/appointments/slots`, `POST /api/appointments` → id `3KhrRfLcirMf` |
| Payment | `POST /api/clinic/payments` → id `Cuq1ngFvGqYr` |
| Upload + download | `POST /api/clinic/uploads` (PNG) → `GET` file URL HTTP 200; object under `gs://…/clinic-files-staging/` |
| SQLite + Litestream | `gs://clinic-erp-staging-clinic-db/clinic.db/` present after writes |
| Restart persistence | New revision `clinic-api-staging-00003-l9l`; patient search still returns `55tYhQVqZ4Jz` |

**Not fully exercised this session:** CRM UI login walkthrough (browser), Litestream explicit restore drill (inferred from replica path + post-restart data), prescriptions UI, reports CSV in browser.

## Production unchanged

| Check | Before / after |
|-------|----------------|
| `clinic-api` revision | `clinic-api-00018-4c5` |
| `kaana-clinic` revision | `kaana-clinic-00009-hgd` |
| `https://clinic-api.kaana.in/api/health` | HTTP 200 |
| `https://clinic.kaana.in/` | HTTP 200 |

No deploys to `crucial-accord-505607-g9`, no DNS changes, no prod secrets copied.

## Cost

- **Estimate:** ~$3–10/month at scale-to-zero (per `07_M5_APPROVAL_GATE.md`).
- **Actual spend:** Not yet visible in CLI; check Billing → Reports filtered to `clinic-erp-staging` after 24–48h.

## Portable migration notes

All resource names are project-scoped under `clinic-erp-staging`. To move accounts: export IAM/WIF bindings, recreate project + bucket + AR + WIF in target org, update GitHub variables, redeploy from `main`.
