#!/bin/bash
# Phase 27.4.4 D-08/D-09/D-15 — Gate B threshold extraction
#
# Usage:
#   bash scripts/extract-gate-b-snapshot.sh https://your-vercel-prod-host.com
#   bash scripts/extract-gate-b-snapshot.sh http://localhost:3001  # local dev test
#
# Pipes /api/events/llm-status JSON through jq to produce a markdown table
# row for each gate. Operator pastes output verbatim into 27.4.4-02-CUTOVER.md
# under the "Threshold check" section.

set -euo pipefail

URL_BASE="${1:-http://localhost:3001}"
LLM_STATUS="$URL_BASE/api/events/llm-status"

curl -fsS "$LLM_STATUS" | jq -r '
  def pf(cond): if cond then "PASS" else "FAIL" end;
  def safeNum: . // 0;
  def safeArr: . // [];

  ((.schemaFailures.nvidia_nim.total // 0) + (.schemaFailures.openrouter.total // 0)) as $sfTotal
  | (.completedBatches // 0) as $batches
  | (if $batches > 0 then ($sfTotal * 100 / $batches) else 0 end) as $sfPct
  | (((.routingTrace // []) | map(select(.reason == "primary")) | length) * 100 / ((.routingTrace | length) // 1)) as $primaryPct
  | (.provenanceCounts // {}) as $pc
  | ($pc | to_entries | map(.value) | add // 0) as $pcSum
  | (($pc."gdelt-actiongeo-fallback" // 0) * 100 / (if $pcSum > 0 then $pcSum else 1 end)) as $fallbackPct
  | ($pcSum > 0) as $pcPopulated
  | ((.durationMs // 0) / 60000) as $durMin
  | "| watchdogTimeoutCount       | 0     | \(.watchdogTimeoutCount // 0) | \(pf((.watchdogTimeoutCount // 0) == 0)) |",
    "| DLQ count                  | ≤ 5   | \(.dlqCount // 0) | \(pf((.dlqCount // 0) <= 5)) |",
    "| Duration (min)             | ≤ 120 | \($durMin | floor) | \(pf($durMin <= 120)) |",
    "| provenanceCounts populated | yes   | \($pcPopulated | tostring) | \(pf($pcPopulated)) |",
    "| schema_fail rate           | ≤ 2%  | \($sfPct | tostring | .[0:5])% | \(pf($sfPct <= 2.0)) |",
    "| latency.nvidia_nim.p95     | ≤ 30s | \(.latency.nvidia_nim.p95 // 0)ms | \(pf((.latency.nvidia_nim.p95 // 0) <= 30000)) |",
    "| routingTrace primary share | ≥ 90% | \($primaryPct | tostring | .[0:5])% | \(pf($primaryPct >= 90)) |",
    "| (UAT D-15) fallbackRatio   | ≤ 15% | \($fallbackPct | tostring | .[0:5])% | \(pf($fallbackPct <= 15)) |"
'
