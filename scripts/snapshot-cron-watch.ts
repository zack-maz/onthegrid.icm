#!/usr/bin/env node
/**
 * Phase 31 D-07 / D-08 — daily snapshot script for the cron-stability watch.
 *
 * Reads four sources and emits one structured row per UTC tick into
 * `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json`:
 *
 *   1. `events:llm-summary:v3` from Redis — per-cron LLMRunSummary
 *      (batchCount, callHistory[].skipReason, evalScore.{within5/20/100km,total}).
 *   2. `events:llm-dlq` SADD set from Redis — DLQEntry list.
 *   3. `cron:lastTick:refresh-events` from Redis — bare Date.now() number
 *      written by the cron route at server/routes/refresh-events-cron.ts:74.
 *   4. `/api/health` HTTP GET — public route, no Bearer; the script only
 *      consumes `endpoints.llmEvents.status` per Phase 28.2 W6 contract.
 *
 * Classification (D-03 hybrid PASS rule + D-11 GAP semantics):
 *   - GAP  : `healthStatus === 'unknown' && freshnessMs === null` (precedence).
 *   - FAIL : healthStatus !== 'healthy', OR any DLQ reason not in
 *            `WATCH_DLQ_WHITELIST = ['v3:timeout_watchdog',
 *            'v3:adaptive-retry-fail']`.
 *   - PASS : otherwise.
 *
 * Exit codes (per CONTEXT D-10):
 *   0 = PASS, 1 = FAIL, 2 = GAP, 99 = script error.
 *
 * Usage:
 *   npm run watch:snapshot
 *   npm run watch:snapshot -- --tick-date=2026-05-18 --notes="manual re-run"
 *   npm run watch:snapshot -- --force --notes="D-02 prep-validation force-trigger"
 *   npm run watch:snapshot -- --help
 *
 * Idempotency: a re-run with the same `--tick-date` overwrites the matching
 * row in-place (same-day reruns never duplicate). `--force` sets
 * `natural: false` so the row does NOT advance the 7-consecutive counter
 * (per CONTEXT D-09).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { cacheGetSafe, redis } from '../server/cache/redis.js';
import { logger } from '../server/lib/logger.js';

import type { LLMRunSummary } from '../server/lib/llmProgress.js';

const log = logger.child({ module: 'snapshotCronWatch' });

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../.planning/phases/31-cron-stability-validation-7-day-watch');
const OUT_PATH = resolve(OUT_DIR, 'watch-log.json');
const TMP_PATH = resolve(OUT_DIR, 'watch-log.json.tmp');

/**
 * The canonical DLQ-whitelist used to classify a tick as PASS vs FAIL.
 *
 * Per 31-RESEARCH.md §Vector 3: these are the TWO DLQEntry.reason values
 * that represent transient / expected per-batch failures the cascade is
 * designed to absorb without operator action. ANY other DLQ reason (zod
 * failures, retry exhaustion, malformed JSON, schema fail, etc.) signals
 * a real regression and flips the day to FAIL.
 *
 * The CONTEXT.md illustrative strings `'transient_rate_limit'` and
 * `'watchdog_timeout'` are NOT canonical and must not be used here — see
 * 31-RESEARCH.md §Vector 3 IMPORTANT-CORRECTION block.
 */
export const WATCH_DLQ_WHITELIST = ['v3:timeout_watchdog', 'v3:adaptive-retry-fail'] as const;

// ---------------------------------------------------------------------------
// Schemas (Zod). Pinned by server/__tests__/scripts/snapshot-cron-watch.test.ts.
// `.strict()` is REQUIRED on both schemas so extra keys fail loud — that is
// the schema-drift fence (Risk 2 in 31-RESEARCH.md).
// ---------------------------------------------------------------------------

const WatchResultSchema = z.enum(['PASS', 'FAIL', 'GAP']);

export const WatchRowSchema = z
  .object({
    tickDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    snapshotAt: z.string().datetime(),
    natural: z.boolean(),
    healthStatus: z.string(),
    freshnessMs: z.number().int().nullable(),
    dlq: z
      .object({
        count: z.number().int().nonnegative(),
        reasons: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    eval: z
      .object({
        at5km: z.number().nullable(),
        at20km: z.number().nullable(),
        at100km: z.number().nullable(),
      })
      .strict(),
    batchCount: z.number().int().nonnegative(),
    breakerTrips: z.number().int().nonnegative(),
    result: WatchResultSchema,
    notes: z.string(),
  })
  .strict();

export const WatchLogSchema = z
  .object({
    schemaVersion: z.literal('1.0'),
    lastSnapshottedTickDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
    rows: z.array(WatchRowSchema),
  })
  .strict();

export type WatchResult = z.infer<typeof WatchResultSchema>;
export type WatchRow = z.infer<typeof WatchRowSchema>;
export type WatchLog = z.infer<typeof WatchLogSchema>;

// ---------------------------------------------------------------------------
// Pure classification helpers — these are the load-bearing rules the contract
// test pins. Keep them allocation-free and side-effect-free.
// ---------------------------------------------------------------------------

/**
 * D-03 hybrid PASS rule + D-11 GAP precedence.
 *
 * GAP takes precedence: a missed snapshot day cannot be classified as
 * PASS or FAIL because Redis only retains the most-recent tick.
 */
export function classifyTick(row: WatchRow): WatchResult {
  if (row.healthStatus === 'unknown' && row.freshnessMs === null) return 'GAP';
  if (row.healthStatus !== 'healthy') return 'FAIL';
  for (const reason of Object.keys(row.dlq.reasons)) {
    if (!(WATCH_DLQ_WHITELIST as readonly string[]).includes(reason)) return 'FAIL';
  }
  return 'PASS';
}

/**
 * D-04 / D-09 counter logic: walks rows newest-first and counts a streak of
 * PASS-natural rows. GAP rows pause (do not break, do not count). FAIL or
 * non-natural rows break the streak.
 */
export function consecutivePassCount(rows: WatchRow[]): number {
  let count = 0;
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]!;
    if (r.result === 'GAP') continue;
    if (r.result === 'PASS' && r.natural === true) {
      count++;
      continue;
    }
    break;
  }
  return count;
}

// ---------------------------------------------------------------------------
// Argv parsing (mirror scripts/analyze-llm-run.ts:249-253 — no CLI lib).
// ---------------------------------------------------------------------------

function parseArg(name: string): string | undefined {
  const flag = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(flag));
  return found?.split('=')[1];
}

// ---------------------------------------------------------------------------
// Redis adapter — DLQEntry-shape parsing with degrade-open semantics.
// ---------------------------------------------------------------------------

interface DLQEntryLike {
  reason: string;
}

function parseDlqMember(raw: unknown): DLQEntryLike | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as DLQEntryLike;
    if (raw && typeof raw === 'object') return raw as DLQEntryLike;
    return null;
  } catch {
    return null;
  }
}

async function readDlqHistogram(): Promise<{ count: number; reasons: Record<string, number> }> {
  let members: unknown[] = [];
  try {
    members = (await redis.smembers('events:llm-dlq')) as unknown[];
  } catch (err) {
    log.warn({ err: String(err) }, 'DLQ smembers failed — treating as 0 entries (degrade-open)');
    return { count: 0, reasons: {} };
  }
  const histogram: Record<string, number> = {};
  let parsed = 0;
  for (const m of members) {
    const entry = parseDlqMember(m);
    if (!entry) continue;
    parsed++;
    const reason = entry.reason ?? 'unknown';
    histogram[reason] = (histogram[reason] ?? 0) + 1;
  }
  return { count: parsed, reasons: histogram };
}

async function readLastTickTs(): Promise<number | null> {
  try {
    const cached = await cacheGetSafe<number | { value: number }>(
      'cron:lastTick:refresh-events',
      999_999_999,
    );
    if (!cached?.data) return null;
    if (typeof cached.data === 'number') return cached.data;
    if (typeof cached.data === 'object' && typeof cached.data.value === 'number')
      return cached.data.value;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Health fetch — public endpoint, no Bearer (Phase 28.2 W6 contract).
// ---------------------------------------------------------------------------

interface HealthResponse {
  endpoints?: { llmEvents?: { status?: string } };
}

async function readHealthStatus(healthUrl: string): Promise<string> {
  const res = await fetch(healthUrl);
  if (!res.ok) {
    throw new Error(`/api/health returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as HealthResponse;
  const status = body.endpoints?.llmEvents?.status;
  if (typeof status !== 'string' || status.length === 0) {
    throw new Error('/api/health response missing endpoints.llmEvents.status');
  }
  return status;
}

// ---------------------------------------------------------------------------
// Watch-log persistence
// ---------------------------------------------------------------------------

function readWatchLog(): WatchLog {
  if (!existsSync(OUT_PATH)) {
    return { schemaVersion: '1.0', lastSnapshottedTickDate: null, rows: [] };
  }
  const raw = readFileSync(OUT_PATH, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  return WatchLogSchema.parse(parsed);
}

function writeWatchLog(snapshot: WatchLog): void {
  WatchLogSchema.parse(snapshot);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(TMP_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  renameSync(TMP_PATH, OUT_PATH);
}

// ---------------------------------------------------------------------------
// GAP backfill — if the operator missed a day between
// `lastSnapshottedTickDate` and today, emit one synthetic GAP row per missed
// day. Redis only retains the most-recent tick (CONTEXT D-11) so the historic
// data for those missed days is unrecoverable; the GAP rows preserve the
// shape of the timeline.
// ---------------------------------------------------------------------------

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function* daysBetween(startExclusive: string, endExclusive: string): Generator<string> {
  const start = new Date(`${startExclusive}T00:00:00Z`);
  const end = new Date(`${endExclusive}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  while (start.getTime() < end.getTime()) {
    yield isoDate(start);
    start.setUTCDate(start.getUTCDate() + 1);
  }
}

function buildGapRow(tickDate: string, snapshotAt: string): WatchRow {
  const row: WatchRow = {
    tickDate,
    snapshotAt,
    natural: true,
    healthStatus: 'unknown',
    freshnessMs: null,
    dlq: { count: 0, reasons: {} },
    eval: { at5km: null, at20km: null, at100km: null },
    batchCount: 0,
    breakerTrips: 0,
    result: 'GAP',
    notes: 'operator-missed snapshot; Redis only retains last tick',
  };
  row.result = classifyTick(row);
  return row;
}

// ---------------------------------------------------------------------------
// Markdown table renderer (operator-facing stdout contract per
// analyze-llm-run.ts:300-301 convention).
// ---------------------------------------------------------------------------

function renderMarkdownTable(rows: WatchRow[]): string {
  const lines: string[] = [];
  lines.push(
    '| Day | Date | Health | Fresh (m) | DLQ | Eval @5/20/100km | Batches | Breakers | Result |',
  );
  lines.push(
    '| --- | ---- | ------ | --------- | --- | ---------------- | ------- | -------- | ------ |',
  );
  rows.forEach((r, idx) => {
    const dayLabel = r.natural ? `D-${idx + 1}` : 'D-0';
    const freshMin = r.freshnessMs === null ? '–' : Math.round(r.freshnessMs / 60_000).toString();
    const evalStr = `${r.eval.at5km ?? '–'} / ${r.eval.at20km ?? '–'} / ${r.eval.at100km ?? '–'}`;
    const reasonsSummary =
      Object.keys(r.dlq.reasons).length === 0
        ? `${r.dlq.count}`
        : `${r.dlq.count} (${Object.entries(r.dlq.reasons)
            .map(([k, v]) => `${k}:${v}`)
            .join(',')})`;
    lines.push(
      `| ${dayLabel} | ${r.tickDate} | ${r.healthStatus} | ${freshMin} | ${reasonsSummary} | ${evalStr} | ${r.batchCount} | ${r.breakerTrips} | ${r.result} |`,
    );
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log(
      'Usage: npm run watch:snapshot -- [--tick-date=YYYY-MM-DD] [--force] [--notes="..."] [--health-url=...]',
    );
    console.log('Exit codes: 0=PASS, 1=FAIL, 2=GAP, 99=script error.');
    console.log(
      'Env: SNAPSHOT_HEALTH_URL overrides --health-url default of https://otg-iran-monitor.vercel.app/api/health',
    );
    process.exit(0);
  }

  const tickDateArg = parseArg('tick-date');
  const force = process.argv.includes('--force');
  const notesArg = parseArg('notes') ?? '';
  const healthUrl =
    parseArg('health-url') ??
    process.env.SNAPSHOT_HEALTH_URL ??
    'https://otg-iran-monitor.vercel.app/api/health';

  const tickDate = tickDateArg ?? isoDate(new Date());
  const snapshotAt = new Date().toISOString();

  // Load existing log (or scaffold) BEFORE doing I/O so we can detect GAPs.
  const watchLog = readWatchLog();

  // GAP backfill — emit one synthetic GAP row per missed day between the
  // last recorded snapshot and today (exclusive on both sides).
  if (watchLog.lastSnapshottedTickDate && watchLog.lastSnapshottedTickDate < tickDate) {
    for (const gapDate of daysBetween(watchLog.lastSnapshottedTickDate, tickDate)) {
      const existing = watchLog.rows.find((r) => r.tickDate === gapDate);
      if (existing) continue;
      watchLog.rows.push(buildGapRow(gapDate, snapshotAt));
    }
  }

  // Read the four data sources for the CURRENT tick.
  const summary =
    (await cacheGetSafe<LLMRunSummary>('events:llm-summary:v3', 999_999_999))?.data ?? null;
  const dlq = await readDlqHistogram();
  const lastTickTs = await readLastTickTs();
  const healthStatus = await readHealthStatus(healthUrl);

  const callHistory = summary?.callHistory ?? [];
  const breakerTrips = callHistory.filter((c) => c.skipReason === 'breaker').length;
  const evalTotal = summary?.evalScore?.total ?? 0;
  const evalRatios: WatchRow['eval'] =
    evalTotal > 0
      ? {
          at5km: (summary?.evalScore?.within5km ?? 0) / evalTotal,
          at20km: (summary?.evalScore?.within20km ?? 0) / evalTotal,
          at100km: (summary?.evalScore?.within100km ?? 0) / evalTotal,
        }
      : { at5km: null, at20km: null, at100km: null };

  const derivedNotes: string[] = [];
  if (notesArg) derivedNotes.push(notesArg);
  if (dlq.count > 0) {
    const reasonsSummary = Object.entries(dlq.reasons)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    derivedNotes.push(`dlq=${reasonsSummary}`);
  }
  // Risk 6 (31-RESEARCH.md): flag any non-NIM routing — current cascade is NIM-only.
  const nonNimProviders = new Set(
    callHistory.filter((c) => c.provider !== 'nvidia_nim').map((c) => c.provider),
  );
  if (nonNimProviders.size > 0) {
    derivedNotes.push(`non-nim-providers=${[...nonNimProviders].join(',')}`);
  }

  const row: WatchRow = {
    tickDate,
    snapshotAt,
    natural: !force,
    healthStatus,
    freshnessMs: lastTickTs === null ? null : Math.round(Date.now() - lastTickTs),
    dlq,
    eval: evalRatios,
    batchCount: summary?.batchCount ?? 0,
    breakerTrips,
    result: 'PASS', // overwritten by classifyTick below
    notes: derivedNotes.join(' | '),
  };
  row.result = classifyTick(row);

  // Idempotent insert: same tickDate overwrites the prior row in place.
  const existingIdx = watchLog.rows.findIndex((r) => r.tickDate === tickDate);
  if (existingIdx === -1) {
    watchLog.rows.push(row);
  } else {
    watchLog.rows[existingIdx] = row;
  }
  watchLog.rows.sort((a, b) => a.tickDate.localeCompare(b.tickDate));

  // Update top-level pointer — most-recent non-GAP row, regardless of natural.
  const nonGapNewest = [...watchLog.rows].reverse().find((r) => r.result !== 'GAP');
  watchLog.lastSnapshottedTickDate = nonGapNewest ? nonGapNewest.tickDate : null;

  writeWatchLog(watchLog);

  console.log(renderMarkdownTable(watchLog.rows));
  console.log('');
  console.log(`Consecutive natural-PASS days: ${consecutivePassCount(watchLog.rows)} / 7`);

  log.info(
    {
      tickDate,
      natural: row.natural,
      healthStatus,
      dlqCount: dlq.count,
      result: row.result,
      consecutive: consecutivePassCount(watchLog.rows),
    },
    'watch tick captured',
  );

  const exitCode = row.result === 'PASS' ? 0 : row.result === 'FAIL' ? 1 : 2;
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  try {
    if (existsSync(TMP_PATH)) unlinkSync(TMP_PATH);
  } catch {
    /* swallow */
  }
  process.exit(99);
});
