# M8 Batch 1 — Commercial SaaS foundation

**Date:** 2026-10-24  
**Branch:** `feature/m8-saas-batch1`

## Shipped

### C1 — Tenant provisioning (API)

- `provisionClinicTenant()` — transactional create: tenant, catalog seed, default doctor migration, owner user, invite token, audit event.
- Idempotency via `tenant_provision_idempotency` + `Idempotency-Key` header.
- Slug rules: `modules/platform/tenantSlug.js` (reserved names, format).
- **Public:** `POST /api/platform/signup` (rate limited, `CLINIC_PUBLIC_SIGNUP_ENABLED`).
- **Internal:** `POST /api/platform/internal/tenants` (platform admin JWT or `X-Clinic-Provisioning-Key`).
- **Ops:** `PATCH /api/platform/internal/tenants/:idOrSlug` — plan / subscription status (validated transitions).
- `GET /api/platform/signup/slug-available?slug=`

### C2 — Clinic onboarding (CRM)

- `/signup` wizard (`SignupWizard.tsx`): clinic → plan → owner → set-password redirect.
- Session draft + idempotency in `signupDraft.ts` (safe retry, no duplicate clinics on double-submit).
- Slug availability debounced against API.
- Login gate link: “Start a new clinic workspace”.

### C3 — Subscription foundation

- `subscription_status` on tenants (`trialing` default for new signups; legacy → `active`).
- States: `trialing`, `active`, `past_due`, `canceled`, `suspended` with transition guards.
- Entitlements API includes `subscriptionStatus` + `subscription.canWrite`.
- `requireLiveTenant` blocks inactive subscriptions; `requireTenantWrite` blocks mutating calls when read-only (`past_due`, etc.).
- **No Razorpay / live billing** in this batch.

## Tests

| Suite | Count |
|-------|------:|
| API (`npm run test:api`) | 67 |
| CRM (`npm test --workspace=apps/crm`) | 25 |

New: `tenantProvisioning.test.js`, `subscription.test.js`, `tenantSlug.test.js`, `signupSlug.test.ts`.

## Staging

- `cloudbuild.staging.yaml`: `CLINIC_PUBLIC_SIGNUP_ENABLED=1` on API.
- After deploy: open `https://kaana-clinic-staging-…/signup`, complete wizard with synthetic email `*.invalid`.
- Existing `dentacare` tenant unchanged.

## Security notes

- Owner password never returned from API — only set-password URL with hashed invite token.
- Provisioning key optional (`CLINIC_PROVISIONING_API_KEY`); if unset, internal routes require platform admin JWT.
- Signup rate limit: 5 / 15 min / IP (configurable).

## PRs

- M7 smoke: [#9](https://github.com/Srinivas-2906/clinic-erp/pull/9) (chore, merge first if not on `main`).
- M8 Batch 1: PR from `feature/m8-saas-batch1`.

## Next grouped batch (recommended)

**Batch 2 — Clinical core (SQLite-safe, parallel tracks):**

1. **Structured consultations / visit notes** — schema + CRM form + API (foundation for EMR).
2. **Follow-ups** — link visit → reminder jobs (extends M7 queue).
3. **Structured prescriptions** — line items + PDF print (build on upload pipeline).

**Defer until Postgres decision:** multi-branch Enterprise, cross-clinic analytics.

**Batch 3 — Billing (after explicit approval):** Razorpay sandbox webhooks → `subscription_status` transitions only.
