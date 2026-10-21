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
| M7+ | Implementation batches | **Next** — see `12_IMPLEMENTATION_ROADMAP.md` |

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
