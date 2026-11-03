# Payment integration + revenue operations

Branch: `feature/payment-integration-revenue-ops`

## Implemented (code)

| Area | Status |
|------|--------|
| Razorpay Subscriptions API adapter (mock + test keys) | Implemented |
| Simulated `razorpay_sandbox` (CI) | Unchanged |
| Webhook subscription entity handling | Implemented |
| Reconciliation dry-run + discrepancy records | Implemented |
| Trial/grace lifecycle job | Implemented |
| Subscription billing emails (deduped) | Implemented |
| Owner billing diagnostics API | Implemented |
| Platform internal reconcile/lifecycle routes | Implemented |

## Verified in CI

- API unit tests with `CLINIC_RAZORPAY_MOCK=1` / sandbox fixtures

## Provider test-mode verification

Run manually when `rzp_test_*` credentials and dashboard plan ids exist:

```bash
export CLINIC_PAYMENT_GATEWAY=razorpay
export CLINIC_RAZORPAY_KEY_ID=rzp_test_...
export CLINIC_RAZORPAY_KEY_SECRET=...
export CLINIC_RAZORPAY_PLAN_PROFESSIONAL=plan_...
node apps/api/scripts/verify-razorpay-test.mjs
```

**Not verified in this environment** without user-supplied Razorpay test credentials.

## Staging / production

- **Not deployed**
- Live payments blocked unless `CLINIC_PAYMENT_LIVE_ENABLED=1` (explicit approval required)

## Failure recovery

1. Inspect `billing_discrepancies` via `GET /api/platform/internal/billing/discrepancies`
2. Re-run `POST /api/platform/internal/reconcile-billing` with `dryRun: false` after human review
3. Replay missed webhooks from Razorpay dashboard (do not trust client-side payment success)

See also `46_PAYMENT_INTEGRATION_ARCHITECTURE.md`.
