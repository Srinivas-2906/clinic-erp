# Clinic ERP — staging environment (proposal)

**Status:** Not provisioned. No GCP resources created in M2.

## Goals

- Exercise full UI + API deploy path without touching Denta Care production.
- Synthetic tenant data only (`dentacare-staging`).
- No access to production Litestream bucket, SQLite file, patient uploads, or `kaana-jwt-secret`.

## Proposed architecture

| Component | Production (unchanged) | Staging (new) |
|-----------|----------------------|---------------|
| Cloud Run API | `clinic-api` | `clinic-api-staging` |
| Cloud Run UI | `kaana-clinic` | `kaana-clinic-staging` |
| Litestream GCS bucket | `kaana-prod-db` | `kaana-clinic-staging-db` (new) |
| JWT secret | `kaana-jwt-secret` | `clinic-staging-jwt-secret` (new) |
| Runtime SA | `kaana-api-runner@...` | `clinic-staging-runner@...` (new, bucket-only) |
| Hostnames | `clinic.kaana.in` | `clinic-staging.kaana.in` (optional; or `*.run.app` only) |

## Isolation controls

1. **Separate Cloud Run services** — no shared revision or env pointing at prod bucket.
2. **IAM** — staging SA: `storage.objectAdmin` on staging bucket only; no `kaana-prod-db`.
3. **Secrets** — separate Secret Manager versions; never mount prod JWT on staging.
4. **Build** — `cloudbuild.staging.yaml` with staging image names (`*-staging` tags).
5. **Data** — `SKIP_DEMO_SEED=0` on staging only; seed script creates fake users/patients.

## GitHub Actions

- Workflow: `.github/workflows/deploy-staging.yml` ( **workflow_dispatch only** ).
- Auth: **Workload Identity Federation** via repository variables:
  - `GCP_WIF_PROVIDER`
  - `GCP_STAGING_DEPLOYER_SA`
- GitHub **Environment** `staging` with required reviewers.

## WIF setup (one-time, kaana-prod)

1. Create workload identity pool + OIDC provider for `Srinivas-2906/clinic-erp`.
2. Grant `roles/iam.workloadIdentityUser` on a dedicated deployer SA.
3. Grant that SA `roles/cloudbuild.builds.editor`, `roles/run.admin` (scoped), `roles/artifactregistry.writer`.
4. Set GitHub repo **Variables** (not secrets in workflow files).

No `GCP_SA_KEY` JSON in `clinic-erp` secrets.

## Estimated monthly cost (idle-light staging)

| Item | Estimate (asia-south1) |
|------|-------------------------|
| Cloud Run (scale to zero, occasional QA) | ~$0–5 |
| GCS staging bucket (<1 GB synthetic) | ~$0.02 |
| Artifact Registry (staging images) | ~$0.10–1 |
| Cloud Build (per manual deploy) | ~$0.01–0.05 per run |
| **Total (light use)** | **~$1–10 / month** |

Costs rise with min-instances > 0 or frequent e2e against staging.

## Approval gate before `terraform apply` / first deploy

Confirm:

- [ ] Staging bucket name and region
- [ ] Whether to use custom DNS or `run.app` URLs only
- [ ] Budget alert threshold
- [ ] Who may trigger `deploy-staging` workflow
