# M5 — Staging provision (approval gate)

**Status:** Read-only checks complete. **No staging project created.** Awaiting explicit approval to link billing and create resources.

## Pre-approval verification (2026-10-22)

| Check | Result |
|-------|--------|
| PR #3 merged | Yes → `main` |
| Production revisions | `clinic-api-00018-4c5`, `kaana-clinic-00009-hgd` unchanged |
| `clinic.kaana.in` / API health | HTTP 200 |
| Billing account | `017956-7B909E-A19606` (**My Billing Account**, OPEN) linked to `crucial-accord-505607-g9` |
| `clinic-erp-staging` project | **Not visible** to `navya-teja@schoolofinterest.com` (likely **does not exist** yet; global ID availability confirmed only at create time) |
| Visible projects (this account) | Only `crucial-accord-505607-g9` in list — may need **Project Creator** on org/billing to add projects |

## Exact resources to create (post-approval)

**Project:** `clinic-erp-staging` (or alternate if ID taken), region work: `asia-south1`, billing link to `017956-7B909E-A19606`.

1. Enable APIs: Run, Cloud Build, Artifact Registry, Secret Manager, Storage, IAM, IAM Credentials, Logging, Monitoring, Cloud Billing Budget API.
2. Artifact Registry repo `clinic` (Docker).
3. GCS bucket `clinic-erp-staging-clinic-db` (Litestream + file uploads prefix).
4. Secret Manager: `clinic-staging-jwt-secret` (new random).
5. Service accounts:
   - `clinic-staging-runner@clinic-erp-staging.iam.gserviceaccount.com`
   - `clinic-staging-cloudbuild@clinic-erp-staging.iam.gserviceaccount.com`
   - `github-clinic-erp-staging@clinic-erp-staging.iam.gserviceaccount.com`
6. IAM: least privilege per `infra/staging/ARCHITECTURE.md`.
7. WIF pool + GitHub OIDC provider for `Srinivas-2906/clinic-erp`.
8. Budget: **$10/month** alerts at 50%, 90%, 100% (notifications only — **not** a hard cap).
9. Cloud Run: `clinic-api-staging`, `kaana-clinic-staging` (max 1 instance, scale to zero).
10. GitHub repo variables + `staging` environment (manual deploy workflow).

**Portable migration:** use separate project, document all resource names; future move = export Terraform/state + recreate WIF in new org.

## Permissions needed (human / org admin)

- `resourcemanager.projects.create`
- `billing.resourceAssociations.create` on billing account `017956-7B909E-A19606`
- `serviceusage.services.enable` on new project
- `iam.serviceAccounts.create`, `run.admin`, `storage.buckets.create`, `secretmanager.secrets.create`
- GitHub admin for repo variables and environments

## Expected charges (estimate)

| Item | Monthly (light QA) |
|------|---------------------|
| Cloud Run (scale to zero) | $0–5 |
| GCS + AR + builds | $1–5 |
| **Total** | **~$3–10** (within $10 budget alert target) |

Free tier: new projects still receive standard GCP free-tier allowances (e.g. Run requests, limited storage); **remaining trial/credits not visible via CLI** — check [Cloud Console → Billing → Account management](https://console.cloud.google.com/billing).

## Post-approval execution order

1. `gcloud projects create clinic-erp-staging --name="Clinic ERP Staging"`
2. Link billing
3. Run `infra/staging/provision.sh` *(to be added on approval)*
4. Configure GitHub WIF + variables
5. Manual `deploy-staging` workflow
6. Persistence test: restart API revision, verify Litestream restore path
7. Record URLs in `08_M5_STAGING_LIVE.md`

**Do not proceed past step 1 without explicit user approval in chat.**
