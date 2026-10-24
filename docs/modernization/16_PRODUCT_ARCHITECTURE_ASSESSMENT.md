# Clinic ERP — Comprehensive product & architecture assessment

**Date:** 2026-10-24 (updated 2026-10-25)  
**Repository:** [Srinivas-2906/clinic-erp](https://github.com/Srinivas-2906/clinic-erp) @ `main` (includes M8 Batch 1, PR #10)

> **Hosting supersession (2026-10-25):** Neon/Railway/Cloudflare as **primary target** in §1 and §6 below is **withdrawn**. **Authoritative GCP-first strategy:** [`17_GCP_FIRST_PLATFORM_STRATEGY.md`](17_GCP_FIRST_PLATFORM_STRATEGY.md) and linked docs `18`–`24`. Keep this file for initial competitive/technical inventory; do not provision alternate clouds per §17.  
**Staging (verified live):** CRM `https://kaana-clinic-staging-ofczrxs2ca-el.a.run.app` · API `https://clinic-api-staging-ofczrxs2ca-el.a.run.app`  
**Production:** `crucial-accord-505607-g9` — **out of scope** for this assessment’s changes.

**Method:** Repository inspection, staging browser verification (login + `/signup`), existing modernization docs, official vendor pricing pages (Oct 2026). No production access, no migrations, no new infrastructure.

---

## 1. Executive decision summary

| # | Topic | Recommendation | Confidence | Action now |
|---|--------|----------------|------------|------------|
| 1 | **Frontend** | **KEEP** React 19 + Vite + custom CSS tokens; incremental UX polish, optional component library later | High | No framework rewrite |
| 2 | **Backend** | **KEEP** Express (ESM); add repository boundary + OpenAPI before DB swap | High | Refactor in place |
| 3 | **Database (target)** | **Neon PostgreSQL** (shared DB, strong `tenant_id` + eventual RLS) for commercial multi-tenant SaaS | Medium–High | **No migration yet** — spike + parity tests |
| 4 | **Database (current)** | **KEEP** SQLite + Litestream on GCP until migration milestone | High | Staging/prod pattern unchanged short term |
| 5 | **Hosting (target)** | **Cloudflare Pages** (CRM static) + **Railway** (API container) + **Neon** (DB) + **R2** (files) | Medium | Plan account cutover; keep GCP staging until ready |
| 6 | **Hosting (current)** | **KEEP** GCP Cloud Run staging; production stays on legacy GCP until approved cutover | High | Continue `deploy-staging` CI |
| 7 | **Object storage** | **IMPROVE** abstraction (`uploadStorage.js`); target **R2** (zero egress) or stay GCS on GCP | High | Env-driven backend already exists |
| 8 | **Background jobs** | **REPLACE** in-process `setInterval` reminder worker with **queue/cron** (Railway cron → internal API, or Cloudflare Cron Triggers) | Medium | Design before SMS go-live |
| 9 | **Native apps** | **Expo (React Native)** new app; **shared API contracts** (OpenAPI + generated types); not a WebView shell | Medium–High | New repo or `apps/mobile` after API contract freeze |
| 10 | **Authentication** | **KEEP** email/password + JWT + invite tokens; **IMPROVE** refresh tokens, password reset, session revocation | High | Defer external IdP (Neon Auth/Clerk) until needed |
| 11 | **Tenant isolation** | **KEEP** app-level `tenant_id`; **IMPROVE** with Postgres RLS + integration tests at migration | High | Add cross-tenant tests continuously |
| 12 | **Subscriptions** | **KEEP** M8 plan + subscription states; Razorpay **sandbox only** after explicit approval | High | No live payments |

**Strategic shift from M7 doc:** SQLite + Litestream remains valid for **single-deployment / early demos**, but **affordable managed Postgres (Neon) + portable hosting (Railway + Cloudflare)** is the better **long-term commercial default** for many clinics on one platform—aligned with your Aqua Care direction. Do **not** auto-merge the external `kaana-clinic` Drizzle tree; use it as a **reference spike** only ([`docs/LOCAL_WORKSPACE.md`](../LOCAL_WORKSPACE.md), [`09_M6_PRODUCT_AUDIT.md`](09_M6_PRODUCT_AUDIT.md)).

---

## 2. Current technical architecture (evidence)

### 2.1 Monorepo layout

| Path | Role |
|------|------|
| [`apps/api`](../apps/api) | Node 20 Express API, `better-sqlite3`, JWT auth |
| [`apps/crm`](../apps/crm) | React 19 SPA (Vite 8), desk CRM |
| [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) | API tests, CRM unit tests, CRM build, Docker smoke |
| [`.github/workflows/deploy-staging.yml`](../../.github/workflows/deploy-staging.yml) | WIF → Cloud Build → Cloud Run |
| [`cloudbuild.staging.yaml`](../../cloudbuild.staging.yaml) | API + CRM images, env, secrets |

### 2.2 Frontend stack — **KEEP / IMPROVE**

| Area | Evidence | Verdict |
|------|----------|---------|
| Framework | React **19.2.6**, [`apps/crm/package.json`](../../apps/crm/package.json) | **KEEP** |
| Build | Vite **8**, `tsc -b` then `vite build` | **KEEP** |
| Routing | Tab state in [`apps/crm/src/App.tsx`](../../apps/crm/src/App.tsx) (`TabId`), not React Router | **IMPROVE** (deep links, `/signup` only special-cased) |
| State | Mostly React `useState` + hooks; TanStack Query in [`useTodayData.ts`](../../apps/crm/src/hooks/useTodayData.ts), [`useDoctors.ts`](../../apps/crm/src/hooks/useDoctors.ts) only | **IMPROVE** (consistent Query for all server state) |
| Forms | Ad-hoc controlled inputs in dialogs | **IMPROVE** (validation helpers; optional RHF later) |
| UI library | **None** — Lucide icons + custom CSS | **KEEP** (lightweight; add primitives selectively) |
| Styling | [`apps/crm/src/styles.css`](../../apps/crm/src/styles.css) — Inter, CSS variables, mobile-first | **KEEP** |
| API client | [`apps/crm/src/lib/api.ts`](../../apps/crm/src/lib/api.ts) — `fetch` + bearer token | **IMPROVE** (OpenAPI-generated client) |
| Auth UI | [`LoginGate.tsx`](../../apps/crm/src/components/LoginGate.tsx), [`SignupWizard.tsx`](../../apps/crm/src/components/SignupWizard.tsx) | **IMPROVE** (post-login routing, error UX) |
| E2E | Playwright **18** specs under [`apps/crm/e2e/tests/`](../../apps/crm/e2e/tests/) | **KEEP** / extend |
| Unit tests | Vitest — libs + few components | **IMPROVE** coverage on wizard & payments |

### 2.3 Backend stack — **KEEP / IMPROVE**

| Area | Evidence | Verdict |
|------|----------|---------|
| Runtime | Node 20, `"type": "module"` | **KEEP** |
| HTTP | Express **4.21** [`apps/api/src/index.js`](../../apps/api/src/index.js) | **KEEP** |
| DB | `better-sqlite3`, schema in [`apps/api/src/db/index.js`](../../apps/api/src/db/index.js) — **no ORM**, inline SQL | **IMPROVE** → repository layer; **TARGET** Drizzle + Postgres |
| Migrations | `CREATE TABLE IF NOT EXISTS` + ad-hoc `ALTER` | **REPLACE** at PG cutover with versioned migrations |
| Auth | [`apps/api/src/middleware/auth.js`](../../apps/api/src/middleware/auth.js) — bcrypt + JWT | **KEEP** / extend refresh + reset |
| Tenancy | [`tenantContext.js`](../../apps/api/src/tenantContext.js), `tenant_id` on rows | **KEEP** |
| Plans / subs | [`plans.js`](../../apps/api/src/modules/identity/plans.js), [`subscription.js`](../../apps/api/src/modules/identity/subscription.js), [`entitlements.js`](../../apps/api/src/modules/identity/entitlements.js) | **KEEP** |
| Provisioning | [`tenantProvisioning.js`](../../apps/api/src/services/tenantProvisioning.js) | **KEEP** |
| Audit | [`clinicAudit.js`](../../apps/api/src/services/clinicAudit.js) + CRM [`AuditView.tsx`](../../apps/crm/src/components/AuditView.tsx) | **KEEP** |
| Reminders | [`reminders/index.js`](../../apps/api/src/services/reminders/index.js) + in-process poll in `index.js` | **IMPROVE** → external worker |
| Files | GCS or memory [`uploadStorage.js`](../../apps/api/src/services/uploadStorage.js), [`config/clinicFiles.js`](../../apps/api/src/config/clinicFiles.js) | **KEEP** abstraction |
| Rate limits | [`utils/rateLimiter.js`](../../apps/api/src/utils/rateLimiter.js) — in-memory | **IMPROVE** for multi-instance (Redis or edge) |
| Tests | `node --test` — **67** tests (incl. M8 provisioning) | **KEEP** |

### 2.4 Deployment (current GCP)

| Component | Staging | Production (Denta Care) |
|-----------|---------|-------------------------|
| API | `clinic-api-staging` Cloud Run, Litestream in [`apps/api/Dockerfile`](../../apps/api/Dockerfile) | `clinic-api` — **do not modify** |
| CRM | `kaana-clinic-staging` — nginx static + proxy env | `kaana-clinic` |
| DB | SQLite `/data/clinic.db` + GCS Litestream | Same pattern |
| CI/CD | GitHub Actions + Cloud Build | Separate legacy pipeline |

See [`08_M5_STAGING_LIVE.md`](08_M5_STAGING_LIVE.md), [`14_M7_DELIVERY.md`](14_M7_DELIVERY.md).

### 2.5 External Postgres experiment — **INVESTIGATE ONLY**

- Documented location: `/Users/srinivas/Downloads/kaana-clinic` ([`docs/LOCAL_WORKSPACE.md`](../LOCAL_WORKSPACE.md)) — Drizzle, dual repos, parity tests.  
- **Not in canonical repo.** Do not merge without parity gate ([`13_M7_DATABASE_DECISION.md`](13_M7_DATABASE_DECISION.md)).

---

## 3. Frontend / UI–UX audit

### 3.1 Screen inventory (web CRM)

| Screen / flow | Route / entry | Primary files | Staging verified |
|---------------|---------------|---------------|------------------|
| Login | `?tenant={slug}` | `LoginGate.tsx` | **Yes** — dentacare login card, “Start a new clinic workspace” link |
| Signup wizard | `/signup` | `SignupWizard.tsx` | **Yes** — Step 1 clinic name + workspace URL, debounced slug hint |
| Set password | `?set-password=` | `SetPasswordScreen.tsx` | Not re-tested this session |
| Home | Tab `overview` | `OverviewTab.tsx` | **INFERRED** (e2e `03-overview.spec.ts`) |
| Schedule / Today | Tab `today` | `TodayView.tsx` | INFERRED (`04-today.spec.ts`) |
| Patients list | Tab `patients` | `PatientsView.tsx` | INFERRED |
| Patient detail | Overlay | `PatientDetail.tsx` | INFERRED |
| Book appointment | Tab `book` | `BookView.tsx` | INFERRED |
| Payments | Tab `payments` | `PaymentsView.tsx` | INFERRED |
| Reports | Tab `reports` | `ReportsView.tsx` | INFERRED |
| Doctors (owner) | Tab `doctors` | `DoctorsView.tsx` | INFERRED |
| Team / access (owner) | Tab `team` | `TeamAccessView.tsx` | INFERRED |
| Activity / audit (owner) | Tab `audit` | `AuditView.tsx` | INFERRED |
| Global search | Dialog | `GlobalSearchDialog.tsx` | INFERRED |

**Gap:** Authenticated desk screens were **not** manually browsed this session (credentials not loaded in browser automation). E2E specs [`01-auth`–`18`](../../apps/crm/e2e/tests/) provide secondary evidence.

### 3.2 Staging UI observations (**VERIFIED**)

1. **Signup (`/signup`):** Clear 3-step hero, clinic name + workspace URL fields, “Desk link: ?tenant=…” hint — professional SaaS onboarding tone.  
2. **Login (`?tenant=dentacare`):** Branded hero; dev defaults still show legacy email in field (localStorage/build defaults) — **IMPROVE** for staging clarity.  
3. **Document title** on signup shows “Denta Care — Dr. D. Ajit” (Vite `index.html` / tenant build arg) — **IMPROVE** generic title on global routes (`/signup`).  
4. **Design system:** Coherent blue clinic brand (`--brand: #1565C0`), Inter, card-based login — **KEEP**.  
5. **Mobile:** Bottom nav + sidebar desktop pattern in `App.tsx` / `styles.css` — **REPORTED** strong in M6; align with Playwright mobile projects.

### 3.3 Prioritized UI/UX improvements

| Priority | Item | Rationale |
|----------|------|-----------|
| P0 | Deep linking / URL routes for tabs (`/today`, `/patients/:id`) | Native apps + bookmarks need stable URLs |
| P0 | Empty states + skeleton loaders on Today/Patients | Desk speed under load |
| P1 | Unified form validation messages (phone, email, required clinical fields) | Reduce reception errors |
| P1 | Consultation / EMR screens (missing) | Competitive gap vs HealthPlix/Practo |
| P1 | Onboarding checklist post-signup (hours, first doctor, services) | M8 signup creates tenant; setup incomplete |
| P2 | Design tokens → documented component patterns (buttons, tables) | Scale CRM + mobile parity |
| P2 | Accessibility audit (focus order, aria on dialogs) | Store compliance readiness |
| P3 | Dark mode | Nice-to-have |

**Recommendation:** **Retain React + custom CSS**; do **not** migrate to Next.js or a heavy UI kit pre-PMF. Modernize **navigation**, **clinical forms**, and **loading/empty states** first.

---

## 4. Backend & security audit

### 4.1 Strengths

- Clear **platform vs clinic** route split ([`routes/index.js`](../../apps/api/src/routes/index.js)).  
- **Owner vs staff** gates + plan entitlements (M7/M8).  
- **Tenant scoping** on clinic mutations; audit logging with redaction ([`clinicAudit.js`](../../apps/api/src/services/clinicAudit.js)).  
- **Upload validation** (magic bytes, size) [`uploadValidation.js`](../../apps/api/src/services/uploadValidation.js).  
- **Public booking** rate limits [`publicBooking.js`](../../apps/api/src/services/publicBooking.js).  
- **Signup** rate limits + idempotent provisioning (M8).

### 4.2 Risks (web + native)

| Risk | Severity | Evidence | Mitigation |
|------|----------|----------|------------|
| SQLite **single-writer** / max 1 instance | High for scale | [`13_M7_DATABASE_DECISION.md`](13_M7_DATABASE_DECISION.md) | Neon + pooler; or shard per tenant |
| JWT in localStorage (CRM) | Medium | [`auth.ts`](../../apps/crm/src/lib/auth.ts) | HttpOnly cookies or secure mobile storage |
| In-memory rate limits | Medium | `rateLimiter.js` | Shared store at scale |
| In-process reminder worker | Medium | [`index.js`](../../apps/api/src/index.js) | Cron + idempotent job table (partially done) |
| Coarse RBAC (owner/staff) | Medium | M6 audit | Role matrix for reception/doctor |
| No refresh token / session revoke | Medium | auth.js | Token version or refresh flow |
| Cloud Run **public invoker** | Medium | staging architecture | IAP or JWT-only API + private CRM origin |
| Cross-tenant bug class | High impact | SQL string queries | RLS + automated isolation tests |

### 4.3 Testing posture

- **API:** 67 unit/integration tests — good for scheduling, doctors, uploads, provisioning.  
- **CRM:** 25 Vitest + 18 Playwright — strong desk regression potential.  
- **Gap:** Load tests, security fuzzing on tenant boundaries, contract tests for mobile.

---

## 5. Database decision (detailed)

### 5.1 Comparison matrix

| Criterion | SQLite + Litestream (current) | Neon PostgreSQL (target) |
|-----------|------------------------------|---------------------------|
| Multi-tenant SaaS on **one** deployment | Weak (1 writer, logical isolation only) | **Strong** (pooling, RLS option) |
| Horizontal API instances | **No** (max-instances=1 enforced) | **Yes** |
| Migration effort | None now | **High** — schema port + Drizzle migrations + parity tests |
| Backup / PITR | Litestream to GCS (proven staging) | Neon PITR (6h free tier; 7–30d paid) — [Neon pricing](https://neon.com/pricing) |
| Cost @ **10 clinics** (shared SaaS) | ~$5–15/mo GCP if single deployment | Neon Free/Launch often **$0–25/mo** early + compute |
| Cost @ **100 clinics** | Sharding or many SQLite files — ops heavy | **~$50–200/mo** Neon (usage-dependent) — estimate |
| Cost @ **1000 clinics** | Impractical single file | **Dedicated Neon Scale** + read replicas — estimate **$500+/mo** |
| Multi-branch | Not modeled | Schema extension + Postgres |
| India residency | GCS/Run `asia-south1` | Neon region selection (verify current region list at deploy time) |
| Vendor lock-in | Low (file + Litestream) | Medium (Neon features); mitigated by standard Postgres |

### 5.2 Preferred architecture (commercial product)

**Recommendation:** Adopt **Neon PostgreSQL** as the **system of record** for the **multi-tenant SaaS control plane** (all clinics in one DB with strict `tenant_id` + **Postgres RLS** before Enterprise marketing).

**Interim:** Continue **SQLite on GCP staging** for desk QA until:

1. Drizzle schema parity with [`db/index.js`](../../apps/api/src/db/index.js) is proven.  
2. Dual-write or cutover rehearsal on staging Neon branch.  
3. Load test: concurrent doctors × clinics (target: 50 writes/sec burst).

**Reject for now:** Full rewrite to Cloudflare D1 (SQLite at edge) — wrong fit for complex reporting and multi-branch.

**Do not migrate in this assessment phase.**

---

## 6. Infrastructure cost comparison

**Official sources (Oct 2026):** [Neon pricing](https://neon.com/pricing), [Railway pricing](https://docs.railway.com/pricing/plans), [Cloudflare Workers/R2](https://developers.cloudflare.com/workers/platform/pricing/), [Cloud Run pricing](https://cloud.google.com/run/pricing).

### 6.1 Architecture options

| | A. Current GCP | B. Railway + Neon + Cloudflare | C. Cloudflare-heavy |
|--|----------------|--------------------------------|---------------------|
| Web CRM | Cloud Run (nginx) | **Cloudflare Pages** (static) | Pages + Workers |
| API | Cloud Run | **Railway** container | Workers (limits for long CPU/SQLite) |
| Database | SQLite + Litestream | **Neon Postgres** | Neon or D1 (not recommended) |
| Files | GCS | **R2** (no egress fee) | R2 |
| Cron/reminders | In-process / future Cloud Scheduler | **Railway cron** → API | Cron Triggers |
| CI | GitHub Actions | GitHub Actions | GitHub Actions |

### 6.2 Workload assumptions

- **Clinic:** 2–5 staff, 20–80 appointments/day, 50–200 patients active, occasional prescription images (~500 KB each).  
- **API:** ~500–3,000 requests/clinic/day.  
- **SaaS deployment:** shared multi-tenant (Batch 1 provisioning).

### 6.3 Monthly cost estimates (INR approx. @ ₹85/USD)

| Scale | A. GCP (current pattern) | B. Target stack (paid, sustainable) | Notes |
|-------|--------------------------|-----------------------------------|--------|
| **Dev / staging** | ₹400–1,200 ($5–15) | **₹0–850** — Neon Free + CF free + Railway Hobby **$5** | Neon free: 100 CU-h/project, 1 GB/project ([Neon FAQ](https://neon.com/faqs/free-plan-limits-and-quotas)) |
| **10 clinics** (shared) | ₹800–2,500 if 1 Run pair + GCS | **₹2,000–7,000** — Neon Launch usage + Railway ~$10–25 + R2 minimal | Free tiers **not** sufficient for 10 production clinics |
| **100 clinics** | Multiple Run or scale pain | **₹17,000–42,000** — Neon compute/storage + Railway Pro + R2 ~10–50 GB | Needs connection pooling (Neon pooler) |
| **1000 clinics** | Not recommended on SQLite | **₹1.7L–4L+** — Neon Scale, multi-service, observability | Enterprise sales motion |

**Free-tier vs production:** Free tiers are for **development and demos only**. Sustainable production at 10+ clinics should budget **paid Neon Launch** and **Railway Hobby/Pro** minimums.

**India latency:** Prefer **asia-south1** (GCP) or nearest Neon/Railway/CF region available at cutover; measure RTT from Mumbai before committing.

---

## 7. Native mobile architecture (Expo)

### 7.1 Recommendation: **Expo (React Native)** — not WebView

| Topic | Approach |
|-------|----------|
| Repo layout | `apps/mobile` in monorepo or `clinic-erp-mobile` with shared `packages/contracts` |
| API | Same REST as CRM; OpenAPI spec generated from routes or hand-maintained v1 |
| Auth | SecureStore (refresh + access); deep link `clinicerp://set-password` |
| Push | Expo Notifications + FCM/APNs; server-side device registry per user |
| Offline | Draft consultations locally; sync queue with idempotency keys |
| Camera / uploads | Expo ImagePicker → presigned or authenticated upload API |
| Navigation | Role-based tabs: Doctor (schedule, patients, quick note) vs Owner (metrics) vs Reception (book, pay) |
| Releases | EAS Build → Play Internal testing / TestFlight |

### 7.2 Mobile-first vs web-first workflows

| Workflow | Mobile-first | Web-first | Both |
|----------|--------------|-----------|------|
| Today board / check-in | ✓ | | ✓ |
| Quick appointment book | ✓ | | ✓ |
| Full patient chart / EMR | | ✓ | Later mobile read-only |
| Billing & reports | | ✓ | Mobile summary |
| Doctor schedule setup | | ✓ | |
| Owner audit export | | ✓ | |
| Signup / provisioning | | ✓ | |

### 7.3 Store compliance (high level)

- **Play / App Store:** Privacy policy, data deletion, no misleading medical claims, secure PHI handling.  
- **Subscriptions:** Use **store IAP** only for consumer subscriptions to the app itself; **B2B clinic SaaS** typically bills clinic owner via Razorpay on web (verify Apple guidelines for reader apps / external billing — **INVESTIGATE** at submission time).

---

## 8. Competitor feature matrix

Legend: **V** verified (official site/docs), **R** reported (third-party/pricing aggregators), **?** unknown without demo.

| Capability | Clinic ERP (now) | Clinic ERP (target 12mo) | Practo Ray | HealthPlix | DocEngage / others |
|------------|------------------|---------------------------|------------|------------|---------------------|
| Appointment calendar | V | V | V | V | R |
| Multi-doctor slots | V | V | V | V | R |
| Patient demographics | V | V | V | V | R |
| Structured EMR / notes | Partial | V | V | V | R |
| E-prescription / print | Partial (files) | V | V | V (14 langs) | R |
| Billing / receipts | V | V | V | V | R |
| Payment gateway | — | Razorpay sandbox | V (RPS) | R | R |
| SMS/WhatsApp reminders | Mock queue | V | V | V (credits) | R |
| Public booking | V API | V | V (Practo.com) | R | ? |
| Inventory / pharmacy | — | Future | R | V (Pro) | V (DocEngage tiers) |
| ABDM / ABHA | — | Investigate | V (marketing) | V | ? |
| Native mobile app | — | Expo | V (Ray tab) | V | R |
| Multi-branch | — | Enterprise | R | V (Elite) | R |
| Pricing entry (India) | Hypothesis ₹799 | Same | **V** ₹999/mo Atom | **V** ~₹1,000/mo/dr | **R** ₹499+/user |

Sources: [Practo Ray plans](https://www.practo.com/providers/clinics/ray/plans), [HealthPlix FAQ/pricing](https://www.healthplix.com/healthplixfaq), [`11_THREE_EDITION_BUSINESS_PLAN.md`](11_THREE_EDITION_BUSINESS_PLAN.md).

### 8.1 Competitor profiles (evidence class)

| Product | Evidence | Positioning (summary) | Pricing (public) |
|---------|----------|---------------------|------------------|
| **Practo Ray** | **V** product pages | Full clinic OS + Practo marketplace discovery | **V** Atom from ₹999/mo (Ray plans page) |
| **HealthPlix** | **V** FAQ | Doctor-centric EMR, AI scribe tiers, 14-language Rx | **V** tiered per doctor (~₹1,000/mo entry on FAQ) |
| **Eka Care (Eka Doc)** | **V** [plan pricing](https://www.eka.care/practice-management/plan-pricing) | OPD queue, billing, digital Rx, ABDM marketing, commerce add-ons | **V** Plus ₹16,999/yr (1 dr, 2 staff); Clinic Pro ₹1,00,000/yr (5 dr) — ex-GST |
| **DocEngage** | **R** marketing / aggregators | CRM + pharmacy tiers for clinics | **R** entry ~₹499/user/mo — confirm on sales |
| **MocDoc** | **R** | HMS + billing + apps (hospital skew) | **UNKNOWN** without current pricing page |
| **Clinicea** | **R** | Cloud clinic + dental modules | **R** per-clinic annual — sales-led |
| **Easy Clinic** | **R** | Lightweight OPD for small practices | **R** low monthly — verify live site |

**Clinic ERP differentiation hypothesis:** Transparent monthly SaaS (Essential ₹799), fast desk UX without marketplace lock-in, developer-owned infra cost curve (Neon/Railway), and dental-friendly scheduling without forcing Eka-style commerce bundles on day one.

**UI verification gap:** Competitor desk UX quality is **REPORTED/INFERRED** except where we have used their marketing demos; only **Clinic ERP staging login + `/signup`** were **VERIFIED** in-browser for this assessment.

---

## 9. Three-edition strategy (refined)

Align product packaging with [`plans.js`](../../apps/api/src/modules/identity/plans.js) (already enforced in API):

| Edition | Price hypothesis (ex-GST) | Launch-critical features |
|---------|---------------------------|---------------------------|
| **Essential** | ₹799/mo | 1 doctor, desk calendar, patients, payments, public booking |
| **Professional** | ₹1,499/mo | Multi-doctor, audit export, reminders, reports, signup |
| **Enterprise** | Custom ₹4,999+ | Multi-branch, Postgres SLA, SSO, API, compliance pack |

Prioritize **workflow depth** (consultation + Rx + reminders) over checkbox features (inventory, ABDM) until Professional tier is competitive with Practo Ray CM / HealthPlix Pro on **daily desk speed**.

---

## 10. Architecture Decision Records (12 decisions)

Each ADR: **Current → Recommendation → Confidence**. Alternatives rejected unless noted.

### ADR-1 Frontend framework

| | |
|--|--|
| **Current** | React 19 + Vite 8 SPA ([`apps/crm`](../../apps/crm)) |
| **Alternatives** | Next.js (SSR), Remix, Angular |
| **Recommendation** | **KEEP** React + Vite |
| **Evidence** | 18 Playwright specs, M8 signup shipped, no SEO need for authenticated CRM |
| **Tradeoffs** | No SSR for marketing (use separate landing on CF Pages) |
| **Effort / risk** | Low / low |
| **Reversibility** | High |

### ADR-2 Backend framework

| | |
|--|--|
| **Current** | Express 4 ESM, flat route modules |
| **Alternatives** | Fastify, Hono on Workers, NestJS |
| **Recommendation** | **KEEP** Express; extract repositories |
| **Evidence** | 67 API tests, proven on Cloud Run + Docker |
| **Tradeoffs** | Workers-native API would force DB at edge |
| **Effort** | Medium (layering) |
| **Reversibility** | High |

### ADR-3 Database

| | |
|--|--|
| **Current** | SQLite + better-sqlite3 ([`db/index.js`](../../apps/api/src/db/index.js)) |
| **Alternatives** | Stay SQLite-per-tenant; Supabase; RDS; PlanetScale |
| **Recommendation** | **TARGET Neon Postgres** (shared multi-tenant); **KEEP SQLite** until migration gate |
| **Evidence** | [`13_M7_DATABASE_DECISION.md`](13_M7_DATABASE_DECISION.md); M8 multi-tenant signup |
| **Tradeoffs** | Migration cost vs horizontal API scale |
| **Effort** | **High** (3–6 eng-weeks) |
| **Reversibility** | Medium (pg_dump export) |
| **Confidence** | Medium–High |

### ADR-4 Hosting

| | |
|--|--|
| **Current** | GCP Cloud Run + GCS (staging + Denta Care prod) |
| **Alternatives** | Stay GCP; Fly.io; Render; AWS |
| **Recommendation** | **TARGET** CF Pages + Railway + Neon; **KEEP GCP staging** until parallel path green |
| **Evidence** | User direction (Aqua Care–style cost); official Railway/Neon/CF pricing |
| **Tradeoffs** | Multi-vendor ops vs GCP single bill |
| **Effort** | Medium staging parallel |
| **Reversibility** | High |
| **Confidence** | Medium |

### ADR-5 Object storage

| | |
|--|--|
| **Current** | GCS or memory via [`uploadStorage.js`](../../apps/api/src/services/uploadStorage.js) |
| **Alternatives** | S3, R2, local disk |
| **Recommendation** | **R2 on target stack**; keep GCS on GCP |
| **Evidence** | R2 zero egress ([Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)) |
| **Effort** | Low (env switch) |
| **Reversibility** | High |

### ADR-6 Background jobs

| | |
|--|--|
| **Current** | In-process reminder poll ([`index.js`](../../apps/api/src/index.js)) |
| **Alternatives** | BullMQ+Redis, Cloud Tasks, Temporal |
| **Recommendation** | **Railway cron** or **CF Cron Trigger** hitting idempotent internal endpoints |
| **Evidence** | Reminder claim logic already durable in DB |
| **Effort** | Medium |
| **Reversibility** | High |

### ADR-7 Native app framework

| | |
|--|--|
| **Current** | None |
| **Alternatives** | Flutter, Kotlin/Swift native, Capacitor WebView |
| **Recommendation** | **Expo (React Native)** |
| **Evidence** | Team React skill; shared TS types; store requirements |
| **Effort** | 8–12 weeks MVP |
| **Reversibility** | High (separate app) |
| **Confidence** | Medium–High |

### ADR-8 Shared packages / API contracts

| | |
|--|--|
| **Current** | Ad-hoc `fetch` + hand types in [`api.ts`](../../apps/crm/src/lib/api.ts) |
| **Alternatives** | tRPC, GraphQL |
| **Recommendation** | **OpenAPI 3.1 + generated TS client** in `packages/api-client` |
| **Effort** | Medium |
| **Reversibility** | High |

### ADR-9 Authentication

| | |
|--|--|
| **Current** | Email/password, bcrypt, JWT ([`auth.js`](../../apps/api/src/middleware/auth.js)) |
| **Alternatives** | Clerk, Auth0, Neon Auth, Firebase |
| **Recommendation** | **KEEP first-party**; add refresh tokens, reset, invite hardening |
| **Evidence** | M8 provisioning + invites already custom |
| **Effort** | Medium |
| **Reversibility** | Medium (user migration if IdP later) |
| **Confidence** | High |

### ADR-10 Tenant isolation

| | |
|--|--|
| **Current** | `tenant_id` column + middleware |
| **Alternatives** | DB-per-tenant, schema-per-tenant |
| **Recommendation** | **KEEP row-level**; add **Postgres RLS** at Neon cutover |
| **Effort** | Medium with migration |
| **Reversibility** | Low if per-tenant DB chosen later |

### ADR-11 Subscription architecture

| | |
|--|--|
| **Current** | Plan enum + `subscription_status` + write guards (M8) |
| **Alternatives** | Stripe-only, manual invoicing |
| **Recommendation** | **KEEP** in-app states; **Razorpay** for India B2B when approved |
| **Effort** | Medium (webhooks) |
| **Reversibility** | High |

### ADR-12 Observability & backups

| | |
|--|--|
| **Current** | Cloud Logging (Run), Litestream → GCS |
| **Alternatives** | Datadog, Grafana Cloud, Sentry |
| **Recommendation** | **Structured JSON logs** + **Sentry** (errors) + **Neon PITR** on target DB |
| **Effort** | Low–medium |
| **Reversibility** | High |

---

## 11. Implementation roadmap (post-assessment)

**Do not start large clinical features until DB/hosting spike is decided.**

### Phase 0 — Foundation (4–6 weeks)

1. OpenAPI v1 + contract tests (API ↔ CRM).  
2. Neon staging project + Drizzle schema spike (read-only replica of SQLite schema).  
3. Railway staging API + Cloudflare Pages staging CRM (parallel to GCP).  
4. Repository layer behind `clinicStore` / routes (prep for PG).  
5. Refresh token + password reset flows.  
6. External reminder worker (cron).

### Phase 1 — Database migration gate

- Parity tests vs SQLite.  
- Cutover rehearsal (staging).  
- **Owner approval** before production.

### Phase 2 — Clinical Batch 2 (SQLite-safe on PG)

- Structured consultations / visit notes.  
- Prescription lines + PDF.  
- Follow-ups → reminder jobs.

### Phase 3 — Commercial

- Razorpay sandbox → subscription state machine.  
- Self-serve polish + onboarding checklist.

### Phase 4 — Mobile MVP (Expo)

- Auth, today board, patient lookup, book, push for appointment alerts.

### Phase 5 — Enterprise

- Branch model, RLS hardening, audit/compliance exports, SLA monitoring.

---

## 12. Open questions (owner decisions)

1. **Single shared DB vs database-per-tenant** for Essential customers (compliance vs ops cost)?  
2. **Target hosting cutover date** — run GCP staging through Q4 vs parallel Railway?  
3. **Neon region** acceptable for Indian clinic data (confirm DPA/residency)?  
4. **ABDM** — required for launch or Enterprise-only?  
5. **Pharmacy/inventory** — in scope for Professional or defer?  
6. **Mobile MVP** — doctor-only first or reception-first?  
7. **Razorpay** — clinic billing vs patient payments (RPS-like) priority?  
8. **Brand/domain** — `clinic.kaana.in` vs per-clinic subdomains for CRM?

---

## Appendix A — M8 / staging status

- M8 Batch 1 merged PR #10; staging deploy run **40119838900** (success).  
- Smoke: `scripts/staging-validate.mjs` (16 checks).  
- Signup enabled: `CLINIC_PUBLIC_SIGNUP_ENABLED=1` in [`cloudbuild.staging.yaml`](../../cloudbuild.staging.yaml).

## Appendix B — Document maintenance

Update this file when: database migration is approved, hosting cutover completes, or competitor pricing changes materially. Link execution progress in [`12_IMPLEMENTATION_ROADMAP.md`](12_IMPLEMENTATION_ROADMAP.md).
