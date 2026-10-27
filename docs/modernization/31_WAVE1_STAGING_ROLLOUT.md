# Wave 1 — staging deployment and rollback

**Branch / PR:** `feature/wave1-clinic-operations` · [PR #24](https://github.com/Srinivas-2906/clinic-erp/pull/24)  
**Supersedes:** When merged, PR #24 includes cherry-picked ops docs (#22) and email integration (#23). Close #22/#23 after #24 merges to avoid duplicate deploy docs — do not merge all three to `main`.

**Scope:** Staging project only (`clinic-erp-staging`). Never deploy to `crucial-accord-505607-g9`.

---

## 1. Pre-deploy checklist

| Item | Action |
|------|--------|
| CI | API tests green (`npm test --workspace=apps/api`) |
| Image | `cloudbuild.staging.yaml` build + deploy API then CRM |
| Secrets | `JWT_SECRET`, `CLINIC_DEMO_OWNER_PASSWORD` (Secret Manager) |
| Email (optional) | Set `CLINIC_EMAIL_PROVIDER=resend`, `CLINIC_RESEND_API_KEY`, `CLINIC_EMAIL_FROM`, `CLINIC_CRM_URL` — see [29_STAGING_PASSWORD_RESET_EMAIL.md](./29_STAGING_PASSWORD_RESET_EMAIL.md) |
| DB | Litestream sidecar + `LITESTREAM_BUCKET` unchanged; finance schema is **additive** at API startup (`initFinanceSchema`) |

---

## 2. Deploy (no merge from this doc)

```bash
# From repo root, staging GCP project configured:
gcloud builds submit --project "$GCP_STAGING_PROJECT_ID" --config cloudbuild.staging.yaml .
```

Default staging env (from `cloudbuild.staging.yaml`):

- `CLINIC_EMAIL_PROVIDER=console` (no real email until secrets updated)
- `SKIP_DEMO_SEED=0`, demo owner email `staging-owner@clinic-erp.invalid`
- Files: `CLINIC_FILES_STORAGE=gcs`, bucket from `_DB_BUCKET`

After deploy, set `PUBLIC_URL` on API service (build step updates this).

---

## 3. Post-deploy verification

```bash
# From repo (adjust API URL / tenant):
node scripts/staging-validate.mjs
node scripts/link-staging-clinician.mjs
node scripts/staging-clinical-qa.mjs
```

**Manual billing smoke (owner + receptionist accounts):**

1. Create invoice with two line items → total matches server.
2. Partial payment → status `partial`, outstanding updated.
3. Second payment → `paid`, balance 0; overpay attempt fails.
4. Print invoice → totals match API `GET /clinic/invoices/:id`.
5. Owner ledger refund → invoice balance increases; label clarifies not gateway.
6. Doctor login → no Payments/Reports nav; API `POST /clinic/payments` returns 403.

**Email (NOT VERIFIED until configured):**

- Forgot password + staff invite with `console` provider → logs only.
- After Resend + DNS → send test to disposable inbox.

---

## 4. Synthetic accounts

| Role | Setup |
|------|--------|
| Owner | Demo seed / known staging owner + password secret |
| Receptionist | Team → approve access request as receptionist |
| Doctor | Team → approve as doctor; optional link to doctor profile |

Link clinician for consult finalize: `node scripts/link-staging-clinician.mjs`.

---

## 5. Schema compatibility and rollback

**Forward deploy (old API → new API):**

- New tables: `patient_invoices`, `invoice_line_items`.
- `ALTER TABLE patient_payments` adds nullable columns (`invoice_id`, `kind`, `related_payment_id`, `idempotency_key`).
- Old API revision **ignores** new columns; legacy payments keep working.

**Rollback (new API → old API):**

- **Do not** drop new tables or columns on rollback — old code does not read them.
- Risk: invoices/payments recorded under Wave 1 while on new API are **invisible** to old CRM/API but remain in SQLite.
- Risk: if old API allowed payment edits that new API forbids on invoice-linked rows, data is still consistent in DB but old UI might confuse users.

**Recommended rollback:** redeploy **previous** Cloud Run revision (images tagged by `$BUILD_ID`), not DB restore, unless corruption — then use [28_STAGING_LITESTREAM_RESTORE_RUNBOOK.md](./28_STAGING_LITESTREAM_RESTORE_RUNBOOK.md) (accepts loss of post-restore writes).

---

## 6. Environment variables reference

| Variable | Required | Notes |
|----------|----------|--------|
| `JWT_SECRET` | Yes (prod/staging) | Secret Manager |
| `DATABASE_PATH` | Yes | `/data/clinic.db` |
| `LITESTREAM_BUCKET` | Staging | Replication |
| `CLINIC_CRM_URL` | Email links | CRM public URL |
| `CLINIC_EMAIL_PROVIDER` | No | `console` \| `smtp` \| `resend` |
| `CLINIC_RESEND_API_KEY` | If resend | Secret |
| `CLINIC_EMAIL_FROM` | If resend/smtp | Verified sender |
| `INVITE_EXPIRY_DAYS` | No | Default 7 |

---

## 7. Attachment recovery

Not executed in Wave 1. See operational readiness §2 — GCS object restore drill still **NOT VERIFIED**. No lifecycle policy changes in PR #24.
