# Staging architecture — separate GCP project (M4)

**Status:** Design only. **No resources provisioned.**

## Project boundary

| | Production | Staging |
|--|------------|---------|
| GCP project ID | `crucial-accord-505607-g9` | **New** e.g. `clinic-erp-staging` |
| Customer data | Denta Care (real) | **Synthetic only** |
| DNS | `clinic.kaana.in` | `*.run.app` initially (optional `clinic-staging.kaana.in` later) |

Staging must **not** use `crucial-accord-505607-g9-db`, `kaana-jwt-secret`, or service names `clinic-api` / `kaana-clinic`.

## Required GCP APIs (staging project)

- `run.googleapis.com`
- `cloudbuild.googleapis.com`
- `artifactregistry.googleapis.com`
- `secretmanager.googleapis.com`
- `storage.googleapis.com`
- `iam.googleapis.com`
- `iamcredentials.googleapis.com` (WIF)
- `logging.googleapis.com` / `monitoring.googleapis.com` (observability)

## Cloud Run

| Service | Purpose | Sizing |
|---------|---------|--------|
| `clinic-api-staging` | API + SQLite volume + Litestream | 512Mi, max 1 instance, scale to zero |
| `kaana-clinic-staging` | CRM static + proxy env | 256Mi, max 1 instance |

**Auth:** Public invoker for desk QA (same as prod pattern) or IAP later; no production IAM bindings copied blindly.

## Database / storage (staging)

**M4 choice: SQLite + Litestream parity (Option A)**

- Empty SQLite on first deploy; `SKIP_DEMO_SEED=0` + seed scripts for fake tenant `dentacare-staging`.
- Litestream replica bucket: `gs://<staging-project-id>-clinic-db` (new bucket, new SA, no prod IAM).
- Uploads: `CLINIC_FILES_BUCKET` = same staging bucket, prefix `clinic-files-staging/`.

No connection to production Litestream path or `clinic.db` replica.

## Service accounts (minimum IAM)

| SA | Roles (staging project only) |
|----|------------------------------|
| `clinic-staging-runner@...` | `secretmanager.secretAccessor` on staging JWT; `storage.objectAdmin` on staging bucket only |
| `clinic-staging-cloudbuild@...` | `cloudbuild.builds.builder`, `run.admin`, `iam.serviceAccountUser` on runner SA, `artifactregistry.writer` |
| GitHub WIF deployer `github-clinic-erp-staging@...` | `iam.workloadIdentityUser` binding; impersonate cloudbuild SA only |

**Deny:** any `storage.*` on `crucial-accord-505607-g9-db`.

## Secret Manager

- `clinic-staging-jwt-secret` — new random value; never copy prod version.
- Optional: `clinic-staging-litestream-config` if not inlined in Cloud Run env.

## Artifact Registry

- Repository: `asia-south1-docker.pkg.dev/<staging-project>/clinic/` (or `kaana` name for consistency).
- Images: `clinic-api-staging:*`, `clinic-crm-staging:*` only.

## GitHub WIF (staging)

1. Pool + OIDC provider: `attribute.repository=Srinivas-2906/clinic-erp`.
2. SA `github-clinic-erp-staging@<staging-project>.iam.gserviceaccount.com`.
3. Repo variables: `GCP_WIF_PROVIDER`, `GCP_STAGING_DEPLOYER_SA`, `GCP_STAGING_PROJECT_ID`.
4. Environment `staging` with required reviewers on `deploy-staging.yml`.

Production WIF (future cutover): separate SA + `production` environment + `GCP_PROD_PROJECT_ID=crucial-accord-505607-g9`.

## Backup strategy (staging)

- Litestream continuous backup to staging bucket; 7-day object lifecycle delete (cost control).
- No cross-project replication.

## Monitoring & cost controls

- Budget alert e.g. $25/month on staging project.
- Log-based metric for 5xx on staging Run only.
- `max-instances: 1`, no min instances.
- Scheduled optional: Cloud Scheduler → scale to 0 / delete old images (manual cleanup doc).

## Estimated cost

~**$5–15/month** with occasional deploys and scale-to-zero; spikes if min-instances > 0 or Playwright load tests run continuously.

**Billing risk:** deploying staging into **production project** by wrong `--project` — mitigated by separate project ID variable and workflow guard (see `deploy-staging.yml`).

## Cleanup procedure

1. Delete Cloud Run services `clinic-api-staging`, `kaana-clinic-staging`.
2. Empty and delete staging GCS bucket.
3. Delete Artifact Registry images / repo.
4. Remove WIF provider bindings; delete SAs.
5. Delete staging GCP project (if dedicated).
