# Authenticated CRM UI/UX audit

**Date:** 2026-10-25  
**Build audited:** `main` post–M8 Batch 1 (same artifact deployed to staging via Cloud Build).

---

## Verification methodology

| Method | Scope | Label |
|--------|--------|-------|
| Browser on staging login URL | Login shell, signup link | **STAGING VERIFIED** |
| Browser on staging `/signup` | Wizard step 1 (prior session) + code review | **STAGING VERIFIED** (partial) |
| Staging authenticated desk | Requires `clinic-staging-demo-password` (Secret Manager) | **NOT VERIFIED** in this session — secret access blocked by policy |
| Local API + E2E credentials | `POST /api/platform/login` succeeds for seeded `e2e-owner@dentacare.in` | **LOCAL VERIFIED** |
| Playwright specs 01–18 | Assert DOM structure and flows against **local** CRM (`E2E_BASE_URL`) | **LOCAL E2E** (specs are evidence; global-setup path currently broken — see [`17`](17_GCP_FIRST_PLATFORM_STRATEGY.md)) |
| Component/source review | Layout, tabs, dialogs | **CODE REVIEW** |

**Rule:** Items below marked **BROWSER** were not manually clicked on staging while logged in. Treat **LOCAL E2E + CODE REVIEW** as high-confidence for the same React bundle staging runs.

**Staging URLs (canonical):** CRM `https://kaana-clinic-staging-339065153036.asia-south1.run.app/?tenant=dentacare` ([`08_M5_STAGING_LIVE.md`](08_M5_STAGING_LIVE.md)).

---

## Screen inventory

| Screen | Tab / route | Primary components | Evidence |
|--------|-------------|-------------------|----------|
| Login | `?tenant=` | `LoginGate.tsx` | **STAGING VERIFIED** |
| Signup | `/signup` | `SignupWizard.tsx` | **STAGING VERIFIED** (step 1) |
| Set password | `?set-password=` | `SetPasswordScreen.tsx` | LOCAL E2E (`01-auth`) |
| Home | `overview` | `OverviewTab.tsx` | LOCAL E2E `03-overview` |
| Schedule | `today` | `TodayView.tsx` | LOCAL E2E `04-today` |
| Patients | `patients` | `PatientsView.tsx` | LOCAL E2E `05-patients` |
| Patient detail | overlay | `PatientDetail.tsx` | LOCAL E2E `10-patient-detail` |
| Book | `book` | `BookView` in `PatientDetail.tsx` | LOCAL E2E `06-book` |
| Payments | `payments` | `PaymentsView.tsx` | LOCAL E2E `07-payments` |
| Reports | `reports` | `ReportsView.tsx` | LOCAL E2E `08-reports` |
| Doctors | `doctors` | `DoctorsView.tsx` | LOCAL E2E `13-doctors` |
| Team | `team` | `TeamAccessView.tsx` | LOCAL E2E `09-team` |
| Activity | `audit` | `AuditView.tsx` | CODE REVIEW (owner tab) |
| Global search | modal | `GlobalSearchDialog.tsx` | LOCAL E2E `03-overview` |
| Navigation | sidebar + bottom nav | `Sidebar`, `BottomNav` | LOCAL E2E `02-navigation` |

**Routing gap:** Tabs are React state only ([`App.tsx`](../../apps/crm/src/App.tsx)) — no `/today` URLs (**P0**).

---

## STAGING VERIFIED findings (login)

1. Pre-filled username shows legacy production email — confusing on staging (**P1** hygiene).
2. Document title remains “Denta Care — Dr. D. Ajit” on tenant login — should be tenant-driven (**P1**).
3. “Start a new clinic workspace” link present — good SaaS path (**positive**).
4. Visual: card layout, brand blue, clear hierarchy (**positive**).

---

## Desk workflow assessment (LOCAL E2E + code)

### Strengths

- Coherent **desk-first** layout: sidebar (desktop) + bottom nav (mobile).
- **Today** board supports list/board toggle and status chips (e2e `04-today`).
- **Multi-doctor** filters and booking (`14`, `15`, `16`).
- **Toasts** for API feedback; compact density toggle.
- **Payments** and **reports** integrated without leaving app.

### Weaknesses vs competitors

| Area | Issue | Priority |
|------|-------|----------|
| Clinical | No structured encounter/EMR UI — uploads only | **P0** product gap |
| Consultation | `CompleteVisitDialog` is payment-oriented, not clinical note | **P0** |
| Onboarding | Post-signup clinic setup checklist missing | **P1** |
| Deep links | No shareable patient/appointment URLs | **P1** |
| Loading | Inconsistent skeletons; some tabs block on full fetch | **P1** |
| Empty states | Variable across tabs | **P2** |
| a11y | Dialog focus not fully audited | **P2** |
| Search | Global search exists; no keyboard shortcut documented in UI | **P2** |

### Mobile / tablet

- Playwright project `chromium-mobile` configured ([`playwright.config.ts`](../../apps/crm/playwright.config.ts)).
- Bottom nav + responsive CSS — **LOCAL E2E** navigation tests; **not STAGING BROWSER** at 390px.

### Performance (perceived)

- TanStack Query only on `useTodayData` / `useDoctors` — other tabs refetch manually → extra spinners (**P1** unify Query).
- Today polling/refetch in `App.tsx` — acceptable for desk; tune intervals after PG.

---

## Prioritized UI/UX backlog

| P | Item | Effort |
|---|------|--------|
| P0 | Encounter/consultation screens (after [`19`](19_CLINICAL_DATA_MODEL.md)) | Large |
| P0 | URL routing (react-router or lightweight path sync) | Medium |
| P1 | Post-signup setup wizard (hours, services, first doctor) | Medium |
| P1 | Staging/prod login field defaults + page titles | Small |
| P1 | Unified React Query + error boundaries per tab | Medium |
| P2 | Design tokens doc + button/table primitives | Medium |
| P2 | Accessibility pass (axe in CI) | Medium |

---

## Recommended follow-up (owner)

Run authenticated staging tour:

```bash
STAGING_DEMO_PASSWORD='…' node scripts/staging-validate.mjs
# Then manual desk pass or:
cd apps/crm && E2E_BASE_URL='https://kaana-clinic-staging-339065153036.asia-south1.run.app' \
  E2E_EMAIL='staging-owner@clinic-erp.invalid' E2E_PASSWORD='…' \
  npx playwright test --project=chromium-desktop
```

Fix `e2e/global-setup.ts` path to `../api` in a **separate code PR**.
