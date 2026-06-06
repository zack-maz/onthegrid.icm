/**
 * Phase 32 (Plan 32-01) — UrlLiveness schema + tiered TTL surface.
 *
 * Foundation module for the ghost-event URL liveness pipeline. This file
 * lands the Zod contract + TTL upper-bound helper + Redis key namespace
 * constants BEFORE any writer / reader exists so future commits in plans
 * 32-02..32-06 compile against a pinned surface and a `.strict()` schema
 * drift fails the next `vitest run`.
 *
 * Decisions implemented in this file:
 *   - D-19  Per-event Redis key shape: `events:url-liveness:{eventId}`
 *           with a JSON value `{status, lastProbedAt, attemptCount,
 *           lastUrlProbed, lastHttpStatus}`.
 *   - D-20  Tiered TTL by status: `live` → 7d, terminal-dead
 *           (`404`/`403`/`dead-host`) → 24h, `unknown` → 1h.
 *   - D-22  Schema is `z.object({...}).strict()` so extra keys / missing
 *           fields / unknown enum values all throw at parse time. The
 *           D-22 contract test (`server/__tests__/lib/urlLiveness.schema.test.ts`)
 *           pins this BEFORE Plan 02 adds the probe writer — silent shape
 *           drift fails the next `vitest run`.
 *
 * NOT in this file (lands in Plans 02 + 03):
 *   - `probeUrl` HTTP HEAD/GET primitive (Plan 02 Task 1; D-16/D-17/D-18/D-21).
 *   - `runProbeSweep` orchestrator + per-host throttle map (Plan 02 Tasks 2-5).
 *   - `pruneDeadUrlEvents` Redis splice + audit-log helper (Plan 03 Task 1).
 *   - `events:url-liveness-count` sidecar INCR/DECR (Plan 02 Task 3 +
 *     Plan 03 Task 1 jointly maintain the integer; the key constant is
 *     declared here as the canonical single source of truth).
 *
 * The unused `log` binding is pre-wired so Plans 02/03 do not need to
 * re-edit the imports — they consume `log.info`/`log.warn`/`log.error`
 * inside the probe + sweep + prune helpers.
 */

import { z } from 'zod';

import { cacheGetSafe, cacheSetSafe, redis } from '../cache/redis.js';

import { createLimit } from './concurrencyLimit.js';
// Phase 32 Plan 32-03 — reuse the canonical v3 cache key + terminal v3 cache
// TTL from llmExtractionPipeline so the prune splice writer shares ONE truth
// source with the cron writer. Hand-rolling the literal 'events:llm:v3' or the
// 48h LLM_TERMINAL_TTL_SEC here is the exact drift class CLAUDE.md §"Serverless
// Cache" warns against. The prune splice MUST use the terminal TTL (not the
// short cooldown sentinel) so it never silently re-TTLs v3 down. The
// plan-checker MEDIUM-01 note (Upstash SCAN
// signature) is honored inline at the SCAN call below — the cast to
// `Promise<[string | number, string[]]>` matches @upstash/redis ^1.37.0
// and the pinning pattern Plan 04's buildDeadUrlSample uses for its
// SCAN iteration.
import { LLM_EVENTS_KEY_ACTIVE, LLM_TERMINAL_TTL_SEC } from './llmExtractionPipeline.js';
import { logger } from './logger.js';
import { appendOperatorAuditEntry } from './operatorAudit.js';

// ============================================================================
// Redis key namespace constants
// ============================================================================

/**
 * D-19 — per-event URL-liveness key family prefix. Callers append the
 * event ID: `${URL_LIVENESS_KEY_PREFIX}${eventId}` → `events:url-liveness:abc123`.
 * Written by the probe sweep (Plan 32-02), DEL'd by `pruneDeadUrlEvents`
 * (Plan 32-03). Tiered TTL per status — see `ttlSecForStatus` below.
 */
export const URL_LIVENESS_KEY_PREFIX = 'events:url-liveness:';

/**
 * Pitfall 3 mitigation — sidecar integer key. Count of events whose primary
 * URL has terminal-dead status. INCR on live→dead transitions, DECR on
 * dead→non-dead AND on prune. No TTL (persistent). Avoids N Redis GETs per
 * dashboard poll. Maintained by Plan 32-02 (probe writer) and Plan 32-03
 * (prune helper); read by Plan 32-04 (`/api/operator-status` aggregator).
 */
export const URL_LIVENESS_COUNT_KEY = 'events:url-liveness-count';

// ============================================================================
// Zod schema + types (D-22 contract — pinned BEFORE any writer exists)
// ============================================================================

/**
 * D-07 + D-19 — five-status taxonomy. Terminal-dead statuses
 * (`404`/`403`/`dead-host`) count toward the dashboard dead-URL count
 * and are eligible for prune. `unknown` (5xx, network blip, transient
 * error) is excluded from the count and re-probed on the next sweep
 * tick. `live` is live.
 */
export const UrlLivenessStatusSchema = z.enum(['live', '404', '403', 'dead-host', 'unknown']);
export type UrlLivenessStatus = z.infer<typeof UrlLivenessStatusSchema>;

/**
 * D-22 contract — `.strict()` rejects extra keys, missing fields, AND
 * unknown enum values at parse time. The matching contract test at
 * `server/__tests__/lib/urlLiveness.schema.test.ts` pins this so future
 * shape drift fails the next `vitest run`.
 */
export const UrlLivenessSchema = z
  .object({
    status: UrlLivenessStatusSchema,
    lastProbedAt: z.string().datetime(),
    /**
     * D-12 + 32-RESEARCH.md A2 — monotonic-with-reset-on-live-or-unknown
     * transition. Increment ONLY when the latest probe status is
     * terminal-dead AND the prior stored status was also terminal-dead
     * (or no prior). Reset to 0 on any `live` or `unknown` transition.
     *
     * Pure-monotonic accumulation would conflate dead→live→dead with
     * three-in-a-row-dead and falsely trigger D-12's cron auto-prune
     * `attemptCount >= 3` gate. The monotonic-with-reset rule makes the
     * "≥3 consecutive terminal-dead ticks" semantics a one-line check
     * inside the probe writer (Plan 32-02 Task 3).
     */
    attemptCount: z.number().int().nonnegative(),
    lastUrlProbed: z.string().url(),
    lastHttpStatus: z.number().int().nullable(),
  })
  .strict();

export type UrlLiveness = z.infer<typeof UrlLivenessSchema>;

// ============================================================================
// D-20 tiered TTL (per status)
// ============================================================================

/**
 * D-20 — TTL ceilings by status. Re-probe cadence proportional to verdict
 * confidence: live verdicts last a week (no need to re-confirm fresh
 * content frequently), terminal-dead verdicts re-confirm daily (so the
 * prune list stays current as publishers move URLs), unknown verdicts
 * re-probe hourly (push toward a terminal verdict fast).
 *
 * The TTL itself is the GC mechanism — there is no separate cleanup
 * pass. When the per-event key expires, the next sweep tick re-probes it.
 *
 * Schema test (Plan 32-01 Task 3) asserts each value here matches the
 * D-20 upper-bound, so silent ceiling raises fail loudly.
 */
const TTL_SEC_BY_STATUS: Record<UrlLivenessStatus, number> = {
  live: 7 * 24 * 3600, // D-20: 7 days
  '404': 24 * 3600, // D-20: 24 hours
  '403': 24 * 3600, // D-20: 24 hours
  'dead-host': 24 * 3600, // D-20: 24 hours
  unknown: 3600, // D-20: 1 hour
};

/**
 * Look up the TTL (in seconds) for a given liveness status. Pure
 * function — no Redis call, no side effects. Used by the probe writer
 * (Plan 32-02) when calling `cacheSetSafe(key, entry, ttlSecForStatus(status))`.
 */
export function ttlSecForStatus(status: UrlLivenessStatus): number {
  return TTL_SEC_BY_STATUS[status];
}

// ============================================================================
// Module-private log binding (pre-wired for Plans 02/03)
// ============================================================================

/**
 * Pino child logger for the urlLiveness module. Pre-declared here so
 * Plans 02/03 (probe + sweep + prune helpers) do not need to re-edit
 * imports.
 */
const log = logger.child({ module: 'urlLiveness' });

// ============================================================================
// Plan 32-02 — probe primitives (D-16, D-17, D-18, D-21)
// ============================================================================

/**
 * D-18 — polite-citizen constants. Hard-coded per CONTEXT "no new
 * env-tunable surfaces" — these are domain knobs for this phase, not
 * operator levers. If a future incident requires emergency tuning,
 * promote to a `VITE_PROBE_*` env family in a separate decimal phase.
 */
const PROBE_CONCURRENCY = 8;
const PROBE_TIMEOUT_MS = 10_000;
const PER_HOST_INTERVAL_MS = 1_000;
const JITTER_MS = 200;
const MAX_REDIRECTS = 3;
const PROBE_UA = 'IranMonitor-LinkCheck/1.0 (+https://otg-iran-monitor.vercel.app)';

/**
 * Pitfall 1 / RESEARCH A6 — caller-supplied wall-clock cutoff for the
 * sweep. Plan 32-03 will compute this as `cronStart + 800_000 - 60_000`
 * so the 60s safety margin reserves time for the post-sweep prune +
 * audit-log writes under Vercel Pro's 800s `maxDuration`. Exported here
 * so all callsites cite the same constant.
 */
export const SWEEP_SAFETY_MARGIN_MS = 60_000;

/**
 * Defense-in-depth SSRF guard (RESEARCH §Security V11). Rejects URLs
 * whose hostname maps to RFC1918 private space, loopback, link-local,
 * IPv6 ULA, ::1, or the AWS / GCP / Azure cloud-metadata services.
 * The probe runs inside the Vercel sandbox; these ranges should never
 * be routable from Vercel egress, but a stored URL that points at one
 * is a tampering signal regardless. Returns `unknown` without issuing
 * fetch.
 *
 * Phase 32 CR-02 fix — IPv6 alternates split out into `IPV6_PRIVATE`
 * because `URL.hostname` returns bracket-wrapped form for v6
 * (`'[::1]'`, `'[fd00::1]'`, `'[fe80::1]'`). The IPv4 regex anchors at
 * `^` and never matched the leading `[`; brackets are now stripped
 * before pattern-matching. The `fc`/`fd` ULA alternates also gained
 * `[0-9a-f]{2}:` hex disambiguation so legitimate hostnames like
 * `fc-barcelona.com` and `fdcompany.com` no longer false-positive-block.
 */
const PRIVATE_HOST_REGEX =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.)/i;

function isPrivateHost(hostname: string): boolean {
  // Node's URL.hostname returns IPv6 with surrounding brackets, e.g. '[::1]'.
  // Strip them so the v6 alternates below anchor against the bare address.
  const h = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  if (PRIVATE_HOST_REGEX.test(h)) return true;
  // IPv6 loopback + unspecified + IPv4-mapped + link-local + ULA.
  // The fc/fd alternates require `[0-9a-f]{2}:` to ensure a real v6 hextet
  // (defangs false positives like `fc-barcelona.com`).
  if (/^::1$/i.test(h)) return true;
  if (/^::$/i.test(h)) return true;
  if (/^::ffff:/i.test(h)) return true;
  if (/^fe80:/i.test(h)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(h)) return true;
  return false;
}

/**
 * Internal shape returned by `probeUrl`. The probe writer (Task 3)
 * derives the `UrlLiveness` Zod-validated entry from this plus the
 * prior cached value.
 */
export interface ProbeResult {
  status: UrlLivenessStatus;
  httpStatus: number | null;
  finalUrl: string;
}

/**
 * fetch-with-timeout helper. Diverges from `server/adapters/nominatim.ts`
 * in two places per CONTEXT D-16 / D-17:
 *   - `redirect: 'manual'` so Phase 32 counts hops itself (not fetch)
 *   - GET branch sets `Range: bytes=0-1023` so 405-fallback caps the
 *     download to 1 KiB
 */
async function fetchOnce(url: string, method: 'HEAD' | 'GET'): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'User-Agent': PROBE_UA };
    if (method === 'GET') headers.Range = 'bytes=0-1023';
    return await fetch(url, {
      method,
      headers,
      redirect: 'manual',
      signal: controller.signal,
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * D-16 / D-17 / D-18 / D-21 — single-URL liveness probe.
 *
 * Method sequence:
 *   1. HEAD with `redirect: 'manual'`. 200 → live; 404 → 404; 403 → 403.
 *   2. On 405, GET with `Range: bytes=0-1023`. 200 → live; 4xx/5xx → same
 *      taxonomy.
 *   3. On 3xx with a `location` header, follow up to MAX_REDIRECTS (3)
 *      hops, counting hops manually. 4th 3xx → `unknown`.
 *   4. fetch throws (DNS / ECONNREFUSED / abort) → `dead-host`.
 *   5. Any other code (5xx, 451, 410, ...) → `unknown`.
 *
 * Defense-in-depth: hostname is checked against `PRIVATE_HOST_REGEX`
 * before any fetch — SSRF target URLs short-circuit to `unknown` with
 * NO outbound request issued.
 */
export async function probeUrl(rawUrl: string): Promise<ProbeResult> {
  // Stage 0 — URL parse + SSRF guard.
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    // Malformed URL — treat as dead-host (no DNS resolution possible).
    return { status: 'dead-host', httpStatus: null, finalUrl: rawUrl };
  }
  if (isPrivateHost(parsed.hostname)) {
    log.warn({ rawUrl }, 'probe target rejected by SSRF guard');
    return { status: 'unknown', httpStatus: null, finalUrl: rawUrl };
  }

  let currentUrl = rawUrl;

  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      // First request is HEAD; subsequent redirect hops also HEAD.
      let res = await fetchOnce(currentUrl, 'HEAD');

      // fetch threw or aborted (network/DNS/timeout) → dead-host.
      if (res === null) {
        return { status: 'dead-host', httpStatus: null, finalUrl: currentUrl };
      }

      // 405 Method Not Allowed — fall back to GET (D-16). CDN-fronted
      // publishers (Cloudflare, Fastly) often refuse HEAD.
      if (res.status === 405) {
        res = await fetchOnce(currentUrl, 'GET');
        if (res === null) {
          return { status: 'dead-host', httpStatus: null, finalUrl: currentUrl };
        }
      }

      const code = res.status;

      // 2xx → live.
      if (code >= 200 && code < 300) {
        return { status: 'live', httpStatus: code, finalUrl: currentUrl };
      }

      // Specific 4xx codes that count toward the dashboard dead surface.
      if (code === 404) {
        return { status: '404', httpStatus: 404, finalUrl: currentUrl };
      }
      if (code === 403) {
        return { status: '403', httpStatus: 403, finalUrl: currentUrl };
      }

      // 3xx — follow up to MAX_REDIRECTS hops. On the (MAX_REDIRECTS+1)th
      // 3xx (i.e. hop === MAX_REDIRECTS at this branch), return unknown.
      if (code >= 300 && code < 400) {
        if (hop >= MAX_REDIRECTS) {
          return { status: 'unknown', httpStatus: code, finalUrl: currentUrl };
        }
        const location = res.headers.get('location');
        if (!location) {
          // 3xx without Location — protocol violation. Bail with unknown.
          return { status: 'unknown', httpStatus: code, finalUrl: currentUrl };
        }
        // Resolve relative redirects against the current URL.
        try {
          currentUrl = new URL(location, currentUrl).toString();
        } catch {
          return { status: 'unknown', httpStatus: code, finalUrl: currentUrl };
        }
        // Re-run SSRF guard for each redirect target (defense-in-depth —
        // a hostile redirect can point at a private host).
        try {
          if (isPrivateHost(new URL(currentUrl).hostname)) {
            log.warn(
              { rawUrl, redirectTarget: currentUrl },
              'redirect target rejected by SSRF guard',
            );
            return { status: 'unknown', httpStatus: code, finalUrl: currentUrl };
          }
        } catch {
          return { status: 'unknown', httpStatus: code, finalUrl: currentUrl };
        }
        continue; // next hop
      }

      // Any other code (5xx, 451, 410, 4xx not in {403,404,405}) → unknown.
      return { status: 'unknown', httpStatus: code, finalUrl: currentUrl };
    }

    // Loop exhausted without return (shouldn't be reachable; MAX_REDIRECTS+1
    // iterations always terminate inside the loop). Treat as unknown.
    return { status: 'unknown', httpStatus: null, finalUrl: currentUrl };
  } catch (err) {
    // Catch-all guard — any unexpected throw collapses to dead-host so
    // the sweep keeps moving.
    log.warn({ err, rawUrl }, 'probeUrl unexpected throw');
    return { status: 'dead-host', httpStatus: null, finalUrl: currentUrl };
  }
}

// ============================================================================
// Plan 32-02 Task 2 — per-host throttle map (D-18 polite-citizen contract)
// ============================================================================

/**
 * Module-singleton hostname → next-allowed-timestamp map. Persists across
 * `runProbeSweep` invocations within a single warm Vercel function
 * instance — so back-to-back sweeps don't burst the same publisher.
 *
 * Pitfall 2: this Map can grow unboundedly across long-warm function
 * instances. `pruneStaleHostSlots()` runs at end-of-sweep and removes
 * entries older than `now - 60s`; daily cold-start naturally resets the
 * full state.
 */
const hostNext = new Map<string, number>();

/**
 * D-18 — block until the per-host probe slot is available, then reserve
 * the next slot. Mirrors the philosophical contract of the Nominatim
 * 1-req/s throttle (CLAUDE.md §LLM pipeline). ±JITTER_MS prevents
 * stampede when many hosts unblock simultaneously.
 */
async function waitForHostSlot(hostname: string): Promise<void> {
  const now = Date.now();
  const prior = hostNext.get(hostname) ?? 0;
  // Symmetric jitter in [-JITTER_MS, +JITTER_MS]. Floor so the test
  // assertion "≥ PER_HOST_INTERVAL_MS - JITTER_MS" holds deterministically.
  const jitter = Math.floor((Math.random() - 0.5) * 2 * JITTER_MS);
  const target = Math.max(now, prior) + jitter;
  // Reserve the NEXT slot SYNCHRONOUSLY before awaiting. Without this,
  // concurrent same-host dispatchers (e.g. 4 items dispatched into
  // createLimit(8) on the same hostname) all read the same `prior`
  // simultaneously and race to update — coalescing to ~1 throttle gap
  // instead of N-1. Math.max(now, target) floors against the
  // negative-jitter case.
  const reservedAt = Math.max(now, target);
  hostNext.set(hostname, reservedAt + PER_HOST_INTERVAL_MS);
  if (target > now) {
    await new Promise<void>((resolve) => setTimeout(resolve, target - now));
  }
}

/**
 * Pitfall 2 — drop hostname entries whose next-allowed timestamp is
 * already 60s in the past. Called at end-of-sweep so the map doesn't
 * leak memory across warm-instance lifetime.
 */
function pruneStaleHostSlots(): void {
  const cutoff = Date.now() - 60_000;
  for (const [host, ts] of hostNext) {
    if (ts < cutoff) hostNext.delete(host);
  }
}

// ============================================================================
// Plan 32-02 Task 3 — persistLiveness writer (D-12 / RESEARCH A2)
// ============================================================================

/**
 * D-07 — terminal-dead statuses count toward the dashboard dead-URL
 * surface and are eligible for prune. Exported so Plan 32-03 reuses the
 * predicate inside `pruneDeadUrlEvents` (and the sweep+prune INCR/DECR
 * sidecar maintenance share one truth source).
 */
export function isTerminalDead(status: UrlLivenessStatus): boolean {
  return status === '404' || status === '403' || status === 'dead-host';
}

/**
 * Logical TTL passed to `cacheGetSafe` — the safe wrapper uses this only
 * to set the `stale` flag on the response envelope; the read itself
 * always returns whatever is in Redis (or the in-memory fallback). For
 * the probe path we don't gate on stale-ness — we always trust the most
 * recent stored value as `prior`. A huge sentinel (~31y) suppresses the
 * stale flag in all realistic conditions.
 */
const LIVENESS_READ_LOGICAL_TTL_MS = 999_999_999;

/**
 * Probe writer. Reads the prior `events:url-liveness:{eventId}` entry
 * (if any), derives the next `UrlLiveness` via the D-12 / RESEARCH A2
 * monotonic-with-reset attemptCount semantics, validates the result
 * against `UrlLivenessSchema` (paranoid drift catch), persists via
 * `cacheSetSafe` exclusively (Pitfall 6 — chaos-test contract holds),
 * and maintains the sidecar `events:url-liveness-count` integer on
 * live↔terminal-dead transitions (Pitfall 3).
 *
 * attemptCount semantics (RESEARCH A2):
 *   prior=null,             next ∈ {live, unknown}     → attemptCount=0
 *   prior=null,             next ∈ {terminal-dead}     → attemptCount=1
 *   prior=terminal-dead,    next ∈ {terminal-dead}     → attemptCount=prior+1
 *   prior=terminal-dead,    next ∈ {live, unknown}     → attemptCount=0
 *   prior ∈ {live, unknown}, next=anything             → attemptCount=
 *                                                        (next dead ? 1 : 0)
 *
 * Sidecar INCR fires only on the prior→next transition NOT-DEAD → DEAD.
 * DECR fires only on DEAD → NOT-DEAD. Same-state transitions (dead→dead,
 * live→live, unknown→unknown) do NOT touch the sidecar. Underflow
 * floors at 0 via `redis.set(KEY, 0)` so a DECR race past zero
 * self-heals.
 *
 * Kept module-private. Test access flows through the NODE_ENV='test'
 * `__test__` export. Plan 32-03's `pruneDeadUrlEvents` reads the entry
 * shape but does NOT call this writer — prune is a delete, not a
 * status transition.
 */
async function persistLiveness(
  eventId: string,
  urlProbed: string,
  probeResult: ProbeResult,
): Promise<void> {
  const key = `${URL_LIVENESS_KEY_PREFIX}${eventId}`;
  const priorEntry = await cacheGetSafe<UrlLiveness>(key, LIVENESS_READ_LOGICAL_TTL_MS);
  const prior: UrlLiveness | null = priorEntry?.data ?? null;

  // D-12 / RESEARCH A2 — monotonic-with-reset-on-live-or-unknown.
  const nextDead = isTerminalDead(probeResult.status);
  const priorDead = prior !== null && isTerminalDead(prior.status);
  let attemptCount: number;
  if (!nextDead) {
    // Any live / unknown transition resets the counter (the "≥3
    // consecutive ticks" rule needs an unbroken run).
    attemptCount = 0;
  } else if (priorDead) {
    // dead → dead: monotonic increment.
    attemptCount = prior.attemptCount + 1;
  } else {
    // not-dead → dead (or first write that's dead): start at 1.
    attemptCount = 1;
  }

  const next: UrlLiveness = {
    status: probeResult.status,
    lastProbedAt: new Date().toISOString(),
    attemptCount,
    lastUrlProbed: urlProbed,
    lastHttpStatus: probeResult.httpStatus,
  };

  // Paranoid contract guard — throws on schema drift so the failing
  // sweep task surfaces via the catch-all log.warn in runProbeSweep.
  UrlLivenessSchema.parse(next);

  await cacheSetSafe(key, next, ttlSecForStatus(next.status));

  // Pitfall 3 — sidecar count maintenance on dead-set transitions only.
  // Wrap raw redis.incr/decr in try/catch (cacheSetSafe shape doesn't
  // fit integer counters; Pitfall 6 note says raw incr/decr must
  // degrade-open).
  try {
    if (!priorDead && nextDead) {
      await redis.incr(URL_LIVENESS_COUNT_KEY);
    } else if (priorDead && !nextDead) {
      const after = await redis.decr(URL_LIVENESS_COUNT_KEY);
      if (typeof after === 'number' && after < 0) {
        // Underflow race (concurrent prune ran between our read of
        // `prior` and the DECR) — floor at 0.
        await redis.set(URL_LIVENESS_COUNT_KEY, 0);
      }
    }
  } catch (err) {
    log.warn({ err, eventId, priorDead, nextDead }, 'sidecar count update failed (degrade-open)');
  }
}

// ============================================================================
// Plan 32-02 Task 5 — buildProbeCandidates priority sort (D-04)
// ============================================================================

/**
 * Minimal shape this module needs from a `events:llm:v3` cache entry.
 * Avoids importing the full `ConflictEventEntity` discriminated union
 * (which would pull in MapEntity + server types and bloat the import
 * graph). The runtime check `typeof url === 'string'` defends against
 * any drift in this assumed shape.
 */
interface ConflictEventEntityForProbe {
  id: string;
  data: { source?: string | null };
}

/**
 * Logical TTL for the v3 cache read. Same sentinel rationale as
 * `persistLiveness` — we want whatever is in Redis regardless of
 * stale-ness.
 */
const V3_READ_LOGICAL_TTL_MS = 999_999_999;

/**
 * D-04 — build the sweep candidate list with two-tier priority sort:
 *   Tier A: events with NO `events:url-liveness:{eventId}` key yet
 *           (sorted first; never-probed → dashboard count converges fast
 *           for new events). Internal order within Tier A follows the
 *           natural input order from `events:llm:v3` — deterministic
 *           and stable.
 *   Tier B: events with a prior liveness key, sorted ascending by
 *           `lastProbedAt` (oldest first — re-probe stale verdicts).
 *           ISO-8601 byte-lex sort equals chronological sort.
 *
 * Entities whose `data.source` is empty / missing / non-string are
 * silently dropped (no probe target — the dashboard count remains 0 for
 * those events). Logged at debug rather than throw so a malformed event
 * never poisons the candidate list.
 *
 * Reads `events:llm:v3` once and one `events:url-liveness:{eventId}`
 * lookup per candidate. Plan 32-03 will call this immediately before
 * `runProbeSweep` inside the cron handler.
 */
export async function buildProbeCandidates(): Promise<Array<{ eventId: string; url: string }>> {
  const v3 = await cacheGetSafe<ConflictEventEntityForProbe[]>(
    'events:llm:v3',
    V3_READ_LOGICAL_TTL_MS,
  );
  const entities = v3?.data ?? [];
  if (!Array.isArray(entities) || entities.length === 0) {
    return [];
  }

  const tierA: Array<{ eventId: string; url: string }> = [];
  const tierB: Array<{ eventId: string; url: string; lastProbedAt: string }> = [];

  for (const entity of entities) {
    const url = entity?.data?.source;
    if (!url || typeof url !== 'string' || url.length === 0) {
      // No primary URL — nothing to probe. Skip silently.
      continue;
    }
    const prior = await cacheGetSafe<UrlLiveness>(
      `${URL_LIVENESS_KEY_PREFIX}${entity.id}`,
      LIVENESS_READ_LOGICAL_TTL_MS,
    );
    if (!prior?.data) {
      tierA.push({ eventId: entity.id, url });
    } else {
      tierB.push({
        eventId: entity.id,
        url,
        lastProbedAt: prior.data.lastProbedAt,
      });
    }
  }

  // ISO-8601 byte-lex sort == chronological sort (well-known JS idiom).
  tierB.sort((a, b) => a.lastProbedAt.localeCompare(b.lastProbedAt));

  return [...tierA, ...tierB.map(({ eventId, url }) => ({ eventId, url }))];
}

// ============================================================================
// Plan 32-02 Task 4 — runProbeSweep orchestrator (D-03, D-18, Pitfall 1)
// ============================================================================

/**
 * D-03 — best-effort partial sweep. Given a candidate list (built by
 * `buildProbeCandidates` — Task 5), probes each candidate's URL under
 * `createLimit(PROBE_CONCURRENCY=8)` concurrency cap + per-host 1-req/s
 * throttle + caller-supplied `deadlineMs` wall-clock cutoff.
 *
 * Each task body does the deadline check FIRST (before any URL parse or
 * fetch), so when budget is exhausted the remaining items short-circuit
 * to `skippedBudget++` without consuming wall-clock or Redis calls.
 *
 * Plan 32-03 will compute `deadlineMs` as
 *   `cronStart + 800_000 - SWEEP_SAFETY_MARGIN_MS`
 * inside `/api/cron/refresh-events`, reserving the 60s safety margin
 * for the post-sweep prune + audit-log writes under Vercel Pro's 800s
 * `maxDuration` (Pitfall 1).
 *
 * On exit, `pruneStaleHostSlots()` runs (Pitfall 2) so the per-host
 * throttle map doesn't grow unboundedly across warm-instance lifetime.
 *
 * Errors inside each task body (URL parse, probeUrl unexpected throw,
 * persistLiveness throw) are caught and logged via `log.warn` — one
 * bad task never poisons the rest of the sweep.
 */
export async function runProbeSweep(opts: {
  eventIdsWithUrls: Array<{ eventId: string; url: string }>;
  deadlineMs: number;
}): Promise<{ probed: number; skippedBudget: number }> {
  const limit = createLimit(PROBE_CONCURRENCY);
  let probed = 0;
  let skippedBudget = 0;

  const tasks = opts.eventIdsWithUrls.map(({ eventId, url }) =>
    limit(async () => {
      // Pitfall 1 — deadline guard MUST be the first statement in the
      // task body. Items dispatched AFTER the deadline must NOT touch
      // fetch or Redis.
      if (Date.now() > opts.deadlineMs) {
        skippedBudget++;
        return;
      }

      try {
        const host = new URL(url).hostname;
        await waitForHostSlot(host);
        // Re-check deadline AFTER the throttle wait — the per-host
        // throttle can push us past the cutoff. (Without this, a
        // saturated same-host batch could overrun the Vercel
        // maxDuration after the throttle wait, defeating Pitfall 1.)
        if (Date.now() > opts.deadlineMs) {
          skippedBudget++;
          return;
        }
        const result = await probeUrl(url);
        await persistLiveness(eventId, url, result);
        probed++;
      } catch (err) {
        // Log but never re-throw — one bad URL never poisons the sweep.
        log.warn({ err, eventId, url }, 'probe sweep task failed');
      }
    }),
  );

  await Promise.all(tasks);
  pruneStaleHostSlots();
  return { probed, skippedBudget };
}

// ============================================================================
// Plan 32-03 Task 1 — pruneDeadUrlEvents helper (D-12, D-13, D-14)
// ============================================================================

/**
 * Minimal shape pruneDeadUrlEvents needs from an `events:llm:v3` entry.
 * Avoids importing the full `ConflictEventEntity` discriminated union —
 * same rationale as `ConflictEventEntityForProbe` above.
 */
interface ConflictEventEntityForPrune {
  id: string;
}

/**
 * Read-side stale ignore: prune is a deliberate destructive action and
 * must operate against whatever the cache currently holds. Same sentinel
 * shape as the probe path.
 */
const PRUNE_READ_LOGICAL_TTL_MS = 999_999_999;

/**
 * D-12 + D-13 + D-14 — splice dead-URL events out of `events:llm:v3`.
 *
 * Called from two paths:
 *   - `POST /api/events/prune-dead-urls` (operator click via the API
 *     Health dashboard button — Plan 32-05) with `trigger:'manual'` +
 *     the operator's Bearer fingerprint.
 *   - `runRefreshExtraction` cron post-step (Plan 32-03 Task 3) with
 *     `trigger:'cron'` (no fingerprint — audit log records the literal
 *     string `'cron:refresh-events'` per RESEARCH A8).
 *
 * Filter logic:
 *   - For every event in `events:llm:v3`, look up its
 *     `events:url-liveness:{id}` entry.
 *   - Event is a prune candidate IFF the liveness entry exists AND
 *     `isTerminalDead(status)` is true.
 *   - When `trigger === 'cron'`, additionally require `attemptCount >= 3`
 *     (D-12 — only events terminal-dead across ≥3 consecutive ticks are
 *     eligible for unattended deletion). Manual trigger has no
 *     attemptCount gate (D-09 — operator can prune any flagged event).
 *
 * Delete scope (D-13 — smallest blast radius):
 *   - Splice out of `events:llm:v3` via cacheSetSafe.
 *   - DEL the `events:url-liveness:{id}` keys via bulk `redis.del`.
 *   - DECR the `events:url-liveness-count` sidecar by prunedCount (paired
 *     with the persistLiveness INCR from Plan 32-02 — the count stays
 *     consistent across probe-time INCR and prune-time DECR).
 *   - Does NOT touch `llmLineage`, `callHistory`, news cluster indices,
 *     `operator:audit-log`, or anything else.
 *
 * Audit log (D-14 — RESEARCH Common Op 2 path (b)):
 *   - `{operation:'prune-dead-urls', args:{trigger, prunedCount, prunedIds},
 *      result:'ok'}`. Stashing the count + ids in `args` (rather than
 *     widening `OperatorAuditEntry.result` to admit a struct) avoids
 *     schema migration and is forensically sufficient — operators drill
 *     in via `/operator-status` and see the IDs.
 *
 * SCAN signature (MEDIUM-01 plan-checker pin):
 *   `redis.scan` on `@upstash/redis ^1.37.0` returns
 *   `Promise<[string | number, string[]]>` — cursor type is string OR
 *   number depending on Upstash response shape. We cast explicitly so
 *   the executor's inferred type matches the runtime contract.
 *
 * Race window (T-32-07 / RESEARCH Pitfall 4 / Open Question 3):
 *   GET → splice → SET against `/api/events` reads is documented but
 *   not mutex-locked in v1. The map can flicker a dead event for ≤1
 *   poll cycle (≤15min logical TTL) until the next refresh. Operator
 *   can re-extract via `/llm-replay` if mis-pruned. Promote to a
 *   Redis-backed lock only if a real overlap is observed in audit-log
 *   telemetry.
 *
 * Errors:
 *   The helper does NOT catch its own errors — chaos-test compatibility
 *   (RESEARCH Pitfall 6) requires the route handler at
 *   `POST /api/events/prune-dead-urls` to translate a Redis throw into
 *   `503 prune_failed`, NOT `500`. Caller's try/catch is the contract.
 */
export async function pruneDeadUrlEvents(opts: {
  trigger: 'manual' | 'cron';
  fingerprint?: string;
}): Promise<{ prunedCount: number; prunedIds: string[] }> {
  // 1. Read the v3 cache. If empty / null → nothing to prune.
  const v3 = await cacheGetSafe<ConflictEventEntityForPrune[]>(
    LLM_EVENTS_KEY_ACTIVE,
    PRUNE_READ_LOGICAL_TTL_MS,
  );
  const events = Array.isArray(v3?.data) ? v3.data : [];
  if (events.length === 0) {
    return { prunedCount: 0, prunedIds: [] };
  }

  // 2. SCAN the events:url-liveness:* keyspace.
  //    MEDIUM-01 — pin Upstash @upstash/redis ^1.37.0 signature.
  const livenessKeys: string[] = [];
  let cursor: string | number = '0';
  do {
    const reply = (await redis.scan(cursor, {
      match: `${URL_LIVENESS_KEY_PREFIX}*`,
      count: 200,
    })) as [string | number, string[]];
    cursor = reply[0];
    for (const key of reply[1]) livenessKeys.push(key);
  } while (cursor !== '0' && cursor !== 0);

  // 3. For each scanned liveness key, load the entry + apply the filter.
  const prunedIds: string[] = [];
  for (const key of livenessKeys) {
    const eventId = key.startsWith(URL_LIVENESS_KEY_PREFIX)
      ? key.slice(URL_LIVENESS_KEY_PREFIX.length)
      : null;
    if (!eventId) continue;

    const cached = await cacheGetSafe<UrlLiveness>(key, PRUNE_READ_LOGICAL_TTL_MS);
    const entry = cached?.data ?? null;
    if (!entry) continue;

    // D-07 — only terminal-dead statuses are ever pruned.
    if (!isTerminalDead(entry.status)) continue;

    // D-12 cron gate — manual trigger bypasses, cron requires ≥3 ticks.
    if (opts.trigger === 'cron' && entry.attemptCount < 3) continue;

    prunedIds.push(eventId);
  }

  if (prunedIds.length === 0) {
    // No prune candidates — still write the audit-log entry so operator
    // sees the no-op (forensic completeness). Skip the splice + DEL +
    // DECR steps since there's nothing to mutate.
    await appendOperatorAuditEntry({
      timestamp: Date.now(),
      bearerFingerprint:
        opts.trigger === 'cron' ? 'cron:refresh-events' : (opts.fingerprint ?? 'unknown'),
      operation: 'prune-dead-urls',
      args: { trigger: opts.trigger, prunedCount: 0, prunedIds: [] },
      result: 'ok',
    });
    return { prunedCount: 0, prunedIds: [] };
  }

  // 4. Splice prunedIds out of the v3 events[] array, write back.
  const prunedSet = new Set(prunedIds);
  const spliced = events.filter((e) => !prunedSet.has(e.id));
  // Terminal v3 TTL (48h, > cron interval) — a prune must NOT re-TTL the
  // enriched cache back down to the short cooldown sentinel TTL.
  await cacheSetSafe(LLM_EVENTS_KEY_ACTIVE, spliced, LLM_TERMINAL_TTL_SEC);

  // 5. Bulk DEL the url-liveness keys.
  const keysToDelete = prunedIds.map((id) => `${URL_LIVENESS_KEY_PREFIX}${id}`);
  await redis.del(...keysToDelete);

  // 6. Decrement the sidecar count by prunedCount.
  //    @upstash/redis exposes DECRBY natively; one round-trip beats N decr() calls.
  //    Pitfall 6 — degrade-open on Redis throw (mirror persistLiveness shape).
  try {
    const after = await redis.decrby(URL_LIVENESS_COUNT_KEY, prunedIds.length);
    if (typeof after === 'number' && after < 0) {
      // Underflow (concurrent prune raced us past 0) — floor at 0.
      await redis.set(URL_LIVENESS_COUNT_KEY, 0);
    }
  } catch (err) {
    log.warn({ err, prunedCount: prunedIds.length }, 'sidecar DECRBY failed (degrade-open)');
  }

  // 7. Append the audit-log entry (D-14 + RESEARCH A8).
  await appendOperatorAuditEntry({
    timestamp: Date.now(),
    bearerFingerprint:
      opts.trigger === 'cron' ? 'cron:refresh-events' : (opts.fingerprint ?? 'unknown'),
    operation: 'prune-dead-urls',
    args: {
      trigger: opts.trigger,
      prunedCount: prunedIds.length,
      prunedIds,
    },
    result: 'ok',
  });

  log.info({ trigger: opts.trigger, prunedCount: prunedIds.length }, 'pruneDeadUrlEvents complete');

  return { prunedCount: prunedIds.length, prunedIds };
}

// ============================================================================
// Test-only export (NODE_ENV=test-gated) — MEDIUM-02 plan-checker fix
// ============================================================================

/**
 * NODE_ENV-gated visibility for module-private throttle + writer
 * helpers. Used by `server/__tests__/lib/urlLiveness.sweep.test.ts` to
 * assert the D-18 polite-citizen contract + the D-12 attemptCount
 * semantics without breaking encapsulation in production builds.
 * Consumers in dev/prod NEVER see this surface — it resolves to
 * `undefined` whenever NODE_ENV !== 'test'.
 *
 * MEDIUM-02 plan-checker fix: the sweep test file asserts
 * `expect(process.env.NODE_ENV).toBe('test')` at file-import time so
 * runner-config drift (vitest no longer forcing NODE_ENV=test) fails
 * loudly rather than silently producing `__test__ === undefined`.
 */
export const __test__ =
  process.env.NODE_ENV === 'test'
    ? { waitForHostSlot, pruneStaleHostSlots, hostNext, persistLiveness }
    : undefined;
