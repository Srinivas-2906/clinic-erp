# Clinical files — staging restore provenance audit (read-only)

**Database:** `.restore-drill/staging-clinic-restored-20261109T184830Z.db` (Litestream restore from `gs://clinic-erp-staging-clinic-db/clinic.db/`)  
**Date:** 2026-11-09  
**Method:** SQLite read-only queries + `pilot-clinical-files-validate.mjs` (local default storage)

## Summary

| Category | Count | Verdict |
|----------|-------|---------|
| Prescription PDF rows with `pdf_storage_key` | **4** (all tenant `denta-care`) | **Confirmed missing** at default local resolver |
| `clinical_attachments` rows | **0** in restore snapshot | N/A |
| Database integrity | **ok** | Metadata present; objects not verified in GCS (auth blocked this session) |

## Sampled missing objects (from validator run)

All four share:

- **Tenant slug/id:** `denta-care` (legacy Denta Care tenant — **out of MVP scope**; do not mutate)
- **Storage key shape:** bare filename (e.g. `prescription-pdf-1792916489417-jXUzsH.pdf`), not `clinic-files-staging/...` prefix
- **Encounter ids:** `t03jbPF-n5cS`, `qzRxiB_K1Wn-`, `8QfICBNxV0kP`, `_CpwRHwCCWIV`

## Expected staging paths (current integration)

Per `cloudbuild.staging.yaml`:

- `CLINIC_FILES_STORAGE=gcs`
- `CLINIC_FILES_BUCKET=${_DB_BUCKET}` (`clinic-erp-staging-clinic-db`)
- `CLINIC_FILES_PREFIX=clinic-files-staging`

New uploads resolve to objects under **`clinic-files-staging/<tenantId>/<fileName>`**. Legacy rows store **filename only** and **`denta-care` tenant**, consistent with pre-GCS or local `/data/uploads` era.

## Classification

| File key | Classification | Rationale |
|----------|------------------|-----------|
| All 4 `prescription-pdf-*.pdf` (`denta-care`) | **Confirmed missing** (local check) | Validator could not open stream; keys predate current GCS prefix model |
| Same objects in GCS | **Inaccessible this session** | `gcloud` token refresh failed — **not** proven present or absent in bucket |
| Alternate prefix recovery | **Unknown** | Would require read-only `gsutil ls` on `gs://clinic-erp-staging-clinic-db/clinic-files-staging/` and legacy upload paths |
| Litestream DB backup | **Recoverable (metadata)** | Row-level prescription keys restored with DB |

## MVP impact

- **MVP pilot tenants** (`dentacare` E2E, new signups) use current storage integration — not affected by legacy `denta-care` gaps.
- **Do not** claim complete document recovery for legacy tenant without object-level GCS proof.
- **Do not** delete DB references.

## Operator follow-up (read-only)

1. Re-auth `gcloud` and run:  
   `gcloud storage ls gs://clinic-erp-staging-clinic-db/clinic-files-staging/**`  
   and search for the four filenames at bucket root or `uploads/` legacy paths.
2. Re-run:  
   `CLINIC_FILES_STORAGE=gcs CLINIC_FILES_BUCKET=clinic-erp-staging-clinic-db CLINIC_FILES_PREFIX=clinic-files-staging PILOT_RESTORE_DB=<restore.db> node scripts/pilot-clinical-files-validate.mjs`
