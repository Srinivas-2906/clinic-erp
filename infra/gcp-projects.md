# GCP project naming — Clinic ERP

| Name | Project ID | Use |
|------|------------|-----|
| **Production** (Denta Care live) | `crucial-accord-505607-g9` | Display name in console: **kaana-prod**. All live `clinic-api` / `kaana-clinic` services. |
| **Staging** (proposed, not created) | `clinic-erp-staging` *(or org-assigned ID)* | Synthetic data only. **Never** share buckets, secrets, or Run service names with production. |

## Common mistake

`gcloud config set project kaana-prod` sets the **display name** only if your org maps it that way; the **API project id** is `crucial-accord-505607-g9`. GitHub workflows must use the **project ID**, via repository variables:

- `GCP_PROD_PROJECT_ID` = `crucial-accord-505607-g9`
- `GCP_STAGING_PROJECT_ID` = *(staging project when provisioned)*

Do not use the string `kaana-prod` as `--project` unless your org has a separate project with that exact ID.
