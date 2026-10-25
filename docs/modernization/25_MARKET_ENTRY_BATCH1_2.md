# Market entry — Batch 1 & 2 delivery notes

**Branch:** `feature/market-entry-batch1-2`  
**Docs PR #11:** still **open** (GCP planning); this implementation PR is independent.

## Batch 1 — staging reliability

| Item | Status |
|------|--------|
| Playwright `global-setup` → `apps/api` | Done |
| `staging-validate.mjs` canonical URLs + gcloud resolve | Done |
| Staging login empty defaults on `*.run.app` | Done |
| Authenticated staging smoke | Run locally with Secret Manager or `STAGING_DEMO_PASSWORD` |

## Batch 2 — clinical workflow (MVP)

- SQLite schema: encounters, vitals, diagnoses, prescriptions, follow-ups, allergies, amendments.
- API under `/api/clinic/…` with **clinician = doctor `user_id` link** (owners cannot finalize unless linked).
- Draft / finalize / PDF (pdfkit) / follow-up reminder enqueue.
- CRM: **Consult** on arrived appointments → `ConsultationDialog`.
- Tests: `encounters.test.js` (+2); API **69** pass.

## Verify locally

```bash
npm run test:api
npm run seed:e2e && cd apps/crm && npm run test:e2e -- e2e/tests/04-today.spec.ts
```

Link staging owner to a doctor (`doctors.user_id`) before clinical finalize on staging.

## Remaining (Batch 3+)

- Patient chart encounter history UI, deep links, password recovery.
- PostgreSQL repository layer (Batch 4).
- Playwright e2e for full consult → PDF path.
- Staging owner↔doctor link automation in demo seed.
