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

## Milestone C0 — Architecture & GCP-first plan (complete)

- [x] Initial assessment — [`16_PRODUCT_ARCHITECTURE_ASSESSMENT.md`](16_PRODUCT_ARCHITECTURE_ASSESSMENT.md)
- [x] GCP-first strategy + portability — [`17`](17_GCP_FIRST_PLATFORM_STRATEGY.md)–[`24`](24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md)
- [ ] Owner decisions — see [`17`](17_GCP_FIRST_PLATFORM_STRATEGY.md) open items + clinical sign-off [`19`](19_CLINICAL_DATA_MODEL.md)
- [ ] **No** Railway/Neon/Cloudflare staging stack (explicitly out of scope)

## Milestone C — M8 commercial onboarding & billing

| Step | Deliverable | Status |
|------|-------------|--------|
| C1 | Provisioning API + idempotency + audit | **Done** (Batch 1) |
| C2 | CRM `/signup` wizard | **Done** (Batch 1) |
| C3 | Subscription states + write guards | **Done** (Batch 1) |
| C4 | Razorpay sandbox webhooks | Not started (needs approval) |
| C5 | Usage metering hooks | Partial (doctor/staff counts in M7) |

**Batch 2 gated on:** clinical data model approval [`19`](19_CLINICAL_DATA_MODEL.md) + GCP-first ADRs in [`17`](17_GCP_FIRST_PLATFORM_STRATEGY.md).

## Milestone D0 — Architecture foundations (next engineering)

| Step | Deliverable | Acceptance |
|------|-------------|------------|
| D0.1 | OpenAPI v1 + `packages/api-client` | Contract tests pass |
| D0.2 | Repository layer (`DB_DRIVER=sqlite`) | API tests green |
| D0.3 | Fix Playwright `global-setup` → `apps/api` | E2E seed works |
| D0.4 | Align `staging-validate.mjs` URLs with `08_M5` | Smoke hits canonical Run URLs |
| D0.5 | Terraform module spike (optional project) | Plan-only or staging import doc |

## Milestone D1 — PostgreSQL on current GCP staging

| Step | Deliverable | Acceptance |
|------|-------------|------------|
| D1.1 | Cloud SQL instance (staging only, smallest tier) | Owner approves ~$10/mo |
| D1.2 | PG schema + migrations per [`18`](18_POSTGRESQL_MIGRATION_PLAN.md) | Apply on empty DB |
| D1.3 | Parity + import rehearsal (synthetic) | Counts match SQLite |
| D1.4 | Cloud Tasks + Scheduler for reminders | No in-process timer in prod path |

**Do not** combine D1 cutover with new-GCP account move ([`24`](24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md)).

## Milestone D — Clinical product depth (M8 Batch 2)

| Step | Deliverable | Depends on |
|------|-------------|------------|
| D2.1 | Implement [`19`](19_CLINICAL_DATA_MODEL.md) MVP tables + API | D0.2, design sign-off |
| D2.2 | CRM encounter + Rx UI | D2.1 |
| D2.3 | PDF generation server-side | D2.2 |
| D2.4 | Follow-ups → reminder jobs | D2.1, M7 |

## Milestone E — UI/UX + SaaS polish

Per [`20`](20_AUTHENTICATED_UI_UX_AUDIT.md): URL routing, post-signup checklist, React Query unify, staging title fixes.

## Milestone F — Enterprise / scale (current GCP)

1. Branch model ([`19`](19_CLINICAL_DATA_MODEL.md)).
2. Postgres RLS + load tests.
3. Custom domain + optional IAP.
4. Compliance exports + backup drills ([`23`](23_SECURITY_RELIABILITY_AND_COSTS.md)).

## Milestone G — Native mobile MVP

[`22`](22_NATIVE_MOBILE_ARCHITECTURE.md) — after OpenAPI stable.

## Milestone H — New GCP account migration

Execute [`24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md`](24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md) only after Milestones D0–F validation on `clinic-erp-staging`.

## Milestone I — Customer-facing extras

1. Patient portal lite — optional.
2. ABDM research spike — Enterprise only unless owner promotes.

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
