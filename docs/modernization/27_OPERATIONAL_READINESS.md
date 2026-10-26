# Operational readiness — clinic day + data safety

**Context:** Staging pilot browser QA is green (PR #21 merged). The next gate is whether **reception + doctor** can run a full working day on Clinic ERP with **safe records** and **recoverable data** — not whether a single Playwright path completes once.

**Scope:** Staging tenant `dentacare` on project `clinic-erp-staging` only. Never use production `crucial-accord-505607-g9` or Denta Care live data for drills.

---

## 1. What “a working day” means (roles)

| Time | Reception | Doctor / clinician |
|------|-----------|-------------------|
| Open | Login, Today calendar = clinic date (IST), refresh queue | Same; filter by doctor if multi-doctor |
| Arrivals | Walk-in (Book → walk-in) or find scheduled appt on Today | — |
| Queue | Confirm → Arrived → **Consult** (or resume draft) | Open consult, draft, finalize, Rx PDF |
| Between patients | Patients search, payments, reschedule / no-show (actions menu) | Patient detail → Visits / history |
| Close | Payments reconciliation, logout | Finalize open drafts; audit own visits |

**Validated automatically (staging):** `21-staging-pilot-journey.spec.ts` — walk-in + scheduled, desktop + mobile, draft reopen, finalize, payment, logout.

**Validated by API scripts (run after deploy):**

```bash
node scripts/staging-validate.mjs
node scripts/link-staging-clinician.mjs
node scripts/staging-clinical-qa.mjs
```

---

## 2. Data safety & recovery

| Control | Staging expectation | Drill / evidence |
|---------|---------------------|------------------|
| SQLite primary | Cloud Run API container + Litestream sidecar pattern in `apps/api/Dockerfile` | Confirm bucket replication in staging project (not prod bucket) |
| Restore | Litestream `restore` (see `apps/api/scripts/restore-live-replica.sh` pattern) | **TODO:** Staging-only restore drill runbook + dated log |
| Audit | Owner Activity tab + CSV export API | Export sample CSV after a test day; retain in secure store |
| Patient identity | PR #17 — no silent phone overwrite; strict WhatsApp identity | Manual: shared-phone registration on staging UI |
| Files / Rx PDF | GCS staging bucket; authenticated GET | `staging-clinical-qa.mjs` PDF 200 |

---

## 3. Known gaps (blockers for “real day” confidence)

| Gap | Impact | Next action |
|-----|--------|-------------|
| **SMTP not configured on staging** | Password reset emails not sent (`emailDelivery.js` warns) | Configure `CLINIC_SMTP_*` on staging API **or** document owner-only password rotation via Secret Manager |
| **No documented staging backup/restore drill** | Recovery untested in ops | Write 1-page runbook; execute once; record RTO/RPO notes |
| **Mobile native app** | Field use may be browser-only | Expo app exists but not part of pilot sign-off |
| **Reminder SMS** | Mock provider only (M7) | Accept for pilot; no live patient SMS without approval |
| **Occasional E2E flake** | Desktop scheduled failed 1/2 in repeat run | Monitor; do not expand Playwright scope unless regression |

---

## 4. Day-one sign-off checklist (human, staging)

Run on **https://kaana-clinic-staging-339065153036.asia-south1.run.app** with staging owner credentials.

- [ ] Login / logout (desktop + phone browser)
- [ ] Walk-in: register → Today → consult draft → refresh → reopen draft → finalize → PDF
- [ ] Scheduled: book future slot → select date on Today → check-in → consult
- [ ] Patient search (list + card), visit history matches finalized encounter
- [ ] Record payment linked to correct patient
- [ ] Activity / audit export downloaded
- [ ] (Optional) Trigger password reset — confirm email or documented fallback

---

## 5. Automation freeze

**Stop iterating on Playwright / ESLint / tsconfig for pilot closure.** Extend E2E only when a **production bug** or **new mandatory workflow** appears.

CI remains: `ci.yml` (API + CRM unit + build). Staging deploy: manual `deploy-staging` after `main` merges that touch runtime.

---

## 6. Suggested next PR themes (product / ops, not test infra)

1. **Staging backup restore runbook** + script targeting staging bucket only.
2. **SMTP or reset fallback** for staging owner/staff onboarding.
3. **Reception “day open” doc** — IST date, queue filters, when to use Book vs Today (link to this checklist).
4. **Pilot tenant hardening** — demo password rotation procedure (already in secrets; document cadence).
