# Clinic ERP — Expo mobile

Connected **Today queue**, **reception check-in**, and **doctor consultation** against the same REST API as the CRM (`@clinic-erp/api-client`).

## Dev

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Metro
cd apps/mobile
EXPO_PUBLIC_CLINIC_API=http://127.0.0.1:3010 npm run start
```

Sign in with workspace `dentacare` and E2E users from `apps/api/scripts/seed-e2e-user.js`.

## Roles

| Role | Today |
|------|--------|
| Receptionist | Confirm → Check in (status transitions) |
| Doctor (linked profile) | **Consult** on arrived patients; save draft / finalize |
| Doctor without link | Consult UI blocked on finalize (API enforces) |

Default Today filter is **All** (no hidden scheduled patients).

## Checks

```bash
npm run typecheck --workspace=apps/mobile
npm test --workspace=apps/mobile
```

## Maestro (device/simulator)

Requires Expo Go + running Metro. Does **not** run in CI unless you execute Maestro locally:

```bash
maestro test apps/mobile/.maestro/login-smoke.yaml
```

Set `MAESTRO_CLINIC_EMAIL` / `MAESTRO_CLINIC_PASSWORD`.
