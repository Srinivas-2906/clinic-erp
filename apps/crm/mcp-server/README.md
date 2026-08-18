# Clinic Desk Playwright MCP Server

MCP server for **screenshots**, **E2E test runs**, and **app catalog** for Clinic Desk.

## Tools

| Tool | Description |
|------|-------------|
| `clinic_get_catalog` | Features, screens, E2E credentials |
| `clinic_list_screens` | Capturable routes |
| `clinic_get_test_credentials` | E2E login details |
| `clinic_capture_screenshots` | Playwright PNG capture (set `headed: true` to watch) |
| `clinic_run_e2e_tests` | Run full suite (`ui: true` for interactive) |
| `clinic_get_features` | Product capabilities |

## Setup

```bash
cd clinic-crm/mcp-server
npm install
npx playwright install chromium
cd ../clinic-api && npm run seed:e2e
```

Start both apps (or let Playwright webServer handle it):

```bash
cd clinic-api && npm run dev   # :3010
cd clinic-crm && npm run dev     # :5185
```

## Cursor MCP config

Add to `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "clinic-desk": {
      "command": "node",
      "args": ["/Users/srinivas/Downloads/Demos/clinic-crm/mcp-server/src/index.js"],
      "env": {
        "CLINIC_BASE_URL": "http://localhost:5185",
        "CLINIC_SCREENSHOT_DIR": "/Users/srinivas/Downloads/Demos/clinic-crm/e2e/screenshots",
        "CLINIC_E2E_EMAIL": "e2e-owner@dentacare.in",
        "CLINIC_E2E_PASSWORD": "E2eTest@2026",
        "CLINIC_TENANT": "dentacare"
      }
    }
  }
}
```

Restart Cursor after adding.

## CLI

```bash
npm run capture                    # all screens → e2e/screenshots
npm run capture --headed login     # interactive single screen
npm run test:ui                    # Playwright UI
npm run test:headed                # visible browser tests
```

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `CLINIC_BASE_URL` | `http://localhost:5185` | CRM URL |
| `CLINIC_SCREENSHOT_DIR` | `./screenshots` | PNG output |
| `CLINIC_E2E_EMAIL` | `e2e-owner@dentacare.in` | Test login |
| `CLINIC_E2E_PASSWORD` | `E2eTest@2026` | Test password |
| `CLINIC_HEADED` | `0` | Show browser during capture |
| `CLINIC_SLOW_MO` | `0` | Slow motion ms |
