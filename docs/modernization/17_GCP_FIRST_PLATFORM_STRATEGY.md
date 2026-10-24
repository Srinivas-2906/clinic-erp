# GCP-first platform strategy & account portability

**Date:** 2026-10-25  
**Supersedes (hosting):** Neon/Railway/Cloudflare **target** in [`16_PRODUCT_ARCHITECTURE_ASSESSMENT.md`](16_PRODUCT_ARCHITECTURE_ASSESSMENT.md) — **not adopted**.  
**Principle:** BUILD AND VALIDATE ON CURRENT GCP → PROVE PRODUCT → REDEPLOY TO NEW GCP ACCOUNT → MIGRATE DATA → CUT OVER WITH ROLLBACK.

**Accounts (verified in docs):**

| Environment | GCP project | Owner / notes |
|-------------|-------------|----------------|
| Staging | `clinic-erp-staging` | `navya-teja@schoolofinterest.com` |
| Production (Denta Care) | `crucial-accord-505607-g9` | **Protected — no changes** |
| Future commercial | New GCP project (TBD) | Provision from IaC; free-trial credits **not assumed** |

---

## Executive summary

| Decision | Recommendation |
|----------|----------------|
| Frontend | **Keep** React 19 + Vite 8 + custom CSS |
| Backend | **Keep** Express 4 (Node 20); add repository layer + OpenAPI |
| Database (engine) | **Target PostgreSQL** for multi-tenant SaaS |
| Database (provider on GCP) | **Cloud SQL for PostgreSQL** (primary); Neon/others **reference only** |
| Database (now) | **Keep** SQLite + Litestream until PG rehearsal passes |
| Hosting | **Google Cloud** — Cloud Run, GCS, Secret Manager, Cloud Build, WIF |
| Jobs | **Cloud Scheduler + Cloud Tasks** (replace in-process reminder timer) |
| Storage | **GCS** behind existing `uploadStorage` abstraction |
| Mobile | **Expo (React Native)** — design only until API contracts stable |
| Auth | **Keep** email/password JWT; add refresh, reset, revocation |
| Portability | **Terraform (or OpenTofu) + parameterized CI** — no project IDs in app code |

**Separate operations:** (1) SQLite → PostgreSQL migration, (2) old GCP account → new GCP account cutover — **never combine** in one maintenance window.

**Related docs:** [`18_POSTGRESQL_MIGRATION_PLAN.md`](18_POSTGRESQL_MIGRATION_PLAN.md), [`19_CLINICAL_DATA_MODEL.md`](19_CLINICAL_DATA_MODEL.md), [`20_AUTHENTICATED_UI_UX_AUDIT.md`](20_AUTHENTICATED_UI_UX_AUDIT.md), [`21_COMPETITIVE_PRODUCT_MATRIX.md`](21_COMPETITIVE_PRODUCT_MATRIX.md), [`22_NATIVE_MOBILE_ARCHITECTURE.md`](22_NATIVE_MOBILE_ARCHITECTURE.md), [`23_SECURITY_RELIABILITY_AND_COSTS.md`](23_SECURITY_RELIABILITY_AND_COSTS.md), [`24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md`](24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md), [`infra/terraform/README.md`](../../infra/terraform/README.md).

---

## Phase A — Current system verification (repository + staging)

Evidence from **live repo inspection** (2026-10-25), not prior docs alone.

### Stack (verified)

| Layer | Actual | Source |
|-------|--------|--------|
| React | **19.2.6** | [`apps/crm/package.json`](../../apps/crm/package.json) |
| Vite | **8.0.12** | same |
| TypeScript (CRM) | **~6.0.2** | same |
| Express | **4.21.2** | [`apps/api/package.json`](../../apps/api/package.json) |
| Node (CI/Docker) | **20** | [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`apps/api/Dockerfile`](../../apps/api/Dockerfile) |
| SQLite driver | **better-sqlite3 12.x** | API package.json |
| ORM | **None** — inline SQL in [`apps/api/src/db/index.js`](../../apps/api/src/db/index.js), [`clinicStore.js`](../../apps/api/src/services/clinicStore.js) |

### API surface (verified)

| Mount | Router | Key paths |
|-------|--------|-----------|
| `/api/platform` | `platformRouter` | `/login`, `/me`, `/signup`, tenant provisioning |
| `/api` | `clinicRouter()` | `/client`, patients, appointments, payments, audit, doctors, uploads |

Login path used by CRM: **`POST /api/platform/login`** with `X-Tenant-Slug` ([`routes/index.js`](../../apps/api/src/routes/index.js) L71–78, [`index.js`](../../apps/api/src/index.js) L32–35).

### Authentication (verified)

- bcrypt + JWT ([`middleware/auth.js`](../../apps/api/src/middleware/auth.js))
- Roles: `owner` / `staff` (+ platform admin flag)
- Invite + set-password flow ([`accessRequests.js`](../../apps/api/src/services/accessRequests.js))
- **Gap:** no refresh tokens, no server-side session revocation list

### Multi-tenant & M8 (verified)

- Provisioning: [`tenantProvisioning.js`](../../apps/api/src/services/tenantProvisioning.js) — idempotency table, trial subscription
- Subscription: [`subscription.js`](../../apps/api/src/modules/identity/subscription.js), `tenants.subscription_status` column (ad-hoc migration in db init)
- Write guards: [`requireTenantWrite.js`](../../apps/api/src/middleware/requireTenantWrite.js), [`requireLiveTenant.js`](../../apps/api/src/middleware/requireLiveTenant.js)
- Public signup: `CLINIC_PUBLIC_SIGNUP_ENABLED=1` on staging ([`cloudbuild.staging.yaml`](../../cloudbuild.staging.yaml) L43)

### Schema tables (verified in `initDatabase`)

`tenants`, `users`, `catalog_items`, `patients`, `appointments`, `patient_payments`, `audit_log`, `access_requests`, `user_invite_tokens`, `doctors`, `doctor_sessions`, `doctor_time_off`, `doctor_services`, `reminder_jobs` (created in reminders module), `tenant_provision_idempotency`.

**Not implemented:** encounters, structured Rx lines, vitals, branches, amendments (see [`19_CLINICAL_DATA_MODEL.md`](19_CLINICAL_DATA_MODEL.md)).

### Files & storage (verified)

- [`uploadStorage.js`](../../apps/api/src/services/uploadStorage.js) — GCS or local memory
- Staging: `CLINIC_FILES_STORAGE=gcs`, bucket `clinic-erp-staging-clinic-db`, prefix `clinic-files-staging/`

### Background jobs (verified)

- Reminders: DB table + **in-process `setInterval`** in [`apps/api/src/index.js`](../../apps/api/src/index.js) L13–21
- `REMINDER_DELIVERY_ENABLED=0` on staging — mock provider only

### Tests & CI (verified)

- API: **67** tests (`node --test`)
- CRM: **25** Vitest unit tests
- Playwright: **18** e2e specs under [`apps/crm/e2e/tests/`](../../apps/crm/e2e/tests/)
- CI: api-tests, crm-unit-tests, crm-build, docker smoke ([`ci.yml`](../../.github/workflows/ci.yml))
- Staging deploy: manual WIF + Cloud Build ([`deploy-staging.yml`](../../.github/workflows/deploy-staging.yml))

### Staging infrastructure (verified)

- Provision script: [`infra/staging/provision.sh`](../../infra/staging/provision.sh) — parameterized `PROJECT_ID`, `REGION`, `BUCKET`
- Cloud Build uses `$PROJECT_ID` substitution (not hardcoded in deploy steps); **substitutions block** still defaults `_DB_BUCKET: clinic-erp-staging-clinic-db` and SA email suffixes — **infra config**, not app logic
- Guard: refuse deploy if `PROJECT_ID=crucial-accord-505607-g9` ([`cloudbuild.staging.yaml`](../../cloudbuild.staging.yaml) L26–28)

### Documentation / tooling gaps (corrective)

| Item | Status |
|------|--------|
| Staging URL in `scripts/staging-validate.mjs` | Uses legacy hostname `*-ofczrxs2ca-el.a.run.app`; canonical doc uses `*-339065153036.asia-south1.run.app` ([`08_M5_STAGING_LIVE.md`](08_M5_STAGING_LIVE.md)) — **fix in a future code PR** |
| Playwright `global-setup.ts` | `cwd: ../../clinic-api` — **wrong path** (should be `../api`) — e2e seed fails in some environments |
| Terraform | **Not present** — design in [`infra/terraform/README.md`](../../infra/terraform/README.md) |
| Versioned SQL migrations | **Missing** — only `CREATE IF NOT EXISTS` + try/catch `ALTER` |
| OpenAPI spec | **Missing** |
| Cloud SQL | **Not provisioned** |

---

## Phase B — Long-term technology decisions (GCP-first)

See ADRs in §10 of [`16_PRODUCT_ARCHITECTURE_ASSESSMENT.md`](16_PRODUCT_ARCHITECTURE_ASSESSMENT.md) with these **overrides**:

| ADR | Override |
|-----|----------|
| Hosting | **GCP only** until new-account migration |
| Database provider | **Cloud SQL PostgreSQL** on GCP (Neon compared in [`23_SECURITY_RELIABILITY_AND_COSTS.md`](23_SECURITY_RELIABILITY_AND_COSTS.md)) |
| Jobs | **Cloud Tasks + Cloud Scheduler** |
| Storage | **GCS** |

Frontend, backend, mobile, auth recommendations unchanged from assessment §1.

---

## Phase C — GCP account portability design

### Configuration layers

1. **Application** — env vars only (`DATABASE_URL`, `CLINIC_FILES_BUCKET`, `JWT_SECRET`, `PUBLIC_URL`, `CLINIC_CRM_URL`, feature flags). No GCP project ID in `apps/*` source.
2. **Infrastructure** — Terraform modules per [`infra/terraform/README.md`](../../infra/terraform/README.md).
3. **Secrets** — Secret Manager; GitHub Actions secrets/vars for WIF only.
4. **Customer data** — SQLite file or Cloud SQL dump; GCS object prefixes per tenant path.
5. **Workflows** — GitHub environments `staging`, `production`, `staging-next-account` with distinct `GCP_*` variables.

### Environment matrix

| Env | Project | DB | Purpose |
|-----|---------|-----|---------|
| Local | n/a | `./data/clinic.db` | Dev |
| Current staging | `clinic-erp-staging` | SQLite + Litestream → GCS | QA / synthetic |
| Current production | `crucial-accord-505607-g9` | SQLite + Litestream | **Denta Care only — frozen** |
| Future staging | `<new-project-id>` | Cloud SQL (after PG migration) | Pre-launch validation |
| Future production | `<new-project-id>` | Cloud SQL + HA option | Commercial SaaS |

### IaC deliverable (future implementation PR)

- `terraform/environments/staging/` and `production/` with `terraform.tfvars.example`
- Remote state in GCS bucket **per account** (never commit state)
- Modules: `run_api`, `run_crm`, `cloud_sql`, `gcs`, `artifact_registry`, `wif_github`, `secret_manager`, `cloud_tasks`, `scheduler`

### CI/CD portability

- Repo variables: `GCP_STAGING_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_STAGING_DEPLOYER_SA` — duplicate set for new account as `GCP_STAGING_NEXT_*` during parallel validation.
- Cloud Build: pass `_DB_BUCKET`, `_API_SERVICE_ACCOUNT` via substitutions file per environment.

---

## Phase K — Dependency-aware roadmap (summary)

Full checklist: [`12_IMPLEMENTATION_ROADMAP.md`](12_IMPLEMENTATION_ROADMAP.md).

| Phase | Deliverables | Depends on | Owner approval |
|-------|--------------|------------|----------------|
| 1 Foundations | OpenAPI, repository layer, fix e2e paths, env doc | — | — |
| 2 PostgreSQL readiness | Drizzle/schema, Cloud SQL **staging** instance, parity tests | Phase 1 | PG on staging |
| 3 Clinical model + Batch 2 | Implement [`19`](19_CLINICAL_DATA_MODEL.md) | Phase 2 design sign-off | Clinical schema |
| 4 UI/UX modernization | [`20`](20_AUTHENTICATED_UI_UX_AUDIT.md) P0–P1 | — | — |
| 5 SaaS billing | Razorpay sandbox | M8 base | Payments |
| 6 Mobile MVP | Expo scaffold | OpenAPI stable | Mobile scope |
| 7 Security/hardening | Cloud Tasks, RLS, rate limit store | Phase 2 | — |
| 8 Full staging validation | Load + migration rehearsal | Phases 2–7 | — |
| 9 New GCP account | Terraform apply | Phase 8 | **New billing account** |
| 10 Cutover & launch | [`24`](24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md) | Phase 9 | **Go/no-go** |

**Effort (rough):** Phases 1–2: 4–8 eng-weeks; 3–4: 6–10; 5–7: parallel 4–6; 8–10: 2–4 ops-weeks + freeze window.

---

## Open decisions (owner)

1. Approve **Cloud SQL** spend on staging for PG rehearsal (~$10–25/mo per [Cloud SQL pricing](https://cloud.google.com/sql/pricing)).
2. **Single shared PostgreSQL** vs schema-per-tenant for compliance narratives.
3. **Clinical schema** sign-off — [`19_CLINICAL_DATA_MODEL.md`](19_CLINICAL_DATA_MODEL.md).
4. **ABDM** — launch blocker or Enterprise-only.
5. **Mobile MVP persona** — doctor-first vs reception-first ([`22`](22_NATIVE_MOBILE_ARCHITECTURE.md)).
6. **Razorpay** scope — clinic subscription vs patient payments (C4).
7. **New GCP account** org/billing owner and target quarter for Milestone H.
8. **Custom domain** strategy for commercial SaaS vs per-clinic subdomains.
9. Authenticated **staging UI walkthrough** — grant Secret Manager access or run Playwright against staging with password.
10. **Denta Care** remains on legacy project indefinitely vs eventual migration (separate commercial decision).
