# Clinic ERP — MVP release readiness

**Baseline (verified):** `main` @ `3d57d7a16164a1d0d80c421fd68cb671c3f15f0a`  
**Stabilization branch:** `feature/mvp-stabilization`  
**Last updated:** 2026-11-09 (IST)

This document defines what the **MVP includes**, what is **explicitly out of scope**, release **gates**, and a **go/no-go** recommendation. MVP means a full outpatient clinic day on web (desktop + mobile browser) with **manual billing only** — no live Razorpay patient checkout.

---

## 1. Verified feature inventory (on `main`)

| Area | MVP capability | Evidence |
|------|----------------|----------|
| Clinic registration | Platform signup, owner set-password, trial/pro plan | `tenantProvisioning.js`, E2E `31-clinic-onboarding-journey` |
| Authentication | Email/password login, JWT, tenant slug routing | `authMiddleware`, E2E `01-auth` |
| Staff invitations | Access request → owner approve → invite token → set password | `accessRequests.js`, E2E onboarding spec |
| Password reset | Tokenized reset flow | `passwordReset.js`, `passwordReset.test.js` |
| Roles | Owner, doctor, receptionist capabilities | `rolePolicy.js`, E2E `23-role-permissions` |
| Patients | CRUD, search, timeline | Patient routes, E2E `05-patients` |
| Appointments | Book, reschedule, cancel, slots, multi-doctor | E2E `06-book`, `24`, `15` |
| Queue / Today | Status transitions, consult handoff | E2E `25`, `32-busy-clinic-day` |
| Consultation | Draft, finalize, prescription lines | E2E `19`, `30-full-clinical-billing-journey` |
| Documents | Upload/list tenant-scoped clinical files | E2E `37-patient-documents` |
| Follow-ups | Create from encounter, reception scheduling | E2E `36-follow-up-journey` |
| Manual billing | Cash, UPI, Card, Online, Other; invoices; partial pay; refunds | `RecordPaymentDialog`, `PAYMENT_METHODS`, E2E `28`, `07` |
| Outstanding | Invoice balance, summary stats | `PaymentsView`, payment summary API |
| Receipts | Share payment (e.g. WhatsApp-oriented UI) | `SharePaymentDialog` |
| Owner reporting | Date-ranged report, ops summary (non-financial Razorpay block on main) | `ReportsView`, `GET /clinic/report` |
| Tenant isolation | API security tests | `clinicHttpSecurity.test.js` |
| Persistence | SQLite single-file DB, migrations on boot | `financeDb.js`, `initDatabase` |
| Backups (design) | Litestream replicate when `LITESTREAM_BUCKET` set | `docker-entrypoint.sh` |

---

## 2. MVP exclusions (do not block pilot on main)

| Excluded | Notes |
|----------|--------|
| Razorpay **patient** checkout / payment intents | Open in PR #64 / #65 — **defer** |
| Provider-verified online capture | Not required for MVP |
| SaaS subscription Razorpay live soak | Sandbox/test only; separate from clinic ledger |
| Autonomous orchestrator (`packages/clinic-orchestrator`) | Engineering tooling; **not deployed** with clinic runtime |
| Native Android / iOS | Deferred per product goals |
| Live appointment reminders | `DISABLE_REMINDER_WORKER` / pilot gating |
| Production deploy | Requires explicit authorization |
| Owner email verification at signup | Not enforced today (console/smtp/resend optional) |
| Per-clinic payment merchant accounts | Not implemented |

---

## 3. PR #64 / #65 disposition (recommendation)

| PR | Recommendation |
|----|----------------|
| [#64](https://github.com/Srinivas-2906/clinic-erp/pull/64) patient payments + orchestrator CI | **Close or park** for post-MVP. Adds Razorpay intents, provider refunds, orchestrator packages, experimental CRM “test online pay”. Not needed for manual-billing MVP. |
| [#65](https://github.com/Srinivas-2906/clinic-erp/pull/65) | **Close as duplicate** of #64 (same 29-file diff at last compare). |

**Accidental overlap:** #64 branch was briefly aligned with #65 commits; do not merge either into MVP stabilization without product approval.

**MVP-relevant fixes from those PRs:** None required on `main` (CRM build failure was due to financial UI not present on main).

---

## 4. Release gates (PASS / FAIL / BLOCKED)

| Gate | Status | Notes |
|------|--------|-------|
| Complete clinic-day workflow | **PASS** (with new E2E) | Existing `30`, `31`, `32` + new `43-mvp-clinic-day` |
| Authentication & staff invitations | **PARTIAL** | Flows exist; owner signup email verification **not** required |
| Tenant isolation | **PASS** | Automated HTTP security tests + E2E negative header |
| Financial correctness (manual) | **PASS** | Idempotency + invoice tests on main |
| Database persistence (restart) | **PASS** (local) | E2E uses persistent `DATABASE_PATH`; re-login test in spec 43 |
| Backup recovery (Litestream/GCS) | **BLOCKED** | No cloud restore executed this session; see §6 |
| Clinical file recovery (GCS) | **PARTIAL** | Local/memory E2E; production GCS not drilled here |
| Email delivery | **BLOCKED** for pilot mail | Requires `CLINIC_EMAIL_PROVIDER` + Resend/SMTP in staging |
| Migration safety | **PASS** (local drill) | `pilot-local-restore-drill` on demo DB — integrity OK |
| Desktop/mobile usability | **PARTIAL** | Mobile specs `33`–`39`; MVP spec runs both Playwright projects |
| Error monitoring | **BLOCKED** | No Sentry/Datadog gate defined in repo for MVP |
| Deployment configuration | **PARTIAL** | Docker/Litestream documented; single-writer + maxScale risk documented in GCP audit |

**Do not declare MVP “ready for production patients”** until staging pilot sign-off and backup drill on **staging** replica (not production).

---

## 5. Data preservation & recovery evidence

### Executed (non-production)

```text
PILOT_RESTORE_SOURCE=/tmp/mvp-drill.db (demo seed via initDatabase)
→ pilot-local-restore-drill.sh
→ integrity_check: ok, fk_violations: 0, orphan_patients: 0
```

Artifact: `.pilot-restore-drill-mvp/local-copy-*.db` (gitignored drill dir).

### Not executed (honest limitations)

- Litestream **GCS** restore from staging/production bucket
- Multi-instance Cloud Run failover (SQLite split-brain risk if `maxScale > 1`)
- Point-in-time recovery across app + GCS clinical objects in one runbook

Use `apps/api/scripts/staging-restore-drill.sh` with operator credentials when staging access is approved.

---

## 6. Authentication (MVP target vs current)

| Requirement | Current state |
|-------------|---------------|
| Owner email + password registration | Signup API + set-password link |
| Email verification | **Optional** — provider-dependent; often console in dev |
| Staff invite | Access request + approve + one-time token |
| Invite expiry / reuse | Tested in `accessRequests` unit paths |
| Password reset | Implemented; rate limits in routes |
| Session security | JWT; logout clears client session |
| Tenant + role enforcement | `requireLiveTenant`, `rolePolicy` |

**Improvement path (post-MVP stabilization, no new IdP):** Enforce verified sender + deliverability test on staging; document owner checklist for Resend domain.

---

## 7. Manual clinic payments (MVP)

- Methods: **Cash, UPI, Card, Online, Other** (`PAYMENT_METHODS`).
- **Manual** payments are clinic-recorded; no platform settlement of patient funds.
- Partial payments and invoice balance recompute: API + E2E `28`.
- Owner refunds: ledger `POST /clinic/payments/:id/refund` (not provider API on main).
- Duplicate credit protection: idempotency keys on payments (tests on main).

**Razorpay on main:** Used for **SaaS subscription** configuration in some environments — **not** required for MVP patient ledger.

---

## 8. Staging deployment prerequisites

| Prerequisite | Purpose |
|--------------|---------|
| `DATABASE_PATH` on persistent volume (`/data/clinic.db`) | SQLite durability |
| `LITESTREAM_BUCKET` + GCP SA | Continuous backup (optional but recommended) |
| **`maxScale=1`** for clinic-api until multi-writer solved | Data safety |
| `CLINIC_JWT_SECRET`, `CLINIC_PLATFORM_ADMIN_*` | Auth |
| `CLINIC_EMAIL_PROVIDER`, `CLINIC_RESEND_API_KEY` or SMTP | Invites & reset in pilot |
| `CLINIC_FILES_STORAGE=gcs`, bucket + prefix | Clinical documents in pilot |
| CRM `VITE_CLINIC_API`, `VITE_TENANT_SLUG` build args | Frontend routing |
| `DISABLE_REMINDER_WORKER=1` until live reminders approved | Safety |
| No `CLINIC_PATIENT_PAYMENTS` / mock Razorpay patient keys | MVP manual billing only |

Runbooks: `docs/gcp-migration-audit/11-migration-execution-order.md`, `apps/api/scripts/staging-restore-drill.sh`.

---

## 9. Security checklist (pilot)

- [ ] JWT secret rotated from dev default
- [ ] Platform admin credentials not shared with clinic staff
- [ ] Tenant slug per clinic; no cross-tenant API without header + membership
- [ ] HTTPS only on staging/production URLs
- [ ] Backup drill completed on staging replica
- [ ] Audit log export rate limits understood
- [ ] File upload size/type limits reviewed

---

## 10. Pilot acceptance checklist

- [ ] Owner completes onboarding checklist in CRM
- [ ] At least one doctor linked to user account
- [ ] Reception records day of walk-ins + scheduled patients
- [ ] Doctor finalizes consult with prescription PDF acceptable
- [ ] Reception records **manual** payment and shares receipt
- [ ] Owner opens reports for same day
- [ ] Mobile browser: login, today queue, record payment
- [ ] Known issues documented for clinic staff

---

## 11. Known blockers

1. **Email in production-like environments** — without Resend/SMTP, invites/reset are console-only.
2. **Cloud backup drill** — not run in this MVP prep session.
3. **Multi-replica Cloud Run** — architectural risk for SQLite.
4. Open PRs #64/#65 — noise; keep out of MVP branch.

---

## 12. Go / no-go recommendation

| Decision | Recommendation |
|----------|----------------|
| **MVP pilot on controlled staging** (manual billing, single instance, backup drill pending) | **CONDITIONAL GO** — after CI green on `feature/mvp-stabilization`, staging deploy approval, and staging Litestream drill |
| **General availability / production patient load** | **NO-GO** until email delivery, backup recovery, and pilot checklist signed off |

---

## 13. Related automated tests

| Suite | Command |
|-------|---------|
| API unit | `npm run test:api` |
| CRM unit | `npm test --workspace=apps/crm` |
| MVP clinic day E2E | `E2E_GREP=@mvp npm run test:e2e --workspace=apps/crm -- --project=chromium-desktop` |
| Full regression | CI `playwright-regression.yml` (not blocking MVP definition if smoke passes) |
