# Commercial SaaS V1 (stacked on Wave 1 / PR #24)

Branch: `feature/commercial-saas-v1` → base PR: `feature/wave1-clinic-operations` (not `main`).

## Product surfaces

| Surface | URL / entry | Auth |
|--------|-------------|------|
| Platform admin | CRM `/platform` | JWT via `POST /api/platform/login`; user must have `is_platform_admin=1` |
| Owner self-service | CRM Settings → Plan & usage | Clinic owner JWT + tenant context |
| Reminder processing | `POST /api/platform/internal/process-reminders` | Provisioning secret (`requireProvisioningAuth`) |

## Platform admin (dev)

Seed a platform operator (no tenant):

```sql
INSERT INTO users (id, tenant_id, email, password_hash, name, role, is_platform_admin)
VALUES ('plat-admin', NULL, 'platform-admin@example.invalid', '<bcrypt>', 'Platform Admin', 'owner', 1);
```

Use email login at `/platform` (no clinic slug). Clinic users receive **403** on `/api/platform/admin/*` even if they guess URLs.

## Owner export

`GET /api/clinic/export` (owner, tenant-scoped). CRM downloads JSON via Settings → **Download clinic data export**.

## Reminders & automation

- In-process poller is **disabled** when `REMINDER_EXTERNAL_SCHEDULER=1` or `DISABLE_REMINDER_WORKER=1`.
- Cloud Scheduler (staging/prod): HTTP POST to `/api/platform/internal/process-reminders` with provisioning auth header; body `{ "limit": 50 }`.
- Real email/SMS: only when `REMINDER_DELIVERY_ENABLED=1` and provider env is configured; default is mock/console.
- Job kinds: appointment reminder/confirmation, payment receipt, outstanding invoice digest, subscription expiry notice, daily ops summary (owner inbox when email present).

## Decisions requiring approval

- Enabling `REMINDER_DELIVERY_ENABLED` against real recipients.
- Paid Cloud Scheduler / SMS / email provider activation.
- Payment gateway credentials (Razorpay/etc.).

## After PR #24 merges

Rebase `feature/commercial-saas-v1` onto updated `main` (or retarget stacked PR) before merge to `main`.
