#!/usr/bin/env bash
# prewarm.sh
#
# Stage operator's deployment pre-warm probe. Hits /api/health and a tiny
# /api/classifier POST against a deployed (or locally running) kid-quest
# build to:
#
#   1. Confirm the function is reachable (kicks the cold start).
#   2. Confirm `hasOpenAiKey: true` from /api/health.
#   3. Confirm the classifier route returns 200 for a smoke payload.
#
# A 503 `missing_provider_env` from /api/classifier is treated as a CRITICAL
# pre-warm failure — the demo would silently fail on the first kid question.
#
# Usage:
#   BASE_URL=https://kid-quest.vercel.app bash scripts/prewarm.sh
#   BASE_URL=http://localhost:3000 npm run prewarm
#
# Default BASE_URL is http://localhost:3000.
#
# Exits 0 on PASS, 1 on any non-2xx response from either probe, 2 on
# unexpected tool / parsing failure.

set -uo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
BASE_URL="${BASE_URL%/}" # strip trailing slash

# Slightly generous so first-byte from a cold serverless function still wins.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-10}"
CLASSIFIER_TIMEOUT="${CLASSIFIER_TIMEOUT:-30}"

# Colorless, pipe-friendly logging.
log()  { printf '[prewarm] %s\n' "$*"; }
warn() { printf '[prewarm] WARN: %s\n' "$*" >&2; }
fail() { printf '[prewarm] FAIL: %s\n' "$*" >&2; exit 1; }

if ! command -v curl >/dev/null 2>&1; then
  printf '[prewarm] ERROR: curl is required.\n' >&2
  exit 2
fi

log "BASE_URL = ${BASE_URL}"

# ---------------------------------------------------------------------------
# 1. /api/health
# ---------------------------------------------------------------------------

log "GET ${BASE_URL}/api/health"

HEALTH_TMP="$(mktemp -t prewarm-health.XXXXXX)" || {
  printf '[prewarm] ERROR: could not create temp file.\n' >&2
  exit 2
}
trap 'rm -f "$HEALTH_TMP" "${CLASSIFIER_TMP:-}"' EXIT

HEALTH_START="$(date +%s)"
HEALTH_STATUS="$(curl --silent --show-error --max-time "$HEALTH_TIMEOUT" \
  --output "$HEALTH_TMP" \
  --write-out '%{http_code}' \
  "${BASE_URL}/api/health" || true)"
HEALTH_ELAPSED="$(( $(date +%s) - HEALTH_START ))s"

log "  status=${HEALTH_STATUS} elapsed=${HEALTH_ELAPSED}"

if [[ -z "$HEALTH_STATUS" || "$HEALTH_STATUS" == "000" ]]; then
  fail "/api/health unreachable (no HTTP response). Check BASE_URL and that the deploy is live."
fi

if [[ "${HEALTH_STATUS:0:1}" != "2" ]]; then
  log "  body: $(head -c 500 "$HEALTH_TMP")"
  fail "/api/health returned non-2xx (${HEALTH_STATUS})."
fi

HEALTH_BODY="$(cat "$HEALTH_TMP")"
log "  body: ${HEALTH_BODY}"

# Lightweight string match — avoids needing jq on stage laptops.
if ! printf '%s' "$HEALTH_BODY" | grep -q '"hasOpenAiKey":true'; then
  fail "/api/health returned hasOpenAiKey != true. The OPENAI_API_KEY env var is missing or empty on the deployed build. Fix it in Vercel and REDEPLOY."
fi

log "  OK (key wired)"

# ---------------------------------------------------------------------------
# 2. /api/classifier
# ---------------------------------------------------------------------------

CLASSIFIER_BODY='{"input":"prewarm probe","topicLock":"math","ageBand":"7-9","sessionId":"prewarm"}'

log "POST ${BASE_URL}/api/classifier"

CLASSIFIER_TMP="$(mktemp -t prewarm-classifier.XXXXXX)" || {
  printf '[prewarm] ERROR: could not create temp file.\n' >&2
  exit 2
}

CLASSIFIER_START="$(date +%s)"
CLASSIFIER_STATUS="$(curl --silent --show-error --max-time "$CLASSIFIER_TIMEOUT" \
  --output "$CLASSIFIER_TMP" \
  --write-out '%{http_code}' \
  --request POST \
  --header 'content-type: application/json' \
  --data "$CLASSIFIER_BODY" \
  "${BASE_URL}/api/classifier" || true)"
CLASSIFIER_ELAPSED="$(( $(date +%s) - CLASSIFIER_START ))s"

log "  status=${CLASSIFIER_STATUS} elapsed=${CLASSIFIER_ELAPSED}"

if [[ -z "$CLASSIFIER_STATUS" || "$CLASSIFIER_STATUS" == "000" ]]; then
  fail "/api/classifier unreachable (no HTTP response)."
fi

CLASSIFIER_BODY_OUT="$(head -c 500 "$CLASSIFIER_TMP")"
log "  body: ${CLASSIFIER_BODY_OUT}"

if [[ "$CLASSIFIER_STATUS" == "503" ]] && \
   printf '%s' "$CLASSIFIER_BODY_OUT" | grep -q 'missing_provider_env'; then
  fail "/api/classifier 503 missing_provider_env — OPENAI_API_KEY is missing on the deployed build despite /api/health reporting it. Likely a stale deploy: REDEPLOY in Vercel."
fi

if [[ "${CLASSIFIER_STATUS:0:1}" != "2" ]]; then
  fail "/api/classifier returned non-2xx (${CLASSIFIER_STATUS}). The classifier path is not ready for stage."
fi

log "  OK (classifier warm)"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------

log "PASS"
log "  health: ${HEALTH_STATUS} in ${HEALTH_ELAPSED}"
log "  classifier: ${CLASSIFIER_STATUS} in ${CLASSIFIER_ELAPSED}"

exit 0
