#!/bin/bash
# Phase 27.4.4 Plan 02 dev-pass recording harness.
#
# Captures EVERYTHING about a single v3 dev pipeline run for later forensic
# review. Output lands in .dev-cache/run-${TIMESTAMP}/ as a self-contained
# directory you can grep, diff, archive, or attach to a phase artifact.
#
# What's recorded:
#   - run-meta.txt           — start/end timestamps, env snapshot, git SHA
#   - status-tick-NNN.json   — verbatim /api/events/llm-status every 30s
#   - status-final.json      — final llm-status (post-geocoding, stage=idle)
#   - terminal-cache.json    — /api/events response after run completes
#   - dlq-final.json         — DLQ entries by reason (if any)
#   - peek-progressive.txt   — peek-v3-partial.ts output at every milestone
#   - eval-detail.txt        — per-event eval review (post-resolver)
#   - RUN_REPORT.md          — synthesized summary of the whole run
#
# Usage (run BEFORE triggering /api/events?backfill=true):
#   bash scripts/record-v3-run.sh
#
# Output:
#   .dev-cache/run-2026-04-29T20-50-00/

set -euo pipefail

TS="$(date '+%Y-%m-%dT%H-%M-%S')"
OUTDIR=".dev-cache/run-${TS}"
mkdir -p "${OUTDIR}"

LOG="${OUTDIR}/RECORDING.log"
META="${OUTDIR}/run-meta.txt"

echo "Recording to ${OUTDIR}"
echo "Tail with: tail -f ${LOG}"

# Run-meta: env, git, dev server identity
{
  echo "=== Recording start: $(date -u +%Y-%m-%dT%H:%M:%SZ) ==="
  echo "git HEAD: $(git rev-parse HEAD 2>/dev/null || echo unknown)"
  echo "git branch: $(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo "git status (porcelain):"
  git status --porcelain 2>/dev/null || true
  echo ""
  echo "Env (relevant only — secrets redacted):"
  # `|| true` so an empty grep result doesn't trip `set -e` and abort recording
  ENV_DUMP=$(env | grep -E '^(NODE_ENV|CACHE_KEY_PREFIX|LLM_PIPELINE_|V3_|NOMINATIM_FETCH_TIMEOUT_MS|LLM_BATCH_TIMEOUT_MS|NVIDIA_NIM_API_KEY|OPENROUTER_API_KEY)=' || true)
  echo "${ENV_DUMP}" | sed -E 's/(API_KEY)=.*/\1=<redacted>/' | sort
  echo ""
  echo "Dev server check:"
  curl -fsS http://localhost:3001/api/events/llm-status 2>&1 | jq -c '{stage, schemaVersion}' || echo "DEV SERVER NOT REACHABLE"
} > "${META}" 2>&1

cat "${META}" | tee -a "${LOG}"
echo "" | tee -a "${LOG}"

# Tick loop — captures status snapshots every 30s, peeks at milestones
TICK=0
LAST_BATCH=-1
LAST_STAGE=""
PEEK_AT=(25 50 75 100 125 150 175)

while true; do
  TICK=$((TICK + 1))
  TICK_PADDED=$(printf "%03d" "${TICK}")
  TS_NOW="$(date '+%H:%M:%S')"

  STATUS=$(curl -fsS http://localhost:3001/api/events/llm-status 2>/dev/null || echo '{"stage":"unreachable"}')
  echo "${STATUS}" > "${OUTDIR}/status-tick-${TICK_PADDED}.json"

  STAGE=$(echo "${STATUS}" | jq -r '.stage // "?"')
  CB=$(echo "${STATUS}" | jq -r '.completedBatches // 0')
  TB=$(echo "${STATUS}" | jq -r '.totalBatches // 0')
  DLQ=$(echo "${STATUS}" | jq -r '.dlqCount // 0')
  WD=$(echo "${STATUS}" | jq -r '.watchdogTimeoutCount // 0')
  GC=$(echo "${STATUS}" | jq -r '.completedGeocodes // 0')
  GT=$(echo "${STATUS}" | jq -r '.totalGeocodes // 0')

  echo "[${TS_NOW}] tick=${TICK} stage=${STAGE} batch=${CB}/${TB} geo=${GC}/${GT} dlq=${DLQ} wd=${WD}" \
    | tee -a "${LOG}"

  # Peek partial cache at milestone batch boundaries
  for MS in "${PEEK_AT[@]}"; do
    if [ "${CB}" -ge "${MS}" ] && [ "${LAST_BATCH}" -lt "${MS}" ]; then
      echo "  → milestone peek at batch ${MS}" | tee -a "${LOG}"
      {
        echo "=== Peek at batch ${MS} (tick ${TICK}, $(date -u +%Y-%m-%dT%H:%M:%SZ)) ==="
        node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/peek-v3-partial.ts 2>&1
        echo ""
      } >> "${OUTDIR}/peek-progressive.txt"
    fi
  done

  LAST_BATCH="${CB}"

  # Stage transition snapshot — capture full status verbatim
  if [ "${STAGE}" != "${LAST_STAGE}" ]; then
    echo "  → stage transition: ${LAST_STAGE} → ${STAGE}" | tee -a "${LOG}"
    cp "${OUTDIR}/status-tick-${TICK_PADDED}.json" "${OUTDIR}/stage-transition-${STAGE}.json"
    LAST_STAGE="${STAGE}"
  fi

  # Run complete — final captures + report
  if [ "${STAGE}" = "idle" ] && [ "${CB}" -gt 0 ] && [ "${CB}" -ge "${TB}" ]; then
    echo "[${TS_NOW}] === RUN COMPLETE ===" | tee -a "${LOG}"

    # Final captures
    cp "${OUTDIR}/status-tick-${TICK_PADDED}.json" "${OUTDIR}/status-final.json"
    curl -fsS http://localhost:3001/api/events 2>/dev/null > "${OUTDIR}/terminal-cache.json"
    echo "${STATUS}" | jq '.dlqRecent // []' > "${OUTDIR}/dlq-final.json"

    # Eval-detail (post-resolver per-event review)
    echo "  → running eval-detail" | tee -a "${LOG}"
    node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/eval-detail.ts > "${OUTDIR}/eval-detail.txt" 2>&1 || true

    # Final peek
    echo "  → final partial-cache peek" | tee -a "${LOG}"
    node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/peek-v3-partial.ts >> "${OUTDIR}/peek-progressive.txt" 2>&1 || true

    # Synthesize RUN_REPORT.md
    DURATION_MS=$(echo "${STATUS}" | jq -r '.durationMs // 0')
    DURATION_MIN=$(( DURATION_MS / 60000 ))
    DLQ_REASONS=$(echo "${STATUS}" | jq -c '.dlqRecent // [] | group_by(.reason) | map({reason: .[0].reason, count: length}) | sort_by(-.count)')
    PROV=$(echo "${STATUS}" | jq -c '.provenanceCounts // {}')
    SUSPECT=$(echo "${STATUS}" | jq -r '.suspectCount // 0')
    SCHEMA_FAILS=$(echo "${STATUS}" | jq -c '.schemaFailures // {}')
    P95=$(echo "${STATUS}" | jq -r '.latency.nvidia_nim.p95 // "n/a"')
    P99=$(echo "${STATUS}" | jq -r '.latency.nvidia_nim.p99 // "n/a"')
    EVAL=$(echo "${STATUS}" | jq -c '.evalScore // {}')
    TERMINAL_COUNT=$(jq '.data | length // 0' "${OUTDIR}/terminal-cache.json" 2>/dev/null || echo "?")

    {
      echo "# v3 Dev Pipeline Run Report"
      echo ""
      echo "**Recorded:** ${TS}"
      echo "**Branch:** $(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
      echo "**HEAD:** $(git rev-parse HEAD 2>/dev/null)"
      echo ""
      echo "## Run timeline"
      echo ""
      echo "| Field | Value |"
      echo "|---|---|"
      echo "| Total batches | ${CB} / ${TB} |"
      echo "| Total events extracted | $(echo "${STATUS}" | jq -r '.enrichedCount // "?"') |"
      echo "| Terminal cache size | ${TERMINAL_COUNT} |"
      echo "| Total duration | ${DURATION_MIN} min |"
      echo "| Watchdog timeouts | ${WD} |"
      echo "| DLQ count | ${DLQ} |"
      echo "| Suspect count (D-23) | ${SUSPECT} |"
      echo ""
      echo "## DLQ taxonomy"
      echo ""
      echo "\`\`\`json"
      echo "${DLQ_REASONS}"
      echo "\`\`\`"
      echo ""
      echo "## Provenance distribution (post-resolver)"
      echo ""
      echo "\`\`\`json"
      echo "${PROV}"
      echo "\`\`\`"
      echo ""
      echo "## Schema failures (LLM JSON parse errors)"
      echo ""
      echo "\`\`\`json"
      echo "${SCHEMA_FAILS}"
      echo "\`\`\`"
      echo ""
      echo "## Latency (NVIDIA NIM)"
      echo ""
      echo "| Percentile | ms |"
      echo "|---|---|"
      echo "| p50 | $(echo "${STATUS}" | jq -r '.latency.nvidia_nim.p50 // "n/a"') |"
      echo "| p95 | ${P95} |"
      echo "| p99 | ${P99} |"
      echo ""
      echo "## Eval score (within5/20/100km)"
      echo ""
      echo "\`\`\`json"
      echo "${EVAL}"
      echo "\`\`\`"
      echo ""
      echo "## Files in this directory"
      echo ""
      echo '```'
      ls -la "${OUTDIR}" | tail -n +2
      echo '```'
      echo ""
      echo "## Quick analysis commands"
      echo ""
      echo '```bash'
      echo "# Tail recording log"
      echo "tail -f ${OUTDIR}/RECORDING.log"
      echo ""
      echo "# Final terminal cache (precision distribution)"
      echo "jq '.data | group_by(.data.precision) | map({precision: .[0].data.precision, count: length})' ${OUTDIR}/terminal-cache.json"
      echo ""
      echo "# Per-event eval review"
      echo "less ${OUTDIR}/eval-detail.txt"
      echo ""
      echo "# Compare DLQ vs prior runs"
      echo "diff <(jq -S . ${OUTDIR}/dlq-final.json) <(jq -S . .dev-cache/run-PRIOR/dlq-final.json)"
      echo '```'
    } > "${OUTDIR}/RUN_REPORT.md"

    echo "[${TS_NOW}] === REPORT WRITTEN: ${OUTDIR}/RUN_REPORT.md ===" | tee -a "${LOG}"
    break
  fi

  sleep 30
done
