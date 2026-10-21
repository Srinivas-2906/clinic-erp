# SaaS architecture (target state)

**Based on:** current `clinic-erp` codebase + staging layout (`08_M5_STAGING_LIVE.md`). Assumptions marked explicitly.

## Current state (verified)

- **Deployment unit:** API + CRM containers on Cloud Run; SQLite file at `/data/clinic.db` with Litestream → GCS.
- **Tenancy:** Row-level `tenant_id` in SQLite; CRM resolves tenant via `?tenant=` / headers (`tenant.ts`).
- **Auth:** JWT per tenant user (`/api/platform/login`); platform vs clinic route split.
- **Files:** `CLINIC_FILES_STORAGE=gcs` with per-tenant path segments.

## Target multi-tenant SaaS (phased)

| Layer | M6–M8 recommendation |
|-------|----------------------|
| **Identity** | Keep JWT short-lived + refresh; add org/clinic hierarchy tables before multi-branch sales |
| **Tenant provisioning** | Admin API + onboarding wizard (Essential: 1 clinic; Enterprise: org → branches) |
| **Data plane** | **Phase 1:** SQLite per tenant or per deployment (current). **Phase 2:** Postgres with schema-per-tenant or pooled DB (inform from `kaana-clinic` experiments, not auto-merge) |
| **Billing** | External subscription provider (Razorpay Subscriptions / Stripe India) + entitlements table |
| **Usage metering** | Count doctors, staff seats, SMS/WhatsApp credits, storage GB |
| **Isolation** | Separate GCP project per environment (done for staging); production stays `crucial-accord-505607-g9` until cutover window |

## Subscription architecture (hypothesis)

```
Customer → Checkout (Razorpay) → Webhook → entitlements row
         → CRM login allowed if tenant.status=active && plan limits OK
```

- **Entitlements:** `max_doctors`, `max_staff`, `features` JSON (e.g. `multi_branch`, `audit_export`, `whatsapp_reminders`).
- **Grace period:** read-only mode after payment failure (not implemented today).

## Database strategy

| Edition | Suggested DB | Rationale |
|---------|--------------|-----------|
| Essential / Professional | SQLite + Litestream (current) | Lowest ops cost; fits &lt;5 doctors, single site |
| Enterprise | Managed Postgres + migrations | Multi-branch reporting, HA, read replicas |

**Assumption:** Enterprise needs Postgres; validate with load tests before promising SLA.

## Customer onboarding

1. Marketing site → signup (org name, slug, admin email).
2. Email verify → set password (reuse `set-password` flow).
3. Guided setup: clinic profile, first doctor, hours, services catalog.
4. Optional data import (CSV patients) — **missing today**.

## Operational administration

- Internal **Kaana admin** console (future): list tenants, suspend, plan override, usage.
- Today: direct DB / scripts only — **gap**.

## Integrations (priority order)

1. SMS/WhatsApp appointment reminders (stub exists).
2. Razorpay / UPI for patient payments (record-keeping exists; gateway not wired in clinic-erp).
3. ABDM / health ID (competitor differentiator — **not in repo**).
4. Practo / marketplace booking — optional for Enterprise.

## Security and compliance

- **Today:** JWT secret in Secret Manager; tenant-scoped file access; HTTPS on Run.
- **Needed for commercial SaaS:** audit log export, data retention policy, DPA template, backup/restore runbooks (Litestream documented), per-tenant encryption at rest (GCS default), rate limits on public booking (partial).

## Differentiation hooks (engineering-aligned)

- Multi-doctor scheduling already in code (slot engine).
- Public booking API without separate product.
- Lightweight desk UX (fast SPA) vs heavy hospital EMR.
- Optional Kaana platform SSO later — not required for standalone SKU.
