#!/usr/bin/env bash
# Provision clinic-erp-staging (idempotent where possible). Run after project + billing link.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-clinic-erp-staging}"
REGION="${REGION:-asia-south1}"
BILLING_ACCOUNT="${BILLING_ACCOUNT:-017956-7B909E-A19606}"
BUCKET="${BUCKET:-${PROJECT_ID}-clinic-db}"
REPO="${REPO:-clinic}"

RUNNER_SA="clinic-staging-runner"
CLOUDBUILD_SA="clinic-staging-cloudbuild"
GITHUB_SA="github-clinic-erp-staging"
JWT_SECRET_ID="clinic-staging-jwt-secret"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
echo "Project: $PROJECT_ID ($PROJECT_NUMBER)"

APIS=(
  run.googleapis.com
  cloudbuild.googleapis.com
  artifactregistry.googleapis.com
  secretmanager.googleapis.com
  storage.googleapis.com
  iam.googleapis.com
  iamcredentials.googleapis.com
  logging.googleapis.com
  monitoring.googleapis.com
  cloudbilling.googleapis.com
  billingbudgets.googleapis.com
)

echo "==> Enable APIs"
for api in "${APIS[@]}"; do
  gcloud services enable "$api" --project="$PROJECT_ID" --quiet
done

echo "==> Artifact Registry"
if ! gcloud artifacts repositories describe "$REPO" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
  gcloud artifacts repositories create "$REPO" \
    --repository-format=docker \
    --location="$REGION" \
    --project="$PROJECT_ID" \
    --description="Clinic ERP staging images"
fi

echo "==> GCS bucket"
if ! gcloud storage buckets describe "gs://${BUCKET}" &>/dev/null; then
  gcloud storage buckets create "gs://${BUCKET}" \
    --project="$PROJECT_ID" \
    --location="$REGION" \
    --uniform-bucket-level-access
fi
gcloud storage buckets update "gs://${BUCKET}" --lifecycle-file=/dev/stdin --project="$PROJECT_ID" <<'EOF' || true
{
  "rule": [
    {
      "action": { "type": "Delete" },
      "condition": { "age": 7, "matchesPrefix": ["litestream/"] }
    }
  ]
}
EOF

echo "==> Service accounts"
for sa in "$RUNNER_SA" "$CLOUDBUILD_SA" "$GITHUB_SA"; do
  if ! gcloud iam service-accounts describe "${sa}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" &>/dev/null; then
    gcloud iam service-accounts create "$sa" --project="$PROJECT_ID" --display-name="$sa"
  fi
done

RUNNER_EMAIL="${RUNNER_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
CLOUDBUILD_EMAIL="${CLOUDBUILD_SA}@${PROJECT_ID}.iam.gserviceaccount.com"
GITHUB_EMAIL="${GITHUB_SA}@${PROJECT_ID}.iam.gserviceaccount.com"

echo "==> JWT secret"
if ! gcloud secrets describe "$JWT_SECRET_ID" --project="$PROJECT_ID" &>/dev/null; then
  openssl rand -base64 48 | gcloud secrets create "$JWT_SECRET_ID" \
    --project="$PROJECT_ID" \
    --replication-policy=automatic \
    --data-file=-
else
  echo "Secret $JWT_SECRET_ID already exists"
fi

echo "==> IAM (runner)"
gcloud secrets add-iam-policy-binding "$JWT_SECRET_ID" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${RUNNER_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" --quiet

gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${RUNNER_EMAIL}" \
  --role="roles/storage.objectAdmin" --quiet

echo "==> IAM (cloud build deployer)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/cloudbuild.builds.builder" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/run.admin" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/artifactregistry.writer" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/secretmanager.secretAccessor" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/secretmanager.secretCreator" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/logging.logWriter" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/cloudscheduler.admin" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/monitoring.editor" --quiet

gcloud iam service-accounts add-iam-policy-binding "$RUNNER_EMAIL" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/iam.serviceAccountUser" --quiet

echo "==> IAM (GitHub WIF deployer)"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GITHUB_EMAIL}" \
  --role="roles/cloudbuild.builds.editor" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GITHUB_EMAIL}" \
  --role="roles/serviceusage.serviceUsageConsumer" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GITHUB_EMAIL}" \
  --role="roles/cloudbuild.builds.builder" --quiet
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${GITHUB_EMAIL}" \
  --role="roles/storage.admin" --quiet

gcloud iam service-accounts add-iam-policy-binding "$CLOUDBUILD_EMAIL" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${GITHUB_EMAIL}" \
  --role="roles/iam.serviceAccountUser" --quiet
gcloud iam service-accounts add-iam-policy-binding "$CLOUDBUILD_EMAIL" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${GITHUB_EMAIL}" \
  --role="roles/iam.serviceAccountTokenCreator" --quiet

echo "==> Workload Identity Federation"
POOL_ID="github"
PROVIDER_ID="github-provider"
if ! gcloud iam workload-identity-pools describe "$POOL_ID" --location=global --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam workload-identity-pools create "$POOL_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER_ID" \
  --workload-identity-pool="$POOL_ID" --location=global --project="$PROJECT_ID" &>/dev/null; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER_ID" \
    --project="$PROJECT_ID" \
    --location=global \
    --workload-identity-pool="$POOL_ID" \
    --display-name="GitHub OIDC" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository" \
    --attribute-condition="assertion.repository=='Srinivas-2906/clinic-erp'" \
    --issuer-uri="https://token.actions.githubusercontent.com"
fi

COMPUTE_DEFAULT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "$COMPUTE_DEFAULT" \
  --project="$PROJECT_ID" \
  --member="serviceAccount:${CLOUDBUILD_EMAIL}" \
  --role="roles/iam.serviceAccountUser" --quiet 2>/dev/null || true

WIF_MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/attribute.repository/Srinivas-2906/clinic-erp"
gcloud iam service-accounts add-iam-policy-binding "$GITHUB_EMAIL" \
  --project="$PROJECT_ID" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$WIF_MEMBER" --quiet

WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/providers/${PROVIDER_ID}"

echo "==> Budget (\$10/month alerts)"
BUDGET_NAME="clinic-erp-staging-monthly"
if ! gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --format='value(displayName)' | grep -qx "$BUDGET_NAME"; then
  gcloud billing budgets create \
    --billing-account="$BILLING_ACCOUNT" \
    --display-name="$BUDGET_NAME" \
    --budget-amount=10USD \
    --filter-projects="projects/${PROJECT_NUMBER}" \
    --threshold-rule=percent=0.5 \
    --threshold-rule=percent=0.9 \
    --threshold-rule=percent=1.0 \
    --quiet || echo "Budget create may need Billing Admin role; configure in console if this failed."
fi

echo "==> Secret IAM (resource-scoped)"
if [ -x infra/staging/bootstrap-staging-secrets.sh ]; then
  GCP_STAGING_PROJECT_ID="$PROJECT_ID" CLOUDBUILD_SA="$CLOUDBUILD_EMAIL" RUNNER_SA="$RUNNER_EMAIL" GITHUB_SA="$GITHUB_EMAIL" \
    bash infra/staging/bootstrap-staging-secrets.sh || echo "Run bootstrap-staging-secrets.sh after granting Secret Manager Admin once if needed."
fi

echo ""
echo "=== Provision complete ==="
echo "GCP_STAGING_PROJECT_ID=$PROJECT_ID"
echo "GCP_STAGING_DEPLOYER_SA=$GITHUB_EMAIL"
echo "GCP_WIF_PROVIDER=$WIF_PROVIDER"
echo "RUNNER_SA=$RUNNER_EMAIL"
echo "DB_BUCKET=$BUCKET"
echo "JWT_SECRET=$JWT_SECRET_ID"
