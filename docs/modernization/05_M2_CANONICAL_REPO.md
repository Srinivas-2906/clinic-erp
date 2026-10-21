# M2 — Canonical repository and safe CI

**Date:** 2026-10-21  
**Repository:** [Srinivas-2906/clinic-erp](https://github.com/Srinivas-2906/clinic-erp)  
**Branch:** `feature/m1-repository-separation`  
**PR:** https://github.com/Srinivas-2906/clinic-erp/pull/1

## Canonical status

| Item | Status |
|------|--------|
| Local workspace | `/Users/srinivas/Downloads/clinic-erp` |
| GitHub canonical target | `Srinivas-2906/clinic-erp` |
| Production deploy source (today) | Still `Srinivas-2906/kaana-prod` (`clinic-api/`, `clinic-crm/`) |
| Auto-deploy from `clinic-erp` | **Disabled** — no push-triggered production workflow |

## Commit (M2)

Recorded at push time in git log on `feature/m1-repository-separation`.

## Source preservation (Task 1)

- Synced from Demos `clinic-api` / `clinic-crm` including Phase 1 multi-doctor, uploads, e2e specs.
- **Excluded from git:** `apps/api/data/` (local SQLite), `.env*`, `clinic-auth.json`, e2e `*.png` (removed from index; kept locally).
- **Local CI validation:** API 47 tests, CRM 24 Vitest tests, CRM production build — all pass.

## Production revision evidence (Task 2)

**GCP read access: blocked for clinic services this session.**

| Account | Result |
|---------|--------|
| `navya-teja@schoolofinterest.com` | `run.services.get/list` denied on `kaana-prod` |
| `yarrala.srinivas@gmail.com` | Can list some Run services in `kaana-prod` but **`clinic-api` not found** (partial project view) |
| `admin@influmojo.com` | Token refresh required (`gcloud auth login`) |

**Live endpoints (read-only curl):**

- `https://clinic.kaana.in/` → 200
- `https://clinic-api.kaana.in/api/health` → `standalone: true`
- `https://clinic-api.kaana.in/api/clinics/dentacare/doctors` → 404

**Strongest non-GCP evidence:** prior `kaana-prod` Cloud Build config references Run URL suffix `wtba53dhka` and services `clinic-api` / `kaana-clinic`. **Exact revision name, image digest, build ID, and git SHA remain unverified** until an account with `run.services.get` on production namespace completes `gcloud auth login`.

## CI (Task 3)

| Workflow | Trigger | Deploys prod? |
|----------|---------|---------------|
| `.github/workflows/ci.yml` | PR + push to `main` / `feature/*` | **No** |
| `deploy-production.yml` | Manual dispatch + confirmation string + `production` environment | Only after cutover + WIF vars |
| `deploy-staging.yml` | Manual dispatch + `staging` environment | Staging only (not provisioned) |

Auth pattern for deploy workflows: **Workload Identity Federation** (`vars.GCP_WIF_PROVIDER`, `vars.GCP_PROD_DEPLOYER_SA` / `GCP_STAGING_DEPLOYER_SA`) — no JSON key in repo.

**GitHub Actions CI result:** pending first run on pushed branch (local equivalent PASS).

## Staging proposal (Task 4)

See [`infra/staging/README.md`](../../infra/staging/README.md). **No GCP resources created.**

Estimated light-use cost: **~$1–10/month**.

## Legacy deployment risks (Task 5)

### kaana-prod triggers

| Path | Trigger | Risk |
|------|---------|------|
| `.github/workflows/deploy-clinic.yml` | Push `main` + `clinic-api/**`, `clinic-crm/**` | Would Cloud Build prod (workflow historically **failed** but still attempts) |
| `cloudbuild.clinic.yaml` | Invoked by above | Deploys `clinic-api` + `kaana-clinic` with **prod bucket/secrets** |
| Root `cloudbuild.yaml` | Manual / legacy suite | Contains `build-clinic` / `deploy-clinic` steps for `clinic-crm` image `clinic` → `kaana-clinic` |

### Cutover plan (not executed)

1. Green CI on `clinic-erp` `main`.
2. Provision staging; validate `cloudbuild.staging.yaml`.
3. Wire WIF + GitHub environments.
4. Single production deploy from `clinic-erp` with maintenance window.
5. Disable `deploy-clinic.yml` path trigger on `kaana-prod` (approval).
6. Keep `clinic-api/` folders in kaana-prod read-only archive until rollback window ends.

## Remaining approvals

- [ ] `gcloud auth login` (account with `kaana-prod` Run read)
- [ ] Merge PR after CI green
- [ ] Create WIF pool + GitHub vars
- [ ] Approve staging GCP spend + first `deploy-staging`
- [ ] Approve production cutover + kaana-prod workflow change
