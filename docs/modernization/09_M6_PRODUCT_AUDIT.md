# M6 — Product audit (evidence-based)

**Repository:** `Srinivas-2906/clinic-erp` (`apps/api`, `apps/crm`)  
**Date:** 2026-10-22  
**Method:** Static code review + staging API smoke tests (see `08_M5_STAGING_LIVE.md`). No comprehensive typecheck.

## Summary maturity

| Area | Status | Notes |
|------|--------|-------|
| Clinic onboarding | Partial | Login, access request, set-password; no self-serve clinic signup wizard |
| Org / multi-branch | Missing | Single tenant row; `location_id` column only |
| Doctors / staff | Working | CRM + `/api/clinic/doctors` (sessions, time-off, services) |
| Auth / permissions | Partial | JWT; `owner` vs `staff`; owner gates for team/doctors |
| Patients | Working | CRUD, timeline, search |
| Appointments / scheduling | Working | Slot engine, multi-doctor, public booking routes |
| Clinical notes | Partial | JSON notes on patient; no structured EMR |
| Prescriptions | Partial | File URLs + upload; no Rx composer / drug DB |
| Billing / payments | Working | Record payments, due counts, visit completion hooks |
| Inventory / pharmacy | Missing | No product code |
| Reports | Working | Date-range report API + CRM view (aggregates) |
| Comms / follow-ups | Partial | tel/WhatsApp links; reminder schedulers stubbed in `clinicStore.js` |
| Uploads | Working | GCS/local; auth’d file GET |
| Mobile UX | Working | Bottom nav, keyboard/viewport helpers, mobile e2e projects |
| Security / audit / backup | Partial | `audit_log` writes; no audit UI/API read; Litestream in Docker entrypoint |
| Integrations | Partial | Public booking; legacy Kaana migration scripts only |

## Frontend surface (`apps/crm`)

Tab SPA (`App.tsx`): `overview`, `today`, `patients`, `book`, `payments`, `reports`, `doctors` (owner), `team` (owner). Overlays: `PatientDetail`, dialogs for book/reschedule/complete visit/payments.

## Backend surface (`apps/api`)

- Platform: `/api/platform/login`, tenant public, booking, access requests, set-password.
- Clinic: patients, appointments, payments, report, uploads/files, team access requests, doctors module.

## Critical defects / gaps (product-quality)

1. **Automated reminders** — `scheduleAppointmentReminders` / recall helpers empty (`clinicStore.js`).
2. **Audit visibility** — writes to `audit_log` but no operator-facing export/UI.
3. **Tenant slug mismatch risk** — staging `cloudbuild.staging.yaml` had `dentacare-staging` until fixed; CRM build arg must match seeded slug (`dentacare`).
4. **Coarse RBAC** — no receptionist/doctor-scoped permissions beyond owner/staff.
5. **Prescriptions** — attachment-only; competitive EMR expects structured Rx + print/share.

## Tests present

- API: `node --test` on scheduling, doctors, uploads, http limits.
- CRM: Vitest on libs/components.
- E2E: Playwright `01`–`18` under `apps/crm/e2e/tests/` (requires seeded user for full pass).

## kaana-clinic Postgres experiment (not merged)

Location: `/Users/srinivas/Downloads/Demos/kaana-clinic` — Drizzle schema, dual SQLite/Postgres repositories, parity tests, optional Cloud SQL Terraform. **Canonical product remains SQLite** in `clinic-erp` until a deliberate migration milestone.

## Staging validation cross-check

Confirmed on live staging: health, login, patient, doctor list, appointment, payment, upload, Litestream path, data survives API revision restart.
