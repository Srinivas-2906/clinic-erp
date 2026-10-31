# Web launch priorities (2026-10-31)

Starting point: **`38_PRODUCT_COMPLETION_AUDIT.md`** (scores on `main` @ post-#48/#49). Native columns are **out of scope** until post-validation.

## Current completion (web surfaces only)

| Surface | Approx. | Blockers |
|---------|---------|----------|
| **Desktop web** | **~92%** | Follow-ups, API test gaps, platform polish |
| **Mobile web (responsive CRM)** | **~87%** | Reports/activity table UX (#51), invoice line grid, uploads UX, follow-ups |

---

## Priority queue

### P0 — Broken or incomplete core workflows

- [x] Owner Settings + Activity on mobile web (account menu) — #48 merged  
- [x] Doctor Payments nav vs `recordPayments` — #49 merged  
- [ ] Extended regression stability (`32-busy-clinic-day`) — **release blocker**, not daily dev  
- [ ] API HTTP tests: clinic settings, `/clinic/report`, access requests  

### P1 — Desktop / mobile-browser functional parity

- [ ] **Reports + Activity tables on narrow viewports** — PR #51  
- [ ] Payments / invoice create flows on small screens (stat strip, filters, line rows)  
- [ ] Platform admin usable on tablet-width mobile web  
- [ ] Clinical document upload UX on mobile web  

### P2 — Patient history, follow-ups, clinical continuity

- [ ] Follow-up scheduling UI completion (API exists)  
- [ ] Patient timeline depth on mobile web  
- [ ] Consultation handoff → billing edge cases (web E2E coverage)  

### P3 — Owner reporting and operational intelligence

- [ ] Report API unit tests + export reliability  
- [ ] Dashboard KPI clarity on mobile web  
- [ ] Audit filters/export on very small screens (partial in #51)  

### P4 — SaaS subscriptions and commercial readiness

- [ ] Entitlements messaging on mobile web  
- [ ] Onboarding checklist polish for new clinics  
- [ ] Staging/prod runbooks (no auto-deploy in this phase)  

### P5 — Security, reliability, market validation, web launch

- [ ] Full extended regression green on release SHA  
- [ ] Branch protection aligned with web-only CI  
- [ ] Staging pilot + production cutover (manual workflows only)  

---

## Next implementation batches (recommended order)

1. Merge **#51** — mobile-web reports/activity responsive tables.  
2. **Billing/overview mobile pass** — `PaymentsView`, `OverviewTab`, invoice modals.  
3. **Follow-ups UI** — P2 clinical continuity.  
4. **API test gap closure** — settings, report, access requests.  
5. **Fix `32-busy-clinic-day`** — unblock release regression.  

Avoid speculative features; prefer measurable clinic workflow improvements.
