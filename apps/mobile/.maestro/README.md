# Maestro (mobile E2E foundation)

Requires [Maestro CLI](https://maestro.mobile.dev/) and a running Expo app + local API.

```bash
# Terminal 1
npm run dev:api

# Terminal 2
cd apps/mobile && EXPO_PUBLIC_CLINIC_API=http://localhost:3010 npm start

# Terminal 3 (simulator/emulator must show the app)
export MAESTRO_CLINIC_EMAIL=e2e-owner@dentacare.in
export MAESTRO_CLINIC_PASSWORD=E2eTest@2026
maestro test .maestro/login-smoke.yaml
```

**Limitation:** This repo’s Expo scaffold is minimal; selectors may need tuning once login UI stabilizes. CI does not run Maestro yet (no emulator in default GitHub runners).
