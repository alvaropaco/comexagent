#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
JOB_NAME="${JOB_NAME:-market-rehydrate}"
SCHEDULE="${SCHEDULE:-0 */2 * * *}"
CORE_DATA_API_URL="${CORE_DATA_API_URL:-}"
SCHEDULER_SA_NAME="${SCHEDULER_SA_NAME:-market-rehydrate-scheduler}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required" >&2
  exit 1
fi

if [[ -z "${CORE_DATA_API_URL}" ]]; then
  echo "CORE_DATA_API_URL is required" >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud config set run/region "${REGION}" >/dev/null

gcloud services enable run.googleapis.com cloudscheduler.googleapis.com secretmanager.googleapis.com >/dev/null

if ! gcloud secrets describe market-sync-token >/dev/null 2>&1; then
  echo "Missing Secret Manager secret: market-sync-token" >&2
  exit 1
fi

if ! gcloud run jobs describe "${JOB_NAME}" >/dev/null 2>&1; then
  gcloud run jobs create "${JOB_NAME}" \
    --image "curlimages/curl:8.6.0" \
    --max-retries 0 \
    --set-secrets "MARKET_SYNC_TOKEN=market-sync-token:latest" \
    --set-env-vars "CORE_DATA_API_URL=${CORE_DATA_API_URL}"
else
  gcloud run jobs update "${JOB_NAME}" \
    --image "curlimages/curl:8.6.0" \
    --max-retries 0 \
    --set-secrets "MARKET_SYNC_TOKEN=market-sync-token:latest" \
    --set-env-vars "CORE_DATA_API_URL=${CORE_DATA_API_URL}"
fi

gcloud run jobs update "${JOB_NAME}" \
  --command /bin/sh \
  --args "-c","TOKEN=\"\$(printf '%s' \"\$MARKET_SYNC_TOKEN\" | tr -d '\r\n')\"; curl -fsS -X POST \"$CORE_DATA_API_URL/market/rehydrate\" -H 'Content-Type: application/json' -H \"x-market-sync-token: \$TOKEN\" -d '{}'"

SCHEDULER_NAME="${JOB_NAME}-schedule"

SCHEDULER_SA_EMAIL="${SCHEDULER_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if ! gcloud iam service-accounts describe "${SCHEDULER_SA_EMAIL}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SCHEDULER_SA_NAME}" >/dev/null
fi

gcloud run jobs add-iam-policy-binding "${JOB_NAME}" \
  --member "serviceAccount:${SCHEDULER_SA_EMAIL}" \
  --role roles/run.invoker >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
CLOUD_SCHEDULER_AGENT="service-${PROJECT_NUMBER}@gcp-sa-cloudscheduler.iam.gserviceaccount.com"
gcloud iam service-accounts add-iam-policy-binding "${SCHEDULER_SA_EMAIL}" \
  --member "serviceAccount:${CLOUD_SCHEDULER_AGENT}" \
  --role roles/iam.serviceAccountTokenCreator >/dev/null

if ! gcloud scheduler jobs describe "${SCHEDULER_NAME}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud scheduler jobs create http "${SCHEDULER_NAME}" \
    --location "${REGION}" \
    --schedule "${SCHEDULE}" \
    --uri "https://run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method POST \
    --oauth-service-account-email "${SCHEDULER_SA_EMAIL}" \
    --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
else
  gcloud scheduler jobs update http "${SCHEDULER_NAME}" \
    --location "${REGION}" \
    --schedule "${SCHEDULE}" \
    --uri "https://run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${PROJECT_ID}/jobs/${JOB_NAME}:run" \
    --http-method POST \
    --oauth-service-account-email "${SCHEDULER_SA_EMAIL}" \
    --oauth-token-scope "https://www.googleapis.com/auth/cloud-platform"
fi

echo "Job: ${JOB_NAME}"
echo "Scheduler: ${SCHEDULER_NAME} (${SCHEDULE})"
