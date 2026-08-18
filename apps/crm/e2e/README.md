# Clinic Desk E2E Tests (Playwright)

Automated end-to-end tests for **clinic-crm** + **clinic-api**.

## Test credentials

| Field | Value |
|-------|-------|
| Email | `e2e-owner@dentacare.in` |
| Password | `E2eTest@2026` |
| Tenant | `dentacare` |
| URL | http://localhost:5185?tenant=dentacare |

Seed (runs automatically before tests):

```bash
cd ../clinic-api && npm run seed:e2e
```

## Run tests

```bash
# Terminal 1 — API (or let Playwright start both)
cd ../clinic-api && npm run dev

# Terminal 2 — install + run
npm install
npx playwright install chromium
npm run test:e2e
```

### Interactive modes

```bash
npm run test:e2e:ui       # Playwright UI — pick tests, step through in the panel
npm run test:e2e:visual   # Opens Chrome and runs all tests automatically (slowMo + video)
npm run test:e2e:headed   # Visible browser window (both desktop + mobile projects)
npm run test:e2e:debug    # Inspector / pause on each action
```

Visual run uses the `chrome-visual` project (real Chrome, headed, ~300ms slowMo). Override speed:

```bash
E2E_SLOW_MO=500 npm run test:e2e:visual
```

## Screenshots

Step screenshots are saved to **`e2e/screenshots/`** during tests (timestamped PNGs + `index.json`).

## Test coverage

| Spec | Covers |
|------|--------|
| `01-auth` | Login, invalid creds, access request form |
| `02-navigation` | All main tabs |
| `03-overview` | Home dashboard, search |
| `04-today` | Board/list, filters, refresh |
| `05-patients` | List, create patient, detail |
| `06-book` | Walk-in + scheduled booking |
| `07-payments` | Summary, record payment |
| `08-reports` | Load date-range report |
| `09-team` | Access request approve flow |
| `10-patient-detail` | Notes, visit history |
| `11-api-public-booking` | Public booking API |
| `12-logout` | Sign out |
| `13-doctors` | Doctor CRUD, schedule, time off |
| `14-multi-doctor-slots` | Doctor-scoped slot API (no cross-block) |
| `15-multi-doctor-book` | Multi-doctor booking UI |
| `16-doctor-filter` | Doctor filter chips on Home/Today |
| `17-phase1-regression` | End-to-end Phase 1 smoke |
| `18-api-phase1` | Phase 1 API regression (slots, timeline, tenant) |

## Phase 1 verification

```bash
# API unit tests (19+ tests)
cd ../clinic-api && npm test

# Frontend build
npm run build

# Full E2E (starts API + CRM, seeds E2E user)
npx playwright install chromium
npm run test:e2e
```

## Playwright MCP

See `mcp-server/README.md` — Cursor MCP tools for capture + test runs.
