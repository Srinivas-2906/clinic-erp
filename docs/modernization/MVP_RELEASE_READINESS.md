# Clinic ERP — MVP release readiness

**Baseline:** `main` @ `3d57d7a16164a1d0d80c421fd68cb671c3f15f0a`  
**Stabilization:** [PR #66](https://github.com/Srinivas-2906/clinic-erp/pull/66) `feature/mvp-stabilization`  
**Validation date:** 2026-11-09 (IST)  
**Pilot runbook:** [MVP_CONTROLLED_PILOT_RUNBOOK.md](./MVP_CONTROLLED_PILOT_RUNBOOK.md)

MVP = full outpatient day on web (desktop + mobile browser), **manual billing only**, no Razorpay patient checkout.

---

## 1. Verified feature inventory (on `main` + #66 doc/E2E)

| Area | MVP capability | Evidence |
|------|----------------|----------|
| Clinic registration | Platform signup, owner set-password | `tenantProvisioning.js`, E2E `31` |
| Authentication | Email/password login, JWT | E2E `01`, `passwordReset.test.js` |
| Staff invitations | Access request → approve → set password | `accessRequests.js`, E2E `31` |
| Patients / appointments / queue / consult | Core flows | E2E `05`–`07`, `19`, `25`, `30`, `32` |
| Manual billing | Cash, UPI, Card, partial pay, refunds | `PAYMENT_METHODS`, E2E `28`, `43-mvp-clinic-day` (after fix) |
| Follow-ups | Encounter → reception schedule | E2E `36` |
| Owner reporting | Date-ranged report | E2E `08`, `43` |
| Tenant isolation | API + E2E negative | `clinicHttpSecurity.test.js`, `43` |
| Persistence | SQLite + Litestream design | `docker-entrypoint.sh`, drills below |

---

## 2. MVP exclusions

| Excluded | Status |
|----------|--------|
| Razorpay **patient** checkout | **Parked** on [#64](https://github.com/Srinivas-2906/clinic-erp/pull/64) (branch preserved) |
| [#65](https://github.com/Srinivas-2906/clinic-erp/pull/65) | **Closed** 2026-11-09 — duplicate of #64 (same head `da84b06`) |
| Orchestrator package | Not deployed |
| Live reminders / production deploy | Requires explicit approval |

---

## 3. Release gates (evidence-based)

| Gate | Status | Evidence |
|------|--------|----------|
| **CI — API unit tests** | **PASS** | PR #66 run `42675588168` |
| **CI — CRM unit tests** | **PASS** | Same |
| **CI — CRM production build** | **PASS** | Same |
| **CI — Docker build smoke** | **PASS** | Same |
| **CI — Playwright fast (smoke + auth)** | **PASS** | Same |
| **CI — Playwright extended regression** | **FAIL** → fix pending | Run `42675588126` — `43-mvp-clinic-day` (patient add + booking); fix pushed post-run |
| **PR #66 merge** | **BLOCKED** until regression **PASS** | Conditional approval requires **six** green checks |
| Complete clinic-day workflow | **PARTIAL** | Spec `43` failed CI once; aligned with `05`/`30` patterns; re-run after push |
| Authentication & staff invitations | **PASS** (logic) / **BLOCKED** (delivery) | `passwordReset.test.js`, `emailDelivery.test.js` (9 tests); staging `CLINIC_EMAIL_PROVIDER=console` |
| Tenant isolation | **PASS** | Security tests + E2E negative in `43` |
| Financial correctness (manual) | **PASS** | API invoice/payment tests on `main` |
| Database persistence (process restart) | **PASS** | `mvp-db-restart-persistence.test.js` — row survives `closeDatabase` + reopen |
| Database persistence (E2E re-login) | **PASS** (design) | `43` new browser context; pending CI |
| Backup recovery — staging GCS | **PASS** | `staging-restore-drill.sh` → `staging-clinic-restored-20261109T184830Z.db`, integrity **ok**, FK **0** |
| Clinical file recovery (staging snapshot) | **FAIL** (partial) | `pilot-clinical-files-validate.mjs`: 4/4 sampled `prescription_pdf` rows **missing** on disk/GCS (`denta-care` legacy refs) |
| Migration safety on restored DB | **PASS** | `pilot-restore-validate.mjs` on staging restore |
| Email delivery (transactional) | **BLOCKED** | No Resend/SMTP credentials exercised; console provider only on staging template |
| Desktop/mobile usability | **PARTIAL** | Existing mobile specs; `43` runs both projects once green |
| Error monitoring | **BLOCKED** | No wired APM gate in repo |
| **Deployment — staging** | **PASS** (config) | `cloudbuild.staging.yaml` → `max-instances 1`, Litestream bucket, GCS files |
| **Deployment — production** | **FAIL** (MVP safety) | `cloudbuild.yaml` → **`max-instances 3`** + ephemeral `/data` — **multi-writer risk**; not safe for SQLite MVP without infra change |
| **Cloud Run volume persistence** | **BLOCKED** (nuance) | No mounted PD; durability = **Litestream + same instance**, not `maxScale=1` alone |

---

## 4. Persistence & recovery evidence

### Staging Litestream (executed)

```text
gs://clinic-erp-staging-clinic-db/clinic.db/ → .restore-drill/replica/ (660 objects)
litestream restore → staging-clinic-restored-20261109T184830Z.db (638976 bytes)
pragma_integrity_check: ok | fk_violations: 0
Aggregates: 3 tenants, 99 patients, 79 appointments, 51 encounters, 25 payments
```

### Local drills

- Demo seed copy: `pilot-local-restore-drill.sh` — **ok**
- Process restart: `scripts/mvp-db-restart-persistence.test.js` — **ok**

### Not claimed

- Production bucket restore
- Full GCS clinical object restore for all tenants on snapshot
- Deploy rollback executed in Cloud Run (documented only)

---

## 5. Authentication & email evidence

| Flow | Automated | Live delivery |
|------|-----------|----------------|
| Password reset | **PASS** — `passwordReset.test.js` | **BLOCKED** — no SMTP/Resend test send |
| Staff invite tokens (expiry/reuse) | **PASS** — service logic + routes | **BLOCKED** — staging uses `console` |
| Owner signup set-password | E2E `31` | Invite URL in API response; email not verified in drill |
| Rate limits | **PASS** — reset IP limit test | — |

**Action for pilot:** Set `CLINIC_EMAIL_PROVIDER=resend` + verified domain on staging, send one invite + one reset, confirm inbox.

---

## 6. Deployment / SQLite single-writer audit

| Configuration | Finding |
|---------------|---------|
| `apps/api/docker-entrypoint.sh` | Litestream **restore** then **replicate** when `LITESTREAM_BUCKET` set |
| Container filesystem | `/data/clinic.db` on instance disk — **lost on cold start** unless restore/replicate succeeds |
| `cloudbuild.staging.yaml` | **`--max-instances 1`** — correct for SQLite MVP |
| `cloudbuild.yaml` (production) | **`--max-instances 3`** — **FAIL** for single-writer SQLite |
| Rolling revision deploy | Overlapping revisions can duplicate writers even at maxScale=1 — use maintenance discipline |
| Fenced lease / single-writer branch | Documented in GCP audit; **not merged** to MVP |

---

## 7. MVP value propositions (observed)

| Proposition | Assessment | Friction / notes |
|-------------|------------|------------------|
| **Fast reception** | **PASS** (code + E2E `32`, `05`) | Walk-in + patient FAB; mobile uses FAB — no CI timings captured |
| **Doctor-first consultations** | **PASS** | Queue → consult sheet; E2E `19`, `30` |
| **Follow-up tracking** | **PASS** | API + E2E `36`; `43` adds follow-up via API after finalize |
| **Owner operational visibility** | **PASS** | Reports tab, payments summary; no CSV outstanding export |
| **Easy staff onboarding** | **PARTIAL** | E2E `31` full path; **email delivery BLOCKED** for self-serve staff in staging |

*Usability timings were not instrumented in this validation run.*

---

## 8. Clinic-day workflow evidence

| Asset | Status |
|-------|--------|
| E2E `30-full-clinical-billing-journey` | **PASS** historically on `main` |
| E2E `43-mvp-clinic-day @mvp` | **FAIL** on CI run `42675588126` (fixed in branch after run) |
| Manual billing in `43` | UPI partial + cash — matches MVP |

---

## 9. Remaining blockers

1. **PR #66** — extended Playwright regression must pass on final head before squash-merge.
2. **Production deploy config** — `max-instances 3` incompatible with SQLite MVP.
3. **Transactional email** — not validated with real provider.
4. **Clinical PDFs** — staging restore shows missing objects for legacy `denta-care` PDF refs.
5. **Error monitoring** — not configured.
6. **#64** — kept open for post-MVP; do not merge into MVP line.

---

## 10. Controlled staging go / no-go

| Decision | Verdict |
|----------|---------|
| **Merge PR #66 to `main`** | **NO-GO** until **6/6** CI green (regression currently **FAIL**) |
| **Deploy staging for pilot** | **NO-GO** without explicit deploy approval + regression fix merged |
| **Pilot with real patients on staging** | **CONDITIONAL GO** only after: merge #66, regression green, email provider tested, operator signs pilot checklist, **`max-instances 1`** confirmed on service |
| **Production / general availability** | **NO-GO** |

---

## 11. Test commands

```bash
npm run test:api
npm test --workspace=apps/crm
node --test apps/api/scripts/mvp-db-restart-persistence.test.js
bash apps/api/scripts/staging-restore-drill.sh   # operator creds
E2E_GREP='@mvp' npm run test:e2e --workspace=apps/crm -- --project=chromium-desktop
```
