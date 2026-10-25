# PR #12 critical review + cross-platform parity

**Reviewed:** `feature/market-entry-batch1-2` (PR [#12](https://github.com/Srinivas-2906/clinic-erp/pull/12)) + follow-up fixes on `feature/web-pilot-mobile-foundation`.

## PR #12 — findings (pre-merge)

| Area | Severity | Finding | Resolution |
|------|----------|---------|------------|
| Finalize + PDF | **High** | DB finalized before PDF; PDF failure left inconsistent Rx | Generate PDF **before** txn; store key in same transaction |
| PDF access | **Medium** | PDF endpoint ignored draft state | Require `status === finalized` |
| Follow-up | **Medium** | Duplicate follow-ups/reminders on retry | Idempotent on `(encounter_id, due_date)` |
| Draft edit RBAC | **Medium** | Owner bypass on clinician-only edits | Removed; clinical fields require clinician link |
| Tenant isolation | **Low** | List encounters without patient check | Return `[]` if patient not in tenant |
| Reception drafts | **Low** | All PATCH required clinician | Non-clinical draft fields can be relaxed later |
| Staging QA | **Ops** | Owner not linked to `doctors.user_id` | Manual link or seed script (not verified on staging) |
| E2E | **Gap** | No full clinical Playwright | Added `19-clinical-consultation.spec.ts` (local API required) |

**Verified in repo tests:** API **69+** after fixes (run locally). **Staging not verified** in this pass.

## Feature parity matrix

| Feature | Web desktop | Mobile browser | Android (Expo) | iOS (Expo) |
|---------|-------------|----------------|----------------|------------|
| Login / tenant | Implemented & tested (unit/e2e partial) | Implemented (responsive CSS) | Implemented (foundation) | Implemented (foundation) |
| Today / queue | Implemented & tested | Implemented (unverified) | Today list only | Today list only |
| Book / patients | Implemented & tested | Implemented (unverified) | Planned | Planned |
| Consultation / Rx / PDF | Implemented; e2e **local** | Implemented (unverified) | Deferred | Deferred |
| Payments / receipts | Implemented & tested | Implemented (unverified) | Deferred | Deferred |
| Allergies | API + partial UI | Partial UI | Deferred | Deferred |
| Amendments | API only | — | Deferred | Deferred |
| Push / offline | — | — | Deferred | Deferred |

Legend: **Implemented and tested** = automated test evidence. **Unverified** = code exists, no staging/browser proof this session.

## Shared packages

| Package | Purpose |
|---------|---------|
| `@clinic-erp/contracts` | Types, error parsing, Rx validation helpers |
| `@clinic-erp/api-client` | Auth transport + fetch wrapper (mobile uses; web CRM gradual) |
| `@clinic-erp/design-tokens` | Colors/spacing/type (mobile uses; web CSS source of truth remains `styles.css`) |

## Next highest value

1. Merge PR #12 + pilot PR after CI green.
2. Link staging demo owner → doctor; run `staging-validate.mjs` + Playwright 19 locally.
3. Batch 3: deep links, password recovery, reception polish, amendment UI.
4. EAS init (empty project id) when native device testing starts.
