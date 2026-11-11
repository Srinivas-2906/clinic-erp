# MVP staging — operator release checklist

**Use before first controlled staging deploy from `main` after single-writer merge.** Do not execute deploy steps without explicit approval.

## Pre-deploy (read-only verification)

- [ ] **Baseline image:** Confirm current traffic revision image tag and SHA (`gcloud run revisions list`).
- [ ] **Replica drill:** Run `apps/api/scripts/staging-restore-drill.sh` — `integrity_check=ok`, expected tenant/patient counts.
- [ ] **Backup freshness:** Note latest Litestream segment timestamp in `gs://clinic-erp-staging-clinic-db/clinic.db/` (synthetic: restore drill + compare `max(audit_at)` to within agreed RPO).
- [ ] **maxScale:** `gcloud run revisions describe` traffic revision — `autoscaling.knative.dev/maxScale` **1**; run `gcloud run services update clinic-api-staging --max-instances=1` if service metadata still shows 3.
- [ ] **Email — Resend:** Set `CLINIC_EMAIL_PROVIDER=resend`, create GSM secret for API key, verify transactional send (password reset / invite) in staging project only.
- [ ] **Monitoring:** Run `scripts/staging-monitoring-setup.sh` or create alert channels (uptime, 5xx rate, Litestream errors); confirm notification routes.
- [ ] **Clinical PDFs:** `node scripts/pilot-clinical-files-validate.mjs` (or gcloud-backed list) — DB file keys resolve in `clinic-files-staging/`.
- [ ] **Secrets:** `clinic-staging-jwt-secret`, `clinic-staging-demo-password`, `clinic-staging-provisioning-key` present in GSM and referenced in deploy config.

## Deploy (controlled — requires approval)

- [ ] **Maintenance:** Scale clinic-api-staging to `--scaling=0`; wait until instance count 0 (Monitoring).
- [ ] **Checkpoint (optional):** `staging-clinic-replica-checkpoint.sh` if available.
- [ ] **Build:** CI green **6/6** on PR merge commit; image from `cloudbuild.staging.yaml`.
- [ ] **No traffic:** `gcloud run deploy … --no-traffic --max-instances=1`.
- [ ] **Lease smoke:** Curl new revision URL (direct, minimal) — `/health` shows `writerLease.held=true` or 503 until lease acquired; **do not** leave revision receiving production traffic during test.
- [ ] **Traffic shift:** `update-traffic` 100% to new revision only after health + lease OK.
- [ ] **Rollback plan:** Prior revision tag recorded; traffic revert command documented.

## Post-deploy clinic-day acceptance

- [ ] Login (demo owner + tenant slug).
- [ ] Walk-in patient → appointment → encounter finalize → invoice → partial payment.
- [ ] Cross-tenant negative check (404 on foreign patient).
- [ ] Reports load without 5xx.
- [ ] `GET /api/health` — `ok: true`, `writerLease` present, fence increments only on intentional takeover.
- [ ] Litestream logs — `replicate` active, no sustained upload errors.

## Known release blockers (outside this PR)

| Item | Status |
|------|--------|
| `CLINIC_EMAIL_PROVIDER=console` on live staging | Blocker for real email |
| Alert policies not configured | Blocker for unattended pilot |
| Service-level `maxScale=3` metadata vs revision `1` | Operator align required |
| Production `cloudbuild.yaml` max-instances 3 | Out of scope — no prod deploy |

## Go / no-go

**CONDITIONAL GO** for controlled staging pilot when: this single-writer PR merged, CI green, checklist items above completed, and deploy uses maintenance + no-traffic pattern. **NO-GO** for production SQLite or multi-instance clinic-api without further infra approval.
