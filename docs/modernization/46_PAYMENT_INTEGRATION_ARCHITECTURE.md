# Payment integration architecture (Razorpay)

**Decision:** Clinic ERP SaaS billing uses the **Razorpay Subscriptions API** for recurring plans. The **Orders API alone** is insufficient because it models one-time payments without renewal, halt, or subscription lifecycle webhooks.

## Model

| Layer | Responsibility |
|-------|----------------|
| `billing_provider_subscriptions` | Maps tenant ↔ Razorpay subscription id, period end, provider status |
| `billing_transactions` | Each charge attempt (initial + renewals) with amount/currency |
| `subscription_events` | Audit trail of status/plan changes |
| `billing_webhook_events` | Idempotent webhook ingest |
| `billing_reconciliation_runs` / `billing_discrepancies` | Provider vs local comparison |

## Checkout flow (test mode)

1. Owner selects plan → `createSubscriptionCheckout`.
2. If `razorpay_sandbox`: local order id (CI, no network).
3. If `razorpay` + `rzp_test_*`: `POST /v1/subscriptions` with mapped `plan_id`.
4. CRM receives `subscriptionId`, optional `shortUrl`, `keyId` for Razorpay Checkout.
5. **No entitlement activation** until webhook confirms `subscription.activated` or `subscription.charged` / `payment.captured` with validated amount.

## Webhooks

Handled events (normalized):

- `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`
- `payment.captured`, `payment.failed` (linked via subscription or order notes)

Out-of-order: transaction row status gates transitions; discrepancies recorded instead of silent overwrite.

## Cancellation

Owner cancel → local `canceled` + optional `POST /v1/subscriptions/:id/cancel` when provider id exists.

## Reconciliation

Scheduled/internal job compares pending transactions, provider subscription status (mock or API), and tenant `subscription_status`. Never auto-grants paid entitlements on ambiguous diff.

## CI vs provider test mode

| Environment | Behavior |
|-------------|----------|
| `CLINIC_RAZORPAY_MOCK=1` | Deterministic mock client (default in CI) |
| `CLINIC_PAYMENT_GATEWAY=razorpay_sandbox` | Simulated orders + signed webhooks |
| `CLINIC_PAYMENT_GATEWAY=razorpay` + `rzp_test_*` | Real test API (requires credentials; run `scripts/verify-razorpay-test.mjs`) |
| Live keys | Blocked unless `CLINIC_PAYMENT_LIVE_ENABLED=1` (not used in this milestone) |

## Tradeoffs

- **Subscriptions API:** Correct renewals; requires Razorpay plan ids per SKU (env-mapped).
- **Orders-only:** Simpler but wrong for SaaS renewals — rejected.
- **Mock in CI:** No flaky network; provider semantics tested via fixture payloads.
