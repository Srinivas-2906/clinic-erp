# Commercial SaaS + owner operations (milestone)

Status: implemented on branch `feature/commercial-saas-owner-operations` (sandbox billing only).

## Scope delivered

- **Subscription domain**: `subscription_events`, state transitions via `transitionTenantSubscription`, checkout idempotency, cancel endpoint, platform-admin overrides with audit + event history.
- **Payment gateway**: `razorpay_sandbox` mode — checkout session records in `billing_transactions`; activation only via HMAC-verified webhooks (`CLINIC_RAZORPAY_WEBHOOK_SECRET`). Live `razorpay` keys are not used in CI.
- **Owner CRM**: Settings → Plan & subscription (plans, checkout, transactions, events, cancel, failed-payment messaging).
- **Platform admin**: Subscription event + billing transaction inspection on tenant detail.
- **Owner reporting**: `GET /clinic/report` includes `opsSummary` (appointments breakdown, finalized consultations, follow-ups, doctor workload).
- **Tests**: `subscriptionBilling.test.js`, `billingWebhook.routes.test.js`, HTTP billing guards, E2E `40-owner-subscription-sandbox.spec.ts`.

## Environment

```bash
CLINIC_PAYMENT_GATEWAY=razorpay_sandbox
CLINIC_RAZORPAY_WEBHOOK_SECRET=...
```

See `apps/api/.env.example`.

## Not in this milestone

- Live Razorpay API checkout UI (requires approved live credentials).
- Patient invoice online collect (still stubbed for sandbox).
- Staging/production deploy or live reminder delivery.

## Related specs

- `docs/modernization/32_COMMERCIAL_SAAS_V1.md` — product baseline
- Pilot ops: `docs/modernization/43_PILOT_ENV_AND_RECOVERY.md`
