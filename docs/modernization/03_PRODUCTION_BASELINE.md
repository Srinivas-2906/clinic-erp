# Production baseline — Clinic ERP

## Live endpoints (verified 2026-10-21)

| URL | Check | Result |
|-----|--------|--------|
| `https://clinic.kaana.in/` | HTTP status | 200 |
| `https://clinic-api.kaana.in/api/health` | JSON body | `{"ok":true,"service":"clinic-api","standalone":true}` |
| `https://clinic-api.kaana.in/api/clinics/dentacare/doctors` | Unauthenticated probe | **404** (multi-doctor routes not on prod) |

Infrastructure headers: `server: Google Frontend`, `via: 1.1 google` (Cloud Run / GLB).

## Intended GCP topology (from repo config)

Documented in `kaana-prod` (`DEPLOY_APPS.md`, `cloudbuild.clinic.yaml`, `scripts/url-map-multi.yaml`):

| Resource | Name / value |
|----------|----------------|
| GCP project (deploy) | `kaana-prod` |
| Region | `asia-south1` |
| Cloud Run — UI | `kaana-clinic` |
| Cloud Run — API | `clinic-api` |
| Artifact Registry | `asia-south1-docker.pkg.dev/.../kaana/clinic-api` & `clinic-crm` |
| DB | SQLite at `/data/clinic.db` + `LITESTREAM_BUCKET=kaana-prod-db` |
| Service account (runtime) | `kaana-api-runner@kaana-prod.iam.gserviceaccount.com` |
| JWT secret | Secret Manager `kaana-jwt-secret` |
| Tenant slug (build arg) | `dentacare` |
| Public API URL substitution | `https://clinic-api-wtba53dhka-el.a.run.app` (in yaml; custom domain `clinic-api.kaana.in` via URL map) |

### Historical GCP account (unverified this session)

- Local `gcloud` active account: `navya-teja@schoolofinterest.com`
- Default project in config: `crucial-accord-505607-g9`
- **Deploy workflows explicitly use `kaana-prod`** — treat `kaana-prod` as production project for clinic.

## Deployment mechanism

### Path-filtered GitHub Actions

Workflow: `.github/workflows/deploy-clinic.yml` in `kaana-prod`

- Triggers on push to **`main`** when `clinic-api/**`, `clinic-crm/**`, or `cloudbuild.clinic.yaml` change.
- Runs `gcloud builds submit` with `cloudbuild.clinic.yaml`.

**Observed runs (GitHub API):** 3 total, **0 successes**, last run 2026-08-15 (failure).

Implication: **current production is not reliably tied to green GHA clinic deploys.** Manual Cloud Build, older revision, or suite `cloudbuild.yaml` deploy is likely.

### Legacy suite build

Root `cloudbuild.yaml` in `kaana-prod` still contains clinic image build steps (`clinic-crm` → service `kaana-clinic`). Pushing unrelated products with a full suite build could theoretically redeploy clinic—**risk** if anyone runs monolithic build.

## Production source commit

| Method | Result |
|--------|--------|
| Cloud Run revision labels / image env | **Not obtained** (gcloud reauth required) |
| GitHub Actions success SHA | **None** for clinic workflow |
| GitHub last commit touching `clinic-api` on `main` | `32dd159e4164a0c9526b92edf761a9f77fc05af3` |
| GitHub last commit touching `clinic-crm` on `main` | `6768e5cdf9a0205181730e47fd3b22df8a498841` |
| Behavioral match (no doctors API) | Consistent with **`main` without Demos uncommitted work** |

**Best estimate:** production runs code **at or before** `6768e5c` / `32dd159` on `kaana-prod` `main`, but **exact parity is unproven** until GCP revision metadata is read.

## Customer data

- No database download, Litestream restore, or GCS writes performed in M1.
- Production SQLite remains on Cloud Run volume + GCS backup bucket per existing config.

## Re-baseline checklist (M3)

1. `gcloud auth login` with deploy-read access to `kaana-prod`.
2. `gcloud run services describe clinic-api` / `kaana-clinic` — record `status.latestReadyRevisionName`, image digest, `metadata.annotations`.
3. Compare image build time to Cloud Build history in `kaana-prod`.
4. Fix `deploy-clinic` workflow and run a dry-run staging service before next prod promote.
