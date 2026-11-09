# Clinic ERP — single-writer safety

**Branch:** `feature/clinic-single-writer`. **Not production.**

## Correct Cloud Run drain sequence

`--max-instances=0` is **invalid** (minimum 1). Use **manual scaling**:

```bash
gcloud run services update SERVICE --region=REGION --project=PROJECT \
  --scaling=auto --min-instances=0 --max-instances=1

gcloud run services update SERVICE --region=REGION --project=PROJECT \
  --scaling=0

# Verify active instance_count = 0 (Monitoring), not assumed from zero traffic
bash infra/scripts/wait-run-zero-instances.sh PROJECT REGION SERVICE 600

bash infra/scripts/staging-clinic-replica-checkpoint.sh 120 15 2

gcloud run deploy SERVICE --image=IMAGE --no-traffic --max-instances=1 ...

gcloud run services update SERVICE --scaling=auto --max-instances=1
gcloud run services update-traffic SERVICE --to-revisions=NEW_REVISION=100
```

**Do not** curl revision **tag** URLs during cutover (starts container → restore + replicate).

**Partial failure:** script exits via `maintenance_halt` — service stays at `--scaling=0` until an operator verifies lease, replica, and revision evidence.

## CPU allocation (clinic-api)

**Default Cloud Run (unless changed):** CPU **throttled outside active requests** (`cpu-throttling` / CPU idle). Background `setInterval` lease renew and **Litestream replication** may stall when idle.

| Mode | Lease timer | Litestream background | Typical cost |
|------|-------------|---------------------|--------------|
| Request-based CPU (default) | **Not reliable when idle** | **May lag** when idle | Lower |
| `--no-cpu-throttling` | Timer runs while instance up | Replicate continues | Higher always-on CPU billing |

**Do not enable** instance-always CPU in prod without approval. **Correctness for deploys** relies on **`--scaling=0` maintenance**, not background lease renew.

## Fencing — what is guaranteed

| Guaranteed | Not guaranteed |
|------------|----------------|
| GCS lease create/update races (generation match) | Litestream WAL uploads fenced by lease fence |
| API **mutating** paths blocked via middleware when remote holder/fence ≠ local | SQLite writes outside HTTP (startup, timers) |
| Process exit when renew/verify fails (incl. timer) | Exit **immediately** when CPU frozen (timer delayed) |
| `release()` only if holder **and** fence match | Two instances after bad deploy without `--scaling=0` |

**Production-safe claim:** **Maintenance `--scaling=0` + max-instances=1 + startup lease admission.** Lease + request guard reduce overlap risk but **do not replace** maintenance deploy.

## Staging deploy

```bash
export CONFIRM_STAGING_CLINIC_DEPLOY=1
bash infra/scripts/staging-clinic-safe-deploy.sh <staging-image>
```

## Prod restore drill (read-only; separate approval)

```bash
export CLINIC_PROD_RESTORE_AUTHORIZED=1
bash apps/api/scripts/prod-restore-drill.sh
```

Script uses **rsync from GCS only**; no `litestream replicate`, no uploads to prod bucket.
