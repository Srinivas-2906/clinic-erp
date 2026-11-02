# Web pilot-readiness audit (evidence-based)

**Repository:** `clinic-erp` (Clinic ERP — `apps/api`, `apps/crm`)  
**Audit date:** 2026-11-02  
**Evidence base:** `main` @ `e1eea38` (consultation amendments)  
**Method:** Source inspection, existing tests, CI workflows, modernization runbooks — no invented completion percentages.

**Follow-up:** [43_PILOT_ENV_AND_RECOVERY.md](./43_PILOT_ENV_AND_RECOVERY.md) — env consolidation, local restore drill (**passed** on E2E DB copy), staging drill operator-run only.

**Out of scope:** Legacy Denta Care project; native Android/iOS (`apps/mobile` deferred per `40_NATIVE_DEFERRED_BACKLOG.md`); untracked `booksaas-*` (separate product).

---

## 1. Executive summary

Clinic ERP is **ready for a controlled web pilot** with real outpatient clinics when:

- Clinics accept **browser-only** reception, clinical, and owner workflows (desktop + mobile browser).
- **Subscription conversion** is handled operationally (platform admin / manual plan change) — no in-app payment checkout.
- **Staging/production ops** follow documented Litestream, GCS file bucket, and SMTP/password-reset runbooks before go-live.

**Go (controlled pilot):** Single-tenant or multi-tenant **clinical + reception + billing** day on web, with trial entitlements and audit trail.

**No-go (commercial self-serve SaaS launch):** Until payment gateway webhooks, production reminder delivery approval, and attachment restore drills are completed.

**Severity legend:** P0 blocks safe controlled pilot · P1 blocks commercial web launch · P2 post-pilot · P3 optional.

---

## 2. Verified feature inventory

| Domain | Capability | Status | Primary evidence |
|--------|------------|--------|------------------|
| Onboarding | Public signup + slug check | Complete | `POST /api/platform/signup`, `SignupWizard.tsx`, `31-clinic-onboarding-journey.spec.ts` |
| Onboarding | Platform/internal tenant provision | Complete | `tenantProvisioning.js`, `PlatformAdminApp.tsx` |
| Onboarding | Onboarding checklist API + UI | Complete | `clinicOnboarding.js`, `ClinicOnboardingChecklist.tsx` |
| Onboarding | Doctors, sessions, time off, services | Complete | `doctors.routes.js`, `DoctorScheduleEditor.tsx`, `13-doctors.spec.ts`, `14–16` slot specs |
| Onboarding | Staff access requests | Complete | `accessRequests.js`, `TeamAccessView.tsx`, `09-team.spec.ts` |
| Onboarding | Trial on provision | Complete | `tenantProvisioning.js`, `subscription.js` |
| Reception | Patients CRUD + search | Complete | `clinicStore.js`, `PatientsView.tsx`, `05-patients.spec.ts` |
| Reception | Booking + slots + multi-doctor | Complete | `slotEngine.js`, `BookView.tsx`, `06-book.spec.ts`, `15-multi-doctor-book.spec.ts` |
| Reception | Public booking API | Complete | `publicBooking.js`, `11-api-public-booking.spec.ts` |
| Reception | Queue / lifecycle | Complete | `appointmentStatus.js`, `TodayView.tsx`, `25-queue-transitions.spec.ts`, `32-busy-clinic-day.spec.ts` |
| Reception | Follow-ups | Complete | `encounters.service.js` follow-up APIs, `FollowUpsPanel.tsx`, `36-follow-up-journey.spec.ts` |
| Reception | Payments + invoices + partial pay | Complete | `clinicPayments.js`, `patientInvoices.js`, `07-payments.spec.ts`, `28-invoice-partial-payment.spec.ts` |
| Clinical | Encounters draft/finalize | Complete | `encounters.service.js`, `ConsultationDialog.tsx`, `19-clinical-consultation.spec.ts`, `30-full-clinical-billing-journey.spec.ts` |
| Clinical | Prescription PDF | Complete | `prescriptionPdf.js`, `GET .../prescription.pdf` |
| Clinical | Patient documents (PDF/image) | Complete | `patientDocuments.service.js`, `PatientDocumentsPanel.tsx`, `37-patient-documents.spec.ts` |
| Clinical | Amendments (note + history) | Complete (PR #58) | `record_amendments`, `EncounterAmendDialog.tsx`, `38-consultation-amendments.spec.ts` |
| Clinical | Allergies | Complete | `/api/clinic/patients/:id/allergies`, patient detail UI |
| Owner | Home / today dashboard | Complete | `OverviewTab.tsx`, `03-overview.spec.ts`, `29-overview-home-consult.spec.ts` |
| Owner | Reports | Complete | `/api/clinic/report`, `ReportsView.tsx`, `08-reports.spec.ts` |
| Owner | Settings + branding | Complete | `/api/clinic/settings`, `ClinicSettingsView.tsx`, `22-settings-audit-routes.spec.ts` |
| Owner | Plan usage + export | Complete | `entitlements.js`, `PlanUsagePanel.tsx`, `26-settings-plan-export.spec.ts` |
| Owner | Audit + CSV export | Complete | `clinicAudit.js`, `AuditView.tsx`, entitlements gate |
| Platform | Admin tenants/plans | Complete | `/api/platform/admin/*`, `PlatformAdminApp.tsx` |
| SaaS | Entitlements + limits | Complete | `entitlements.js`, `plans.js`, unit tests |
| SaaS | Subscription states + write gates | Complete | `subscription.js`, `requireLiveTenant.js`, `requireTenantWrite.js` |
| SaaS | Payment gateway | **Missing** | `paymentGateway.js` → `not_configured` |
| Ops | CI fast + extended E2E | Complete | `.github/workflows/ci.yml`, `playwright-regression.yml`, `39_CI_FAST_AND_EXTENDED.md` |
| Ops | Deploy / staging docs | Complete | `06_M4`, `08_M5`, `33_INTEGRATED_STAGING_RELEASE.md` |
| Ops | Litestream / restore runbook | Documented | `28_STAGING_LITESTREAM_RESTORE_RUNBOOK.md`, `Dockerfile` entrypoint |
| Ops | App APM (Sentry/Datadog) | **Missing** | Health endpoints only (`/health`, `/api/health`) |

---

## 3. Desktop / mobile-browser parity matrix

| Workflow | Desktop web | Mobile browser | Notes |
|----------|-------------|----------------|-------|
| Login / auth | Complete | Complete | `01-auth.spec.ts` |
| Bottom nav (Today, Book, Patients, Pay) | N/A | Complete | `BottomNav`, safe-area CSS |
| Owner Settings / Audit | Sidebar | Account menu | `33-mobile-owner-account-menu.spec.ts` |
| Booking + follow-ups | Complete | Complete | Follow-ups on Book tab; mobile layout CSS |
| Today queue + consult | Complete | Partial UX | Mobile list-first; no dedicated mobile-only consult E2E |
| Patient detail + documents | Complete | Complete | `37-patient-documents.spec.ts` (mobile project) |
| Consultation amend + history | Complete | Complete | `38-consultation-amendments.spec.ts` |
| Reports tables | Complete | Complete | `34-mobile-reports-activity-tables.spec.ts` (`data-label`) |
| Billing overview stats | Complete | Complete | `35-mobile-billing-overview.spec.ts` |
| Doctors / team admin | Sidebar | Account menu / limited | Owner-only paths |
| Platform admin | Complete | Partial | `/platform` desktop-oriented |

**Parity gap (P2):** No `chromium-mobile` E2E for full queue→consult→finalize path (covered on desktop + staging spec `21-staging-pilot-journey.spec.ts`, ignored in default Playwright config).

---

## 4. Core clinic workflow coverage

| Day-one workflow | API | CRM UI | Automated proof |
|------------------|-----|--------|-----------------|
| Open clinic / today view | `/api/clinic/today` | `OverviewTab`, `TodayView` | `04-today`, `32-busy-clinic-day` |
| Register patient | `/api/patients` | `PatientFormDialog` | `05-patients` |
| Book appointment | `/api/appointments`, slots | `BookView` | `06-book`, `15` |
| Check-in → consult | status transitions | `TodayView`, `ConsultationDialog` | `25-queue-transitions`, `19` |
| Finalize + Rx PDF | finalize + PDF stream | consult + patient history | `19`, `30` |
| Record payment | `/api/clinic/payments` | `RecordPaymentDialog` | `07`, `28` |
| Upload clinical document | patient documents API | `PatientDocumentsPanel` | `37` |
| Amend finalized note | amendments API | `EncounterAmendDialog` | `38`, `encounters.test.js` |
| Owner end-of-day report | `/api/clinic/report` | `ReportsView` | `08-reports` |

**Partial:** Follow-up **reporting** in Reports tab (copy mentions follow-ups; operational UI is on Book).

---

## 5. Security findings

| Finding | Severity | Evidence | Pilot impact |
|---------|----------|----------|--------------|
| Tenant scoping via `tenant_id` in queries (no Postgres RLS) | P2 | `13_M7_DATABASE_DECISION.md`; cross-tenant tests in `clinicHttpSecurity.test.js`, documents, uploads, amendments | Acceptable for SQLite pilot if API deployment is trusted |
| JWT + session version invalidation | — | `auth.js` | Complete |
| Role capabilities server-side | — | `rolePolicy.js`, service-layer checks | Complete |
| Clinical writes require doctor profile link | — | `clinicalPermissions.js` | Complete |
| Private files; clinical-doc registry gate | — | `index.js` file route, `patientDocuments.service.js` | Complete |
| Subscription suspended → no access | — | `requireLiveTenant.js` | Complete |
| past_due → read-only writes | — | `requireTenantWrite.js` | Complete |
| Platform admin separation | — | `is_platform_admin`, `/platform` routes | Complete |

**No P0 security defects identified** in web API/CRM paths reviewed for this audit.

---

## 6. Commercial readiness findings

| Item | Status | Evidence |
|------|--------|----------|
| Plan tiers + feature flags | Complete | `plans.js`, `entitlements.js` |
| Trial provisioning | Complete | `tenantProvisioning.js` |
| Owner plan panel | Complete | `PlanUsagePanel.tsx` |
| Platform plan/subscription PATCH | Complete | `platformAdmin.service.js` |
| Razorpay/Stripe in Clinic ERP | **Missing** | `paymentGateway.js` stub |
| Reminder SMS/email live delivery | Partial | Mock unless `REMINDER_DELIVERY_ENABLED` + provider env (`32_COMMERCIAL_SAAS_V1.md`) |
| Self-serve upgrade checkout | **Missing** | Manual/platform ops only |

**Commercial launch blockers (P1):** Payment integration + webhook-driven subscription state; approved reminder delivery to real patients.

---

## 7. Operational readiness findings

| Item | Status | Reference |
|------|--------|-----------|
| Docker / Cloud Build deploy paths | Complete | `cloudbuild*.yaml`, `deploy-staging.yml` |
| GCS private uploads | Documented | `apps/api/docs/STORAGE.md`, `CLINIC_FILES_*` |
| Litestream backup pattern | Complete in image | `apps/api/Dockerfile`, `28_*` runbook |
| Staging SMTP / password reset | Partial | `27_OPERATIONAL_READINESS.md` §3 |
| Clinical file restore drill | Partial | GCS attachment restore not fully drilled (`27` §2) |
| Centralized error monitoring | Missing | No in-app APM |
| Env var catalog | Partial | Thin `.env.example`; vars scattered in docs/code |

**Pilot ops minimum:** Configure staging/prod `JWT_SECRET`, `CLINIC_FILES_BUCKET`, `DATABASE_PATH`/Litestream bucket, run `scripts/verify-local.sh` or staging validate scripts after deploy.

---

## 8. Known test gaps

| Gap | Risk | Severity |
|-----|------|----------|
| No API HTTP test for `/api/clinic/report` body shape | Report regression | P2 |
| Limited settings route HTTP tests | Settings auth regression | P2 |
| Mobile full consult journey (chromium-mobile project) | Mobile consult UX undetected | P2 |
| Staging journey spec ignored in default CI | Staging-only regressions | P2 |
| Load/performance tests | Unknown scale limits | P2 |
| Manual pilot sign-off checklist | Human staging day | Required process (`27` §4) |

**Coverage strengths:** 38 Playwright specs; 31+ API test files; explicit cross-tenant tests for payments, encounters, uploads, documents, amendments; Fast CI + extended regression workflows.

---

## 9. Prioritized backlog

| ID | Priority | Issue | Why |
|----|----------|-------|-----|
| B1 | P1 | Payment gateway + subscription webhooks | Cannot monetize or automate trial→paid |
| B2 | P1 | Production reminder delivery governance | Patient communications liability |
| B3 | P1 | SMTP/password reset on pilot environment | Staff lockout without ops workaround |
| B4 | P2 | GCS clinical file restore drill | DB restore without files breaks Rx/docs |
| B5 | P2 | Mobile E2E: queue→consult→finalize | Parity confidence for phone-only staff |
| B6 | P2 | `/api/clinic/report` + settings HTTP tests | Owner workflow regression safety |
| B7 | P2 | Consolidated `.env.example` + ops checklist | On-call and pilot setup friction |
| B8 | P2 | APM/logging dashboards | Incident response in pilot |
| B9 | P3 | Follow-up analytics in Reports | Owner insight, not day-one blocker |
| B10 | P3 | In-app prescription amend workflow | Clinical policy; amendments limited to notes |

---

## 10. Recommended pilot scope

**Include:**

- 1–3 outpatient clinics (dental/medical generic), single location each.
- Roles: owner, receptionist, 1+ doctors (user linked to doctor profile).
- Web only (desktop + mobile browser).
- Workflows: signup or platform-provisioned tenant, onboarding checklist, full reception day, consultation + PDF, documents, amendments, payments, basic reports, audit export sample.
- Trial plan with manual conversion via platform admin.

**Exclude:**

- Native apps.
- Live SMS/email reminders to patients (unless explicitly approved and configured).
- Self-serve paid checkout.
- Multi-branch enterprise features (plan flag only).

---

## 11. Estimated implementation effort (from code gaps)

| Workstream | Scope | Rough effort |
|------------|--------|--------------|
| Payment gateway MVP (Razorpay or Stripe) + webhooks | `paymentGateway.js`, subscription sync, owner UI | 2–4 weeks |
| Pilot ops hardening | SMTP, env docs, attachment restore drill, monitoring | 1–2 weeks |
| Test gaps (report/settings HTTP, mobile consult E2E) | Targeted tests only | 3–5 days |
| Post-pilot polish | Reports follow-ups, APM | 1–2 weeks |

Estimates assume existing architecture; no greenfield rewrite.

---

## 12. Explicit go / no-go criteria

### Controlled web pilot — **GO** when all are true

1. Staging or pilot environment deployed with **JWT**, **GCS/files**, and **DB backup** per runbooks.
2. Each pilot clinic completes **onboarding checklist** (doctors, hours, staff, test appointment).
3. At least one **full day simulation** passed: `32-busy-clinic-day` + manual owner sign-off (`27` §4).
4. Clinicians accept **amendment limits** (clinical note/history only; Rx changes via regenerate/new visit policy).
5. **No P0** open defects in tenant isolation, auth, or file access.

### Commercial web launch — **NO-GO** until

1. B1 payment + entitlement automation shipped and tested.
2. B3 operational email/reset path verified in target environment.
3. B4 file restore validated with Litestream + GCS bucket.
4. Extended regression green on `main` for two consecutive releases.

---

## Appendix: key file index

| Area | Paths |
|------|--------|
| API entry | `apps/api/src/appFactory.js`, `apps/api/src/routes/index.js` |
| Clinical | `apps/api/src/modules/clinical/*` |
| Identity / SaaS | `apps/api/src/modules/identity/*`, `middleware/requireLiveTenant.js` |
| CRM shell | `apps/crm/src/components/AppShell.tsx`, `apps/crm/src/lib/api.ts` |
| E2E | `apps/crm/e2e/tests/01–38` |
| CI | `.github/workflows/ci.yml`, `playwright-regression.yml` |

**Related docs:** `27_OPERATIONAL_READINESS.md`, `32_COMMERCIAL_SAAS_V1.md`, `37_WEB_FIRST_STRATEGY.md`, `41_WEB_LAUNCH_PRIORITIES.md`, **`43_PILOT_ENV_AND_RECOVERY.md`** (env + recovery tooling, 2026-11-02 batch).

**Addendum (2026-11-02):** Local isolated SQLite restore drill **passed** via `pilot-local-restore-drill.sh` on E2E seed DB. Staging GCS Litestream drill not re-run (operator credentials). See `43_*` for scripts and SMTP/password-reset review.
