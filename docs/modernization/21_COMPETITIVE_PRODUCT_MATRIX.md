# Competitive product matrix (India clinic SaaS)

**Evidence classes:** **V** = official product/pricing page; **R** = third-party/marketing; **I** = inferred; **U** = unknown without demo login.

---

## Feature matrix

| Capability | Clinic ERP now | Target (12 mo) | Practo Ray | HealthPlix | Eka Care | DocEngage / others |
|------------|----------------|----------------|------------|------------|----------|---------------------|
| Appointment calendar | V | V | V | V | V | R |
| OPD queue / today board | V | V | V | V | V | R |
| Multi-doctor scheduling | V | V | V | V | V | R |
| Patient demographics | V | V | V | V | V | R |
| Structured EMR | I (partial) | V | V | V | V | R |
| E-prescription PDF | I (image upload) | V | V | V | V | R |
| Billing / receipts | V | V | V | V | V | R |
| Payment gateway | U | Razorpay sandbox | V (RPS) | R | V (integrated PG marketing) | R |
| SMS / WhatsApp reminders | Mock | V | V | V (credits) | V (Eka credits) | R |
| Public booking | V API | V UI polish | V (+ marketplace) | R | V (booking link) | R |
| Inventory / pharmacy | — | Future | R | V (Pro) | V (add-ons) | V (DocEngage tiers) |
| ABDM / ABHA | — | Enterprise investigate | V (marketing) | V | V (marketing) | U |
| Native mobile apps | — | Expo MVP | V | V | V (iPad tier) | R |
| Multi-branch | — | Enterprise | R | V (Elite) | V (Clinic Pro) | R |
| Self-serve signup | V (M8) | V | R | R | R | U |
| Audit export | V (owner) | V | R | R | R | U |

Sources: [Practo Ray plans](https://www.practo.com/providers/clinics/ray/plans), [HealthPlix FAQ](https://www.healthplix.com/healthplixfaq), [Eka plan pricing](https://www.eka.care/practice-management/plan-pricing), [`11_THREE_EDITION_BUSINESS_PLAN.md`](11_THREE_EDITION_BUSINESS_PLAN.md).

---

## Role-based workflow comparison

| Workflow | Clinic ERP | Competitor benchmark |
|----------|------------|----------------------|
| Reception: walk-in → register → book | **V** — Patients + Book tabs | HealthPlix/Eka queue-first — match speed |
| Doctor: see queue → consult → Rx | **U** — no encounter UI | HealthPlix EMR depth — **primary gap** |
| Owner: staff invite → audit | **V** — Team + Activity | Table stakes |
| Billing at checkout | **V** — Complete visit + payments | Practo Ray integrated RPS — later |
| Follow-up reminder | Partial (jobs table) | Eka/WhatsApp credits — need real provider |

---

## Edition packaging (recommendation)

| Edition | INR/mo (hypothesis, ex-GST) | Launch scope |
|---------|----------------------------|--------------|
| **Essential** | ₹799 | 1 doctor, calendar, patients, payments, booking |
| **Professional** | ₹1,499 | Multi-doctor, EMR+Rx, reminders, audit, reports |
| **Enterprise** | ₹4,999+ custom | Branches, RLS/SLA, ABDM, API, SSO |

**Defer:** pharmacy inventory, marketplace discovery, AI scribe.

---

## Positioning

- **Vs Practo Ray:** Lower entry price, no marketplace tax; focus on **desk speed** and transparent SaaS signup.
- **Vs HealthPlix:** Fewer AI bells; win on **simple onboarding** and **modern web UX** for small clinics.
- **Vs Eka:** Avoid bundled commerce/lab upsells in Essential; optional later.

---

## UX differentiators (achievable)

1. Sub-3-click book from patient search (already close — optimize).
2. Same-day onboarding: signup → first appointment < 15 min.
3. Reliable mobile **doctor queue** (Expo Phase 6).
4. Clear subscription state in UI (trial banner — partial in API).

---

## Competitors not deeply verified (UI)

MocDoc, Clinicea, Easy Clinic — **R/U** for desk UX; sales-led demos required before claims.
