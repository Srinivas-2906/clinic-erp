# Development speed — focused tests and CI

Use the **smallest relevant check** while iterating; run **full CI** before merge (GitHub PR checks).

## Baseline (PR branch CI, Oct 2026)

| Run (approx.) | Duration | Notes |
|---------------|----------|--------|
| Full `CI` workflow | 21–38 min | 9 parallel jobs + Maestro emulator |
| Native Android Maestro | 13–20 min | Emulator boot + APK install + all flows |
| Android APK build | 8–15 min | prebuild + Gradle release |
| Playwright smoke + regression | ~8–12 min each | Separate jobs, each `npm ci` |

**Redundancy removed:** `push` to `feature/**` no longer runs a second copy of `CI` (only `pull_request` + `push` to `main`).

## Root commands

| Command | When |
|---------|------|
| `npm run test:api` | API changes |
| `npm run test:api -- --test-name-pattern='billing'` | Single API test name (Node test runner) |
| `npm run test:api:file -- apps/api/src/foo.test.js` | One API test file |
| `npm run test:crm` | CRM unit (Vitest) |
| `npm run test:crm:file -- src/lib/foo.test.ts` | One CRM unit file |
| `npm run typecheck:mobile` | Mobile TS only |
| `npm run test:mobile` | Mobile unit tests |
| `npm run test:e2e:smoke` | Desktop `@smoke` Playwright |
| `npm run test:e2e:spec -- apps/crm/e2e/login.spec.ts` | One Playwright file |
| `npm run verify:local:smoke` | API + CRM unit/build + smoke (no full regression) |
| `npm run verify:local:full` | Adds full Playwright desktop + mobile |

Env: `VERIFY_SKIP_NPM_CI=1` skips install in `verify-local.sh`.

## Android / Maestro (local)

Requires: emulator running (`adb devices`), optional `ANDROID_HOME`, Maestro CLI.

| Command | When |
|---------|------|
| `npm run android:apk` | Build release APK only (~Gradle; no Maestro) |
| `FORCE_ANDROID_APK_BUILD=1 npm run android:apk` | Force rebuild |
| `npm run maestro:login` | Login smoke only (reuse APK if present) |
| `MAESTRO_FLOWS=login-smoke.yaml npm run maestro:android` | One flow |
| `MAESTRO_FLOWS=login-smoke.yaml,reception-register.yaml npm run maestro:android` | Subset |
| `SKIP_APK_INSTALL=1 npm run maestro:login` | JS-only iteration, same installed APK |
| `npm run maestro:android:full` | Build APK + full Maestro suite |

API for Maestro: script starts API on `:3010` with `apps/api/data/e2e/clinic.db`.

## CI behavior

- **Pull request → `main`:** full required checks (unchanged job names for branch protection).
- **Push → `main`:** same workflow (post-merge verification).
- **Push → feature branch without PR:** no CI (open/update PR to run checks).
- **Concurrency:** newer run on same ref cancels in-progress run (`ci-${{ workflow }}-${{ ref }}`).

Gradle and Playwright browser caches are keyed on lockfiles to speed repeat runs.

## PR #47 Android login (evidence)

1. **Startup (c41bac5):** `expo.autolinking.exclude` included `expo-asset` while `Expo.fx` requires native `expo-asset` / `expo-constants` → JS never registered `main`; login never mounted.
2. **Fix (d99327e):** Link `expo-asset` + `expo-constants`; keep `expo-font` excluded (Gradle `pika-compiler` missing on CI).
3. **Maestro (d99327e CI):** App reached login UI; emulator **Settings ANR** dialog blocked `login-screen` visibility for Maestro (screenshot artifact).
4. **Mitigation (5f19257):** Dismiss ANR flow + emulator stabilize; logcat via `grep` (not `rg`) on failure.

Do not weaken Maestro assertions; fix startup or environment blockers.
