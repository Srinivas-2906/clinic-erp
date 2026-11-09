# Clinic ERP — production release package (read-only until approved)

**Branch:** `feature/clinic-single-writer`  
**Staging proof revision:** `clinic-api-staging-00051-tgd`  
**Staging image (validated):** `…/clinic-api-staging:c5606b0-singlewriter2`

## Prod restore drill (read-only)

Prerequisites: `srinivas@schoolofinterest.com` auth, **no** Cloud Run mutations.

```bash
export CLINIC_PROD_RESTORE_AUTHORIZED=1
export GCP_PROJECT_ID=crucial-accord-505607-g9
bash apps/api/scripts/prod-restore-drill.sh
# Expect: integrity_check ok, isolated file under .restore-drill/
```

## Production maintenance sequence (approval required)

```bash
export CONFIRM_PROD_CLINIC_DEPLOY=1   # add when prod script lands; mirror staging
export GCLOUD_ACCOUNT=srinivas@schoolofinterest.com
# Build prod image from merged main after PR — do not reuse staging tag
bash infra/scripts/staging-clinic-safe-deploy.sh <prod-image>   # staging script refuses prod project
# Prod: port script or use cloudbuild deploy blocked until PR merges cloudbuild.yaml max-instances=1
```

**Staging-proven steps (translate to prod):**

1. Record state (`staging-clinic-predeploy-record.sh` pattern).
2. `--scaling=0` → `wait-run-zero-instances` → replica checkpoint (quiescence).
3. Deploy candidate `--no-traffic`, `--max-instances=1`.
4. Restore `--scaling=auto`, pin traffic `--to-revisions=NEW=100` only.
5. Health: `/api/health` with `writerLease.held=true`.
6. On failure: **remain at scaling=0**; manual recovery (no auto-rescale).

**Estimated downtime:** 3–8 minutes API unavailable (scaling=0 window + cold start). CRM static may still serve UI; data mutations blocked during drain.

## Rollback

1. Leave service at `--scaling=0` if cutover uncertain.
2. Verify GCS replica checkpoint + lease object.
3. Route `--to-revisions=<LAST_KNOWN_GOOD_REV>=100` (e.g. pre-maintenance revision from predeploy record).
4. **Do not** `--to-latest` if a failed no-traffic revision exists.
5. If DB uncertainty: restore from Litestream replica to isolated file, compare generation/fence, then operator decision.

## Duplicate lease fix (must ship)

- **Before:** `docker-entrypoint.sh` acquired lease; `run-api-with-lease.mjs` acquired again → startup deny.
- **After:** single acquire in `run-api-with-lease.mjs` only; stable `buildHolderId()`.

## CI / deploy enforcement (after merge)

- `cloudbuild.yaml`: clinic-api `--max-instances 1` (branch change).
- Prefer `infra/scripts/staging-clinic-safe-deploy.sh` for staging cutovers instead of raw `gcloud run deploy`.
- Wire production equivalent before enabling prod maintenance.
