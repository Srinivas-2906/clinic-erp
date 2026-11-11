# SQLite deployment safety — MVP assessment

**Scope:** Clinic ERP API on Cloud Run + Litestream (no production changes in this assessment).

## Current architecture

| Layer | Behavior |
|-------|----------|
| Process | Node API in container |
| DB file | `DATABASE_PATH=/data/clinic.db` on **instance ephemeral disk** |
| Startup (`docker-entrypoint.sh`) | If `LITESTREAM_BUCKET`: required `litestream restore` in production (fail-closed), then `litestream replicate -exec run-api-with-lease.mjs` |
| Writer lease | GCS `_meta/writer-lease.json`; acquire in `run-api-with-lease.mjs`; mutating API blocked without holder/fence match (see [12-clinic-single-writer.md](../gcp-migration-audit/12-clinic-single-writer.md)) |
| Clinical files (staging) | GCS via `CLINIC_FILES_*` |
| CRM | Stateless static/nginx |

## Why `max-instances=1` is necessary but not sufficient

| Concern | `maxScale=1` helps? | Notes |
|---------|---------------------|--------|
| Concurrent SQLite writers | **Partially** | Only one instance at steady state |
| **Rolling deploy** (two revisions) | **No** | Old + new revision both run; two writers possible during cutover |
| **Cold start** after scale-to-zero | **No** | New instance runs `restore` — must succeed before writes; lag risk |
| **Ephemeral disk** | **No** | Container recycle without Litestream flush → data loss without replica |
| **Replication lag** | **No** | Recent commits may not be in GCS yet at crash |
| **Graceful shutdown** | **No** | Litestream must finish WAL; SIGTERM window matters |

**Conclusion:** `max-instances=1` is a **necessary** guard for SQLite but **not sufficient** for durability or writer isolation during deploys and cold starts.

## Production vs staging (repo config)

| File | `max-instances` | MVP-safe? |
|------|-----------------|-----------|
| `cloudbuild.staging.yaml` | **1** | **Yes** (minimal SQLite pattern) |
| `cloudbuild.yaml` | **3** | **No** — multi-instance SQLite writer risk |

## Smallest safe MVP architecture (recommended)

1. **Staging pilot:** Keep SQLite + Litestream + GCS replica; **`max-instances=1`**; `min-instances=0` or `1` if cold-start SLA requires (trade cost vs restore latency).
2. **Deploy discipline:** One revision at a time; verify health before shifting 100% traffic; avoid overlapping API revisions during pilot.
3. **Backups:** Scheduled `staging-restore-drill.sh`; monitor Litestream logs for replicate errors.
4. **Files:** GCS for clinical objects; DB holds metadata only.
5. **No production pilot** until production `max-instances` aligned or database migrated.

## If SQLite is unacceptable for GA

**Managed database migration** (future, not executed here):

| Phase | Action |
|-------|--------|
| Design | Choose Postgres (or Cloud SQL); map tenant isolation, migrations, finance integrity |
| Dual-write / cutover | Export SQLite → import; read-only window or brief maintenance |
| Rollback | Keep Litestream snapshot + last good revision; document restore-to-SQLite only as emergency |
| Effort | Large — **post-MVP** unless pilot proves SQLite ops burden |

## Failure modes & detection

| Failure | Symptom | Mitigation |
|---------|---------|------------|
| Split brain (2 writers) | Corrupt DB, FK errors | max-instances=1; writer lease + write guard; maintenance deploy (`--scaling=0`) |
| Restore stale | Missing recent patients | Monitor replicate lag; `min-instances=1` optional |
| Lost replica | Empty DB after restore-if-not-exists | Alert on missing bucket; refuse startup without policy |
| PDF missing | DB key, no GCS object | `pilot-clinical-files-validate.mjs` in drill |

## Decision for MVP pilot

| Path | Verdict |
|------|---------|
| Controlled **staging** pilot with above constraints | **Allowed** with operator runbook |
| **Production** `cloudbuild.yaml` as-is | **Not allowed** for SQLite MVP |
| Managed DB migration | **Recommended before GA scale**; plan only |
