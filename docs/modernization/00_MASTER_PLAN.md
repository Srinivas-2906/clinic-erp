# Clinic ERP modernization — master plan

**Milestone 1 status:** Complete (local workspace + docs).  
**Milestone 2 status:** Feature branch pushed to `clinic-erp`; safe CI added; **production unchanged**. See `05_M2_CANONICAL_REPO.md`.

## Vision

Move Clinic ERP from a folder inside the Kaana multi-product monorepo (`Srinivas-2906/kaana-prod`) to an independent product repository and workspace, without disrupting the live Denta Care tenant (`clinic.kaana.in`, tenant `dentacare`).

## Milestones (high level)

| # | Milestone | Scope | M1 status |
|---|-----------|--------|-----------|
| M1 | Repository & workspace separation | Discover sources of truth; standalone local workspace; document risks | **In progress (local workspace done)** |
| M2 | Canonical GitHub & CI cutover | Point deploy workflows at `clinic-erp`; retire `kaana-prod` path filters for clinic | **Blocked — approval required** |
| M3 | Production baseline lock | Pin prod revision ↔ git SHA; fix failing `deploy-clinic` workflow | **Blocked — GCP auth + approval** |
| M4 | Shared dependency cleanup | `dental-clinic`, marketing portfolio, URL map scripts | Not started |
| M5+ | Product redesign / GCP migration | Postgres, multi-tenant scale, etc. | **Out of scope for M1** |

## Verified facts (2026-10-21)

- **Production is up:** `https://clinic.kaana.in/` → HTTP 200; `https://clinic-api.kaana.in/api/health` → `{"ok":true,"service":"clinic-api","standalone":true}`.
- **GCP project for deploy config:** GitHub Actions use `project_id: kaana-prod` (not the historical `crucial-accord-505607-g9` default in local `gcloud`).
- **Local `gcloud`:** token refresh failed (non-interactive); Cloud Run revision/image SHA **not verified** this session.
- **GitHub `deploy-clinic` workflow:** only **3 runs**, all **failed**; clinic has **no successful GHA deploy** on record. Prod likely deployed manually or via legacy suite `cloudbuild.yaml` (unverified).

## M1 deliverables

1. Evidence in `01_SOURCE_OF_TRUTH.md`, `03_PRODUCTION_BASELINE.md`, `04_DECISIONS_AND_RISKS.md`.
2. Local canonical workspace: `/Users/srinivas/Downloads/clinic-erp` on branch `feature/m1-repository-separation`.
3. Synced code from `Demos/clinic-api` + `Demos/clinic-crm` (including uncommitted Phase 1 / multi-doctor / upload work).
4. Adapted `cloudbuild.yaml` and `.github/workflows/deploy-clinic.yml` for `apps/api` and `apps/crm` paths (**not pushed**).

## Explicit non-goals (M1)

- No production deploys, DB migrations, or Litestream/GCS writes.
- No push to `main` on any remote.
- No product redesign or Postgres cutover.

## Next recommended milestone

**M2 — Canonical remote & safe CI:** push `feature/m1-repository-separation` to `Srinivas-2906/clinic-erp`, add path-filtered deploy workflow, run a **staging** Cloud Build, then plan cutover off `kaana-prod` with a maintenance window.
