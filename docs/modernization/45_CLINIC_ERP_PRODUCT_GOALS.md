# Clinic ERP — product goals specification

**Evidence baseline:** repository @ `main` `e8ee2fc` (post PR #60).  
**Method:** each area lists expected behavior, file/API evidence, gaps, dependencies, acceptance criteria, manual checks, priority, and **status** (not a percentage score).

Status values: `complete` | `partial` | `missing` | `blocked` (external dependency).

---

## 1. Clinic onboarding

| Field | Detail |
|-------|--------|
| **Expected** | Self-serve signup (optional), tenant provisioning, trial start, owner account, onboarding checklist, slug branding. |
| **Evidence** | `tenantProvisioning.js`, `SignupWizard`, `clinicOnboarding.js`, `/clinic/onboarding`, E2E signup specs. |
| **Gaps** | Production signup gating via env; email verification not required for pilot. |
| **Dependencies** | JWT, SQLite tenants, CRM URLs for invites. |
| **Automated acceptance** | API provisioning tests; Playwright onboarding/smoke. |
| **Manual** | End-to-end signup on staging with real email (when enabled). |
| **Priority** | P1 |
| **Status** | **partial** |

## 2. Doctor and staff administration

| Field | Detail |
|-------|--------|
| **Expected** | Doctor profiles, schedules, staff roles, access requests, invite/set-password. |
| **Evidence** | Doctors routes, `TeamView`, access-request routes, `clinicHttpSecurity.test.js` (partial). |
| **Gaps** | Some HTTP tests for access-request edge cases; mobile-web parity verified in E2E 39+. |
| **Dependencies** | Entitlements (plan limits). |
| **Automated acceptance** | API doctor tests; E2E multi-doctor slots. |
| **Manual** | Owner approves staff on mobile browser. |
| **Priority** | P1 |
| **Status** | **partial** |

## 3. Patient management

| Field | Detail |
|-------|--------|
| **Expected** | Register, search, profile, timeline, phone normalization, tenant isolation. |
| **Evidence** | Patients routes, CRM patient views, API patient tests. |
| **Gaps** | Duplicate detection policy varies by clinic workflow. |
| **Automated acceptance** | Patient API tests; patient journey E2E. |
| **Manual** | Large patient list performance. |
| **Priority** | P0 |
| **Status** | **partial** |

## 4. Appointment scheduling

| Field | Detail |
|-------|--------|
| **Expected** | Book, reschedule, cancel, multi-doctor slots, public booking API. |
| **Evidence** | Appointments routes, slots service, `PublicBooking` patterns, E2E booking specs. |
| **Gaps** | Recurring appointments not a goal for v1. |
| **Automated acceptance** | Slots tests; booking E2E. |
| **Manual** | Timezone edge cases (Asia/Kolkata). |
| **Priority** | P0 |
| **Status** | **partial** |

## 5. Queue management

| Field | Detail |
|-------|--------|
| **Expected** | Today board, status transitions (confirmed → arrived → visited), role-specific views. |
| **Evidence** | Today tab, queue helpers, E2E busy clinic / mobile clinical journey (39). |
| **Gaps** | None critical for web pilot. |
| **Automated acceptance** | Playwright queue specs. |
| **Manual** | High-volume day simulation. |
| **Priority** | P0 |
| **Status** | **partial** |

## 6. Consultations

| Field | Detail |
|-------|--------|
| **Expected** | Complaint, exam, diagnosis, finalize encounter, PDF/chart output. |
| **Evidence** | Encounters routes, `ConsultationDialog`, consult E2E. |
| **Gaps** | Native deferred (40_NATIVE_DEFERRED_BACKLOG). |
| **Automated acceptance** | Encounter API tests; consult E2E. |
| **Manual** | Doctor finalize under load. |
| **Priority** | P0 |
| **Status** | **partial** |

## 7. Prescriptions

| Field | Detail |
|-------|--------|
| **Expected** | Rx lines, print/PDF, linked to encounter. |
| **Evidence** | Prescription PDF generation, CRM consult UI. |
| **Gaps** | Drug interaction checks not in scope. |
| **Automated acceptance** | API PDF smoke where present. |
| **Manual** | PDF layout review. |
| **Priority** | P1 |
| **Status** | **partial** |

## 8. Clinical documents

| Field | Detail |
|-------|--------|
| **Expected** | Upload, list, soft-delete, tenant-scoped storage (local/GCS/memory). |
| **Evidence** | PR #57 attachments, `patientClinicalDocuments`, E2E 38. |
| **Gaps** | Mobile-web upload UX polish. |
| **Automated acceptance** | API security tests; E2E 38. |
| **Manual** | GCS pilot bucket ACL review. |
| **Priority** | P1 |
| **Status** | **partial** |

## 9. Consultation amendments

| Field | Detail |
|-------|--------|
| **Expected** | Amend finalized encounters with history, concurrency guard. |
| **Evidence** | PR #58 amendment routes, E2E 38. |
| **Gaps** | Mobile-specific amendment UX not separately spec’d. |
| **Automated acceptance** | Amendment API tests; E2E 38. |
| **Manual** | Two-doctor conflict scenario. |
| **Priority** | P1 |
| **Status** | **partial** |

## 10. Follow-ups

| Field | Detail |
|-------|--------|
| **Expected** | Pending/scheduled follow-ups from encounters, owner visibility in reports. |
| **Evidence** | `encounters.service.js`, `ConsultationDialog`, `FollowUpsPanel`, `BookView` link-appointment, E2E 36 + 41. |
| **Gaps** | Optional today-tab surfacing. |
| **Automated acceptance** | `encounters.test.js`; Playwright 36, 41. |
| **Manual** | Reception books follow-up appointment. |
| **Priority** | P2 |
| **Status** | **partial** |

## 11. Billing and collections (patient ledger)

| Field | Detail |
|-------|--------|
| **Expected** | Invoices, payments, refunds, idempotency, owner/reception roles. |
| **Evidence** | Invoice/payment routes, billing E2E specs, idempotency tests. |
| **Gaps** | Online patient payment collect still stub (`paymentGateway.js` patient path). |
| **Dependencies** | Separate from SaaS subscription billing. |
| **Automated acceptance** | Payment API tests; Playwright billing flows. |
| **Manual** | Refund audit trail review. |
| **Priority** | P0 |
| **Status** | **partial** |

## 12. Owner dashboards and reporting

| Field | Detail |
|-------|--------|
| **Expected** | Overview stats, date-ranged reports, exports, ops summary. |
| **Evidence** | `ReportsView`, `GET /clinic/report`, `opsSummary`, CSV export. |
| **Gaps** | Dedicated API unit test file for report handler (HTTP security covers basics). |
| **Automated acceptance** | `clinicHttpSecurity.test.js` report; CRM report UX manual. |
| **Manual** | Financial totals vs ledger spot-check. |
| **Priority** | P1 |
| **Status** | **partial** |

## 13. Subscription management (SaaS)

| Field | Detail |
|-------|--------|
| **Expected** | Plans, trial, checkout, webhooks, cancel, entitlements enforcement. |
| **Evidence** | `subscriptionBilling.service.js`, `PlanUsagePanel`, platform billing diagnostics, platform admin revenue ops, E2E 40. |
| **Gaps** | Real Razorpay test-mode soak; live approval. |
| **Dependencies** | Razorpay test credentials for provider verification. |
| **Automated acceptance** | `subscriptionBilling.test.js`, webhook tests, E2E 40 (simulated sandbox). |
| **Manual** | Test-mode checkout in Razorpay dashboard. |
| **Priority** | P0 commercial |
| **Status** | **partial** |

## 14. Platform administration

| Field | Detail |
|-------|--------|
| **Expected** | Tenant search, subscription override with audit, billing visibility. |
| **Evidence** | `PlatformAdminApp`, `platformAdmin.service.js`. |
| **Gaps** | Revenue reconciliation UI (payment milestone). |
| **Automated acceptance** | `platformAdmin.test.js`. |
| **Manual** | Platform admin JWT isolation from clinic tenants. |
| **Priority** | P1 |
| **Status** | **partial** |

## 15. Tenant isolation

| Field | Detail |
|-------|--------|
| **Expected** | All clinical/financial queries scoped by `tenant_id`; cross-tenant IDs rejected. |
| **Evidence** | `withTenant`, security tests across routes. |
| **Gaps** | Continuous review on new routes. |
| **Automated acceptance** | `clinicHttpSecurity.test.js`, attachment security tests. |
| **Manual** | Pen-test style spot checks. |
| **Priority** | P0 |
| **Status** | **partial** |

## 16. Clinical and financial integrity

| Field | Detail |
|-------|--------|
| **Expected** | Atomic payment writes, amendment concurrency, no silent entitlement escalation. |
| **Evidence** | Idempotent payments, amendment `updated_at` guards, subscription transition matrix. |
| **Gaps** | Full provider reconciliation (in progress). |
| **Automated acceptance** | Billing + amendment tests. |
| **Manual** | Reconciliation runbook execution. |
| **Priority** | P0 |
| **Status** | **partial** |

## 17. Desktop / mobile-browser parity

| Field | Detail |
|-------|--------|
| **Expected** | Core workflows usable on responsive CRM; no native requirement. |
| **Evidence** | Playwright desktop + mobile projects, E2E 39–40. |
| **Gaps** | Dense tables on small screens (P1 UX). |
| **Automated acceptance** | Extended Playwright regression. |
| **Manual** | Owner settings on phone browser. |
| **Priority** | P1 |
| **Status** | **partial** |

## 18. Backup and recovery

| Field | Detail |
|-------|--------|
| **Expected** | Litestream docs, pilot restore drills, no overwrite of live DB. |
| **Evidence** | `43_PILOT_ENV_AND_RECOVERY.md`, restore scripts + tests. |
| **Gaps** | Staging restore not run in CI. |
| **Automated acceptance** | `pilot-restore-validate.test.js`. |
| **Manual** | Cloud Run restore drill. |
| **Priority** | P1 pilot |
| **Status** | **partial** |

## 19. Security

| Field | Detail |
|-------|--------|
| **Expected** | JWT, role capabilities, webhook HMAC, no secrets in logs. |
| **Evidence** | Auth middleware, billing webhook verify, env validation scripts. |
| **Gaps** | Live WAF/rate limits at edge (ops). |
| **Automated acceptance** | Security-focused API tests. |
| **Manual** | Secret rotation procedure. |
| **Priority** | P0 |
| **Status** | **partial** |

## 20. Performance

| Field | Detail |
|-------|--------|
| **Expected** | SQLite suitable for pilot scale; no unbounded report queries. |
| **Evidence** | Report date filters, pagination patterns in lists. |
| **Gaps** | Formal load tests not in repo. |
| **Automated acceptance** | None dedicated. |
| **Manual** | Report on 90-day range with data. |
| **Priority** | P2 |
| **Status** | **partial** |

## 21. Operational monitoring

| Field | Detail |
|-------|--------|
| **Expected** | Health endpoint, reminder job visibility, platform ops counters. |
| **Evidence** | `/health`, platform admin reminder health. |
| **Gaps** | Centralized metrics/dashboards not in app repo. |
| **Automated acceptance** | Release integration tests. |
| **Manual** | Cloud Run logs + alerts. |
| **Priority** | P2 |
| **Status** | **partial** |

## 22. Controlled pilot readiness

| Field | Detail |
|-------|--------|
| **Expected** | GO/NO-GO audit, env checklist, file storage, email for reset. |
| **Evidence** | `42_WEB_PILOT_READINESS_AUDIT.md`, `validate-pilot-env.mjs`. |
| **Gaps** | Ops must supply GCS + Litestream buckets. |
| **Automated acceptance** | Env validation script. |
| **Manual** | Pilot tenant onboarding with real ops config. |
| **Priority** | P1 |
| **Status** | **partial** |

## 23. Commercial launch readiness

| Field | Detail |
|-------|--------|
| **Expected** | Paid subscriptions, reconciliation, dunning/grace, no live until approved. |
| **Evidence** | Sandbox billing shipped; test-mode adapter in progress. |
| **Gaps** | Live Razorpay, production webhook URL, reconciliation ops. |
| **Dependencies** | Provider credentials, legal/commercial approval. |
| **Automated acceptance** | Mock-based CI; optional `scripts/verify-razorpay-test.mjs`. |
| **Manual** | Staging soak with test-mode checkout. |
| **Priority** | P0 commercial |
| **Status** | **blocked** (provider + approval) |

---

## Summary

No category is marked **complete** end-to-end with full automated + manual sign-off. Web clinical and ledger flows are **partial** with strong E2E coverage; **commercial launch** remains **blocked** on real payment provider verification and explicit live-payment approval.

**Next executable priorities (Track A):** Razorpay test-mode + reconciliation + lifecycle automation; follow-up booking UX; patient online pay (post-subscription).
