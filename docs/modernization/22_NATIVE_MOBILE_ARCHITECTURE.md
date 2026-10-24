# Native mobile architecture (Expo) — design only

**No scaffold in this phase.**

---

## Repository structure (recommended)

```
clinic-erp/
  apps/mobile/          # Expo SDK 52+
  packages/api-client/  # OpenAPI-generated types + fetch wrapper
  packages/validation/  # Shared Zod schemas (optional)
```

Alternative: separate repo with published `@clinic-erp/api-client` — defer until API v1 frozen.

---

## Shared contracts

- **OpenAPI 3.1** from Express routes (hand-maintained v1 acceptable initially).
- Mobile **must not** duplicate billing rules, slot logic, or subscription checks — server is source of truth.
- Tenant: deep link `https://app.example/?tenant=slug` or in-app tenant picker after login.

---

## Authentication

| Concern | Approach |
|---------|----------|
| Token storage | `expo-secure-store` (refresh + access) |
| Login | Same `POST /api/platform/login` |
| Set password | Deep link from email → `expo-linking` |
| Revocation | Server refresh token version; mobile handles 401 → login |

---

## Navigation (role-based)

| Role | Primary tabs |
|------|----------------|
| Doctor | Today, Patients, Quick note (future encounter) |
| Reception | Book, Patients, Payments |
| Owner | Metrics (read-only), Team alerts |

Staff without clinical permission never see finalize Rx actions.

---

## Features by phase

| Phase | Scope |
|-------|--------|
| MVP | Auth, today list, patient search, book, push for appointment |
| 2 | Read-only encounter summary, attachment camera upload |
| 3 | Offline draft note queue + idempotent sync |

---

## Push notifications

- FCM (Android) + APNs (iOS) via Expo Notifications.
- API: `device_tokens` table; Cloud Task dispatches provider payload.
- Staging: test project keys in Secret Manager per GCP account.

---

## Release pipeline

- **EAS Build** profiles: `development`, `preview`, `production`.
- Android: Play Internal testing track.
- iOS: TestFlight → App Store.
- Store privacy: data collection disclosure aligned with [`23_SECURITY_RELIABILITY_AND_COSTS.md`](23_SECURITY_RELIABILITY_AND_COSTS.md).

---

## Web-first vs mobile-first

| Workflow | Primary |
|----------|---------|
| EMR authoring, reports, audit export | Web |
| Queue check-in, quick book, on-call schedule | Mobile |
| Signup / billing / plan upgrade | Web |
| Patient comms (SMS) | Server-driven (both benefit) |

---

## Billing / stores

B2B clinic subscription via **Razorpay on web** (existing plan). App Store IAP for consumer-only SKUs — **INVESTIGATE** Apple reader-app rules before linking external payment in iOS.
