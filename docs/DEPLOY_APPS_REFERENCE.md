# Kaana — Product deploy map

This repo hosts multiple products under **one domain** (`kaana.in`) and deploys them as **independent Cloud Run services** behind a shared HTTPS load balancer URL map (`scripts/url-map-multi.yaml`).

## Deploy rule

- Each product should have:
  - its own **Cloud Build config**
  - its own **GitHub Actions workflow** with **path filters**
  - its own **Cloud Run service(s)** and **secrets**
- Avoid suite-wide redeploys unless intentionally running `cloudbuild.yaml`.

## Products

### Marketing site (kaana.in)

- **Domain**: `kaana.in`, `www.kaana.in`
- **Path**: `kaana/`
- **Cloud Run service**: `kaana-web`
- **Cloud Build**: `cloudbuild.marketing.yaml`
- **Workflow**: `.github/workflows/deploy-marketing.yml`

### Platform (app.kaana.in)

- **Domain**: `app.kaana.in`
- **Path**: `kaana-platform/`
- **Cloud Run service**: `kaana-platform`
- **Cloud Build**: `cloudbuild.platform.yaml`
- **Workflow**: `.github/workflows/deploy-platform.yml`

### CRM (crm.kaana.in)

- **Domain**: `crm.kaana.in`
- **Path**: `propcrm/`
- **Cloud Run service**: `kaana-crm`
- **Cloud Build**: `cloudbuild.crm.yaml`
- **Workflow**: `.github/workflows/deploy-crm.yml`

### BotIQ / API (api.kaana.in + inbox.kaana.in)

- **Domains**: `api.kaana.in`, `inbox.kaana.in`
- **Path**: `botiq-app/`
- **Cloud Run service**: `kaana-api`
- **Cloud Build**: `botiq-app/cloudbuild.yaml`
- **Workflow**: `.github/workflows/deploy-botiq.yml`
- **Health**: `GET /health`

### Clinic (clinic.kaana.in + clinic-api.kaana.in)

- **Domains**: `clinic.kaana.in` (desk), `clinic-api.kaana.in` (API)
- **Paths**: `clinic-crm/`, `clinic-api/`
- **Cloud Run services**:
  - UI: `kaana-clinic`
  - API: `clinic-api`
- **Cloud Build**: `cloudbuild.clinic.yaml` (both UI + API)
- **Workflow**: `.github/workflows/deploy-clinic.yml`
- **Health**: `GET /api/health` (on `clinic-api`)

### Tracker (tracker.kaana.in)

- **Domain**: `tracker.kaana.in`
- **Paths**: `kaana-tracker/`, `kaana-tracker-api/`
- **Cloud Run services**:
  - UI: `kaana-tracker`
  - API: `kaana-tracker-api`
- **Cloud Build**: `cloudbuild.tracker.yaml`
- **Workflow**: `.github/workflows/deploy-tracker.yml`
- **Health**: `GET /api/health` (proxied via UI)

## Shared ingress (one domain, many products)

The shared URL map (`scripts/url-map-multi.yaml`) routes hostnames to Cloud Run services via serverless NEGs + backend services. When adding a new product under `kaana.in`:

- add a **Cloud Run service** (and optionally a second service for its API)
- add a **host rule** + backend in the URL map (or use Cloud Run domain mapping)
- add **per-product** Cloud Build + GitHub workflow

