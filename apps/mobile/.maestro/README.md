# Maestro (native UI)

Requires [Maestro CLI](https://maestro.mobile.dev/) and a running Expo app on a **device or emulator**.

| Flow | Purpose |
|------|---------|
| `login-smoke.yaml` | Sign in, Today visible |
| `reception-book-tab.yaml` | Receptionist reaches Book tab |
| `reception-register.yaml` | Book tab patient registration fields |
| `reception-check-in.yaml` | Today queue check-in tap (optional, needs matching appointment) |
| `doctor-consult-smoke.yaml` | Optional Consult tap |

**Execution status:** Maestro is **not installed** in the CI/agent environment used for this work, and **no Android emulator/iOS simulator** was available (`maestro` not found; no device tests executed). Run locally:

```bash
cd apps/mobile
EXPO_PUBLIC_CLINIC_API=http://YOUR_LAN_IP:3010 npm run start
# separate terminal:
MAESTRO_CLINIC_EMAIL=e2e-receptionist@dentacare.in MAESTRO_CLINIC_PASSWORD=E2eTest@2026 maestro test .maestro/login-smoke.yaml
```

Do not report device E2E as passed unless the above completes successfully.
