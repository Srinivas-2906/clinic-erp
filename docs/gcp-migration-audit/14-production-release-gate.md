# Production release gate — clinic-api single-writer

**Status:** NO-GO until blockers below cleared. **Do not deploy without signed approval.**

## Staging validation (done)

| Item | Evidence |
|------|----------|
| Revision | `clinic-api-staging-00051-tgd` |
| Image | `…/clinic-api-staging:c5606b0-singlewriter2` |
| Disposable write + replica + cold restart | `.staging-evidence/`, `scripts/staging-persistence-drill.mjs` |

## Production as-is (2026-11-09)

| Item | Value |
|------|-------|
| Service | `clinic-api` @ `crucial-accord-505607-g9` / `asia-south1` |
| Ready revision | `clinic-api-00018-4c5` |
| Image | `…/kaana/clinic-api:d3.1-clinic-20260929-742c4ce1` |
| **template maxScale** | **3** |
| **service maxScale** | **3** |
| Litestream bucket | `gs://crucial-accord-505607-g9-db` |

## Prod read-only restore drill (2026-11-09)

With `CLINIC_PROD_RESTORE_AUTHORIZED=1`:

- `integrity_check` **ok**, `fk_violations` **0**
- Counts: tenants **1**, users **4**, patients **41**
- `max_audit_ts` **2026-10-16 13:52:24** (replica PITR at rsync end)
- Output: `.restore-drill-prod/prod-clinic-restored-20261109T132817Z.db`
- No GCS writes, no replicate, no Run changes

**Note:** Audit tail age must be reconciled with live API activity before cutover (low traffic vs replication lag).

## Maintenance sequence (when approved)

Mirror `infra/scripts/staging-clinic-safe-deploy.sh` for prod:

1. `CONFIRM_PROD_CLINIC_DEPLOY=1` + `prod-clinic-safe-deploy.sh <image>`
2. Predeploy record + prod restore drill + replica quiescence
3. `--scaling=0` → instance_count 0 → deploy `--no-traffic`
4. `--max-instances=1` → pin `--to-revisions=NEW=100`
5. `/api/health` → `writerLease.held=true`
6. Failure → **maintenance halt** (stay scaling=0)

**Do not** route traffic to a pre-cutover revision that may hold stale `/data/clinic.db`.

**Downtime:** ~3–8 min API mutations unavailable; CRM UI may load stale.

## Rollback

- Keep `scaling=0` if uncertain
- Verify replica checkpoint + lease on prod bucket
- `--to-revisions=<PREDEPLOY_VERIFIED_REV>=100` only after DB evidence

## Fencing honesty

GCS lease ≠ SQLite write fence. Maintenance drain + maxInstances=1 + request guard. Idle CPU can delay lease renew / Litestream.

## PR scope (single-writer only)

Commit from `main`, **exclude** orchestrator, mobile E2E follow-up, platform revenue UX on current `feature/clinic-single-writer` tip.

See `docs/gcp-migration-audit/13-clinic-prod-release-package.md`.
