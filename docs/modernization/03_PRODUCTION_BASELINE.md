# Production baseline — Clinic ERP

Last updated: **2026-10-21 (M3)**

## Live endpoints (read-only curl)

| URL | Result |
|-----|--------|
| `https://clinic.kaana.in/` | HTTP 200 |
| `https://clinic-api.kaana.in/api/health` | `{"ok":true,"service":"clinic-api","standalone":true}` |
| `https://clinic-api.kaana.in/api/clinics/dentacare/doctors` | **404** (multi-doctor API not on prod) |

## M3 GCP access (2026-10-21)

| Account | `kaana-prod` access | `clinic-api` / `kaana-clinic` |
|---------|---------------------|-------------------------------|
| `navya-teja@schoolofinterest.com` | **Denied** (`projects.get` / not a member) | N/A |
| `yarrala.srinivas@gmail.com` | **Partial** — can `run.services.list` in `asia-south1` | **Not listed** — only `aquafarm-api`, `aquafarm-web`, `only-gods` visible |
| `admin@influmojo.com` | Token refresh failed in agent shell | N/A |

**Agent `gcloud` status:** blocked after corrupt line `th1` in `~/.config/gcloud/configurations/config_default` (remove that line locally, then re-run describe commands).

**IAM needed (read-only baseline, no changes made):** an identity with **`roles/run.viewer`** (or `run.services.get`) on project **`kaana-prod`** *and* visibility of services `clinic-api` and `kaana-clinic`. If those services live in another project (e.g. `crucial-accord-505607-g9`), the same role on that project.

## Verified production revision / image

| Field | Value |
|-------|--------|
| Cloud Run revision (API) | **Not obtained** |
| Cloud Run revision (UI) | **Not obtained** |
| Container image @ digest | **Not obtained** |
| Cloud Build → git SHA | **Not obtained** |

**Do not treat GitHub `kaana-prod` `main` SHAs as production proof** until Run/Build metadata is read.

## Inferred topology (config only — not verified against live GCP this session)

| Resource | Documented name |
|----------|-----------------|
| Project | `kaana-prod` (workflows); Run URL suffix `wtba53dhka` matches other services in partial list |
| Region | `asia-south1` |
| Services | `clinic-api`, `kaana-clinic` |
| Litestream bucket (metadata) | `kaana-prod-db` |
| JWT secret (name only) | `kaana-jwt-secret` |

## Deployment triggers (unchanged — legacy)

| Source | Trigger | M3 action |
|--------|---------|-----------|
| `Srinivas-2906/kaana-prod` `deploy-clinic.yml` | Push `main` + clinic paths | **Not modified** |
| `kaana-prod` root `cloudbuild.yaml` | Manual / suite | **Not modified** |
| `Srinivas-2906/clinic-erp` | **No push deploy** after PR #1 merge | `deploy-production.yml` / `deploy-staging.yml` = `workflow_dispatch` only |

## Customer data

No DB, Litestream restore, or GCS object reads in M3.

## Commands to complete baseline (run locally after fixing `config_default`)

```bash
gcloud config set project kaana-prod
gcloud run services describe clinic-api --region asia-south1 \
  --format='yaml(status.latestReadyRevisionName,status.traffic,spec.template.spec.containers[0].image)'
gcloud run services describe kaana-clinic --region asia-south1 \
  --format='yaml(status.latestReadyRevisionName,status.traffic,spec.template.spec.containers[0].image)'
gcloud builds list --project kaana-prod --filter='substitutions._CLINIC_API_SERVICE:clinic-api OR images:clinic-api' --limit=5
gsutil ls -L -b gs://kaana-prod-db 2>/dev/null | head -20   # bucket metadata only
```
