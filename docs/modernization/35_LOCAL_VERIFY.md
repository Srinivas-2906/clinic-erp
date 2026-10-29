# Local-first verification (primary dev gate)

Staging GCP billing/IAM is **not** required for day-to-day development. Use isolated SQLite + Playwright.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev:api` / `npm run dev:crm` | Manual dev (default `apps/api/data/clinic.db`) |
| `npm run test:api` | API unit/integration tests (temp DBs) |
| `npm run seed:e2e:local` | Role fixtures on current `DATABASE_PATH` |
| `npm run test:e2e:smoke` | Fast `@smoke` Playwright (desktop) |
| `npm run test:e2e:full` | Full local Playwright (desktop + mobile projects) |
| `npm run verify:local` | Reset e2e DB → API tests → CRM build → smoke E2E |
| `npm run verify:local:full` | Same + full Playwright |

E2E uses **`apps/api/data/e2e/clinic.db`** (gitignored under `apps/api/data/`). Your normal dev database is untouched.

**Guards:** `assert-e2e-safe-env.js` blocks seed/reset on `data/clinic.db` or production GCP. `GET /api/health` returns `e2e: true` and `dbFingerprint: e2e/clinic.db` when `CLINIC_E2E_MODE=1`. Setting `E2E_REUSE_SERVERS=1` without that fingerprint aborts the run.

**Guards:** `assert-e2e-safe-env.js` blocks seed/reset on `data/clinic.db` or production GCP. With `E2E_REUSE_SERVERS=1`, global setup requires `/api/health` to report `e2e: true` and `dbFingerprint` containing `e2e/`.

## Credentials (local E2E only)

| Role | Email | Password |
|------|-------|----------|
| Owner | `e2e-owner@dentacare.in` | `E2eTest@2026` |
| Receptionist | `e2e-receptionist@dentacare.in` | same |
| Doctor | `e2e-doctor@dentacare.in` | same |
| Platform | `e2e-platform@clinic-erp.invalid` | same |

Tenant slug: `dentacare` → http://localhost:5185?tenant=dentacare

## CI

Pull requests: API tests, CRM unit tests, build, **Playwright smoke** (no GCP).

Cloud/staging workflows remain separate (`staging-ops`, `staging-e2e`).

## Mobile (Maestro)

See `apps/mobile/.maestro/README.md` — flows run against local API when Metro + emulator are available.
