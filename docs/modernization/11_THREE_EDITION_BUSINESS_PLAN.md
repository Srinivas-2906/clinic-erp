# Three editions — feature matrix and pricing hypotheses

**Disclaimer:** Competitor rows cite **publicly listed** prices/features (Oct 2026). Clinic ERP rows reflect **actual code** unless marked *planned*.

## Competitor snapshot (verified public pricing)

| Vendor | Published entry price | Notes |
|--------|----------------------|--------|
| Practo Ray CM Atom | ₹999/mo (1y) | Up to 50 doctors; SMS bundles; [Ray plans](https://www.practo.com/providers/clinics/ray/plans) |
| Practo Ray Clinic Mgmt | ₹1,499/mo (1y) | Unlimited doctors; more SMS/storage |
| HealthPlix Pro | ₹12,000/yr (~₹1,000/mo) | Specialty EMR, tele, billing; GST extra |
| HealthPlix Elite | ₹18,000/yr (~₹1,500/mo) | Multi-clinic, website, analytics tier |
| DocEngage Clinic | ₹499–699/user/mo (annual) | EMR + pharmacy tier on advanced plan; [pricing](https://www.docengage.in/pricing) |
| Eka Doc Plus | ~₹16,999/yr | 1 doctor + 2 staff (aggregator cites vendor) |

**Assumption:** GST 18% applies unless stated inclusive; SMS/WhatsApp often extra.

## Clinic ERP positioning

**Strengths (evidence):** fast desk UI, multi-doctor slots, payments ledger, reports export, GCS uploads, public booking API.  
**Gaps vs market:** reminders, pharmacy/inventory, structured EMR/Rx, multi-branch, ABDM, payment gateway.

## Edition matrix

| Capability | Essential | Professional | Enterprise |
|------------|-----------|--------------|------------|
| Doctors | 1 | Up to 10 | Unlimited |
| Staff users | 2 | 15 | Unlimited |
| Branches | 1 | 1 | Multi-branch *planned* |
| Appointments & calendar | ✓ | ✓ | ✓ |
| Patient records | ✓ | ✓ | ✓ |
| Multi-doctor scheduling | — | ✓ | ✓ |
| Payments recording | ✓ | ✓ | ✓ |
| Reports / CSV | Basic | Advanced | Advanced + API *planned* |
| File uploads | ✓ (quota) | ✓ | ✓ + retention policy |
| Public booking page | ✓ | ✓ | ✓ custom domain *planned* |
| SMS/WhatsApp reminders | — | ✓ *planned* | ✓ + templates |
| Audit log export | — | — | ✓ *planned* |
| SSO / org admin | — | — | ✓ *planned* |
| Support | Email | Email + chat | Priority + onboarding |

## Pricing hypotheses (INR, ex-GST, monthly if annual prepay)

| Edition | Hypothesis | Rationale |
|---------|------------|-----------|
| **Essential** | ₹799/mo (₹8,999/yr) | Undercut Ray Atom on single-doctor positioning |
| **Professional** | ₹1,499/mo (₹16,999/yr) | Align with Ray CM / HealthPlix entry; multi-doctor included |
| **Enterprise** | ₹4,999/mo+ (custom) | Per-branch + seats; comparable to Eka Clinic Pro band |

**Usage limits (enforce in entitlements):**

- Essential: 1 doctor, 2 staff, 2 GB files, 500 patients active.
- Professional: 10 doctors, 15 staff, 20 GB, 5k patients.
- Enterprise: negotiated; SLA add-on.

**Assumption:** Payment processing fees (Razorpay) passed through or bundled like Practo RPS — decide at integration time.

## Phased release strategy

1. **M7:** Sell Essential/Professional on staging-backed demos; manual provisioning.
2. **M8:** Self-serve signup + Razorpay; entitlements enforcement in API.
3. **M9:** Enterprise branch model + Postgres option + audit/compliance pack.

## Differentiation (practical)

- **Speed:** sub-second desk flows, mobile-first today board.
- **Transparency:** no marketplace lock-in; customer owns export (CSV + Litestream backup).
- **India-first pricing:** rupee annual plans, UPI-friendly patient receipts *planned*.
- **Optional Kaana ecosystem:** WhatsApp/concierge upsell — separate SKU.
