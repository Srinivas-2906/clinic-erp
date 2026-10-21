# Repository separation (M1)

## Objective

Establish an independent Clinic ERP workspace with preserved history path, uncommitted work, deploy templates, and docs—without altering production.

## Actions completed (2026-10-21)

### Workspace

- **Path:** `/Users/srinivas/Downloads/clinic-erp`
- **Branch:** `feature/m1-repository-separation` (created from `main`)
- **Remote:** `https://github.com/Srinivas-2906/clinic-erp.git` (unchanged; **not pushed**)

### Sync method

Non-destructive **rsync** from Demos (source of truth for app code):

- `Demos/clinic-api/` → `clinic-erp/apps/api/`
- `Demos/clinic-crm/` → `clinic-erp/apps/crm/`

**Excluded:** `node_modules`, `data/`, `uploads/`, `.env*`, local `.tools/`, e2e PNG screenshots (tests and `.gitkeep` retained).

### Deploy artifacts copied & adapted

| Source (kaana-prod layout) | Target (clinic-erp layout) |
|----------------------------|----------------------------|
| `cloudbuild.clinic.yaml` | `cloudbuild.yaml` (`./apps/api`, `./apps/crm`) |
| `.github/workflows/deploy-clinic.yml` | `.github/workflows/deploy-clinic.yml` (path filters `apps/api/**`, `apps/crm/**`) |
| `scripts/setup-clinic-api-backend.sh` | `infra/scripts/setup-clinic-api-backend.sh` |
| `DEPLOY_APPS.md` (excerpt) | `docs/DEPLOY_APPS_REFERENCE.md` |

### Preserved local-only work (from Demos, now in clinic-erp)

**API**

- Multi-doctor module (`src/modules/providers/*`, scheduling `slotEngine`)
- Upload hardening (`uploadStorage`, `uploadValidation`, GCS config)
- HTTP body limits + JSON error middleware
- E2E seed script, expanded tests (47 passing `npm run test:api`)

**CRM**

- Doctors UI, filters, schedule editors, booking slot integration
- Authenticated clinic file preview / thumbnails + Vitest coverage
- Playwright e2e suite (18 spec files; screenshots not copied)
- MCP server under `apps/crm/mcp-server/`

**Not merged into clinic-erp**

- `kaana-clinic` PostgreSQL/drizzle/repository layer (remains in Demos nested repo)
- Hundreds of e2e PNG captures (remain under `Demos/clinic-crm/e2e/screenshots/`)

## Validation (M1)

| Check | Result |
|-------|--------|
| `npm install` at repo root | Pass |
| `npm run test:api` | Pass (47 tests) |
| `npm run build` (CRM) | Pass |
| `apps/api/data/clinic.db` | Present locally, **gitignored** |
| No `.env` committed | Pass (none tracked) |
| Production URLs | Unchanged (read-only curl) |

## Git status

Changes exist **only locally** on `feature/m1-repository-separation`. User should commit when ready; **do not push to `main`** without M2 plan.

## Separation result

**PASS** for local independent workspace and build/test validation.

**PARTIAL** for “canonical GitHub repository”—remote `clinic-erp` still points at August snapshot until feature branch is pushed and deploy cutover is approved.

## Duplication note

Demos monorepo folders are **unchanged**. Two copies of clinic code now exist by design until M2 retires `kaana-prod/clinic-*` paths.
