# Clinic ERP — Expo mobile

Connected **Today queue**, **reception**, **doctor consultation**, and **billing** against the same REST API as the CRM (`@clinic-erp/api-client`).

## Dev

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Metro
cd apps/mobile
EXPO_PUBLIC_CLINIC_API=http://127.0.0.1:3010 npm run start
```

Sign in with workspace `dentacare` and E2E users from `apps/api/scripts/seed-e2e-local.js`.

## Roles

| Role | Today | Patients | Book | Payments |
|------|--------|----------|------|----------|
| Receptionist / owner | Queue actions | Search, detail | Register, book | Invoices, record payment |
| Doctor (linked) | **Consult** | Read-only | — | — |

## Billing (native V1)

**Payments** tab (owner/receptionist only): list due invoices, create invoice with line items (optional catalog chips), open detail, record partial/full payment, void (owner only, no payments applied). Uses server totals and idempotent payment keys — no auto-invoice on consult finalize.

## Android Maestro (pre-launch)

Not a PR merge blocker. Run manually in CI (**Android Maestro verify (manual)**) or locally:

```bash
npm run maestro:login          # single flow
npm run maestro:android:full # build APK + full suite
```

See `.maestro/README.md` and `docs/modernization/37_WEB_FIRST_STRATEGY.md`.

## Checks

```bash
npm run typecheck --workspace=apps/mobile
npm test --workspace=apps/mobile
```
