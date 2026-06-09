/**
 * Phase 39 OBS-FLIGHT-02 — Redis-backed per-run summary ring.
 *
 * Companion to `llmCallHistory.ts`; same bounded-list + parseEntry +
 * degrade-open idiom. Records one `RunHistoryEntry` per `runRefreshExtraction`
 * run so the flight recorder can answer "what happened to last night's 3am
 * run?".
 *
 * GA-2 lifecycle: `openRunRecord` LPUSHes a `running` record at run start;
 * `closeRunRecord` re-LPUSHes (NOT LSET) the terminal record at run end. Why
 * re-LPUSH over LSET-by-index: LTRIM shifts list indices, so an index-based
 * mutation is fragile. Re-LPUSH is append-only and ordering-safe — the terminal
 * record lands at the head (newest), the stale `running` record sits deeper,
 * and `listRunHistory` dedupes by `runId` (first/head wins) returning the
 * terminal state. A run killed by Vercel's `maxDuration` leaves only the
 * `running` record — the intended "run that died" signal (Pitfall 5).
 *
 * Bounded at 200 entries (`RUNS_MAX`) via native LTRIM; 30d TTL (`RUNS_TTL_SEC`,
 * D-02). Degrade-open: every redis call try/caught; this module NEVER throws.
 */

import { redis } from '../cache/redis.js';

import { logger } from './logger.js';

import type { RunHistoryEntry } from './llmProgress.js';

const log = logger.child({ module: 'llm-run-history' });

/** Redis key for the run-history ring (LPUSH+LTRIM 200-cap, 30d TTL). */
export const RUNS_KEY = 'llm:runs:history';
const RUNS_MAX = 200;
const RUNS_TTL_SEC = 30 * 24 * 3600;

/**
 * Parse a list member that may be JSON text or an already-deserialized object
 * (Upstash REST dual-shape — copied from `llmDLQ.ts`/`llmCallHistory.ts`).
 */
function parseEntry(raw: unknown): RunHistoryEntry | null {
  try {
    if (typeof raw === 'string') return JSON.parse(raw) as RunHistoryEntry;
    if (raw && typeof raw === 'object') return raw as RunHistoryEntry;
    return null;
  } catch {
    return null;
  }
}

/** LPUSH a record, then LTRIM to the 200 newest and refresh the 30d TTL. */
async function pushRecord(entry: RunHistoryEntry): Promise<void> {
  try {
    await redis.lpush(RUNS_KEY, JSON.stringify(entry)); // newest at head
    await redis.ltrim(RUNS_KEY, 0, RUNS_MAX - 1); // native bounded ring
    await redis.expire(RUNS_KEY, RUNS_TTL_SEC);
  } catch (err) {
    log.warn({ err, runId: entry.runId }, 'runHistory push failed'); // never throw
  }
}

/**
 * Open a run record at run START (`outcome:'running'`, `completedAt:null`).
 * All numeric fields are zeroed; the terminal `closeRunRecord` re-LPUSHes the
 * real counts. Degrade-open.
 */
export async function openRunRecord(args: { runId: string; startedAt: string }): Promise<void> {
  const entry: RunHistoryEntry = {
    runId: args.runId,
    startedAt: args.startedAt,
    completedAt: null,
    outcome: 'running',
    batchCount: 0,
    batchesCompleted: 0,
    batchesFailed: 0,
    tokenSpend: { nvidia_nim: 0 },
    evalScore: undefined,
    dlqDelta: 0,
    watchdogTimeouts: 0,
    durationMs: 0,
    pipelineVersion: 'v3',
  };
  await pushRecord(entry);
}

/**
 * Close a run record at run END by re-LPUSHing the FULL terminal entry (NOT
 * LSET-by-index — GA-2). The reader's dedupe-by-runId (head-first) returns this
 * terminal record over the earlier `running` one. Degrade-open.
 */
export async function closeRunRecord(entry: RunHistoryEntry): Promise<void> {
  await pushRecord(entry);
}

/**
 * Return up to `limit` run records, newest first, deduped by `runId`
 * (first/head occurrence wins — the terminal record sits at the head since it
 * was re-LPUSHed after the `running` record). A never-closed `running` run
 * (maxDuration kill) survives as its sole occurrence (Pitfall 5). Degrade-open
 * → [] on Redis failure.
 */
export async function listRunHistory(limit = RUNS_MAX): Promise<RunHistoryEntry[]> {
  try {
    const raw = await redis.lrange(RUNS_KEY, 0, limit - 1);
    const parsed = raw.map((r) => parseEntry(r)).filter((x): x is RunHistoryEntry => x !== null);
    const seen = new Set<string>();
    return parsed.filter((r) => (seen.has(r.runId) ? false : (seen.add(r.runId), true)));
  } catch {
    return [];
  }
}

/**
 * OBS-FLIGHT-06 cold-start hydration symmetry with `hydrateCallHistoryIfCold`.
 * No in-memory run singleton exists, so this primes nothing beyond marking the
 * module hydrated (one bounded LRANGE, flag-guarded against re-LRANGE) — kept
 * for endpoint symmetry and forward use. Degrade-open.
 */
let runHistoryHydrated = false;
export async function hydrateRunHistoryIfCold(): Promise<void> {
  if (runHistoryHydrated) return;
  runHistoryHydrated = true; // set FIRST — best-effort, never retry-loop
  await listRunHistory(RUNS_MAX);
}

/** Test-only: reset the module-level hydration flag between cases. */
export function __resetRunHistoryHydrationForTest(): void {
  runHistoryHydrated = false;
}
