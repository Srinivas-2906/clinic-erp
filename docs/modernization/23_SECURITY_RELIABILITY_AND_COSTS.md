# Security, reliability & infrastructure costs

**Hosting direction:** **GCP-first** ([`17_GCP_FIRST_PLATFORM_STRATEGY.md`](17_GCP_FIRST_PLATFORM_STRATEGY.md)). Railway + Neon + Cloudflare compared **for reference only** — **not provisioned**.

Official pricing references (Oct 2026): [Cloud Run](https://cloud.google.com/run/pricing), [Cloud SQL](https://cloud.google.com/sql/pricing), [Cloud Storage](https://cloud.google.com/storage/pricing), [Neon](https://neon.com/pricing), [Railway](https://docs.railway.com/pricing/plans).

---

## 1. Security & reliability review

| Area | Current | Target |
|------|---------|--------|
| Tenant isolation | App-level `tenant_id` | + Postgres RLS + isolation tests |
| RBAC | owner / staff | Expand doctor/reception matrix ([`19`](19_CLINICAL_DATA_MODEL.md)) |
| Auth | JWT 7d, localStorage in CRM | Refresh tokens, HttpOnly cookie option, revocation list |
| Secrets | Secret Manager (staging JWT, demo pwd) | All env secrets in SM per project |
| Uploads | Magic-byte validation, tenant path prefix | Presigned optional; virus scan future |
| Audit | `audit_log` + CSV export rate limit | Immutable store / export to GCS for Enterprise |
| Encryption | GCS + TLS in transit | CMEK optional Enterprise |
| Rate limits | In-memory | Memorystore or Cloud Armor / API gateway at scale |
| Backups | Litestream → GCS | Cloud SQL automated backups + PITR |
| Monitoring | Cloud Logging default | Error Reporting + uptime check + alert policy |
| Sessions | No revoke | Token version in DB |
| India DPDP | Not assessed legally | Owner legal review; data in `asia-south1` |
| App stores | N/A | Privacy policy, deletion endpoint ([`22`](22_NATIVE_MOBILE_ARCHITECTURE.md)) |

**Incident response (minimal):** On-call runbook — rotate JWT secret (forces re-login), disable signup flag, scale Run to zero, restore DB from backup.

---

## 2. Workload assumptions (cost model)

- **Shared SaaS** (multi-tenant): one API deployment serves N clinics.
- Per clinic: 3 users, 40 appointments/day, 500 API req/day, 200 MB files/year.
- Region: **`asia-south1`**.

---

## 3. GCP cost estimates (USD/month, **estimated**)

| Scale | Cloud Run (API+CRM) | Cloud SQL PG | GCS | AR / Build / logs | **Total est.** |
|-------|---------------------|--------------|-----|-------------------|----------------|
| **Current staging** | $5–15 (scale-to-zero, measured pattern in [`08_M5`](08_M5_STAGING_LIVE.md)) | $0 (SQLite) | $1–3 | $1–5 | **$7–23** |
| **10 clinics** | $15–40 | db-g1-small ~$25 + 20GB storage ~$3 ([pricing](https://cloud.google.com/sql/pricing)) | $5–15 | $5–10 | **$50–90** |
| **100 clinics** | $80–200 (2–4 API instances, 1 vCPU each) | db-custom 2 vCPU / 8GB ~$120–180 + storage | $30–80 | $20–40 | **$250–500** |
| **1000 clinics** | $400–900 + CDN | HA Cloud SQL + read replica $800–2000+ | $200–500 | $100+ | **$1,500–3,500+** |

**Notes:**

- Cloud SQL **db-f1-micro** ~**$0.0105/hr** ≈ **$7.6/mo** instance only ([Cloud SQL pricing](https://cloud.google.com/sql/pricing)) — suitable **dev/PG spike only**, not 100-clinic SLA (shared core, no SLA).
- Google’s **test instance example** ~**$9.37/mo** for 0.6GB/1 shared CPU + 10GB storage ([pricing examples](https://cloud.google.com/sql/docs/postgres/pricing-examples)).
- **Free trial credits:** may offset early Cloud SQL; **not guaranteed** on new accounts — budget recurring lines above.

**Measured vs estimated:** Staging Run spend is **measured** qualitatively in M5; higher tiers are **estimated** — validate with [Pricing Calculator](https://cloud.google.com/products/calculator).

---

## 4. Alternative stack (reference only)

Same workload **hypothesis** — **do not provision**:

| Scale | Railway + Neon + Cloudflare (est. USD) |
|-------|----------------------------------------|
| Dev/staging | $0–15 (Neon free + Railway Hobby $5) |
| 10 clinics | $40–80 |
| 100 clinics | $200–500 |
| 1000 clinics | $1,700–4,000+ |

Neon selected for **cost reference**, not as primary provider while GCP-first policy active. Cloud SQL wins on **same-network latency to Cloud Run**, unified IAM/billing, and **account migration** story (PG dump stays in GCP).

---

## 5. Cost controls

- Run: `min-instances=0`, `max-instances` cap per env; right-size memory after profiling.
- SQL: start small; use connection pooling; avoid HA until Enterprise SLA sold.
- GCS: lifecycle delete non-current versions on staging; separate buckets per env.
- Logging: exclusion filters for health checks; sample debug in prod.
- Scheduler: single cron for reminders vs always-on worker.
- Budget alerts per project (staging $25, prod TBD).

---

## 6. Recovery objectives (targets for sign-off)

| Metric | Staging | Production (future) |
|--------|---------|---------------------|
| RPO | 24h (Litestream) / 1h (PG PITR) | 15 min (PG PITR) |
| RTO | 4h manual | 1h runbook |
