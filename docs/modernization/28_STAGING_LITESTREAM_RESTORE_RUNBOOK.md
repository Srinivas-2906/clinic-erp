# Staging Litestream restore runbook (isolated drill)

**Scope:** GCP project `clinic-erp-staging` only. **Never** use production bucket `kaana-prod-db` or project `crucial-accord-505607-g9`.

**Purpose:** Prove SQLite can be recovered from the Litestream replica in GCS **without** overwriting the live Cloud Run database or redeploying staging.

---

## What this drill proved vs did not prove

| Area | Status | Notes |
|------|--------|--------|
| **SQLite file restoration** | **Verified (2026-10-26)** | Isolated local `.restore-drill/` file; `integrity_check` ok; FK violations 0 |
| **Full Cloud Run service recovery** | **Not verified** | No redeploy, cold start, or entrypoint `litestream restore` timed end-to-end |
| **Clinical attachments (Rx PDF, uploads)** | **Not verified** | Objects live under `gs://…/clinic-files-staging/`; separate from Litestream replica |
| **Operator laptop → GCS direct restore** | **Blocked by IAM/ADC** | `litestream restore gcs://…` returned 403; drill used `gcloud storage rsync` + `file://` |
| **Guaranteed RPO / data-loss window** | **Not measured** | GCS object mtimes and max row timestamps are **hints only**, not proof of zero loss |
| **Backup retention / lifecycle** | **Misconfigured vs intent** | See §1 retention — **do not change lifecycle in this PR** |

---

## 1. Backup configuration (as deployed)

| Item | Value |
|------|--------|
| Primary DB path | `/data/clinic.db` (`DATABASE_PATH`) |
| Replica URL | `gcs://clinic-erp-staging-clinic-db/clinic.db` |
| Litestream version | **v0.3.13** (API `Dockerfile`) |
| Startup | `apps/api/docker-entrypoint.sh`: `litestream restore` → `litestream replicate -exec node …` |
| Cloud Run API | `clinic-api-staging`, **max-instances 1**, min 0 (scale to zero) |
| Runtime SA | `clinic-staging-runner@clinic-erp-staging.iam.gserviceaccount.com` — GCS on staging bucket |
| Uploads / files | Same bucket, prefix `clinic-files-staging/` (not included in SQLite replica) |
| Replication | Continuous (WAL segments uploaded by Litestream while API runs) |
| Retention (documented intent) | `infra/staging/provision.sh` sets a **7-day delete** rule on prefix `litestream/` |
| Retention (actual replica path) | Litestream writes under **`clinic.db/`** — the provisioned rule **does not apply** to current backups |

### Retention risk (no policy change in this runbook)

- **Risk:** Ops may believe staging SQLite replicas expire after 7 days; in practice **`clinic.db/**` objects are not covered** by the existing lifecycle prefix, so replicas may **accumulate indefinitely** (cost + clutter) rather than expire as intended.
- **Risk (if fixed naively):** Adding a broad delete rule on `clinic.db/` without recovery testing could **destroy restorable history**.
- **Recommendation:** Open a **separate, reviewed change** (infra + ops sign-off) for a **recovery-safe retention policy** — e.g. minimum retention window aligned with pilot needs, optional transition to Nearline/Coldline, explicit exclusion of the **latest** generation until a newer chain is verified, and a documented restore drill **after** any lifecycle change.

---

## 2. Preconditions

- `gcloud` authenticated to an identity with **read** on `gs://clinic-erp-staging-clinic-db/` (list + get). Secret Manager access is **not** required for restore.
- `sqlite3` locally (validation).
- **Do not** set `DATABASE_PATH` to `/data/clinic.db` on a running staging container for drills.
- **Do not** delete or overwrite objects in GCS.

---

## 3. Permissions

| Actor | Needs |
|-------|--------|
| Cloud Run API (normal ops) | SA `clinic-staging-runner`: object read/write on staging bucket |
| Human ops drill | `roles/storage.objectViewer` (or equivalent) on `clinic-erp-staging-clinic-db` **for the gcloud account** |

**Known gap (2026-10-26):** `gcloud storage ls/rsync` may work while **Application Default Credentials** used by `litestream restore gcs://…` return `403 storage.objects.list`. Until ADC is aligned, use the **local replica sync** path below (same data; extra download step).

Optional fix for direct GCS restore from a laptop:

```bash
gcloud auth application-default login
# plus bucket IAM: roles/storage.objectViewer for the operator account
```

---

## 4. Safe isolated restore procedure

### 4.1 Verify backup activity (read-only)

```bash
export PROJECT=clinic-erp-staging
gcloud storage ls -l -r "gs://clinic-erp-staging-clinic-db/clinic.db/**" --project="$PROJECT" | tail -20
```

Confirm recent `generations/*/wal/*.wal.lz4` timestamps and non-zero object count.

### 4.2 Restore drill script (recommended)

From repo root:

```bash
chmod +x apps/api/scripts/staging-restore-drill.sh
apps/api/scripts/staging-restore-drill.sh
```

Outputs under **`.restore-drill/`** (gitignored):

- `replica/clinic.db/` — copy of Litestream objects
- `staging-clinic-restored-<UTC-stamp>.db` — isolated SQLite file

Split steps:

```bash
apps/api/scripts/staging-restore-drill.sh --sync-only
apps/api/scripts/staging-restore-drill.sh --restore-only
```

### 4.3 Manual equivalent

```bash
LITESTREAM=apps/api/.tools/litestream   # or v0.3.13 on PATH
REPLICA=.restore-drill/replica/clinic.db
OUT=.restore-drill/staging-clinic-restored-manual.db

gcloud storage rsync -r gs://clinic-erp-staging-clinic-db/clinic.db/ "$REPLICA/" --project=clinic-erp-staging
"$LITESTREAM" restore -if-replica-exists -o "$OUT" "file://$REPLICA"
sqlite3 "$OUT" "PRAGMA integrity_check; PRAGMA foreign_key_check;"
```

---

## 5. Validation (no PHI in logs)

Run aggregate checks only:

```sql
PRAGMA integrity_check;          -- expect: ok
PRAGMA foreign_key_check;        -- expect: empty
SELECT slug FROM tenants;        -- expect: dentacare
SELECT count(*) FROM patients;
SELECT count(*) FROM appointments;
SELECT count(*) FROM encounters;
SELECT count(*) FROM prescriptions;
SELECT count(*) FROM patient_payments;
SELECT count(*) FROM audit_log;
-- Max timestamps (recovery point hint):
SELECT max(substr(created_at,1,19)) FROM appointments WHERE created_at IS NOT NULL;
SELECT max(substr(created_at,1,19)) FROM encounters WHERE created_at IS NOT NULL;
SELECT max(substr(created_at,1,19)) FROM audit_log WHERE created_at IS NOT NULL;
```

Compare counts to staging API **only via aggregates** (no patient names/phones in tickets).

**Not in SQLite backup:** GCS clinical file blobs under `clinic-files-staging/` — recovery of PDFs/images requires separate object restore.

---

## 6. Abort / rollback

| Situation | Action |
|-----------|--------|
| Wrong bucket / project in env | **Stop** — script refuses prod bucket name |
| Restore targeted live `/data/clinic.db` | **Do not** — use `.restore-drill/` only |
| integrity_check ≠ ok | Do not use file; inspect replica sync completeness and Litestream logs |
| Drill complete | Delete local `.restore-drill/` when done (optional) — **never** delete GCS replica |

Live staging needs **no rollback** if drill stayed local.

---

## 7. Common failures

| Symptom | Likely cause | Mitigation |
|---------|----------------|------------|
| `403` on `litestream restore gcs://…` | ADC lacks storage.list | `gcloud storage rsync` + `file://` restore |
| Empty `generations/` after sync | Wrong prefix or bucket | Use `…/clinic.db/` not bucket root only |
| Stale data vs live UI | Scale-to-zero + backup lag | Check latest WAL mtime in GCS; warm API before critical demo |
| Missing Rx PDFs | Files in GCS prefix, not DB | Restore objects from `clinic-files-staging/` |

---

## 8. Evidence — drill 2026-10-26 (UTC)

| Metric | Observed |
|--------|----------|
| GCS replica prefix | `gs://clinic-erp-staging-clinic-db/clinic.db/` |
| Objects (approx.) | **565** files, **~3.79 MiB** total |
| Latest snapshot (generation `169e4bd12796f3cc`) | **2026-10-26T17:05:25Z** |
| Latest WAL segment (same generation) | **2026-10-26T17:12:40Z** |
| Litestream generation restored | `169e4bd12796f3cc` (newest complete chain) |
| Replica sync duration | **~11 s** (local network) |
| `litestream restore` duration | **~0.11 s** (after sync) |
| Restored file size | **471,040 bytes** |
| `integrity_check` | **ok** |
| `foreign_key_check` | **0 violations** |
| Tenant slug | **dentacare** |
| Row counts | users **3**, patients **96**, appointments **79**, encounters **51**, prescriptions **50**, payments **24**, audit_log **383** |
| Max row timestamps in restore | appointments **2026-10-26 17:12:15**, encounters **2026-10-26T17:12:15**, audit **2026-10-26 17:12:19** |

**Recovery point (interpret carefully):**

- **Inside the restored file:** latest row timestamps through **2026-10-26 17:12 UTC** (appointments / encounters / audit).
- **In GCS:** newest WAL object on the restored generation through **2026-10-26T17:12:40Z**.
- These values **do not** by themselves prove how much data could be lost in a real outage (uncommitted transactions, scale-to-zero gaps, or activity after the last WAL are not quantified here). Treat as **observed backup freshness**, not contractual RPO.

**RTO (this drill type only):** **~11 s** download + **<1 s** restore for current DB size on a developer machine. **Service RTO unverified.**

---

## 8.1 Follow-up required — clinical attachments

SQLite restore **does not** restore binary clinical files. Staging stores them in the **same bucket**, prefix **`clinic-files-staging/`** (`CLINIC_FILES_BUCKET` / `CLINIC_FILES_PREFIX` on API).

**Required before calling staging “fully recoverable”:**

1. Document object layout (keys referenced from `clinical_attachments` / prescription PDF paths).
2. Run a **separate read-only drill**: list or sample-sync `gs://clinic-erp-staging-clinic-db/clinic-files-staging/` and verify authenticated GET (e.g. extend `staging-clinical-qa.mjs` or a dedicated script) after a DB restore scenario.
3. Record evidence in this doc or a linked `29_*` attachment runbook when complete.

---

## 9. Periodic verification

- **Monthly (staging):** run §4.2, record object count, latest WAL time, integrity_check, and aggregate counts in a dated note (this section or a secure ops log).
- **After major staging demos:** confirm WAL activity in GCS within 24h.
- **Before pilot sign-off:** re-run drill after any Litestream or Cloud Run storage change.

---

## 10. Related docs

- `docs/modernization/27_OPERATIONAL_READINESS.md` — clinic-day checklist and gaps
- `infra/staging/ARCHITECTURE.md` — staging boundary and backup strategy
- `docs/modernization/08_M5_STAGING_LIVE.md` — initial staging go-live (restore drill was TODO there)
