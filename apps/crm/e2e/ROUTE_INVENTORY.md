# CRM route & workflow inventory (local E2E)

Query-param routing on `/?tenant=dentacare&tab=…&patient=…`. Platform console: `/platform`.

| Tab / area | URL param | Spec coverage |
|------------|-----------|---------------|
| Login | `/` | `01-auth`, `12-logout` |
| Home (overview) | `tab=overview` | `02-navigation`, `03-overview`, `17-phase1` |
| Schedule (today) | `tab=today` | `04-today`, `16-doctor-filter` |
| Patients | `tab=patients` | `05-patients`, `10-patient-detail`, `22-settings-audit` |
| Book | `tab=book` | `06-book`, `15-multi-doctor-book` |
| Payments | `tab=payments` | `07-payments`, `23-role-permissions` |
| Reports | `tab=reports` | `08-reports` |
| Doctors | `tab=doctors` | `13-doctors`, `14-multi-doctor-slots` |
| Team | `tab=team` | `09-team` |
| Settings | `tab=settings` | `22-settings-audit` |
| Activity (audit) | `tab=audit` | `22-settings-audit` |
| Patient detail | `patient=<id>` | `10-patient-detail`, `19-clinical-consultation` |
| Platform admin | `/platform` | `23-role-permissions` |
| Appointment cancel | Today actions | `24-appointment-lifecycle` |
| Queue → consult | Today | `25-queue-transitions` |
| Settings / plan / export | `tab=settings` | `26-settings-plan-export` |
| Reminders (API) | — | `27-reminders-api` |
| Invoice + partial pay | Payments | `28-invoice-partial-payment` |
| Staging-only pilot | Cloud Run | `21-staging-pilot-journey` (staging config) |
| Cancel appointment | Today actions | `24-appointment-lifecycle` |
| Queue → Consult | Today | `25-queue-transitions` |
| Settings / plan / export | `tab=settings` | `26-settings-plan-export` |
| Reminders (API) | — | `27-reminders-api` |
| Invoice + partial pay | Payments | `28-invoice-partial-payment` |

**Roles (seed `seed-e2e-local.js`):** owner, receptionist, doctor, platform admin.

**Smoke tag (`@smoke`):** `01-auth`, `02-navigation`, `17-phase1` (core tabs), `22-settings-audit`.
