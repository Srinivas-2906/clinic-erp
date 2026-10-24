# M7 — Database architecture decision

**Date:** 2026-10-22  
**Scope:** Clinic ERP canonical repo (`apps/api` SQLite + Litestream) vs `kaana-clinic` Postgres/Drizzle experiment.

**Update (2026-10-24):** Pre–Batch 2 assessment [`16_PRODUCT_ARCHITECTURE_ASSESSMENT.md`](16_PRODUCT_ARCHITECTURE_ASSESSMENT.md) keeps SQLite for the **current** deploy pattern but recommends **Neon Postgres** as the **commercial multi-tenant target**. Owner sign-off on doc `16` §12 before migration.

## Current production pattern (verified)

- Single SQLite file per Cloud Run API instance path (`/data/clinic.db`).
- Litestream continuous replication to GCS (`clinic.db` object prefix).
- Tenant isolation: **application-level** `tenant_id` on all clinic tables; one DB file holds all tenants in the deployment.
- Cloud Run **max-instances: 1** on staging (and prod API today) avoids multi-writer SQLite conflicts.

## Evaluation

| Criterion | SQLite + Litestream (current) | Shared PostgreSQL (kaana-clinic experiment) |
|-----------|------------------------------|---------------------------------------------|
| Tenant isolation | Logical rows; risk if query misses `tenant_id` | Schema/row policies possible; stronger for multi-tenant SaaS |
| Concurrent writes / multi-instance | **Poor** — requires max 1 API instance or DB-per-tenant | **Good** — horizontal Cloud Run scale |
| Backup / recovery | Litestream proven on staging; restore via `litestream restore` | Managed backups, PITR (Cloud SQL) |
| Migration effort | None for M7 | High — parity tests exist in `kaana-clinic` but not merged |
| Ops complexity | Low cost, low ops | Higher (Cloud SQL, migrations, connection pooling) |
| Cost @ 10 clinics | ~1 deployment, minimal GCS | Overkill unless true multi-tenant single DB |
| Cost @ 100 clinics | Still viable on **per-customer** SQLite+Litestream or sharded projects | Shared PG becomes economical |
| Cost @ 1000 clinics | Needs sharding / PG / hybrid | PostgreSQL (or Cockroach) almost required |
| Multi-branch | Not modeled (single tenant row) | Experiment schema closer to normalized model |
| Account migration | Project-per-env documented (M5) | Export/import via pg_dump + migration scripts |

## Recommendation

1. **Retain SQLite + Litestream through Essential and Professional tiers** while Cloud Run **max-instances = 1** per clinic deployment (or per shard).
2. **Do not merge** `kaana-clinic` Postgres code until an explicit migration milestone with parity test gate.
3. **Introduce shared PostgreSQL** for **Enterprise multi-branch / multi-clinic** and horizontal scale — design using `kaana-clinic` repositories as a spike, not as drop-in replacement.
4. **Short-term SaaS on single staging project:** acceptable for QA; commercial multi-tenant hosting should plan either **database-per-tenant** (SQLite file + Litestream prefix per tenant) or **Postgres RLS** before marketing unlimited clinics on one instance.

## Assumptions

- Enterprise customers will expect branch-level reporting and >1 concurrent API instance.
- Litestream remains the backup standard for SQLite deployments until Postgres cutover.
