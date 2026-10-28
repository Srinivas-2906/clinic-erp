# Integrated staging release — PR #24 + PR #25

**Projects:** `clinic-erp-staging` only. Never `crucial-accord-505607-g9` or legacy Denta Care production.

---

## Release sequence (requires explicit approval at merge/deploy steps)

| Step | Action | Owner |
|------|--------|--------|
| 1 | Review and merge **PR #24** (`feature/wave1-clinic-operations` → `main`) | Human |
| 2 | Rebase **PR #25** onto `main`; retarget base to `main` | Agent/human |
| 3 | Review and merge **PR #25** | Human |
| 4 | Deploy API then CRM via `cloudbuild.staging.yaml` | Human/CI |
| 5 | Post-deploy verification (below) | Agent/human |
| 6 | Enable email + Cloud Scheduler **only after separate comms approval** | Human |

Do **not** merge #22/#23 if #24 already contains their changes.

---

## Automated checks (local / CI)

```bash
npm run test:api                    # unit + releaseIntegration HTTP suite
node apps/api/scripts/release-preflight.js
node apps/api/scripts/billing-api-smoke.js
npm test --workspace=apps/crm
npm run build --workspace=apps/crm
```

**Staging (live URL):**

```bash
# Password via Secret Manager or STAGING_DEMO_PASSWORD — never commit
node scripts/staging-validate.mjs
node scripts/staging-clinical-qa.mjs
```

Optional orchestration (prints revision + checklist):

```bash
node scripts/staging-release.mjs --check-only
```

---

## Build revision tracking

- Record `git rev-parse HEAD` at deploy time (Cloud Build `SHORT_SHA` / commit trigger).
- API `GET /` and `GET /health` return `{ ok: true, service: 'clinic-api' }` — compare deployed image digest in Cloud Run console to build log.

---

## Required environment variables (staging)

| Variable | Required | Notes |
|----------|----------|--------|
| `JWT_SECRET` | Yes | Secret Manager; not default dev secret |
| `CLINIC_PROVISIONING_API_KEY` | Yes | Internal tenants + `process-reminders` |
| `LITESTREAM_BUCKET` | Yes | Sidecar backup |
| `CLINIC_EMAIL_PROVIDER` | No | `console` until Resend approved |
| `REMINDER_DELIVERY_ENABLED` | No | Keep `0` until comms approved |
| `REMINDER_EXTERNAL_SCHEDULER` | After scheduler | Set `1` + `DISABLE_REMINDER_WORKER=1` when job live |
| `CLINIC_DEMO_OWNER_PASSWORD` | Demo seed | Secret Manager |

Preflight (staging mode, no values printed):

```bash
RELEASE_PREFLIGHT_MODE=staging JWT_SECRET=x CLINIC_PROVISIONING_API_KEY=x LITESTREAM_BUCKET=x \
  node apps/api/scripts/release-preflight.js
```

---

## Migration compatibility

- Finance and reminder tables: **additive** via `initFinanceSchema` / `initReminderInfrastructure` at startup.
- Rollback: redeploy previous Cloud Run revision; do **not** drop columns on rollback.

---

## Post-deploy verification

1. `node scripts/staging-validate.mjs` — owner login, patient, payments, entitlements, export, platform-admin 403 for clinic JWT.
2. Manual billing checklist in [31_WAVE1_STAGING_ROLLOUT.md](./31_WAVE1_STAGING_ROLLOUT.md).
3. Platform admin: CRM `/platform` with seeded operator (see [32_COMMERCIAL_SAAS_V1.md](./32_COMMERCIAL_SAAS_V1.md)).
4. Reminders: `POST .../internal/process-reminders` with provisioning key; confirm mock delivery in logs.

---

## Failure diagnostics

| Symptom | Likely cause |
|---------|----------------|
| 401 on all API calls | `JWT_SECRET` mismatch or session version bump |
| 403 `SUBSCRIPTION_READ_ONLY` | Tenant `subscription_status` past_due — use platform admin or internal patch |
| 403 on `/platform/admin/*` | Clinic user token — expected; use platform admin account |
| Reminders never drain | In-process worker disabled but Scheduler not calling internal endpoint |
| Export 403 for receptionist | Expected — owner only |

---

## Rollback

1. Cloud Run → clinic-api-staging / kaana-clinic-staging → **Revisions** → route 100% traffic to previous revision.
2. DB: rely on Litestream point-in-time if schema mismatch (rare for additive deploys).
3. Re-run `staging-validate.mjs` on rolled-back revision.

---

## Native app

Continues on branch `feature/native-mobile-release-v1` (not required for web staging cut).
