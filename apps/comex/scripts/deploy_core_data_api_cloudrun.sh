#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-comex}"
IMAGE="${IMAGE:-core-data-api}"
SERVICE_NAME="${SERVICE_NAME:-core-data-api}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required (or run: gcloud config set project YOUR_PROJECT_ID)" >&2
  exit 1
fi

gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud config set run/region "${REGION}" >/dev/null

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "${REPO}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPO}" --repository-format=docker --location="${REGION}" --description="COMEX images" >/dev/null
fi

PRIMARY_SECRET=""
for candidate in DB_MONGO_URI MONGODB_URI MONGO_URI; do
  if gcloud secrets describe "${candidate}" >/dev/null 2>&1; then
    PRIMARY_SECRET="${candidate}"
    break
  fi
done

FALLBACK_SECRET=""
for candidate in MONGODB_URI_FALLBACK MONGO_URI_FALLBACK; do
  if gcloud secrets describe "${candidate}" >/dev/null 2>&1; then
    FALLBACK_SECRET="${candidate}"
    break
  fi
done

if [[ -z "${PRIMARY_SECRET}" ]]; then
  echo "Missing Mongo Secret Manager secret. Create one of: DB_MONGO_URI, MONGODB_URI, MONGO_URI" >&2
  exit 1
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest"

(cd core-data-api && gcloud builds submit \
  --project "${PROJECT_ID}" \
  --config cloudbuild.cloudrun.yaml \
  --substitutions "_IMAGE_URI=${IMAGE_URI}" \
  .)

DEPLOY_ARGS=(
  "${SERVICE_NAME}"
  --image "${IMAGE_URI}"
  --allow-unauthenticated
)

SECRETS_ARG="MONGODB_URI=${PRIMARY_SECRET}:latest"
if [[ -n "${FALLBACK_SECRET}" ]]; then
  SECRETS_ARG+=" ,MONGODB_URI_FALLBACK=${FALLBACK_SECRET}:latest"
fi

DEPLOY_ARGS+=(--set-secrets "${SECRETS_ARG// /}")

if gcloud secrets describe openai-api-key >/dev/null 2>&1; then
  DEPLOY_ARGS+=(--set-secrets "OPENAI_API_KEY=openai-api-key:latest")
fi

if gcloud secrets describe market-sync-token >/dev/null 2>&1; then
  DEPLOY_ARGS+=(--set-secrets "MARKET_SYNC_TOKEN=market-sync-token:latest")
fi

if gcloud secrets describe vector-store-token >/dev/null 2>&1; then
  DEPLOY_ARGS+=(--set-secrets "VECTOR_STORE_TOKEN=vector-store-token:latest")
fi

if gcloud secrets describe external-tool-token >/dev/null 2>&1; then
  DEPLOY_ARGS+=(--set-secrets "EXTERNAL_TOOL_TOKEN=external-tool-token:latest")
fi

gcloud run deploy "${DEPLOY_ARGS[@]}"

URL="$(gcloud run services describe "${SERVICE_NAME}" --format='value(status.url)')"
echo "Deployed: ${URL}"
curl -fsS "${URL}/health" >/dev/null
echo "Health check OK"
