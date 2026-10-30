# Web-first product strategy

**Principle:** One shared backend. Desktop web and mobile web = same CRM (`apps/crm`). Native Android = functional parity client (`apps/mobile`). Android emulator Maestro is **pre-launch** verification, not a PR merge gate.

## CI merge requirements (PR → `main`)

| Check | Workflow | Required for merge |
|-------|----------|-------------------|
| API unit tests | `CI` | Yes |
| CRM unit tests | `CI` | Yes |
| Mobile typecheck + unit | `CI` | Yes |
| Android APK build | `CI` | Yes (compile native bundle; no emulator) |
| CRM production build | `CI` | Yes |
| Docker build (no push) | `CI` | Yes |
| Playwright smoke | `CI` | Yes |
| Playwright regression (desktop + mobile browser) | `CI` | Yes |
| **Native Android Maestro** | **`Android Maestro verify (manual)`** | **No — run before launch** |

**Manual Maestro:** Actions → **Android Maestro verify (manual)** → Run workflow. Optional input `maestro_flows` (e.g. `login-smoke.yaml`).

**Branch protection:** If `Native Android Maestro` is still listed as a required check on `main`, remove it in GitHub **Settings → Branches** so it does not block merges after this workflow split.

## Testing policy

| Phase | Scope |
|-------|--------|
| **Development** | Focused tests for touched code (`docs/modernization/36_DEV_SPEED.md`) |
| **Before merge** | Full web CI row above |
| **Pre-launch** | Manual Maestro workflow, physical Android devices, iOS, native perf polish |

## Parity matrix (high level)

| Workflow | Desktop web | Mobile web (responsive CRM) | Native Android | Device verified |
|----------|-------------|----------------------------|----------------|-----------------|
| Login / tenant | Yes | Yes | Yes | Web CI; native compile only |
| Today / queue | Yes | Yes (list-first) | Yes | Web CI |
| Patients + detail | Yes | Yes | Yes (Patients tab) | Web CI |
| Book / register | Yes | Yes | Yes | Web CI |
| Check-in / consult | Yes | Yes | Yes (Consult) | Web CI |
| Prescriptions / clinical | Yes | Yes | Partial (consult screen) | Web E2E |
| Invoices / payments | Yes | Yes | Yes (Payments V1 in PR #47) | Web CI; native not Maestro-gated |
| Reports | Yes | Yes | No dedicated tab | Web |
| Doctors / schedule admin | Yes | Yes (owner menu; not bottom nav) | No | Web |
| Team / roles | Yes | Yes (owner menu) | No | Web |
| Clinic settings / onboarding | Yes | Yes | No | Web |
| Audit log | Yes | Yes (owner) | No | Web |
| Owner dashboard / SaaS plan | Yes | Yes | No | Web |
| Platform admin (`/platform`) | Yes | Usable but desktop-oriented | N/A | Staging/manual |

**Native gaps to track incrementally:** reports, doctors admin, team, settings, audit, platform console, deep clinical amend flows.

## Responsive mobile-web notes

- Breakpoint **768px**: sidebar + desktop topbar vs mobile top bar + **bottom nav** (`apps/crm/src/styles.css`, `BottomNav.tsx`).
- Bottom nav: Home, Today, Patients, Book, Payments, Reports — **not** Doctors, Team, Settings, Activity; owner reaches those via **user menu** (`App.tsx`).
- Today: mobile defaults to **list** not board; calendar collapses (`TodayView.tsx`).
- Patients: mobile **FAB** for add; header add hidden (`styles.css`).
- Playwright **chromium-mobile** (Pixel 7) runs in CI regression job — same specs as desktop where applicable.

## Recommended implementation batches (web-first)

1. **Owner mobile discoverability** — Settings, Team, Doctors reachable in ≤2 taps on mobile (nav or menu), without new backend.
2. **Consultation + Rx completeness** — align mobile-web consult dialog with API capabilities; close gaps flagged in `26_PR12_REVIEW_AND_PARITY.md`.
3. **Billing polish** — web partial pay, void, idempotency UX; native follows after web stable.
4. **Onboarding checklist** — owner path on mobile-web; tie to existing APIs.
5. **Reports** — ensure mobile-web tables scroll/export; no native until web complete.
6. **Pre-launch** — manual Maestro full suite + physical Android smoke.

## Launch risks (current)

| Risk | Mitigation |
|------|------------|
| Native Android unverified on device | Defer to pre-launch; keep APK build on PR |
| Owner-only tabs harder on mobile web | Batch 1 above |
| Staging GCP / reminders / paid SaaS | Documented in modernization docs; not blocking local web |
| Legacy Denta Care repo | Out of scope |

See also: `35_LOCAL_VERIFY.md`, `36_DEV_SPEED.md`, `apps/mobile/.maestro/README.md`.
