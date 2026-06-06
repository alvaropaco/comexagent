#!/usr/bin/env bash
set -euo pipefail

CORE_DATA_API_URL="${CORE_DATA_API_URL:-}"
MARKET_SYNC_TOKEN="${MARKET_SYNC_TOKEN:-}"
SOURCE_URL="${SOURCE_URL:-https://comexlive.org/coffee/}"

if [[ -z "${CORE_DATA_API_URL}" ]]; then
  echo "CORE_DATA_API_URL is required" >&2
  exit 1
fi

curl -fsS -X POST "${CORE_DATA_API_URL%/}/market/coffee/sync" \
  -H 'Content-Type: application/json' \
  -H "x-market-sync-token: ${MARKET_SYNC_TOKEN}" \
  -d "{\"sourceUrl\":\"${SOURCE_URL}\"}"

