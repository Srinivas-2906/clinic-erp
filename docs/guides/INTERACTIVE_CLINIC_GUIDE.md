# Interactive clinic guide (CRM)

Role-based guided journeys with spotlight tooltips, demonstration mode, and persistent progress (`clinic-guide:v*` keys scoped by tenant, user, role, and tour version).

## Why the setup checklist disappeared

The owner **setup checklist** (`ClinicOnboardingChecklist`) is shown only on **Home / Today** for owners until API steps are complete. **Dismiss** stored a single global `pilot-setup-dismissed` flag (not per tenant), so it could vanish for all clinics. Dismiss now uses `pilot-setup-dismissed:{tenant}`. Restore via **Help & guides → Show owner setup checklist again**.

## Chapters

| Chapter | Roles |
|--------|--------|
| Owner: clinic setup | owner |
| Reception: front desk day | receptionist, owner |
| Doctor: clinical queue | doctor, owner |
| How roles hand off | all clinic roles |

## Tests

- Vitest: `apps/crm/src/guides/*.test.ts`
- Playwright: `apps/crm/e2e/tests/44-interactive-clinic-guide.spec.ts` (run with local webServer; unset `E2E_STAGING`)

## Screenshots (local QA)

Capture with Playwright after `npm run dev` + API:

```bash
cd apps/crm
env -u E2E_STAGING npx playwright test e2e/tests/44-interactive-clinic-guide.spec.ts --project=chromium-desktop --grep welcome
```

Artifacts: `apps/crm/e2e/screenshots/` (when visual project is used) or failure screenshots under `e2e/test-results/`.
