# Clinic desk (frontend)

Standalone dental clinic CRM. Pairs with **`clinic-api`** — no botiq, Firebase, or Kaana platform required.

## Local dev

```bash
# From repo root — Terminal 1
npm run dev:api

# Terminal 2
npm run dev:crm
```

Open **http://localhost:5185?tenant=dentacare**

## Phone testing (same Wi‑Fi)

```text
http://<your-mac-ip>:5185?tenant=dentacare
```

Both `clinic-api` (:3010) and this app (:5185) must be running on your Mac.

## Demo login

| Email | Password |
|-------|----------|
| `ajitdentacare@gmail.com` | `Dentacare@123` |

## Deploy

See repo root [cloudbuild.yaml](../../cloudbuild.yaml) — deploys **apps/api** + **apps/crm** as separate Cloud Run services.
