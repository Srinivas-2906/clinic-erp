# Product completion audit (2026-10-30)

Evidence from `main` @ `5445173` plus open **PR #47** (native billing + Android CI infra, not merged).

## Scoring method

Each capability scored **0–3** per surface (desktop web, mobile web, native Android):

| Score | Meaning |
|-------|---------|
| 3 | Implemented, permission-aware, wired to API |
| 2 | Partial (missing edge cases, weaker UX, or untested) |
| 1 | Stub, disconnected, or role confusion |
| 0 | Missing |

**Category %** = sum of scores ÷ (capability count × 3 surfaces × 3 max) × 100.

Automated test flag: **Y** if API module test and/or Playwright spec exists; **N** otherwise.

---

## Category completion (main branch)

| Category | Desktop | Mobile web | Native | Tests (API/E2E) | Notes |
|----------|---------|------------|--------|-----------------|-------|
| Auth & authorization | 3 | 3 | 3 | Y/Y | JWT, roles, capabilities (`permissions.ts`, `/me`) |
| Clinic signup / onboarding | 3 | 3 | 0 | Y/Y | `SignupWizard`, onboarding checklist; no native signup |
| Tenant / branding | 3 | 3 | 2 | Y/Y | Client profile; mobile tenant slug on login |
| Doctor management | 3 | 2 | 1 | Y/Y | Mobile: menu had no Settings/Activity until P0 PR; native read-only in Book |
| Staff / team access | 3 | 2 | 0 | N/Y | Approve access requests; mobile via account menu |
| Patient records | 3 | 3 | 2 | Y/Y | Native lacks files/timeline depth |
| Scheduling / slots | 3 | 3 | 2 | Y/Y | Public booking API; native simplified book |
| Appointments lifecycle | 3 | 3 | 2 | Y/Y | Cancel/reschedule/queue E2E |
| Today queue | 3 | 3 | 2 | Y/Y | Mobile list-first; native `TodayScreen` |
| Consultation | 3 | 3 | 2 | Y/Y | `ConsultationDialog` / native `ConsultScreen` |
| Prescriptions | 3 | 3 | 2 | Y | PDF via API; native consult chart |
| Clinical documents / uploads | 3 | 2 | 0 | Y/Y | CRM thumbs; native no uploads |
| Billing / invoices | 3 | 3 | 2* | Y/Y | *Native billing in **PR #47** only |
| Payments / refunds | 3 | 3 | 2* | Y/Y | Owner refunds; PR #47 native pay |
| Follow-ups | 2 | 2 | 1 | Y/N | API encounters; UI partial |
| Owner dashboard (Home) | 3 | 3 | 0 | Y/Y | `OverviewTab`; no native home |
| Reports | 3 | 3 | 0 | N/Y | `/clinic/report`; no API unit test |
| Clinic settings | 3 | 2→3 | 0 | N/Y | Mobile owner menu gap → **P0 fix** |
| SaaS subscriptions | 3 | 3 | 0 | Y/Y | Entitlements, plan panel, platform provisioning |
| Platform admin | 3 | 2 | N/A | Y/Y | `/platform` desktop-oriented |

### Aggregate (main, before PR #47 merge)

| Bucket | Completion |
|--------|------------|
| **Desktop web** | **~92%** (56/60 weighted points) |
| **Mobile web** | **~85%** (51/60) — owner admin nav gap |
| **Native Android (main)** | **~38%** (23/60) — reception + consult; billing in PR #47 |
| **Backend APIs** | **~88%** — routes present; gaps: settings/report HTTP tests, access-request tests |

---

## PR #47 status

| Item | State |
|------|--------|
| Branch | `feature/native-billing-android-e2e` @ `9d2f38c` |
| Merge | **Not merged** — awaiting your explicit approval |
| Required CI (revised) | API, CRM unit, mobile typecheck/unit, **Android APK build**, CRM build, Docker, Playwright smoke + **desktop/mobile regression** |
| Maestro | **Deferred** — workflow `Android Maestro verify (manual)` |
| Latest CI | Run for `9d2f38c` was **in progress** at handoff; prior `5880a60` Maestro failed on emulator infra (`libpulse`); fixed in `ba04886`, Maestro removed from PR CI in `9d2f38c` |

---

## Confirmed missing / incomplete

1. **Mobile-web owner Settings & Activity** — account menu lacked links (desktop sidebar had them). **P0 batch addresses.**
2. **Native reports, settings, doctors admin, team, audit, overview** — no screens (`apps/mobile/App.tsx` four tabs only).
3. **Shared api-client** — no `fetchClinicReport`, settings, doctor CRUD (CRM uses `lib/api.ts`).
4. **API tests** — `clinicSettings`, `/clinic/report`, access-request HTTP untested.
5. **Sidebar footer** — hardcoded “Admin” (P0: real user name + role).
6. **Doctor role** — Payments nav visible but billing denied (intentional message; UX friction P1).

---

## Development speed (confirmed)

| Improvement | Status |
|-------------|--------|
| No duplicate CI on feature push | In PR #47 (`5880a60`) |
| Gradle + Playwright browser cache | In PR #47 |
| Focused npm/Maestro scripts | `36_DEV_SPEED.md` on PR branch |
| Maestro off PR critical path | `9d2f38c` |
| APK input hash reuse (local) | PR branch scripts |

---

## Competitive direction (essentials vs differentiators)

**Parity essentials:** Same-day queue, book/register, consult note + Rx PDF, invoice + payment, role separation, owner export, multi-doctor slots.

**Differentiators (existing, not AI):** Integrated consult→billing handoff, tenant self-signup, platform admin console, onboarding checklist, public booking API, idempotent payments.

---

## Prioritized backlog (summary)

### P0 — Broken / incomplete core (web)
- ~~Mobile owner Settings + Activity navigation~~ → **PR `feature/p0-mobile-owner-admin-nav`**
- Verify PR #47 web-related changes do not regress Playwright billing specs after merge

### P1 — Daily operations UX
- Doctor Payments nav visibility vs capability
- Mobile-web dense tables / report scrolling
- Patient detail mobile polish (already has viewport E2E)

### P2 — Clinical / follow-ups
- Follow-up booking from encounter closure
- Encounter amend UX on mobile web

### P3 — Owner intelligence
- Reports API tests + richer CRM charts
- Daily ops email (reminders infra exists)

### P4 — Commercial SaaS
- Real payment gateway (stub today)
- Reminder delivery in production

### P5 — Launch
- Manual Maestro + physical Android
- iOS (not started)

Full item templates: see batch tables in PR descriptions.

---

## Architecture / quality (no rewrite)

- Keep `@clinic-erp/contracts` + `@clinic-erp/api-client` as shared types/client boundary.
- Move CRM-only API helpers into api-client incrementally for native parity.
- Server remains authoritative for money, clinical sign-off, scheduling conflicts.

---

## Launch risks

| Risk | Severity |
|------|----------|
| Native Android unverified on device | Medium (deferred) |
| Mobile owner admin discoverability | **Addressed in P0 PR** |
| Settings/report API untested at HTTP layer | Low–medium |
| Staging/prod not deployed in this effort | N/A |

See `37_WEB_FIRST_STRATEGY.md` (on PR #47 branch) for CI policy.
