# MVP staging maintenance release

Scope: `clinic-erp-staging`, `asia-south1`, `clinic-api-staging`. Cloud Build deploys one API candidate with `--no-traffic --tag=mvp-candidate`; it does not deploy CRM or change API traffic. Run only after operator approval. Every cloud command must include `--project=clinic-erp-staging`. Do not use the production project.

## Preflight and rollback record

1. Use the approved merged release SHA in a clean checkout: `git rev-parse HEAD`. Never submit a dirty working tree. Cloud Build `gcloud builds submit --project=clinic-erp-staging --config cloudbuild.staging.yaml .` submits the *local checkout*, not necessarily remote `main`.
2. Record the service configuration, revision, image digest, traffic, tags, service and revision min/max instance settings, and current env/secret references with `gcloud run services describe clinic-api-staging --project=clinic-erp-staging --region=asia-south1 --format=json` and `gcloud run revisions describe REVISION --project=clinic-erp-staging --region=asia-south1 --format=json`. Store sensitive configuration securely; never print secret values. Confirm exactly one revision has 100% traffic, no unexpected tag or other writer, and service and revision max instances are each 1.
3. Confirm JWT, provisioning and optional Resend secrets exist and have enabled versions and runtime service account `secretAccessor` access. Check sender verification and operator notification destination. Do not guess either value.
4. Run `GCP_STAGING_PROJECT_ID=clinic-erp-staging bash apps/api/scripts/staging-restore-drill.sh` and validate integrity, foreign keys, aggregates, all four legacy PDF objects, replica freshness, Litestream logs, and lease state. The script writes only to `.restore-drill/`. Halt on any failure. Compare replica data to a known write if measuring RPO.
5. Compare schema changes since the live image. Revision rollback is permitted only while the prior image can read every migration applied by the candidate.

## Quiesce and deploy

1. During the approved maintenance window, block scheduled and manual API writers. Verify the live revision and all tagged revisions. Record `LIVE_REV` from the actual 100% traffic row. Quiesce with `gcloud run services update clinic-api-staging --project=clinic-erp-staging --region=asia-south1 --scaling=0`.
2. Verify the old revision has no running instance through Cloud Monitoring instance counts and Cloud Run logs. Inspect `gs://clinic-erp-staging-clinic-db/_meta/writer-lease.json` without disclosing identifiers. A past TTL alone is insufficient. Wait for old process termination and lease release/expiry, and halt if ownership is uncertain. Tagged revision URLs may still start instances under manual scaling zero; do not probe them until the old writer is stopped.
3. From the pinned clean checkout, run `gcloud builds submit --project=clinic-erp-staging --config cloudbuild.staging.yaml .`. Confirm only API candidate deployment occurred and 100% traffic still targets `LIVE_REV`. `--update-env-vars` and `--update-secrets` preserve unrelated existing entries; review current entries first. The release sets `SKIP_DEMO_SEED=1` and `CLINIC_ALLOW_DEMO_SEED=0` so startup does not rewrite the demo owner or catalog. Email settings remain as currently configured unless approved in the same candidate release.
4. Resolve `CANDIDATE_REV` from `status.latestCreatedRevisionName`. Resolve the exact `mvp-candidate` URL from `status.traffic` or `status.trafficStatuses`; do not construct it. Probe `/api/health` once only after old writer stop. Require `ok`, candidate `writerLease.held`, one lease holder, and Litestream replication logs. Halt if the old revision restarts or owns the lease.
5. Shift all traffic at once: `gcloud run services update-traffic clinic-api-staging --project=clinic-erp-staging --region=asia-south1 --to-revisions="${CANDIDATE_REV}=100"`. Restore the **recorded** approved scaling mode and max instance settings; if the prior setting was manual zero, use `gcloud run services update clinic-api-staging --project=clinic-erp-staging --region=asia-south1 --scaling=auto --max-instances=1` only when that matches the approved baseline. Confirm one traffic revision, `/health`, `/api/health`, CRM connectivity, database aggregates, lease and Litestream logs.

## Rollback

Stop the candidate writer first (`--scaling=0`), verify process termination and lease release as above, then run `gcloud run services update-traffic clinic-api-staging --project=clinic-erp-staging --region=asia-south1 --to-revisions="${LIVE_REV}=100"`. Restore the recorded scaling configuration and verify lease, API health and data. Halt if schema compatibility or backup integrity is uncertain; do not restore a database over the live instance as part of routine rollback.

## Abort conditions

Stop on credentials or secret access failure, failed restore/integrity check, stale backup, unexpected traffic or tagged writer, uncertain lease ownership, schema change without rollback proof, candidate health or replication failure, or any unapproved CRM deployment. Do not run the GitHub staging deploy workflow outside this maintenance procedure: it submits the full Cloud Build config.
