# Web-first launch strategy (2026-10-31)

**Decision:** Ship Clinic ERP as **web SaaS** first (desktop + responsive mobile browser). **Native Android and iOS are deferred** until web completion and market validation.

**One product:** Same React CRM (`apps/crm`), same API (`apps/api`). Mobile web is responsive layout, not a separate app.

**Out of scope for active development:** New native screens, native parity work, Maestro/APK on every PR, EAS/Play Store releases.

Native source (`apps/mobile`), Maestro flows, and Gradle scripts **remain in the repo** — see **`40_NATIVE_DEFERRED_BACKLOG.md`**.

---

## CI merge requirements (PR → `main`)

| Check | Workflow | Required |
|-------|----------|----------|
| API unit tests (+ billing smoke, release preflight) | `CI` | **Yes** |
| CRM unit tests | `CI` | **Yes** |
| CRM production build | `CI` | **Yes** |
| Docker build (no push) | `CI` | **Yes** |
| Playwright fast (smoke + auth; desktop + mobile @smoke) | `CI` | **Yes** |
| Playwright regression (full) | `Playwright extended regression` | **Async** — required before **web release** |
| Mobile typecheck + unit | `Native Android verify (manual)` | **No** |
| Android APK build | `Native Android verify (manual)` | **No** |
| Native Maestro | `Android Maestro verify (manual)` | **No** |

See **`39_CI_FAST_AND_EXTENDED.md`** for branch protection and parallel development.

**Typical web PR CI wall time:** ~4–8 min (no native jobs).

---

## Deployment (web/backend only)

| Workflow | Trigger | Builds native? |
|----------|---------|----------------|
| `deploy-staging.yml` | Manual + approval | **No** — `cloudbuild.staging.yaml` → API + CRM Cloud Run |
| `deploy-production.yml` | Manual + approval | **No** — `cloudbuild.yaml` → API + CRM only |
| `staging-ops.yml` / `staging-e2e.yml` | Manual / scheduled | Web staging E2E only |

No Expo/EAS, APK publish, or iOS steps in deploy pipelines.

---

## Active product scope (this phase)

Shared backend, desktop CRM, responsive mobile-browser CRM, SaaS onboarding, clinical + billing + reporting, security, commercial readiness.

**Do not** block web delivery on native compatibility except where API contracts must stay stable (document in native backlog).

---

## Responsive mobile-web parity (same features, layout adapts)

| Area | Desktop | Mobile web | Notes |
|------|---------|------------|--------|
| Auth / roles | Yes | Yes | Bottom nav + account menu for owner-only tabs |
| Patients, book, today, consult | Yes | Yes | List-first today; FAB patients |
| Billing / payments | Yes | Yes | Doctor Payments nav gated by capability (#49) |
| Reports / activity | Yes | Yes | Table UX — **PR #51** stacked rows |
| Settings / team / doctors | Yes | Yes | Owner account menu (#48) |
| Owner home / SaaS | Yes | Yes | Overview tab |
| Platform admin | Yes | Usable; desktop-oriented | P4 polish |
| Follow-ups | Partial | Partial | P2 |
| Clinical uploads | Yes | Weaker UX | P1–P2 |

Prioritized backlog: **`41_WEB_LAUNCH_PRIORITIES.md`**.

---

## Testing policy

| Phase | Scope |
|-------|--------|
| Development | Focused tests (`36_DEV_SPEED.md`) |
| PR merge | Fast `CI` row above |
| Web release | Green extended regression + security/infra gates + manual deploy approval |

---

## Launch risks (web-first)

| Risk | Mitigation |
|------|------------|
| Extended regression flake (`32-busy-clinic-day`) | Fix before release; async visibility |
| Branch protection still lists native job names | Update GitHub required checks after CI PR |
| Owner workflows on small phones | Continue responsive batches; no feature hiding |

See also: `38_PRODUCT_COMPLETION_AUDIT.md`, `40_NATIVE_DEFERRED_BACKLOG.md`, `41_WEB_LAUNCH_PRIORITIES.md`.
