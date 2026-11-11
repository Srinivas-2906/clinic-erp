# Coordinated staging release — operator bundle (`clinic-erp-staging`)

**Release SHA:** `main` @ `102cbc5cade47d02957885f05a90e5f646d753b3` or newer explicitly logged.

**Cloud configs:** `cloudbuild.staging.yaml` (API, no traffic), `cloudbuild.staging-crm.yaml` (CRM, no traffic).

## 12-step sequence (execute only with consolidated cloud approval)

| # | Action | Mutates GCP? |
|---|--------|--------------|
| 1 | Record `LIVE_API_REV`, `LIVE_CRM_REV`, images, traffic, scaling, env **names** | No |
| 2 | `git rev-parse HEAD` = approved SHA | No |
| 3 | `staging-restore-drill.sh` + 4× PDF GCS crosswalk | No (local `.restore-drill/`) |
| 4 | API `--scaling=0`; verify instance count 0 + lease absent/expired | **Yes** |
| 5 | `gcloud builds submit --config=cloudbuild.staging.yaml` | **Yes** (API candidate, 0% traffic) |
| 6 | Resolve `mvp-candidate` URL from `status.traffic`; **one** `/api/health` curl | **Yes** (starts 1 instance) |
| 7 | `update-traffic --to-revisions=CANDIDATE=100`; `--scaling=auto --max-instances=1` | **Yes** |
| 8 | `gcloud builds submit --config=cloudbuild.staging-crm.yaml` | **Yes** (CRM candidate, 0% traffic) |
| 9 | Smoke CRM via `crm-candidate` tag URL; then `update-traffic` 100% CRM | **Yes** |
| 10 | Resend smoke (test inbox) if secrets configured | **Yes** (env) |
| 11 | Confirm monitoring alerts / uptime | Observe |
| 12 | Synthetic clinic-day manual UAT (desktop + mobile browser) | No patient data |

**STOP** if lease ownership uncertain, restore fails, or traffic shifts without approval.

### Scaling=0 + tagged revisions

- Service manual scaling **0** blocks ordinary service-url scale-up.
- **Tagged revision URLs** (`mvp-candidate`, `crm-candidate`) may still **cold-start one instance** for smoke — do not probe until old API writer is quiesced (step 4).

## Email bundle (prepare only until approved)

See `29_STAGING_PASSWORD_RESET_EMAIL.md`.

| Item | GSM name | Runtime mount |
|------|----------|---------------|
| Provisioning | `clinic-staging-provisioning-key` | `CLINIC_PROVISIONING_API_KEY` |
| Resend | `clinic-staging-resend-api-key` | `CLINIC_RESEND_API_KEY` |
| JWT / demo | exist | unchanged on API deploy (#68 uses `--update-secrets` partial) |

**Optional:** include Resend env in the **same** API Cloud Build after secrets exist (avoids second writer handoff). Add to `cloudbuild.staging.yaml` only when operator supplies verified `CLINIC_EMAIL_FROM`.

## Monitoring bundle (prepare only)

1. `GCP_STAGING_PROJECT_ID=clinic-erp-staging bash scripts/staging-monitoring-setup.sh` (uptime `/health`, CRM `/`).
2. Create notification channel (email/Slack) — operator supplies destination.
3. Suggested policies: Cloud Run 5xx rate, `instance_count > 1` on `clinic-api-staging`, log match `writer-lease FATAL`, Litestream `ERROR`.

## Manual UAT access (synthetic)

| Item | Value |
|------|--------|
| CRM URL | `https://kaana-clinic-staging-ofczrxs2ca-el.a.run.app` |
| API URL | `https://clinic-api-staging-ofczrxs2ca-el.a.run.app` |
| Tenant slug | `dentacare` (build-time `VITE_TENANT_SLUG`) |
| Login | Platform login via CRM; staging demo owner email configured in API env (`staging-owner@clinic-erp.invalid`) — password from GSM **demo** secret (operator only) |
| Staff | Create receptionist/doctor via Settings → Team (synthetic emails) |
| Blockers until cutover | Live API lacks `102cbc5` single-writer; CRM image **2026-10-28**; email **console**; provisioning **missing** |

**Workflows:** Match Playwright `43-mvp-clinic-day` — walk-in, appointment, encounter, invoice, partial payment; amendments/follow-ups if enabled; reports; cross-tenant 404 on foreign patient id.
