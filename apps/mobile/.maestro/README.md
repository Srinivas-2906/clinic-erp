# Maestro (native UI)

Requires [Maestro CLI](https://maestro.mobile.dev/) and a **release/debug APK** or emulator run (see `scripts/run-android-maestro.sh`).

| Flow | Purpose |
|------|---------|
| `config.yaml` | App id `in.kaana.clinicerp` |
| `login-smoke.yaml` | Sign in → Today |
| `reception-book-tab.yaml` | Book tab |
| `reception-register.yaml` | Register patient on Book tab |
| `reception-check-in.yaml` | Optional Today check-in (data-dependent) |
| `doctor-consult-smoke.yaml` | Doctor opens seeded consult (`appt-maestro-consult`) |
| `billing-smoke.yaml` | Create invoice + pay full (receptionist) |

## CI

GitHub Actions job **Native Android Maestro** runs `apps/mobile/scripts/run-android-maestro.sh` on an API 30 x86_64 emulator with isolated `apps/api/data/e2e/clinic.db`.

## Local

```bash
# Terminal 1 — API + E2E seed (from repo root)
export DATABASE_PATH=apps/api/data/e2e/clinic.db
node apps/api/scripts/seed-e2e-local.js
node apps/api/scripts/seed-maestro-mobile.js
npm run start --workspace=apps/api

# Terminal 2 — emulator + script (needs Android SDK + adb)
export EXPO_PUBLIC_CLINIC_API=http://10.0.2.2:3010
bash apps/mobile/scripts/run-android-maestro.sh
```

Env: `MAESTRO_CLINIC_EMAIL`, `MAESTRO_CLINIC_PASSWORD`, `MAESTRO_CLINIC_TENANT` (default `dentacare`).

Do not report device E2E as passed unless Maestro completes successfully on an emulator or device.
