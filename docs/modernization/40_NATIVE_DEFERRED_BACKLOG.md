# Deferred native development backlog (2026-10-31)

Native Android and iOS work is **paused** until Clinic ERP web SaaS is complete and validated in market. This document records current state and future scope — **do not implement** during the web-first phase.

---

## Existing Android functionality (`apps/mobile`)

| Capability | Status | Backend / notes |
|------------|--------|----------------|
| Login + tenant slug | Implemented | JWT, `@clinic-erp/api-client` |
| Today queue | Implemented | Simplified vs CRM |
| Patients list / search | Implemented | Limited detail vs web |
| Book appointment | Implemented | Multi-doctor via API |
| Consultation | Implemented | `ConsultScreen` — partial Rx depth |
| Payments tab | Implemented | Invoices, record payment, V1 billing UI |
| Invoice create / detail | Implemented | Native screens post billing V1 |

**Tabs today:** Today, Patients, Book, Payments — no Reports, Settings, Team, Doctors, Activity, Owner home.

**Tests:** `apps/mobile` unit tests (slots, billing UI, appointment UI). **Maestro:** `apps/mobile/.maestro/` (manual workflow only).

**Build:** `apps/mobile/scripts/build-android-apk.sh`, Expo prebuild, Gradle release APK.

---

## Missing native functionality (vs web CRM)

| Web capability | Native gap |
|----------------|------------|
| Owner dashboard / overview | No screen |
| Reports + export | No screen; API `/clinic/report` unused in app |
| Clinic settings | No screen |
| Doctors admin / schedules | No admin UI |
| Team / access requests | No screen |
| Activity / audit log | No screen |
| SaaS plan / entitlements UI | No screen |
| Platform admin | N/A on device |
| Patient files / clinical uploads | No upload UX |
| Follow-ups | Minimal / none |
| Full consultation amend / handoff polish | Partial |
| Signup / onboarding wizard | No native flow |

---

## Shared backend dependencies

- All native features consume **`apps/api`** REST routes; CRM uses `apps/crm/src/lib/api.ts`, mobile uses **`@clinic-erp/api-client`** (subset of endpoints).
- **Contracts:** `packages/contracts`, `packages/design-tokens` — keep stable when changing API shapes; web-first changes must not break mobile types unintentionally (run manual native verify before any native resume).
- **Billing:** Server-calculated totals, idempotent payments, invoices — native already aligned for core pay flows; advanced void/refund UX may lag web.

---

## API compatibility considerations

| Area | Note |
|------|------|
| Auth `/me` + capabilities | Native must respect `recordPayments`, role flags when native billing resumes |
| Multi-tenant headers | Tenant slug on login — same as web |
| Report/settings CRUD | Not in api-client today — add when native admin phase starts |
| File uploads | Signed URLs / clinic file API — web-first; native needs RN file picker + upload pipeline |
| Public booking | Web/API; optional deep link later |

---

## Android testing requirements (when resumed)

| Layer | Tooling |
|-------|---------|
| Unit / typecheck | `npm run typecheck --workspace=apps/mobile`, `npm test --workspace=apps/mobile` |
| Compile + APK | **Native Android verify (manual)** workflow |
| Device / emulator UI | **Android Maestro verify (manual)** — full or `login-smoke.yaml` |
| Physical devices | Pre-store release smoke (not automated in repo yet) |

**Do not** re-add APK or Maestro to web PR CI.

---

## Potential iOS requirements (future)

- Expo supports iOS build; no iOS-specific CI or screens exist today.
- App Store: certificates, TestFlight, push (if reminders added), same API base URL strategy as Android.
- **Rough effort:** greenfield parity with Android V1 → **8–16 weeks** after Android stable (team-dependent); full web parity → **6–12+ months**.

---

## Estimated effort (indicative, post web launch)

| Milestone | Scope | Order-of-magnitude |
|-----------|--------|-------------------|
| Android maintenance | Keep APK building on manual workflow, API drift fixes | Ongoing small |
| Android “V2 parity” | Reports, settings, team, doctors read-only admin | **4–8 weeks** |
| Android clinical depth | Uploads, follow-ups, consult parity | **4–6 weeks** |
| Maestro + device hardening | Stable CI emulator + store checklist | **2–4 weeks** |
| iOS V1 (reception + consult + pay) | Port Android tab model | **8–12 weeks** |

Estimates assume web API stable and one experienced mobile engineer; not commitments.

---

## Manual verification commands (deferred use only)

```bash
# Local (developer machine)
npm run typecheck --workspace=apps/mobile
npm test --workspace=apps/mobile

# CI (GitHub Actions → workflow_dispatch)
# - "Native Android verify (manual)"
# - "Android Maestro verify (manual)"
```

See `apps/mobile/.maestro/README.md`, `36_DEV_SPEED.md`.
