# Staging password-reset email readiness

**Scope:** `clinic-erp-staging` only. **Do not** configure production `crucial-accord-505607-g9` or email real Denta Care patients from this runbook.

**Goal:** Staff can receive a **real** password-reset email on staging using the existing token model (`passwordReset.js`), with secrets in Secret Manager and a designated **test inbox** only.

---

## Phase 1 — Existing implementation (audit)

| Area | Status | Location |
|------|--------|----------|
| Forgot-password API | **Done** | `POST /api/platform/tenant/:slug/forgot-password` |
| Token generation | **Done** | 32-byte hex, SHA-256 stored |
| Expiry | **Done** | `PASSWORD_RESET_EXPIRY_MINUTES` (default 60) |
| Single-use | **Done** | `used_at` set on complete; prior pending tokens invalidated on new request |
| Session invalidation | **Done** | `session_version` incremented on reset |
| Generic response | **Done** | Unknown email → same message as success; no token in API response (prod) |
| Rate limit | **Done** | IP bucket, default 5 / 15 min (`FORGOT_PASSWORD_RATE_*`) |
| Email abstraction | **Done** | `emailDelivery.js`: `console`, `smtp`, **`resend`** |
| Reset URL | **Done** | `CLINIC_CRM_URL/?reset-password=<token>` |
| Frontend | **Done** | `LoginGate` forgot flow; `SetPasswordScreen` mode `reset` |
| Staging today | **Console only** | `CLINIC_EMAIL_PROVIDER=console` in `cloudbuild.staging.yaml` — no real delivery |
| Dev token expose | **Gated** | `CLINIC_PASSWORD_RESET_EXPOSE_TOKEN` + `CLINIC_ALLOW_RESET_TOKEN_EXPOSE` + non-production only |

**Gaps addressed in this PR (code, not deployed):**

- `nodemailer` added for SMTP path (was dynamically imported but not declared).
- **Resend** HTTP provider (no new auth vendor) for staging/production parity.
- Ops logging when delivery fails (reason only — **no token, no reset URL in logs**).
- Tests for provider failure, expiry, reuse, rate limit, reset URL shape.

**Not changed:** JWT model, token hashing, invite flow, or CRM routes.

---

## Phase 2 — Provider recommendation

| Provider | SMTP | HTTP API | Free / low volume | Domain verify | Logs | Ops complexity |
|----------|------|----------|-------------------|---------------|------|----------------|
| **Resend** (recommended) | Yes (`smtp.resend.com`) | Yes | ~100 emails/day free tier | Required for custom from; `onboarding@resend.dev` for API tests only | Dashboard + webhooks | Low |
| Brevo (Sendinblue) | Yes | Yes | ~300/day free (subject to change) | SPF/DKIM | Dashboard | Medium UI |
| Amazon SES | Yes | Yes | Very cheap at scale | DNS + sandbox exit | CloudWatch | Higher IAM/DNS |
| Postmark | Yes | Yes | Paid trial / low free | DNS | Excellent | Low, paid sooner |
| Mailgun | Yes | Yes | Trial then paid | DNS | Dashboard | Medium |

**Recommendation:** **Resend** for staging and eventual production.

- Fits existing abstraction via **`CLINIC_EMAIL_PROVIDER=resend`** (preferred on Cloud Run) or **`smtp`** with Resend SMTP credentials.
- Simple Secret Manager story (`CLINIC_RESEND_API_KEY`).
- No purchase required to evaluate; use a **test API key** and **designated inbox** only.

**Cost (indicative):** $0 within free tier for pilot staff count; paid tiers only if volume grows. Confirm current pricing on [resend.com](https://resend.com) before production commit.

---

## Phase 3 — Configuration reference

| Variable | Required | Notes |
|----------|----------|--------|
| `CLINIC_EMAIL_PROVIDER` | Yes | `resend` (staging pilot) or `smtp` |
| `CLINIC_EMAIL_FROM` | Yes | Verified sender, e.g. `Clinic Desk <noreply@staging.kaana.in>` |
| `CLINIC_RESEND_API_KEY` | If `resend` | Secret Manager — **never** in git |
| `CLINIC_SMTP_*` | If `smtp` | Alternative to Resend HTTP |
| `CLINIC_CRM_URL` | Yes | Set by staging deploy to CRM Cloud Run URL (reset links) |
| `PASSWORD_RESET_EXPIRY_MINUTES` | Optional | Default 60 |
| `FORGOT_PASSWORD_RATE_MAX` | Optional | Default 5 |

**Security preserved:**

- API still returns generic copy for unknown emails.
- Provider failures are logged server-side; user message unchanged (no account enumeration).
- Console provider omits reset link from log payload (`bodyBytes` only).

---

## Phase 4 — Testing (local / CI)

```bash
cd apps/api && npm test -- src/services/passwordReset.test.js src/services/emailDelivery.test.js
```

Covers: unknown email, token reuse, session invalidation, expiry, rate limit, reset URL, Resend mock success, missing credentials, SMTP misconfig.

**Do not** run forgot-password against staging with real clinic addresses until rollout below is approved.

---

## Phase 5 — Staging rollout plan (requires approval)

### 5.1 DNS (custom domain sender — recommended before pilot)

For domain e.g. `staging.kaana.in` or `kaana.in` (subdomain used for staging mail):

| Type | Host | Value | Purpose |
|------|------|-------|---------|
| TXT | `@` or subdomain | Resend domain verification record | Prove domain ownership |
| TXT | `_dmarc` | `v=DMARC1; p=none; …` | Deliverability (start with p=none) |
| CNAME | `resend._domainkey` (per Resend UI) | Resend DKIM | Signing |

Exact records come from the Resend **Domains** UI after you add the domain. **No DNS changes are applied by this repo.**

**Test-only shortcut:** Resend allows sending from `onboarding@resend.dev` to **your verified email** only — suitable for one inbox smoke test, not clinic branding.

### 5.2 Secret Manager (`clinic-erp-staging`)

```bash
export PROJECT=clinic-erp-staging
# Create once (value from Resend dashboard — do not commit):
gcloud secrets create clinic-staging-resend-api-key \
  --project="$PROJECT" \
  --replication-policy=automatic

echo -n 're_…' | gcloud secrets versions add clinic-staging-resend-api-key \
  --project="$PROJECT" \
  --data-file=-

# Grant runtime SA:
gcloud secrets add-iam-policy-binding clinic-staging-resend-api-key \
  --project="$PROJECT" \
  --member="serviceAccount:clinic-staging-runner@clinic-erp-staging.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### 5.3 Deploy API env (after merge + image build — manual)

Update **`clinic-api-staging`** only:

```bash
export REGION=asia-south1
gcloud run services update clinic-api-staging \
  --project=clinic-erp-staging \
  --region="$REGION" \
  --update-env-vars "CLINIC_EMAIL_PROVIDER=resend,CLINIC_EMAIL_FROM=Clinic Desk <noreply@YOUR_VERIFIED_DOMAIN>" \
  --update-secrets "CLINIC_RESEND_API_KEY=clinic-staging-resend-api-key:latest"
```

Remove or override `CLINIC_EMAIL_PROVIDER=console` from the deployed revision (currently set in `cloudbuild.staging.yaml` — change that file in a **follow-up deploy PR** after secrets exist).

Confirm `CLINIC_CRM_URL` still points at `kaana-clinic-staging` URL (Cloud Build sets this post-deploy).

### 5.4 Verification (designated test inbox only)

1. Use a **personal test address** you control (not a real patient).
2. Open staging CRM → Forgot password → enter **staging owner or test staff email**.
3. Confirm email arrives; link host matches `CLINIC_CRM_URL`.
4. Complete reset → sign in with new password.
5. Confirm old JWT/session no longer valid (re-login required elsewhere).
6. Cloud Logging: search `[password-reset]` — expect no token in logs; on failure, `reason` only.

### 5.5 Rollback

```bash
gcloud run services update clinic-api-staging \
  --project=clinic-erp-staging \
  --region=asia-south1 \
  --update-env-vars "CLINIC_EMAIL_PROVIDER=console" \
  --remove-secrets "CLINIC_RESEND_API_KEY"
```

Password reset tokens still work in DB; users fall back to **Secret Manager demo password rotation** documented in operational readiness until email is re-enabled.

---

## Phase 6 — Remaining security concerns

| Risk | Mitigation |
|------|------------|
| Account enumeration via timing | Same generic message; consider monitoring only |
| Email link leaked | Short TTL, single-use; HTTPS CRM URL |
| Resend key compromise | Secret Manager + rotate key in Resend |
| Rate limit by IP only | Accept for pilot; add email-based limit later if abused |
| Delivery failure invisible to user | By design (no enumeration); monitor `[password-reset] email not delivered` |
| `onboarding@resend.dev` in prod | Use verified clinic domain before real pilot |

---

## Related

- [27_OPERATIONAL_READINESS.md](./27_OPERATIONAL_READINESS.md)
- `apps/api/scripts/staging-restore-drill.sh` (data recovery — separate from email)
