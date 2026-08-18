# Clinic ERP

Standalone dental clinic SaaS — CRM frontend + API backend in one monorepo.

**Canonical repo:** [github.com/Srinivas-2906/clinic-erp](https://github.com/Srinivas-2906/clinic-erp)  
Deploys to **clinic.kaana.in** via GitHub Actions on push to `main` (see `.github/workflows/deploy.yml`).

Features: multi-tenant clinics, multi-doctor scheduling, slot engine, permissions, e2e tests, calendar schedule UI, +91 phone handling, Litestream-backed SQLite.

## Structure

```
clinic-erp/
├── apps/
│   ├── crm/     # Vite + React clinic desk (port 5185)
│   └── api/     # Express + SQLite API (port 3010)
├── cloudbuild.yaml
└── package.json
```

## Local dev

```bash
npm install

# Terminal 1 — API
npm run dev:api

# Terminal 2 — CRM
npm run dev:crm
```

Open **http://localhost:5185?tenant=dentacare**

## Demo login

| Email | Password |
|-------|----------|
| `ajitdentacare@gmail.com` | `Dentacare@123` |

## Data

SQLite database: `apps/api/data/clinic.db` (created on first run). Production uses Litestream on GCS (`crucial-accord-505607-g9-db`).

## Deploy (GCP)

Push to `main` triggers `.github/workflows/deploy.yml` → `cloudbuild.yaml` → Cloud Run (`clinic-api` + `kaana-clinic`).

Manual deploy:

```bash
gcloud builds submit \
  --project crucial-accord-505607-g9 \
  --config cloudbuild.yaml \
  --service-account=projects/crucial-accord-505607-g9/serviceAccounts/kaana-cloudbuild-deployer@crucial-accord-505607-g9.iam.gserviceaccount.com \
  .
```

## E2E tests

```bash
npm run seed:e2e
npm run test:e2e
```
