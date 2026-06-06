#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-us-central1}"
REPO="${REPO:-comex}"
IMAGE="${IMAGE:-comex-api}"
SERVICE_NAME="${SERVICE_NAME:-comex-api}"
OPENAI_SECRET_NAME="${OPENAI_SECRET_NAME:-openai-api-key}"
EXTERNAL_TOOL_SECRET_NAME="${EXTERNAL_TOOL_SECRET_NAME:-external-tool-token}"
STRIPE_SECRET_NAME="${STRIPE_SECRET_NAME:-stripe-secret-key}"
STRIPE_WEBHOOK_SECRET_NAME="${STRIPE_WEBHOOK_SECRET_NAME:-stripe-webhook-secret}"
OPENAI_MODEL="${OPENAI_MODEL:-gpt-4o-mini}"
CORE_DATA_API_URL="${CORE_DATA_API_URL:-}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-}"
FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
FIRESTORE_DATABASE_ID="${FIRESTORE_DATABASE_ID:-}"

if [[ -z "${PROJECT_ID}" ]]; then
  echo "PROJECT_ID is required (or run: gcloud config set project YOUR_PROJECT_ID)" >&2
  exit 1
fi

OPENAI_API_KEY_VALUE="${OPENAI_API_KEY:-}"
if [[ -z "${OPENAI_API_KEY_VALUE}" && -f .env ]]; then
  echo "OPENAI_API_KEY not set in environment; reading OPENAI_API_KEY from .env" >&2
  OPENAI_API_KEY_VALUE="$(python - <<'PY'
import os
from pathlib import Path

val = ""
for line in Path('.env').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    if s.startswith('OPENAI_API_KEY='):
        val = s.split('=', 1)[1].strip()
        break
print(val)
PY
)"
fi

if [[ -z "${OPENAI_API_KEY_VALUE}" ]]; then
  echo "OPENAI_API_KEY is required (export it, or set it in .env)." >&2
  exit 1
fi

if [[ -z "${FIREBASE_PROJECT_ID}" && -f .env ]]; then
  FIREBASE_PROJECT_ID="$(python - <<'PY'
from pathlib import Path

val = ""
for line in Path('.env').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    if s.startswith('FIREBASE_PROJECT_ID='):
        val = s.split('=', 1)[1].strip()
        break
print(val)
PY
)"
fi

if [[ -z "${FIRESTORE_DATABASE_ID}" && -f .env ]]; then
  FIRESTORE_DATABASE_ID="$(python - <<'PY'
from pathlib import Path

val = ""
for line in Path('.env').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    if s.startswith('FIRESTORE_DATABASE_ID='):
        val = s.split('=', 1)[1].strip()
        break
print(val)
PY
)"
fi

STRIPE_SECRET_KEY_VALUE="${STRIPE_SECRET_KEY:-}"
if [[ -z "${STRIPE_SECRET_KEY_VALUE}" && -f .env ]]; then
  STRIPE_SECRET_KEY_VALUE="$(python - <<'PY'
from pathlib import Path

val = ""
for line in Path('.env').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    if s.startswith('STRIPE_SECRET_KEY='):
        val = s.split('=', 1)[1].strip()
        break
print(val)
PY
)"
fi

STRIPE_WEBHOOK_SECRET_VALUE="${STRIPE_WEBHOOK_SECRET:-}"
if [[ -z "${STRIPE_WEBHOOK_SECRET_VALUE}" && -f .env ]]; then
  STRIPE_WEBHOOK_SECRET_VALUE="$(python - <<'PY'
from pathlib import Path

val = ""
for line in Path('.env').read_text().splitlines():
    s = line.strip()
    if not s or s.startswith('#'):
        continue
    if s.startswith('STRIPE_WEBHOOK_SECRET='):
        val = s.split('=', 1)[1].strip()
        break
print(val)
PY
)"
fi

gcloud config set project "${PROJECT_ID}" >/dev/null
gcloud config set run/region "${REGION}" >/dev/null

gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com >/dev/null

if ! gcloud artifacts repositories describe "${REPO}" --location "${REGION}" >/dev/null 2>&1; then
  gcloud artifacts repositories create "${REPO}" --repository-format=docker --location="${REGION}" --description="COMEX images" >/dev/null
fi

if gcloud secrets describe "${OPENAI_SECRET_NAME}" >/dev/null 2>&1; then
  printf '%s' "${OPENAI_API_KEY_VALUE}" | gcloud secrets versions add "${OPENAI_SECRET_NAME}" --data-file=- >/dev/null
else
  printf '%s' "${OPENAI_API_KEY_VALUE}" | gcloud secrets create "${OPENAI_SECRET_NAME}" --data-file=- >/dev/null
fi

if ! gcloud secrets describe "${EXTERNAL_TOOL_SECRET_NAME}" >/dev/null 2>&1; then
  EXTERNAL_TOOL_SECRET_NAME=""
fi

STRIPE_SECRET_AVAILABLE=""
if gcloud secrets describe "${STRIPE_SECRET_NAME}" >/dev/null 2>&1; then
  STRIPE_SECRET_AVAILABLE="1"
elif [[ -n "${STRIPE_SECRET_KEY_VALUE}" ]]; then
  printf '%s' "${STRIPE_SECRET_KEY_VALUE}" | gcloud secrets create "${STRIPE_SECRET_NAME}" --data-file=- >/dev/null
  STRIPE_SECRET_AVAILABLE="1"
fi

STRIPE_WEBHOOK_SECRET_AVAILABLE=""
if gcloud secrets describe "${STRIPE_WEBHOOK_SECRET_NAME}" >/dev/null 2>&1; then
  STRIPE_WEBHOOK_SECRET_AVAILABLE="1"
elif [[ -n "${STRIPE_WEBHOOK_SECRET_VALUE}" ]]; then
  printf '%s' "${STRIPE_WEBHOOK_SECRET_VALUE}" | gcloud secrets create "${STRIPE_WEBHOOK_SECRET_NAME}" --data-file=- >/dev/null
  STRIPE_WEBHOOK_SECRET_AVAILABLE="1"
fi

if [[ -n "${STRIPE_SECRET_AVAILABLE}" && -n "${STRIPE_SECRET_KEY_VALUE}" ]]; then
  printf '%s' "${STRIPE_SECRET_KEY_VALUE}" | gcloud secrets versions add "${STRIPE_SECRET_NAME}" --data-file=- >/dev/null
fi

if [[ -n "${STRIPE_WEBHOOK_SECRET_AVAILABLE}" && -n "${STRIPE_WEBHOOK_SECRET_VALUE}" ]]; then
  printf '%s' "${STRIPE_WEBHOOK_SECRET_VALUE}" | gcloud secrets versions add "${STRIPE_WEBHOOK_SECRET_NAME}" --data-file=- >/dev/null
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/${IMAGE}:latest"

gcloud builds submit \
  --config cloudbuild.cloudrun.yaml \
  --substitutions "_IMAGE_URI=${IMAGE_URI}" \
  .

gcloud run deploy "${SERVICE_NAME}" \
  --image "${IMAGE_URI}" \
  --allow-unauthenticated \
  --set-env-vars "COMEX_SELLER_MODE=openai,OPENAI_MODEL=${OPENAI_MODEL},COMEX_MARKET_DATA_SOURCE=core_data_api${CORE_DATA_API_URL:+,CORE_DATA_API_URL=${CORE_DATA_API_URL}}${PUBLIC_BASE_URL:+,PUBLIC_BASE_URL=${PUBLIC_BASE_URL}}${FIREBASE_PROJECT_ID:+,FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}}${FIRESTORE_DATABASE_ID:+,FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID}}" \
  --set-secrets "OPENAI_API_KEY=${OPENAI_SECRET_NAME}:latest${EXTERNAL_TOOL_SECRET_NAME:+,EXTERNAL_TOOL_TOKEN=${EXTERNAL_TOOL_SECRET_NAME}:latest}${STRIPE_SECRET_AVAILABLE:+,STRIPE_SECRET_KEY=${STRIPE_SECRET_NAME}:latest}${STRIPE_WEBHOOK_SECRET_AVAILABLE:+,STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET_NAME}:latest}"

URL="$(gcloud run services describe "${SERVICE_NAME}" --format='value(status.url)')"
echo "Deployed: ${URL}"
curl -fsS "${URL}/health" >/dev/null
echo "Health check OK"
