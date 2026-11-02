# Pilot environment, recovery, and verification (2026-11-02)

**Branch context:** `feature/pilot-ops-and-billing-prep` · **Base:** `main` @ `e1eea38`  
**Related:** [42_WEB_PILOT_READINESS_AUDIT.md](./42_WEB_PILOT_READINESS_AUDIT.md), [28_STAGING_LITESTREAM_RESTORE_RUNBOOK.md](./28_STAGING_LITESTREAM_RESTORE_RUNBOOK.md), [29_STAGING_PASSWORD_RESET_EMAIL.md](./29_STAGING_PASSWORD_RESET_EMAIL.md), [apps/api/docs/STORAGE.md](../../apps/api/docs/STORAGE.md)

---

## 1. Executive summary

This batch adds **operator tooling and documentation** for controlled pilot onboarding — not live billing or reminder delivery.

| Deliverable | Status |
|-------------|--------|
| Consolidated env reference | `apps/api/.env.example`, `apps/crm/.env.example`, `validate-pilot-env.mjs` |
| Local restore drill + validation | **Executed successfully** on isolated copy of E2E SQLite (see §4) |
| Staging GCS Litestream drill | **Not re-run in this batch** — use existing `staging-restore-drill.sh` + runbook §4 (requires `gcloud` + bucket IAM) |
| Clinical files vs metadata check | `pilot-clinical-files-validate.mjs` |
| Report/settings HTTP tests | Extended `clinicHttpSecurity.test.js` (already had baseline coverage) |
| Mobile clinical E2E | `39-mobile-clinical-queue-journey.spec.ts` |
| Password reset / SMTP | Review only — no behavior change (see §6) |

---

## 2. Environment tiers

| Variable group | Local dev | Controlled pilot | Commercial launch |
|----------------|-----------|------------------|-------------------|
| `JWT_SECRET`, `DATABASE_PATH` | Required | Required (strong secret) | Required |
| `CLINIC_CRM_URL`, `PUBLIC_URL` | Recommended | **Required** (reset links) | Required |
| `CLINIC_FILES_STORAGE` + bucket | `local` OK | **`gcs` + bucket** | `gcs` |
| `LITESTREAM_BUCKET` / replica | Optional | **Required** on Cloud Run | Required |
| `CLINIC_EMAIL_*` / SMTP / Resend | `console` OK | **Required** for real email | Required |
| `REMINDER_DELIVERY_ENABLED` | `0` | **`0` unless approved** | Approved + provider |
| Payment gateway | N/A | Manual plan via platform admin | **Gateway + webhooks** |

Validate without secrets:

```bash
cd apps/api
node scripts/validate-pilot-env.mjs          # local tier
node scripts/validate-pilot-env.mjs --pilot  # pilot blockers
node scripts/validate-pilot-env.mjs --commercial
```

---

## 3. Recovery procedure and ordering

### 3.1 What restores together

| Layer | Tooling | Consistency |
|-------|---------|-------------|
| **SQLite** | Litestream replica → `litestream restore` or `staging-restore-drill.sh` | Point-in-time bounded by replication lag (RPO not guaranteed zero) |
| **Clinical blobs** | GCS prefix `clinic-files-*` / `CLINIC_FILES_BUCKET` | **Separate** from SQLite; restore DB first, then validate files |
| **In-flight WAL** | Litestream continuous upload | Live service must not be overwritten during drill |

### 3.2 Safe order (pilot/staging)

1. **Stop writes** to the target environment (scale API to 0 or maintenance — ops decision; not automated here).
2. **Restore SQLite** to an **isolated file** (never `/data/clinic.db` on a running container).
3. Run **`pilot-restore-validate.mjs`** — integrity, FK, tenant orphan checks, aggregate counts.
4. Run **`pilot-clinical-files-validate.mjs`** against the same DB path with production `CLINIC_FILES_*` — lists missing blobs.
5. Swap `DATABASE_PATH` only after human sign-off (out of scope for this script bundle).

### 3.3 Scripts

| Script | Purpose |
|--------|---------|
| `apps/api/scripts/staging-restore-drill.sh` | Staging-only GCS rsync + Litestream restore (existing; see runbook 28) |
| `apps/api/scripts/pilot-local-restore-drill.sh` | Copy any source DB → `.pilot-restore-drill/` + validate |
| `apps/api/scripts/pilot-restore-validate.mjs` | Integrity + tenant + counts |
| `apps/api/scripts/pilot-clinical-files-validate.mjs` | Metadata ↔ storage existence |

**Refusals built in:** no overwrite of live `DATABASE_PATH`, no production bucket names in staging drill, no restore artifact overwrite.

### 3.4 RTO / RPO considerations

- **RPO:** Last Litestream segment uploaded before failure; not measured automatically.
- **RTO:** Depends on replica download size + operator runbook steps; local copy drill on E2E DB completed in **&lt;5s** (trivial size).
- **Data loss window:** Appointments/clinical rows created after last replica segment are **lost** on restore.
- **Files:** Prescription PDFs and `clinical-doc-*` uploads missing from GCS remain missing after DB restore until objects are restored separately.

---

## 4. Restore drill results (this batch)

### 4.1 Local isolated drill — **PASSED** (2026-11-02)

Command:

```bash
cd apps/api
PILOT_RESTORE_SOURCE=../data/e2e/clinic.db bash scripts/pilot-local-restore-drill.sh
```

Outcome:

- `integrity_check`: **ok**
- `fk_violations`: **0**
- `orphan_patients`: **0**
- Tenant: **dentacare** (active)
- Aggregate counts recorded (E2E seed; 0 encounters in snapshot)
- Clinical files check: **0 rows** (nothing to verify)

Artifact directory: `.pilot-restore-drill/` (gitignored).

### 4.2 Staging GCS drill — **NOT EXECUTED**

**Blocker:** Requires operator `gcloud` credentials with read access to `gs://clinic-erp-staging-clinic-db/` (see runbook 28). CI agents do not run this drill.

**Prior evidence:** Runbook 28 documents a successful **2026-10-26** staging SQLite restore to an isolated file.

---

## 5. Clinical file storage validation

`pilot-clinical-files-validate.mjs`:

- Reads `clinical_attachments` (respects `deleted_at` when column exists) and `prescriptions.pdf_storage_key`.
- Calls storage backend `openReadStream` (no public URLs).
- Reports `missing[]` for orphaned metadata or missing blobs.

Run after restore with the same `CLINIC_FILES_*` as production target.

---

## 6. Authentication and email (findings)

**Implementation:** `apps/api/src/services/passwordReset.js`, `emailDelivery.js`, tests in `passwordReset.test.js`, `emailDelivery.test.js`.

| Control | Status |
|---------|--------|
| Reset token hashing (SHA-256) | Implemented |
| Expiry (`PASSWORD_RESET_EXPIRY_MINUTES`) | Implemented |
| Single-use (`used_at`) | Implemented |
| Invalidate prior tokens on new request | Implemented |
| Session bump on password change | Implemented |
| Rate limit (`FORGOT_PASSWORD_*`) | Implemented |
| Enumeration-safe response | Generic success when user missing |
| Tenant-bound reset (`tenant_id` on lookup) | Implemented |
| Email failure handling | Logs reason; user still sees generic success |
| Live delivery | Requires `CLINIC_EMAIL_PROVIDER` + SMTP or Resend (see `29_*`) |

**No code changes** in this batch — existing design matches pilot needs once SMTP/Resend is configured.

---

## 7. API security test coverage

`apps/api/src/routes/clinicHttpSecurity.test.js` covers:

- Settings: auth, owner PATCH, receptionist denial, tenant scoping, unknown key stripping
- Report: auth, tenant row isolation, doctor access
- Access requests: owner-only, cross-tenant approve/reject

This batch adds: PATCH settings unauthenticated, GET settings tenant B isolation, report tenant B isolation case.

---

## 8. Mobile-browser E2E

**Spec `39-mobile-clinical-queue-journey.spec.ts`** (`chromium-mobile` only):

1. Receptionist marks patient arrived (when control visible).
2. Doctor opens Today → Consult → finalize.
3. Receptionist sees completed/visited state on Today.

Complements desktop `19-clinical-consultation.spec.ts` and audit gap B5.

---

## 9. Pilot-readiness audit update

See [42_WEB_PILOT_READINESS_AUDIT.md](./42_WEB_PILOT_READINESS_AUDIT.md) — addendum:

- **B4 (file restore drill):** Local validation tooling + procedure documented; staging drill remains operator-run.
- **B7 (env catalog):** Addressed via expanded `.env.example` + `validate-pilot-env.mjs`.
- **B6 (report/settings HTTP tests):** Strengthened; route-level report still lacks dedicated business-logic unit tests (P2).

**Controlled pilot go/no-go:** Unchanged — **GO** for web pilot when staging env + SMTP + GCS configured per §2; commercial launch still **NO-GO** without payment gateway.

---

## 10. Infrastructure reference (existing)

| Topic | Location |
|-------|----------|
| Litestream entrypoint | `apps/api/docker-entrypoint.sh` |
| SQLite schema / migrations | `apps/api/src/db/`, `clinicalDb.js` |
| File storage abstraction | `apps/api/src/services/uploadStorage.js`, `config/clinicFiles.js` |
| Subscription gates | `requireLiveTenant.js`, `requireTenantWrite.js` |
| Payment stub | `apps/api/src/modules/billing/paymentGateway.js` |
