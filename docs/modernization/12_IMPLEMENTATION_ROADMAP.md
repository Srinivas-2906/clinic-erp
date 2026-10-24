# Implementation roadmap (prioritized)

Dependencies flow top → bottom. Each milestone is a **reviewable PR batch**, not a single mega-release.

## Milestone A — Staging & deploy hygiene

- [x] GCP project `clinic-erp-staging`, bucket, AR, SAs, WIF, secrets
- [x] Cloud Run deploy + API smoke tests (`08_M5_STAGING_LIVE.md`)
- [x] Merge M5 deploy fixes (PR #5)
- [x] Merge M7 (PR #6) — entitlements, audit, reminders
- [x] Staging Cloud Build from `main` (build `a200bd31`; IAM fix for GitHub WIF)
- [x] Green GitHub `deploy-staging` workflow ([39731216613](https://github.com/Srinivas-2906/clinic-erp/actions/runs/39731216613), build `8112cb7b`)
- [x] GitHub `staging` environment + repo variables (WIF, project, deployer SA)
- [ ] GitHub required reviewers on `staging` (plan limitation — manual dispatch gate)
- [ ] Console budget $10 @ 50/90/100% (Billing Admin)

## Milestone B — SaaS foundation (M7 — complete)

1. [x] **Entitlements** — plan limits on doctors/staff (`modules/identity/entitlements.js`)
2. [x] **Audit** — list + CSV export API; CRM Activity tab (owner)
3. [x] **Reminders** — durable jobs + mock provider (no patient SMS)
4. [x] **PUBLIC_URL / CLINIC_CRM_URL** — resolved in `cloudbuild.staging.yaml`
5. [x] **Demo credential rotation** — `CLINIC_DEMO_OWNER_PASSWORD` secret (staging)
6. [x] **Hardening** — export rate limit, reminder claim, GHA deploy poll (PR #7)

**Validation:** 56/56 API unit tests; `scripts/staging-validate.mjs` on staging; no prod deploy.

## Milestone C — M8 commercial onboarding & billing (next)

**Order (dependency-aware):**

| Step | Deliverable | Depends on | Safe with SQLite |
|------|-------------|------------|------------------|
| C1 | Internal `POST /platform/tenants` provision (slug, plan, owner invite) | M7 entitlements | Yes |
| C2 | CRM signup wizard (collect clinic + owner → C1) | C1 | Yes |
| C3 | Subscription state machine on `tenants` (trial/active/past_due) | C1 | Yes |
| C4 | Razorpay sandbox webhooks → C3 (no live keys) | C3 + approval | Yes |
| C5 | Usage metering hooks (doctors/staff already counted) | M7 | Yes |

**Do not batch with C1–C2 until decided:** Postgres migration (Enterprise scale) — see `13_M7_DATABASE_DECISION.md`.

## Milestone D — Clinical product depth (M8+)

| Step | Deliverable | Depends on |
|------|-------------|------------|
| D1 | Structured consultation / visit note model + CRM form | C1 tenant stable |
| D2 | Prescription lines + print/PDF (extends upload pipeline) | D1 |
| D3 | Follow-up rules → existing reminder queue | D1, M7 reminders |
| D4 | Doctor onboarding UX (profile, sessions) tied to entitlements | M7 |

**Parallel track after C1:** D1 + D3 (consultations + follow-ups) without Razorpay.

## Milestone E — Enterprise / scale

1. Org + branch model (schema + CRM switcher).
2. Postgres migration path (leverage parity tests; **no blind merge**).
3. Custom domain + IAP option for CRM.
4. Compliance pack: audit export, backup restore drill automation.

## Milestone F — Customer-facing polish

1. Onboarding wizard polish + empty states.
2. Patient portal lite — optional.
3. Marketplace integrations (ABDM) — research spike only.

## Preserve (do not rewrite)

- Slot engine + schedule validation modules.
- Doctors sessions/time-off UI.
- Payments + today board UX.
- Upload pipeline + authenticated file GET.
- Playwright e2e suite — extend, don’t replace.

## Validation requirements

| Layer | Requirement |
|-------|-------------|
| CI | `ci.yml` on every PR |
| Staging | Manual `deploy-staging` after merge to `main` |
| Smoke | `node scripts/staging-validate.mjs` |
| E2E | `npm run test:e2e` against staging URL |
| Backup | Litestream restore drill (staging bucket only) |
