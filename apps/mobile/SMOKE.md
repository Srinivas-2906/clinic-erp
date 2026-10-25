# Mobile (Expo) smoke test

Minimal manual smoke — not store submission or full EMR.

## Prerequisites

- Node 20+
- From repo root: `npm install`
- API running: `npm run dev:api` (port 3010)
- E2E tenant seeded: `npm run seed:e2e`

## Run

```bash
cd apps/mobile
EXPO_PUBLIC_CLINIC_API=http://127.0.0.1:3010 npm run start
```

1. Sign in with workspace `dentacare` and E2E credentials (`e2e-owner@dentacare.in` / see `apps/api/scripts/seed-e2e-user.js`).
2. Confirm **Today** lists appointments (or empty state without crash).
3. Open **Patients**, search, open a patient card.
4. Logout and confirm session clears (SecureStore).

## Automated (optional)

```bash
npx expo-doctor
```

Fix any dependency skew reported before upgrading Expo SDK.
