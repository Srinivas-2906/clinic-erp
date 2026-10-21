# Source of truth — Clinic ERP (M1)

Last updated: 2026-10-21 (evidence gathering session)

## Local code locations

| Path | Role | Git remote / branch | Notes |
|------|------|---------------------|--------|
| `/Users/srinivas/Downloads/Demos` | Kaana multi-product monorepo | `origin` → `Srinivas-2906/kaana-prod` | Current branch: `feature/phase1-multi-doctor-m1` (same SHA as `origin/main` for clinic commits; **large uncommitted** clinic diff) |
| `/Users/srinivas/Downloads/Demos/clinic-api` | Production-aligned API (SQLite + Litestream env in Cloud Build) | Tracked in `kaana-prod` | Latest **committed** API change on GitHub: `32dd159` |
| `/Users/srinivas/Downloads/Demos/clinic-crm` | Clinic desk UI | Tracked in `kaana-prod` | Latest **committed** CRM change on GitHub: `6768e5c` |
| `/Users/srinivas/Downloads/Demos/kaana-clinic` | Planned “Clinic OS” monorepo (pnpm/turbo) | Nested git: `feature/clinic-standalone-monorepo`; remote `demos` → local Demos path | **Heavy WIP**; includes PostgreSQL/drizzle experiments **not** in `clinic-api` |
| `/Users/srinivas/Downloads/clinic-erp` | **M1 canonical local workspace** | `origin` → `Srinivas-2906/clinic-erp`; branch `feature/m1-repository-separation` | Synced from Demos clinic folders 2026-10-21 |
| `/Users/srinivas/Downloads/clinic-erp` (Aug snapshot) | Stale GitHub `main` | `0d26564` only | Pre–Phase 1; **not** current dev |

## GitHub repositories

| Repository | Default branch | Last push (API) | Clinic relevance |
|------------|----------------|-----------------|------------------|
| `Srinivas-2906/kaana-prod` | `main` @ `2d36b6c` | 2026-10-20 | **Active production deploy config** (`cloudbuild.clinic.yaml`, `deploy-clinic.yml`) |
| `Srinivas-2906/clinic-erp` | `main` @ `0d26564` | 2026-08-18 | Intended standalone repo; **behind** Demos by months |

### Clinic-related branches (kaana-prod, local Demos)

Not exhaustive; relevant samples:

- `feat/clinic-bookview-extract`, `feat/clinic-dentacare-deploy` (remote)
- Local only: `clinic-api-split`, `clinic-crm-split`, `feature/phase1-multi-doctor-m1`

## Production vs Git vs local

| Layer | Best known revision | Confidence |
|-------|---------------------|------------|
| **GitHub `main` (clinic-api)** | `32dd159` — booking honeypot / IST date fix | High (GitHub API) |
| **GitHub `main` (clinic-crm)** | `6768e5c` — booking view extract | High |
| **Running Cloud Run** | Unknown image digest / git SHA | **Low** — GCP CLI auth expired; GHA clinic deploy never succeeded |
| **Behavioral probe** | No public `.../doctors` route (404) | Suggests prod **does not** include uncommitted multi-doctor API from Demos |

## Authoritative dev source for M1 workspace

**Winner for M1 sync:** `Demos/clinic-api` + `Demos/clinic-crm` (including uncommitted work on `feature/phase1-multi-doctor-m1`).

**Not used as primary:** `kaana-clinic` (diverged DB layer, incomplete alignment with prod SQLite path).

## Customer / tenant

- Marketing desk: `https://clinic.kaana.in` (tenant slug `dentacare` in Cloud Build substitutions).
- API host: `https://clinic-api.kaana.in`.
- Tenant site / booking: `dental-clinic` app in Demos proxies public booking to `clinic-api` (shared dependency — see `04_DECISIONS_AND_RISKS.md`).

## Unknown / needs human verification

- Exact Cloud Run revision and container image tag for `kaana-clinic` and `clinic-api`.
- Whether any deploy used root `cloudbuild.yaml` “clinic” steps vs `cloudbuild.clinic.yaml`.
- Whether production DB was mutated outside Litestream backup policy since last manual deploy.
