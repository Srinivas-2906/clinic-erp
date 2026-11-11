# Clinic ERP modernization — master plan

**Canonical repo:** https://github.com/Srinivas-2906/clinic-erp  
**Production (unchanged):** GCP `crucial-accord-505607-g9`, `clinic.kaana.in`, tenant `dentacare`.

## Milestone status (2026-10-22)

| # | Milestone | Status |
|---|-----------|--------|
| M1 | Repository separation | **Done** — `apps/api`, `apps/crm` monorepo |
| M2 | Canonical GitHub + safe CI | **Done** — PR #1 merged; CI only on push |
| M3 | Production baseline | **Done** — `03_PRODUCTION_BASELINE.md` |
| M4 | Config + staging design | **Done** — PR #3; staging guards |
| M5 | Staging provision + deploy | **Done** — `08_M5_STAGING_LIVE.md` |
| M6 | Product audit + SaaS plan | **Done** — `09`–`12` docs |
| M7 | Entitlements, audit, reminders | **Done** — `14_M7_DELIVERY.md` |
| M8 Batch 1 | Signup + provisioning | **Done** — `15_M8_BATCH1_DELIVERY.md` |
| Assessment | Product + architecture (pre–Batch 2) | **Done** — `16` + **GCP-first** `17`–`24` |
| M8+ | Batch 2+ (clinical, mobile, PG, IaC) | **Gated** — [`17`](17_GCP_FIRST_PLATFORM_STRATEGY.md) + open decisions |

## Staging

- Project: `clinic-erp-staging`
- URLs: see `08_M5_STAGING_LIVE.md`
- Deploy: manual `deploy-staging.yml` (after workflow fix merge)

## Hard constraints (ongoing)

- No production deploys or DNS changes without explicit approval.
- No real patient data on staging.
- No automatic merge of `kaana-clinic` Postgres experiment.
- Denta Care production revisions pinned and re-verified after infra work.

## Document index

| Doc | Purpose |
|-----|---------|
| `01`–`07` | Separation, baseline, approval gate |
| `08_M5_STAGING_LIVE.md` | Live staging evidence |
| `09_M6_PRODUCT_AUDIT.md` | Module maturity |
| `10_SAAS_ARCHITECTURE.md` | Target SaaS technical shape |
| `11_THREE_EDITION_BUSINESS_PLAN.md` | Editions + pricing hypotheses |
| `12_IMPLEMENTATION_ROADMAP.md` | Prioritized engineering milestones |
| `13_M7_DATABASE_DECISION.md` | SQLite vs Postgres analysis (M7) |
| `14_M7_DELIVERY.md` | M7 merge evidence |
| `15_M8_BATCH1_DELIVERY.md` | Signup / provisioning delivery |
| `16_PRODUCT_ARCHITECTURE_ASSESSMENT.md` | Initial assessment (hosting superseded by `17`) |
| `17_GCP_FIRST_PLATFORM_STRATEGY.md` | **Authoritative** GCP build + account portability |
| `18_POSTGRESQL_MIGRATION_PLAN.md` | SQLite → Cloud SQL plan |
| `19_CLINICAL_DATA_MODEL.md` | Pre–Batch 2 clinical schema |
| `20_AUTHENTICATED_UI_UX_AUDIT.md` | UI/UX evidence + backlog |
| `21_COMPETITIVE_PRODUCT_MATRIX.md` | Competitor parity |
| `22_NATIVE_MOBILE_ARCHITECTURE.md` | Expo design |
| `23_SECURITY_RELIABILITY_AND_COSTS.md` | Security + GCP cost model |
| `24_NEW_GCP_ACCOUNT_MIGRATION_PLAYBOOK.md` | Future account cutover |
| `infra/terraform/README.md` | IaC design (no apply yet) |
