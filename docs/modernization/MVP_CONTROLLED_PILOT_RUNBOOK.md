# Clinic ERP — controlled staging pilot runbook

**Scope:** Manual-billing MVP on **authorized staging** only. No production deploy without explicit approval. No real patient PHI until go/no-go is **GO**.

---

## 1. Preconditions (operator)

| # | Check |
|---|--------|
| 1 | `feature/mvp-stabilization` merged to `main`; CI green on merge commit |
| 2 | Staging project id confirmed (`clinic-erp-staging` or operator-defined) |
| 3 | `cloudbuild.staging.yaml` reviewed — **`max-instances 1`** for clinic-api |
| 4 | Staging restore drill completed within 7 days (`staging-restore-drill.sh`) |
| 5 | Email provider configured if pilot needs real invites (`CLINIC_EMAIL_PROVIDER`) |
| 6 | Pilot clinic slug + owner credentials documented in secure store (not repo) |
| 7 | Rollback owner identified; on-call window scheduled |

---

## 2. Deploy (requires explicit approval)

Do **not** run deploy steps unless product owner approves in writing.

```bash
# Example — operator supplies project/region
gcloud builds submit --project "$GCP_STAGING_PROJECT_ID" --config cloudbuild.staging.yaml .
```

Post-deploy smoke:

- `GET /api/health` → 200
- CRM login with demo or pilot tenant
- Confirm `CLINIC_EMAIL_PROVIDER` and `REMINDER_DELIVERY_ENABLED=0`

---

## 3. SQLite / persistence constraints (read before pilot)

| Risk | Mitigation |
|------|------------|
| **Cloud Run ephemeral disk** | `/data/clinic.db` survives only while the **same container instance** is warm; Litestream + GCS replica is the durability layer |
| **`maxScale > 1` (production `cloudbuild.yaml`)** | Multiple instances → **multiple independent SQLite writers** — **FAIL** for correctness |
| **Rolling deploy** | Old and new revision may both write briefly — treat as maintenance window; prefer **`max-instances 1`** on staging |
| **Litestream** | Entrypoint `restore` then `replicate` on boot (`docker-entrypoint.sh`) |

Staging template already sets `--max-instances 1`. **Production `cloudbuild.yaml` still sets `max-instances 3`** — **not MVP-safe without infra change**.

---

## 4. Pilot day script (manual)

1. Owner: sign in, complete settings (timezone, address, phone).
2. Owner: link doctor login; approve reception access request (or pre-provision).
3. Reception: register patient, book walk-in, confirm on Today.
4. Doctor: consult, prescribe, finalize encounter.
5. Reception: create invoice, record **Cash/UPI** (manual refs), share receipt.
6. Reception: schedule follow-up from follow-ups panel.
7. Owner: open Reports for today; verify collections vs Payments tab.
8. **Do not** enable patient Razorpay or live reminders.

---

## 5. Monitoring checklist (staging)

| Signal | Where | Action if bad |
|--------|-------|----------------|
| API health | Cloud Run metrics / `GET /health` | Rollback revision |
| 5xx rate | Cloud Logging | Inspect stack; rollback |
| Litestream errors | Container logs `litestream` | Pause traffic; restore drill |
| Disk / OOM | Cloud Run | Scale memory or reduce concurrency |
| Auth failures spike | Audit log + login routes | Check JWT secret rotation |
| Email bounces | Resend/SMTP dashboard | Switch to console + manual invites |

---

## 6. Incident response

| Severity | Example | Response |
|----------|---------|----------|
| S1 | Data loss suspected, FK errors | Stop traffic (`--max-instances 0` or remove revision), restore isolated DB from Litestream, **do not** overwrite live `/data` until root cause |
| S2 | Auth broken for all users | Rollback CRM+API to last green revision; verify `JWT_SECRET` |
| S3 | Billing miscalculation | Disable new payments; export audit log; fix forward on branch |
| S4 | UI-only regression | Rollback CRM static deploy only |

Escalation: product owner → engineering → GCP operator.

---

## 7. Rollback instructions

1. Identify last known-good Cloud Run revision:  
   `gcloud run revisions list --service clinic-api-staging --region REGION`
2. Route 100% traffic to previous revision (no code change).
3. Repeat for `clinic-crm-staging` if frontend regression.
4. If SQLite corruption suspected: **do not** delete GCS replica; run `staging-restore-drill.sh` to validate recoverability.
5. Post-incident: document timeline in pilot log; update `MVP_RELEASE_READINESS.md` gates.

---

## 8. Recovery references

- Local copy drill: `apps/api/scripts/pilot-local-restore-drill.sh`
- Staging GCS drill: `apps/api/scripts/staging-restore-drill.sh`
- Validate restore: `PILOT_RESTORE_DB=… node scripts/pilot-restore-validate.mjs`
- Clinical files: `pilot-clinical-files-validate.mjs` (expects GCS or local storage)
