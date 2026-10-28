# Staging ops — Secret Manager IAM (one-time)

**Project:** `clinic-erp-staging` only.

## Who needs which secret

| Secret | `clinic-staging-runner` | `clinic-staging-cloudbuild` | `github-clinic-erp-staging` |
|--------|-------------------------|-----------------------------|-----------------------------|
| `clinic-staging-jwt-secret` | Yes (Cloud Run API) | No | No (uses impersonation) |
| `clinic-staging-demo-password` | Yes (runtime + ops via impersonation) | Yes (deploy + Cloud Build ops) | No |
| `clinic-staging-provisioning-key` | Yes | Yes | No |
| `clinic-staging-platform-admin-password` | Yes (bootstrap job) | Yes | No |

GitHub Actions reads secrets by **impersonating** runner or cloudbuild (WIF → github SA → `serviceAccountTokenCreator` on target SA).

## One-time fix (your user account)

Run with a Google account that is **Owner** (or **Secret Manager Admin** + **Service Account Admin**) on `clinic-erp-staging`:

```bash
gcloud auth login
gcloud config set project clinic-erp-staging
gcloud config get-value account   # must be Owner-capable, not a read-only member
```

```bash
cd /path/to/clinic-erp
export GCP_STAGING_PROJECT_ID=clinic-erp-staging
bash infra/staging/bind-staging-secret-access.sh
bash infra/staging/bootstrap-staging-secrets.sh
bash scripts/staging-iam-verify.sh
```

**What this grants:**

- `roles/secretmanager.secretAccessor` **on each secret** for `clinic-staging-runner` and `clinic-staging-cloudbuild` only (not project-wide, not on the GitHub SA).
- `roles/iam.serviceAccountUser` and `roles/iam.serviceAccountTokenCreator` on **runner** for **github-clinic-erp-staging** (WIF impersonation for ops).

Bootstrap creates missing ops secrets with new random values (does **not** rotate `clinic-staging-demo-password`).

## Billing (required for Secret Manager)

```bash
gcloud billing projects describe clinic-erp-staging --format='yaml(billingEnabled,billingAccountName)'
```

If **`billingEnabled: false`**, no user can bind or read secrets via the API until billing is re-linked (Owner or Billing Account Administrator):

- Console: [Link billing to clinic-erp-staging](https://console.cloud.google.com/billing/linkedaccount?project=clinic-erp-staging)
- CLI (replace with your billing account id):  
  `gcloud billing projects link clinic-erp-staging --billing-account=XXXXXX-XXXXXX-XXXXXX`

Wait a few minutes, then run `bind-staging-secret-access.sh` again.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|--------|-----|
| `requires billing to be enabled` / `BILLING_DISABLED` | Project billing unlinked or disabled | Re-enable billing (section above) |
| `PERMISSION_DENIED` on secret bind (billing OK) | User lacks Secret Manager Admin | `gcloud auth login` as **Owner** |
| `iam.serviceAccounts.getIamPolicy` denied on WIF step | User lacks **Service Account Admin** | Use Owner account, or `SKIP_WIF=1` if you already bound github SA → runner (GHA shows impersonation `ok: true`) |

```bash
# WIF already applied; only fix secretAccessor:
export GCP_STAGING_PROJECT_ID=clinic-erp-staging SKIP_WIF=1
bash infra/staging/bind-staging-secret-access.sh
```

## Verify

```bash
gcloud --impersonate-service-account=clinic-staging-runner@clinic-erp-staging.iam.gserviceaccount.com \
  secrets versions access latest --secret=clinic-staging-demo-password \
  --project=clinic-erp-staging >/dev/null && echo "demo secret: ok"
```

## Then

GitHub Actions → **Staging ops (validate, scheduler, monitoring)** → `confirm=run-staging-ops`.
