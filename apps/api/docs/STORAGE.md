# Clinic API — durable file storage (Step D2)

## Configuration

| Variable | Required | Description |
|----------|----------|-------------|
| `CLINIC_FILES_BUCKET` | **Yes in production** | GCS bucket name (e.g. `crucial-accord-505607-g9-db`) |
| `CLINIC_FILES_PREFIX` | No (default `clinic-files`) | Object key prefix |
| `CLINIC_FILES_STORAGE` | No | `gcs` (production default), `local` (dev), `memory` (tests) |
| `UPLOADS_DIR` | Local only | Filesystem root when `CLINIC_FILES_STORAGE=local` |
| `PUBLIC_URL` | Recommended | Used in upload response URLs (API route, not `gs://`) |

### Production

- `NODE_ENV=production` → **must** use `CLINIC_FILES_STORAGE=gcs` (implicit default).
- Missing `CLINIC_FILES_BUCKET` → process fails at config read (no silent `/data/uploads` fallback).

### Local development

```bash
export CLINIC_FILES_STORAGE=local
export UPLOADS_DIR=/tmp/clinic-uploads
# Do not set CLINIC_FILES_BUCKET unless testing real GCS locally
```

### Tests

```bash
export CLINIC_FILES_STORAGE=memory
```

Uses in-memory fake storage; never writes to production GCS.

## Object layout

```
gs://{CLINIC_FILES_BUCKET}/{CLINIC_FILES_PREFIX}/{tenantId}/{fileName}
```

Example: `gs://crucial-accord-505607-g9-db/clinic-files/denta-care/prescription-1712345678900-abc123.jpg`

Bucket objects remain **private**. Clients use authenticated `GET /api/clinic/files/:tenantId/:fileName`.

## Upload / download flow

1. `POST /api/clinic/uploads` — validate base64, magic bytes, 8MB cap → GCS put → `{ url, path }`.
2. Client saves patient with URL (unchanged product flow).
3. `GET /api/clinic/files/:tenantId/:fileName` — auth + tenant match → stream from GCS.

If GCS upload fails, POST fails (no URL). If patient save fails after upload, GCS object may remain (no auto-delete).

## Step B orphan object

Historical object:

`clinic-files/clinic-crm/dentacare/patients/6888765555/prescription-1783531352781.jpg`

The API contract only supports `:tenantId/:fileName` (single path segment each). **This nested Step B path is not addressable** through the current GET route without weakening validation. Handle separately if needed.

## Frontend note (D1)

Stored URLs pointing at `clinic-api…/api/clinic/files/…` cannot be loaded via raw `<img src>` without Bearer auth. UI currently uses blob URLs for local preview before save; verify patient detail rendering before deploy.

## IAM (document only — not applied in D2)

Minimum recommended for runtime SA:

- `storage.objects.create` on prefix
- `storage.objects.get` on prefix
- Optional: `storage.objects.list` for diagnostics

Avoid `objectAdmin` / delete in production unless deletion features are added.
