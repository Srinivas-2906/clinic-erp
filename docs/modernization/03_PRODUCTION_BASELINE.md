# Production baseline — Clinic ERP

Last updated: **2026-10-21 (M3 — verified via GCP)**

## GCP project identity (verified)

| Field | Value |
|-------|--------|
| **Project ID** | `crucial-accord-505607-g9` |
| **Display name** | `kaana-prod` |
| **Project number** | `888176696307` |
| **Region** | `asia-south1` |

GitHub Actions / docs often say `project_id: kaana-prod`; the **actual** deploy target for clinic is **`crucial-accord-505607-g9`**. Use `gcloud config set project crucial-accord-505607-g9` (not the string `kaana-prod` unless that is a separate project you can access).

### GCP access (reconciled M4)

| Account | `gcloud config set project kaana-prod` | `gcloud config set project crucial-accord-505607-g9` |
|---------|----------------------------------------|------------------------------------------------------|
| `navya-teja@schoolofinterest.com` | **Fails** — not a member of project id `kaana-prod` (if it exists separately) | **Works** — `run.services.get/list`, bucket metadata |
| `yarrala.srinivas@gmail.com` | Partial / misleading | Lists other Run services; `clinic-api` **not found** in partial views |
| `admin@influmojo.com` | Reauth required in automation | Not verified |

**Rule:** Always use project ID **`crucial-accord-505607-g9`** for production clinic infrastructure. Console display name **kaana-prod** is not the API project id.

**Verified (M4 re-check):** `navya-teja@schoolofinterest.com` + `crucial-accord-505607-g9` → revisions `clinic-api-00018-4c5`, `kaana-clinic-00009-hgd` unchanged.

## Live endpoints

| URL | Result |
|-----|--------|
| `https://clinic.kaana.in/` | HTTP 200 |
| `https://clinic-api.kaana.in/api/health` | `standalone: true` |
| Run URL (API) | `https://clinic-api-nhgux56o2a-el.a.run.app` |
| Run URL (UI) | `https://kaana-clinic-nhgux56o2a-el.a.run.app` |

## Cloud Run — production baseline

### `clinic-api`

| Field | Value |
|-------|--------|
| Latest ready revision | `clinic-api-00018-4c5` |
| Revision created | `2026-09-29T06:16:40Z` |
| Traffic | 100% → latest revision |
| Image (tag) | `asia-south1-docker.pkg.dev/crucial-accord-505607-g9/kaana/clinic-api:d3.1-clinic-20260929-742c4ce1` |
| Image (digest) | `sha256:2bb647875bbcbdc9bc3a9af95176a5222442ac0e82f648b364b656b83a606db2` |
| Litestream bucket | `crucial-accord-505607-g9-db` |
| Patient files (GCS) | bucket `crucial-accord-505607-g9-db`, prefix `clinic-files` |
| Runtime SA | `kaana-api-runner@crucial-accord-505607-g9.iam.gserviceaccount.com` |
| JWT secret (name) | `kaana-jwt-secret` |

### `kaana-clinic`

| Field | Value |
|-------|--------|
| Latest ready revision | `kaana-clinic-00009-hgd` |
| Revision created | `2026-09-29T06:17:52Z` |
| Traffic | 100% → `kaana-clinic-00009-hgd` |
| Image (tag) | `asia-south1-docker.pkg.dev/crucial-accord-505607-g9/kaana/clinic-crm:d3.1-clinic-20260929-742c4ce1` |
| Image (digest) | `sha256:a9e2f92acff927720233e933b3c8652db9c74877073eea341864421174f60cc1` |
| `CLINIC_API_ORIGIN` | `https://clinic-api-nhgux56o2a-el.a.run.app` |

Both services last modified via deploy on **2026-09-29** (Ready conditions). `lastModifier` annotation: `navya-teja@schoolofinterest.com`.

## Source commit correlation

| Evidence | Value |
|----------|--------|
| Image tag suffix | `742c4ce1` (in tag `d3.1-clinic-20260929-742c4ce1`) |
| GitHub `Srinivas-2906/kaana-prod` @ `742c4ce1` | **Not found** (short SHA not in recent history via API) |
| GitHub `Srinivas-2906/clinic-erp` @ `742c4ce1` | **Not found** |

**Baseline record:** treat **image digests above** and tag **`d3.1-clinic-20260929-742c4ce1`** as the authoritative production artifact IDs until a matching commit is located (may be from another branch, repo, or manual tag).

## Storage / backup (metadata only)

| Resource | Detail |
|----------|--------|
| `gs://crucial-accord-505607-g9-db` | STANDARD, `ASIA-SOUTH1`, created 2026-08-15, uniform bucket-level access |

No object listing or DB download performed.

## Deployment triggers (unchanged)

| Source | Notes |
|--------|--------|
| `Srinivas-2906/kaana-prod` `deploy-clinic.yml` | Still targets `project_id: kaana-prod` in yaml — **verify** against real project ID before any deploy |
| `Srinivas-2906/clinic-erp` | PR #1 merged: **no** push-to-prod; manual WIF workflows only |

## Local capture script

`scripts/capture-production-baseline.sh` — re-run after auth; default project should be `crucial-accord-505607-g9`.
