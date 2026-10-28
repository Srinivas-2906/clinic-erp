# Staging ops — Secret Manager IAM (one-time)

**Project:** `clinic-erp-staging` only.

## Symptom

GitHub **Staging ops** fails with:

```json
{"secret":"clinic-staging-demo-password","status":"iam_denied","identity":"clinic-staging-runner@..."}
```

This is **IAM**, not a missing secret. Secret Manager often returns `NOT_FOUND` to unauthorized callers; ops scripts classify via `versions access`.

## Fix (Project Owner or Secret Manager Admin)

```bash
export GCP_STAGING_PROJECT_ID=clinic-erp-staging
bash infra/staging/bind-staging-secret-access.sh
```

Optional: create missing ops secrets (does **not** rotate demo password):

```bash
bash infra/staging/bootstrap-staging-secrets.sh
```

## Re-run

GitHub Actions → **Staging ops (validate, scheduler, monitoring)** → `confirm=run-staging-ops`.

## Identities

| Identity | Role in ops |
|----------|-------------|
| `github-clinic-erp-staging@...` | WIF → submit Cloud Build, impersonate runner/cloudbuild |
| `clinic-staging-cloudbuild@...` | Cloud Build steps, deploy, scheduler |
| `clinic-staging-runner@...` | Cloud Run runtime, GHA secret read (impersonated) |

Do **not** grant project-wide `roles/secretmanager.admin`. Use per-secret `secretAccessor` bindings only.
