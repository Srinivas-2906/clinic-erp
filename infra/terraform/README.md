# Infrastructure as Code — design (documentation only)

**Status:** Not implemented. This folder defines the **target** for zero-rewrite GCP account migration.

## Goals

1. Recreate staging or production in a **new GCP project** from version control.
2. Parameterize every environment-specific value (no `clinic-erp-staging` in application code).
3. Never commit secrets or Terraform state containing secrets.

## Recommended tool

**Terraform** (or OpenTofu) with Google provider `hashicorp/google`.

## Proposed layout

```
infra/terraform/
  README.md                 # this file
  modules/
    apis/                   # enable required services
    artifact_registry/
    gcs/                    # Litestream + uploads (pre-PG) or files-only (post-PG)
    cloud_sql/              # PostgreSQL — post-migration
    cloud_run/              # api + crm services
    iam/                    # runner, cloudbuild, github WIF SAs
    secrets/                # secret *containers* only; values via gcloud/console
    cloud_tasks/
    scheduler/
  environments/
    staging/
      main.tf
      variables.tf
      terraform.tfvars.example
    production/
      ...
```

## Required input variables (examples)

| Variable | Example | Used by |
|----------|---------|---------|
| `project_id` | `clinic-erp-staging` | All resources |
| `region` | `asia-south1` | Run, SQL, AR, buckets |
| `billing_account` | (set at project create) | Project |
| `github_repository` | `Srinivas-2906/clinic-erp` | WIF attribute condition |
| `api_service_name` | `clinic-api-staging` | Cloud Run |
| `crm_service_name` | `kaana-clinic-staging` | Cloud Run |
| `db_bucket_name` | `{project_id}-clinic-db` | GCS |
| `cloud_sql_tier` | `db-f1-micro` (dev) | Cloud SQL |
| `cors_allowed_origins` | CRM Run URL | API env |

## State backend

- GCS bucket `{project_id}-tf-state` with versioning and uniform access.
- Separate state prefixes: `staging/`, `production/`.
- **Do not** store state in the git repo.

## Relationship to existing scripts

[`infra/staging/provision.sh`](../staging/provision.sh) remains the **bootstrap** until Terraform module parity is proven. Migration path:

1. Import existing staging resources into Terraform state, or
2. Create **parallel** project from Terraform and cut over DNS/URLs.

## Secrets workflow

Terraform creates Secret Manager **secrets** and IAM bindings. Values are set once via:

```bash
echo -n "$JWT" | gcloud secrets versions add clinic-staging-jwt-secret --data-file=-
```

Never `terraform apply` with secret values in `.tfvars`.

## CI integration

GitHub Actions continues to call `gcloud builds submit` with `--substitutions` loaded from environment-specific `.env.staging` files (gitignored) or GitHub vars:

- `GCP_STAGING_PROJECT_ID`
- `GCP_WIF_PROVIDER`
- `GCP_STAGING_DEPLOYER_SA`

New account: duplicate environment with new variable set — same workflow file.
