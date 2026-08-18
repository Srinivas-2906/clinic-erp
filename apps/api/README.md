# Standalone backend for clinic-crm

Self-contained API for the dental clinic desk. **No dependency on botiq-whatsapp-server.**

## Quick start

```bash
# From repo root
npm install
cp apps/api/.env.example apps/api/.env
npm run dev:api
```

API runs at **http://localhost:3010**

## Start clinic desk

```bash
npm run dev:crm
```

Open **http://localhost:5185?tenant=dentacare**

## Demo login

| Email | Password |
|-------|----------|
| `ajitdentacare@gmail.com` | `Dentacare@123` |

## Test on phone (same Wi‑Fi)

1. Find Mac IP: `ipconfig getifaddr en0`
2. On phone open: `http://<mac-ip>:5185?tenant=dentacare`

Both **clinic-api** (3010) and **clinic-crm** (5185) must be running on your Mac.

## Data

SQLite database: `apps/api/data/clinic.db` (created on first run).

## Architecture

```
clinic-crm  →  /api/*  →  clinic-api (:3010 local, :8080 Cloud Run)
                          ├─ SQLite (patients, appointments, payments)
                          └─ Local file uploads (prescriptions)
```

No Firebase, no Kaana platform, no botiq-whatsapp-server.

WhatsApp booking sync is optional — run `botiq-whatsapp-server` separately only if needed.

## Public website booking (dentacare.kaana.in)

No auth required. Used by the marketing site contact form.

| Method | Path |
|--------|------|
| GET | `/api/platform/tenant/dentacare/booking/services` |
| GET | `/api/platform/tenant/dentacare/booking/slots?date=YYYY-MM-DD` |
| POST | `/api/platform/tenant/dentacare/booking` |

POST body: `{ name, phone, service, date, slot, notes? }` → creates appointment with `status: requested`, `source: Website`. Shows on CRM Today board in **Not confirmed**.

Local test (with `npm run dev` running):

```bash
curl -X POST http://localhost:3010/api/platform/tenant/dentacare/booking \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rahul","phone":"9876543210","service":"General Consultation","date":"2026-07-28","slot":"10 AM"}'
```
