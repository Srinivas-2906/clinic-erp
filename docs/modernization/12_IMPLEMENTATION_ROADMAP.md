# Implementation roadmap (prioritized)

Dependencies flow top → bottom. Each milestone is a **reviewable PR batch**, not a single mega-release.

## Milestone A — Staging & deploy hygiene

- [x] GCP project `clinic-erp-staging`, bucket, AR, SAs, WIF, secrets
- [x] Cloud Run deploy + API smoke tests (`08_M5_STAGING_LIVE.md`)
- [x] Merge M5 deploy fixes (PR #5)
- [ ] GitHub `staging` environment (repo admin) + green `deploy-staging` after M7
- [ ] Console budget $10 @ 50/90/100% (Billing Admin)

## Milestone B — SaaS foundation (M7 — in progress)

1. [x] **Entitlements** — plan limits on doctors/staff (`modules/identity/entitlements.js`)
2. [x] **Audit** — list + CSV export API; CRM Activity tab (owner)
3. [x] **Reminders** — durable jobs + mock provider (no patient SMS)
4. [x] **PUBLIC_URL / CLINIC_CRM_URL** — resolved in `cloudbuild.staging.yaml`
5. [x] **Demo credential rotation** — `CLINIC_DEMO_OWNER_PASSWORD` secret (staging); no passwords in logs/docs
6. [ ] Razorpay / self-serve signup (M8)

**Validation:** API tests + Playwright smoke on staging; no prod deploy.

## Milestone C — SaaS foundation

1. Tenant signup + admin provisioning API.
2. Razorpay subscription webhooks → plan status.
3. Usage counters (doctors, staff, storage).
4. Operator admin UI (internal).

**Validation:** contract tests for webhooks; staging synthetic billing.

## Milestone D — Professional feature depth

1. Structured visit notes (templates).
2. Prescription PDF generator (not just file upload).
3. Reports: doctor-wise revenue, no-show rate.
4. SMS/WhatsApp reminder integration (provider abstraction).

**Validation:** e2e book → remind → complete visit.

## Milestone E — Enterprise / scale

1. Org + branch model (schema + CRM switcher).
2. Postgres migration path (leverage `kaana-clinic` parity tests; **no blind merge**).
3. Custom domain + IAP option for CRM.
4. Compliance pack: audit export, backup restore drill automation.

## Milestone F — Customer-facing polish

1. Onboarding wizard in CRM.
2. Patient portal lite (records share) — optional.
3. Marketplace integrations (ABDM) — research spike only until compliance sign-off.

## First recommended development batch (start here)

| # | Work item | Repo area | Depends on |
|---|-----------|-----------|------------|
| 1 | Merge M5 deploy fixes + green GHA staging | `.github/workflows`, `cloudbuild.staging.yaml` | — |
| 2 | Fix `PUBLIC_URL` substitution post-deploy | `cloudbuild.staging.yaml` | 1 |
| 3 | Implement reminder provider interface + no-op default | `apps/api` services | — |
| 4 | `GET /api/clinic/audit` + CSV export (owner) | API + CRM reports | — |
| 5 | `tenant.plan` + doctor/staff limits | `db/index.js`, doctors/team routes | 3 optional |

## Preserve (do not rewrite)

- Slot engine + schedule validation modules.
- Doctors sessions/time-off UI.
- Payments + today board UX.
- Upload pipeline + authenticated file GET.
- Playwright e2e suite — extend, don’t replace.

## Redesign candidates

- Tenant/onboarding (missing product surface).
- Permissions matrix (expand beyond owner/staff).
- Reports (move from ad-hoc aggregates to defined metrics layer).

## Validation requirements

| Layer | Requirement |
|-------|-------------|
| CI | Existing `ci.yml` on every PR |
| Staging | Manual `deploy-staging` before release tag |
| E2E | `npm run test:e2e` against staging URL with `seed-e2e` |
| Backup | Quarterly Litestream restore drill documented in runbook |
