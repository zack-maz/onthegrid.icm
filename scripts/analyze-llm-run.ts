#!/usr/bin/env node
/**
 * Phase 30 D-01 — operator-facing post-run throttle analyzer.
 *
 * Reads `events:llm-summary:v3` from Redis (or a local JSON fixture for
 * smoke), computes the throttle characterization metrics required by
 * LLM-RELI-02 (throttle window length, steady-state RPM ceiling, recovery
 * interval, per-batch latency p50/p95, watchdog hard-kill count, eval
 * score), and emits both:
 *
 *   1. A JSON snapshot (written to --snapshot=<path> or stdout when absent).
 *      Shape is fixed by 30-VALIDATION.md "Snapshot Deliverables" so Phase
 *      31's 7-day watch can re-derive the same metrics from the same raw
 *      summary without ambiguity.
 *
 *   2. A Markdown table to stdout, intended to be pasted into
 *      `docs/architecture/llm-pipeline-reliability.md` (D-06). The "Throttle
 *      window (Path A|B)" label tells the operator whether NIM honored the
 *      Retry-After header (Path A) or whether the analyzer inferred the
 *      window from the 429→200 timestamp gap (Path B).
 *
 * Usage:
 *   npm run analyze:llm-run
 *   npm run analyze:llm-run -- --snapshot=.planning/phases/30-.../run-1-throttle-snapshot.json
 *   npm run analyze:llm-run -- --fixture=tests/fixtures/run-with-retry-after.json
 *
 * Cost: zero token spend, Redis-read only (or fixture-mode for smoke).
 * `runEval()` is NOT invoked — eval ratios are passed through from the
 * existing `evalScore` field already present on the summary.
 *
 * Per RESEARCH Pitfall 2: NIM's 429 Retry-After header surface is
 * undocumented (assumption A1). This script handles both Path A (header
 * present → median+p95 of retryAfterMs across rate_limit rows) and Path B
 * (header absent → 429-to-200 timestamp gap inference). Run 1 (Plan 02)
 * reveals which path NIM actually serves.
 *
 * Per RESEARCH gotcha at llmEventExtractor.v3.ts widening: old summaries
 * in Redis (~90d after Plan 04) may carry skipReason: 'watchdog-soft-warn'
 * on callHistory rows. This analyzer ignores unknown enum values rather
 * than crashing.
 *
 * Env-var gotcha: `CACHE_KEY_PREFIX="dev: "` (trailing whitespace) is
 * stripped by `node --env-file-if-exists=`. Export manually before running
 * if your dev cache uses whitespace-suffixed prefixes — Phase 30.1 deferred.
 */
import { readFileSync, writeFileSync } from 'node:fs';

import { cacheGetSafe } from '../server/cache/redis.js';
import { logger } from '../server/lib/logger.js';

import type { LLMRunSummary } from '../server/lib/llmProgress.js';

const log = logger.child({ module: 'analyze-llm-run' });

// ---------------------------------------------------------------------------
// Output shape — pinned by 30-VALIDATION.md "Snapshot Deliverables".
// ---------------------------------------------------------------------------

interface ThrottleWindow {
  /** 'A' when ≥1 callHistory row has a numeric retryAfterMs > 0. 'B' otherwise. */
  path: 'A' | 'B';
  /** Median throttle window length in ms; null when no signal extractable. */
  median: number | null;
  /** P95 throttle window length in ms; null when no signal extractable. */
  p95: number | null;
}

interface AnalyzerSnapshot {
  runTimestamp: number;
  durationMs: number;
  batchCount: number;
  watchdogTimeoutCount: number;
  throttleWindowMs: ThrottleWindow;
  steadyStateRpm: number;
  recoveryIntervalMs: number | null;
  perBatchLatency: { p50: number; p95: number };
  evalScore: {
    within5km: number;
    within20km: number;
    within100km: number;
    total: number;
  };
}

// ---------------------------------------------------------------------------
// Pure stats helpers
// ---------------------------------------------------------------------------

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  const lo = sorted[mid - 1];
  const hi = sorted[mid];
  if (lo === undefined || hi === undefined) return null;
  return (lo + hi) / 2;
}

function p95(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return sorted[idx] ?? null;
}

// ---------------------------------------------------------------------------
// Core computation — Path A / Path B branching per RESEARCH Pitfall 2.
// ---------------------------------------------------------------------------

type CallRow = NonNullable<LLMRunSummary['callHistory']>[number];

function isRetryAfterPresent(row: CallRow): row is CallRow & { retryAfterMs: number } {
  return typeof row.retryAfterMs === 'number' && row.retryAfterMs > 0;
}

function computeThrottleWindow(callHistory: CallRow[]): ThrottleWindow {
  // Path A: any callHistory row carries a numeric retryAfterMs > 0.
  const retryValues = callHistory.filter(isRetryAfterPresent).map((row) => row.retryAfterMs);
  if (retryValues.length > 0) {
    const sorted = [...retryValues].sort((a, b) => a - b);
    return { path: 'A', median: median(sorted), p95: p95(sorted) };
  }

  // Path B: walk callHistory in timestamp order looking for 429-then-200 transitions
  // for the same provider. The gap (next200.timestamp - last429.timestamp) is the
  // inferred recovery interval. Path B kicks in when NIM omits Retry-After.
  const sortedByTs = [...callHistory].sort((a, b) => a.timestamp - b.timestamp);
  const gaps: number[] = [];
  for (let i = 0; i < sortedByTs.length - 1; i++) {
    const failing = sortedByTs[i];
    const next = sortedByTs[i + 1];
    if (!failing || !next) continue;
    if (failing.ok === false && next.ok === true && failing.provider === next.provider) {
      const gap = next.timestamp - failing.timestamp;
      if (gap > 0) gaps.push(gap);
    }
  }

  if (gaps.length === 0) {
    // No 429-then-200 transitions observed at all (RESEARCH Open Question 2):
    // either the rolling-window limiter perfectly gated submission so NIM never
    // returned 429, or the run produced no failed calls. Either way, the
    // throttle window is unobservable.
    return { path: 'B', median: null, p95: null };
  }
  const sorted = [...gaps].sort((a, b) => a - b);
  return { path: 'B', median: median(sorted), p95: p95(sorted) };
}

function computeSteadyStateRpm(callHistory: CallRow[], durationMs: number): number {
  const successfulNim = callHistory.filter(
    (row) => row.ok === true && row.provider === 'nvidia_nim',
  ).length;
  const minutes = durationMs / 60_000;
  if (minutes <= 0) return 0;
  return Math.round(successfulNim / minutes);
}

function computeRecoveryInterval(callHistory: CallRow[]): number | null {
  // From the LAST failing rate-limit row (or any failure) to the FIRST
  // subsequent ok=true row, the wall-clock gap in ms. Returns null if no
  // failure-then-success pair exists.
  const sortedByTs = [...callHistory].sort((a, b) => a.timestamp - b.timestamp);
  // Find the last failing row first.
  let lastFailingIdx = -1;
  for (let i = sortedByTs.length - 1; i >= 0; i--) {
    const row = sortedByTs[i];
    if (row && row.ok === false) {
      lastFailingIdx = i;
      break;
    }
  }
  if (lastFailingIdx === -1) return null;
  const lastFailing = sortedByTs[lastFailingIdx];
  if (!lastFailing) return null;
  for (let i = lastFailingIdx + 1; i < sortedByTs.length; i++) {
    const row = sortedByTs[i];
    if (row && row.ok === true) return row.timestamp - lastFailing.timestamp;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Assemble the snapshot from a summary payload.
// ---------------------------------------------------------------------------

function buildSnapshot(summary: LLMRunSummary): AnalyzerSnapshot {
  const callHistory = summary.callHistory ?? [];
  const throttleWindowMs = computeThrottleWindow(callHistory);
  const steadyStateRpm = computeSteadyStateRpm(callHistory, summary.durationMs);
  const recoveryIntervalMs = computeRecoveryInterval(callHistory);
  const nimLatency = summary.latencyHistogram?.nvidia_nim;
  const perBatchLatency = {
    p50: nimLatency?.p50 ?? 0,
    p95: nimLatency?.p95 ?? 0,
  };
  const evalScore = summary.evalScore ?? {
    within5km: 0,
    within20km: 0,
    within100km: 0,
    total: 0,
  };

  return {
    runTimestamp: summary.lastRun,
    durationMs: summary.durationMs,
    batchCount: summary.batchCount,
    watchdogTimeoutCount: summary.watchdogTimeoutCount ?? 0,
    throttleWindowMs,
    steadyStateRpm,
    recoveryIntervalMs,
    perBatchLatency,
    evalScore,
  };
}

// ---------------------------------------------------------------------------
// Markdown emitter — destined for docs/architecture/llm-pipeline-reliability.md
// ---------------------------------------------------------------------------

function fmtMsOrNull(v: number | null): string {
  if (v === null) return 'n/a';
  return `${v.toFixed(0)} ms`;
}

function renderMarkdown(snap: AnalyzerSnapshot): string {
  const lines: string[] = [];
  lines.push('## LLM Run Analysis');
  lines.push('');
  lines.push(`Run timestamp: ${new Date(snap.runTimestamp).toISOString()}`);
  lines.push(`Duration: ${snap.durationMs} ms`);
  lines.push(`Batches: ${snap.batchCount}`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('| ------ | ----- |');
  lines.push(
    `| Throttle window (Path ${snap.throttleWindowMs.path}) | median ${fmtMsOrNull(snap.throttleWindowMs.median)} / p95 ${fmtMsOrNull(snap.throttleWindowMs.p95)} |`,
  );
  lines.push(`| Steady-state RPM (NIM) | ${snap.steadyStateRpm} |`);
  lines.push(`| Recovery interval (ms) | ${snap.recoveryIntervalMs ?? 'n/a'} |`);
  lines.push(
    `| Per-batch latency p50 / p95 (ms) | ${snap.perBatchLatency.p50} / ${snap.perBatchLatency.p95} |`,
  );
  lines.push(`| Watchdog hard-kill count | ${snap.watchdogTimeoutCount} |`);
  lines.push(
    `| Eval @ 5/20/100km | ${snap.evalScore.within5km} / ${snap.evalScore.within20km} / ${snap.evalScore.within100km} (of ${snap.evalScore.total}) |`,
  );
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Argv parsing (mirror scripts/eval-replay.ts:25-35 shape — no CLI lib).
// ---------------------------------------------------------------------------

function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found?.split('=')[1];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: npm run analyze:llm-run -- [--fixture=<path>] [--snapshot=<path>]');
    console.log('Env: CACHE_KEY_PREFIX must be exported manually if it has trailing whitespace.');
    process.exit(0);
  }
  const fixture = parseArg('fixture');
  const snapshotPath = parseArg('snapshot');

  let summary: LLMRunSummary;
  if (fixture) {
    // Fixture-mode (smoke test) — read LLMRunSummary from a local JSON file.
    let raw: string;
    try {
      raw = readFileSync(fixture, 'utf8');
    } catch (err) {
      console.error(`fixture file missing or unreadable: ${fixture}`);
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    summary = JSON.parse(raw) as LLMRunSummary;
  } else {
    // Redis-mode (production) — read events:llm-summary:v3 with a long logical
    // TTL so the analyzer never considers the summary "stale" (we want the
    // most recent run regardless of age).
    const cached = await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999);
    if (!cached?.data) {
      console.error('events:llm-summary:v3 missing or empty');
      process.exit(1);
    }
    summary = cached.data;
  }

  const snap = buildSnapshot(summary);
  log.info(
    {
      path: snap.throttleWindowMs.path,
      median: snap.throttleWindowMs.median,
      steadyStateRpm: snap.steadyStateRpm,
      recoveryIntervalMs: snap.recoveryIntervalMs,
      watchdogTimeoutCount: snap.watchdogTimeoutCount,
    },
    'analyzer summary',
  );

  // Markdown table is the operator-facing stdout contract (intentional
  // console.log per CLAUDE.md logger discipline — analyzer's stdout IS the
  // doc-paste artifact for D-06).
  console.log(renderMarkdown(snap));

  // JSON snapshot. When --snapshot=<path> is provided, write to disk; else
  // emit alongside the Markdown so the operator can pipe stdout through jq.
  const json = JSON.stringify(snap, null, 2);
  if (snapshotPath) {
    writeFileSync(snapshotPath, json + '\n');
    log.info({ snapshotPath }, 'snapshot written');
  } else {
    console.log('');
    console.log(json);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
