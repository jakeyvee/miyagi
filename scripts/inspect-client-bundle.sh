#!/usr/bin/env bash
# inspect-client-bundle.sh
#
# Final-line-of-defense check: greps the built Next.js client bundle for
# anything that should never reach the browser. Catches the case where a
# developer adds a `NEXT_PUBLIC_OPENAI_API_KEY`, accidentally imports the
# `openai` SDK in a client component, or pulls in a microphone API.
#
# Runs `npm run build` first if `.next` is missing.
#
# Usage:
#   npm run verify:bundle
#
# Exits 0 on PASS, 1 on any hit, 2 on tool/build failure.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

STATIC_DIR=".next/static"

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "[verify:bundle] .next/static missing — running 'npm run build' first."
  if ! npm run build; then
    echo "[verify:bundle] ERROR: build failed; cannot inspect bundle." >&2
    exit 2
  fi
fi

if [[ ! -d "$STATIC_DIR" ]]; then
  echo "[verify:bundle] ERROR: $STATIC_DIR still missing after build." >&2
  exit 2
fi

# Patterns that must NEVER appear in the static client bundle.
# Each entry is "<grep-flag>::<pattern>::<label>".
PATTERNS=(
  "F::OPENAI_API_KEY::OPENAI_API_KEY identifier"
  "E::sk-[A-Za-z0-9_-]{16,}::OpenAI secret key literal (sk-...)"
  "F::getUserMedia::microphone API (getUserMedia)"
  "F::MediaRecorder::audio recorder API (MediaRecorder)"
  "F::webkitSpeechRecognition::Web Speech API"
  "F::api.openai.com::direct OpenAI URL"
)

header="kid-quest client bundle inspect"
echo
echo "$header"
printf '%*s\n' "${#header}" '' | tr ' ' '='
echo "Scanning: $STATIC_DIR"

# grep prints to stdout; capture per-pattern hit counts.
total_hits=0
total_files_with_hits=0
declare -a HIT_REPORTS=()

for entry in "${PATTERNS[@]}"; do
  flag="${entry%%::*}"
  rest="${entry#*::}"
  pattern="${rest%%::*}"
  label="${rest##*::}"

  # -r recursive, -I skip binary, -n line numbers.
  if [[ "$flag" == "E" ]]; then
    out="$(grep -rInE "$pattern" "$STATIC_DIR" 2>/dev/null || true)"
  else
    out="$(grep -rInF "$pattern" "$STATIC_DIR" 2>/dev/null || true)"
  fi

  if [[ -n "$out" ]]; then
    # Count lines.
    count="$(printf '%s\n' "$out" | wc -l | tr -d ' ')"
    files="$(printf '%s\n' "$out" | awk -F: '{print $1}' | sort -u | wc -l | tr -d ' ')"
    total_hits=$((total_hits + count))
    total_files_with_hits=$((total_files_with_hits + files))
    HIT_REPORTS+=(
      "  [HIT] $label  ($count match(es) across $files file(s))"
    )
    # Show first few matches per pattern to keep output manageable.
    truncated="$(printf '%s\n' "$out" | head -n 20)"
    while IFS= read -r line; do
      HIT_REPORTS+=("    $line")
    done <<<"$truncated"
    extra=$((count - 20))
    if (( extra > 0 )); then
      HIT_REPORTS+=("    ... ($extra more line(s) suppressed)")
    fi
  fi
done

if (( total_hits == 0 )); then
  echo
  echo "Result: PASS — no forbidden tokens found in client bundle."
  echo
  for entry in "${PATTERNS[@]}"; do
    label="${entry##*::}"
    echo "  - cleared: $label"
  done
  exit 0
fi

echo
echo "Result: FAIL — $total_hits hit(s) in $total_files_with_hits file(s):"
echo
for line in "${HIT_REPORTS[@]}"; do
  echo "$line"
done
echo
exit 1
