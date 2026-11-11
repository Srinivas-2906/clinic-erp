# New GCP account migration playbook

**When to use:** After product validation on `clinic-erp-staging` and **PostgreSQL migration** rehearsed — **do not combine** first PG cutover with account move.

**Principle:** Same container images + same env var **names**; different project IDs and secret **values**.

---

## Preconditions (go/no-go)

| # | Criterion | Owner |
|---|-----------|-------|
| G1 | All CI green on release tag | Eng |
| G2 | Staging on SQLite **or** PG passes Playwright + `staging-validate.mjs` | Eng |
| G3 | Terraform (or equivalent) applies cleanly to **empty** new project | Eng |
| G4 | RTO/RPO documented and backup drill passed | Eng + Owner |
| G5 | No dependency on old project for runtime (except during cutover) | Eng |
| G6 | Legal/commercial approval for data processing in new account | Owner |

**Rollback trigger:** Error rate > 2% for 15 min, auth failure spike, or data integrity check failure → revert DNS/env to old project.

---

## Phase 1 — New account eligibility

1. Create or designate Google Cloud org/folder for commercial Clinic ERP.
2. Verify billing account; **check free trial/credits eligibility at that time** — do not budget credits.
3. Create project `<new-clinic-erp-prod>` (and optional `<new-clinic-erp-staging>`).
4. Enable APIs (mirror [`infra/staging/provision.sh`](../../infra/staging/provision.sh) list + `sqladmin.googleapis.com`, `cloudtasks.googleapis.com`).

---

## Phase 2 — Infrastructure from IaC

1. Apply [`infra/terraform`](../../infra/terraform/README.md) with new `project_id`.
2. Create Artifact Registry; configure Cloud Build in new project (or continue GitHub WIF submit to new project).
3. Create GCS buckets: `{project}-clinic-db` (files), `{project}-tf-state` (terraform).
4. Create Cloud SQL instance (if PG migration complete) — **empty** or restore from approved backup.
5. Create Secret Manager secrets (empty versions).
6. Create service accounts: runner, cloudbuild, github WIF — **no** IAM on old project.

---

## Phase 3 — Secrets & CI

1. Populate secrets via console/`gcloud` (JWT, DB password, demo passwords, SMS keys).
2. Add GitHub environment `production-next` with:
   - `GCP_STAGING_PROJECT_ID` → new project (or prod vars)
   - New WIF provider resource name
   - Deployer SA email
3. **Do not** copy secret values into git.

---

## Phase 4 — Deploy application

1. Deploy **same** image digest/tag validated on old staging:
   ```bash
   gcloud builds submit --project NEW_PROJECT --config cloudbuild.staging.yaml
   ```
2. Set env: `PUBLIC_URL`, `CLINIC_CRM_URL`, `DATABASE_URL` or SQLite path, GCS bucket, feature flags.
3. Verify `/` and `/api/health`.

---

## Phase 5 — Data migration (approved only)

**Order:** Database first, then files, then async verification.

1. **Write freeze** on old environment (maintenance banner).
2. Export SQLite or PG dump from **approved** source (synthetic staging → synthetic new; commercial → contractual process).
3. Import to new Cloud SQL / GCS Litestream restore.
4. Row-count scripts per tenant.
5. GCS: `gsutil -m rsync` bucket prefix to new bucket; verify ACLs and SA access.
6. Re-hash sample uploads.

**Never** copy Denta Care production data without explicit legal approval.

---

## Phase 6 — Validation matrix

| Test | Command / action |
|------|------------------|
| Auth | Login owner + staff per tenant |
| Tenant isolation | Cross-tenant API attempt → 403 |
| Booking | Create appointment + slot conflict |
| Payments | Record payment + report |
| Upload | Prescription image round-trip |
| Reminders | Cloud Task fires mock job |
| Signup | New tenant provision (if enabled) |
| Mobile | API smoke with OpenAPI client |

---

## Phase 7 — DNS & cutover

1. Lower TTL 24h ahead on CRM/API hostnames (if custom domain).
2. Point DNS to new Cloud Run URLs or load balancer.
3. Monitor 5xx, latency, login rate for 48h.
4. Keep old project **running read-only** until sign-off.

---

## Phase 8 — Retire old resources (after approval)

1. Document final backup location in new account.
2. Disable deploy workflows targeting old project.
3. **Do not delete** `crucial-accord-505607-g9` (Denta Care) or shared org assets without separate business decision.
4. Staging project `clinic-erp-staging` may remain for history or be deleted after 30-day quarantine.

---

## Synchronization strategies

| Scenario | Strategy |
|----------|----------|
| Staging synthetic only | One-shot copy |
| Commercial cutover | Short write-freeze + single export |
| Long migration window | **Avoid** dual-write; use read replica export instead |

---

## Documentation updates post-migration

- [`08_M5_STAGING_LIVE.md`](08_M5_STAGING_LIVE.md) or successor live doc
- GitHub repo variables
- [`00_MASTER_PLAN.md`](00_MASTER_PLAN.md) project table
