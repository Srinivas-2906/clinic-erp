# Wave 1 — clinic operations (implementation notes)

Branch: `feature/wave1-clinic-operations` (integrates PR #22 + #23 commits; does not replace those PRs on GitHub until merged).

## Delivered in code

| Workstream | Backend | CRM UI |
|------------|---------|--------|
| Roles | `rolePolicy.js`, route guards, `/me` capabilities | `permissions.ts`, team role on approve |
| Billing | `patient_invoices`, line items, refunds, idempotency | API client; **invoice UI partial** |
| Settings | `GET/PATCH /clinic/settings` | `ClinicSettingsView`, Settings tab |
| Doctor config | (existing API) | `DoctorServicesEditor` |
| Staff onboarding | Invite email via `deliverStaffInviteEmail` | Role select + copy link fallback |
| Ops | Restore runbook + email (from cherry-picks) | — |

## External config still required (not verified here)

- Staging Resend/SMTP for password reset and staff invites (`29_STAGING_PASSWORD_RESET_EMAIL.md`)
- Attachment restore drill (`28` §8.1)

## SaaS Wave 2 foundations (unchanged billing provider)

- Entitlements and subscription gates reused; no Razorpay in Wave 1.
