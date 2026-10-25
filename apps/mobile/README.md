# Clinic ERP — Expo mobile (foundation)

Scaffold only: login, tenant context, Today list via shared `@clinic-erp/api-client`.

## Dev

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Metro
cd apps/mobile && npm install && EXPO_PUBLIC_CLINIC_API=http://YOUR_LAN_IP:3010 npm start
```

Use EAS when ready (`eas.json` not committed — follow Influmojo-style project init without copying credentials).
