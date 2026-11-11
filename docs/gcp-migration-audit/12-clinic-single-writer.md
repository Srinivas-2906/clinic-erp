# Clinic ERP — single-writer safety (MVP)

**Scope:** SQLite + Litestream on Cloud Run. **Merged to main** via `fix/release-single-writer-safety` (minimal port from `fix/clinic-single-writer-safety`).

## Layers

| Layer | Mechanism | Guarantees |
|-------|-----------|------------|
| Infra | `--max-instances 1` on clinic-api (staging cloudbuild) | Caps concurrent Cloud Run instances |
| Startup | GCS writer lease in `run-litestream-with-lease.mjs` **before** `litestream replicate` | No Litestream publish without lease; second instance **exits** if denied |
| Runtime | `writerLeaseGuardMiddleware` on mutating HTTP methods | API writes **503** when local holder/fence ≠ remote |
| Restore | `CLINIC_REQUIRE_LITESTREAM_REPLICA` (default on in production + bucket) | **No empty DB** when replica missing |
| Ops | Maintenance `--scaling=0` before image cutover | Avoid overlapping Litestream parents |

## What `writerLease.held=true` in `/health` does **not** prove

- Two overlapping revisions cannot both run **Litestream replicate** (parent process is not lease-gated).
- CPU-throttled idle instances keep renewing on a reliable timer.
- Exclusive SQLite safety without **`max-instances=1`** and **no-traffic deploy** discipline.

## Service `maxScale=3` vs revision `maxScale=1`

Cloud Run applies **per-revision** `autoscaling.knative.dev/maxScale` from the **active revision template**. A stale **service** label `run.googleapis.com/maxScale: '3'` can remain in metadata after deploy; operators should verify **`gcloud run revisions describe`** on the traffic-bearing revision. **Effective instance count** for SQLite MVP must be **1** — align service-level update: `gcloud run services update … --max-instances=1`.

## Controlled staging deploy (no traffic)

See [MVP_STAGING_OPERATOR_CHECKLIST.md](../modernization/MVP_STAGING_OPERATOR_CHECKLIST.md). Do not deploy without approval.
