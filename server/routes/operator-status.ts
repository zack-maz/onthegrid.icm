/**
 * Phase 28.2 W5 Plan 05 Task 7.5 — `/api/operator-status` aggregator.
 *
 * Bearer-gated read-only route that surfaces operator-tier sidecars for the
 * merged DevApiStatus API Health tab's Operator Actions block:
 *
 *   - `operator:audit-log` (SMEMBERS, bounded 500 entries, 30d TTL — written
 *     by `/api/events/llm-replay` handler): rolling 24h count + per-Bearer
 *     fingerprint breakdown
 *   - `events:llm-eval-adversarial:v3` (90d TTL — written by Plan 03's
 *     `runAdversarialEval()`): prompt-injection robustness summary
 *
 * Phase 29 D-02 part A — the pipeline override countdown + version block
 * is removed because the override write surface is gone. The response no
 * longer contains a pin-version field; DevApiStatus's render block is
 * removed in the same plan.
 *
 * The route NEVER writes. It aggregates Redis sidecars in one Bearer-gated
 * fetch so the UI can replace separate poll cycles with one. Per threat
 * T-28.2-05-02 + T-28.2-05-09 the route is Bearer-gated; per Pitfall 6
 * dual-gate the read-only contract MUST stay absolute.
 */
import { Router, type Request, type Response } from 'express';

import { cacheGetSafe, redis } from '../cache/redis.js';
import { logger } from '../lib/logger.js';
import {
  isTerminalDead,
  URL_LIVENESS_COUNT_KEY,
  URL_LIVENESS_KEY_PREFIX,
  type UrlLiveness,
} from '../lib/urlLiveness.js';
import { dashboardAuth } from '../middleware/dashboardAuth.js';

const log = logger.child({ module: 'operator-status' });

export const operatorStatusRouter = Router();

// ============================================================================
// Phase 32 Plan 04 — `prune` block constants + drill-down helper
// ============================================================================

/**
 * Cap on the number of terminal-dead entries returned in `prune.deadUrlSample`.
 * Bounds the dashboard payload size + serves as a SCAN short-circuit when the
 * dead population is large. Plan 32-05's `<ul data-testid="dead-url-list">`
 * renders this slice with a "...and N more" truncation row when
 * `prune.deadUrlCount > LIMIT_DRILL_DOWN`.
 */
const LIMIT_DRILL_DOWN = 20;

/**
 * Pitfall 3 budget guard — hard ceiling on the number of `events:url-liveness:*`
 * keys we'll load values for during a single `/api/operator-status` poll. A
 * runaway key population (e.g. probe sweep wrote many `unknown` entries that
 * never converge to terminal-dead) must not blow the aggregator's wall-clock
 * budget. Once the loop has touched `MAX_SCAN_KEYS` keys, it stops SCANning
 * even if the cursor hasn't returned to 0.
 */
const MAX_SCAN_KEYS = 200;

/**
 * Shape of a single drill-down entry returned in `prune.deadUrlSample`.
 * The status union mirrors `isTerminalDead`'s acceptance set — Plan 32-05's
 * UI can render the badge color (red 404, amber 403, gray dead-host) directly
 * off this field.
 */
type DeadUrlSampleEntry = {
  eventId: string;
  url: string;
  status: 'dead-host' | '403' | '404';
};

/**
 * SCAN over `events:url-liveness:*`, filter to terminal-dead entries, return
 * up to `LIMIT_DRILL_DOWN` matches in encounter order.
 *
 * Why a helper (not inline): the SCAN cursor loop with the MAX_SCAN_KEYS
 * short-circuit + LIMIT_DRILL_DOWN cap + per-key `cacheGetSafe` value load
 * is non-trivial; extracting it keeps the main route body readable and
 * isolates the degrade-open `try/catch` so a SCAN throw can't cascade past
 * the `prune` block.
 *
 * MEDIUM-01 plan-checker pin (also resolved by Plan 32-03's `pruneDeadUrlEvents`
 * SCAN call): `redis.scan(cursor, opts)` on `@upstash/redis ^1.37.0` returns
 * `Promise<[string | number, string[]]>` — cursor type is string OR number
 * depending on Upstash response shape. The explicit `as` cast pins the
 * signature so silent drift fails TypeScript instead of producing an
 * infinite SCAN loop.
 *
 * Degrade-open contract (mirrors `advEval` block + Plan 32-02 sidecar
 * INCR/DECR pattern): any Redis throw inside this helper logs a warning
 * and returns `[]`. The route handler treats `[]` as "no drill-down
 * available this poll" — the dashboard renders the count (still readable
 * from the sidecar) and the deadUrlSample row is empty until the next
 * poll succeeds.
 */
async function buildDeadUrlSample(): Promise<DeadUrlSampleEntry[]> {
  try {
    const sample: DeadUrlSampleEntry[] = [];
    let cursor: string | number = 0;
    let scanned = 0;
    do {
      const reply = (await redis.scan(cursor, {
        match: `${URL_LIVENESS_KEY_PREFIX}*`,
        count: 50,
      })) as [string | number, string[]];
      cursor = reply[0];
      const keys = reply[1];
      for (const key of keys) {
        if (scanned >= MAX_SCAN_KEYS) {
          // Budget exhausted — short-circuit the outer SCAN loop too.
          cursor = 0;
          break;
        }
        scanned += 1;
        const cached = await cacheGetSafe<UrlLiveness>(key, 999_999_999);
        const value = cached?.data;
        if (!value) continue;
        if (!isTerminalDead(value.status)) continue;
        const eventId = key.startsWith(URL_LIVENESS_KEY_PREFIX)
          ? key.slice(URL_LIVENESS_KEY_PREFIX.length)
          : key;
        sample.push({
          eventId,
          url: value.lastUrlProbed,
          // Terminal-dead union pinned by `isTerminalDead` — cast narrows
          // the broader `UrlLivenessStatus` type to the dashboard subset.
          status: value.status as DeadUrlSampleEntry['status'],
        });
        if (sample.length >= LIMIT_DRILL_DOWN) {
          cursor = 0;
          break;
        }
      }
    } while (cursor !== 0 && cursor !== '0');
    return sample;
  } catch (err) {
    log.warn({ err }, 'failed to build dead-URL drill-down sample');
    return [];
  }
}

/**
 * Audit entry shape — matches Plan 03's SADD writer. Kept minimal so the
 * route is forward-compatible with future Plan 03 / Plan 06 audit
 * extensions (extra fields are ignored by the aggregator).
 *
 * Phase 29 WR-03 (legacy retention): the `'pipeline-swap'` operation tag
 * is retained for backward compatibility with the 30-day audit-log TTL.
 * Phase 29 D-02 part A deleted the POST /api/events/llm-pipeline route
 * (the only writer of `pipeline-swap` entries), so no NEW entries with
 * this tag will be written. Existing entries in Redis (under the 30d
 * SADD TTL) still parse correctly, and the per-fingerprint `swaps`
 * counter below will naturally decay to 0 once the last legacy entry
 * expires. The dashboard "swaps" column becomes visual noise after that
 * window — a follow-up may drop the field and tag, but it is harmless
 * in the interim and avoids dropping historical observability mid-TTL.
 */
interface AuditEntry {
  timestamp: number;
  bearerFingerprint: string;
  /**
   * Phase 32 Plan 04 — widened to admit `'prune-dead-urls'` entries
   * written by `pruneDeadUrlEvents()` (Plan 32-03) from BOTH the manual
   * dashboard button (Plan 32-05) AND the cron auto-prune step inside
   * `/api/cron/refresh-events`. Distinguished downstream via
   * `bearerFingerprint` (operator's hash vs the literal
   * `'cron:refresh-events'` per CONTEXT D-11 / RESEARCH A8).
   *
   * The canonical `OperatorAuditEntry.operation` union in
   * `server/lib/operatorAudit.ts` was widened in the same phase (Plan 32-01
   * Task 5); this local copy stays in sync so unknown operation tags in
   * the SADD set don't fail to parse.
   */
  operation: 'pipeline-swap' | 'replay' | 'prune-dead-urls';
}

/**
 * Adversarial eval payload shape — matches Plan 03's `runAdversarialEval`
 * Redis writer. Optional fields tolerate older / partial payloads.
 *
 * Phase 29 WR-02: dropped the spurious `leaked` field from byCategory
 * entries. The writer in llmEvalHarness.ts (`runAdversarialEval`) only
 * tracks `{ total, blocked }` per category — the top-level result carries
 * the aggregate `leaked` count but it is NOT broken out per category. The
 * prior shape was likely copy-pasted from the top-level AdversarialEvalResult
 * and would always render `NaN` after arithmetic on any UI consumer.
 */
interface AdversarialEvalPayload {
  total: number;
  blocked: number;
  leaked: number;
  score?: number;
  byCategory?: Record<string, { total: number; blocked: number }>;
  generatedAt?: string;
}

// Phase 29 D-02 part A — humanizeTtl helper deleted with the override block.

operatorStatusRouter.get(
  '/operator-status',
  dashboardAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const now = Date.now();

      // Audit log — SMEMBERS returns the full bounded set (≤500 entries).
      // Each entry was SADD'd as a JSON string by Plan 03; parse defensively.
      let auditMembers: string[] = [];
      try {
        auditMembers = ((await redis.smembers('operator:audit-log')) as string[]) ?? [];
      } catch (err) {
        log.warn({ err }, 'failed to read operator:audit-log');
      }
      const entries: AuditEntry[] = auditMembers
        .map((raw) => {
          try {
            return JSON.parse(raw) as AuditEntry;
          } catch {
            return null;
          }
        })
        .filter(
          (e): e is AuditEntry =>
            e !== null &&
            typeof e.timestamp === 'number' &&
            typeof e.bearerFingerprint === 'string',
        );

      const last24h = entries.filter((e) => e.timestamp > now - 86_400_000);
      const audit24h = last24h.length;

      // Phase 32 Plan 04 — byFingerprint map value extended with `prunes`
      // counter so Plan 32-05's dashboard can attribute prune activity to
      // the operator's fingerprint AND to the literal `cron:refresh-events`
      // pseudo-fingerprint (RESEARCH A8). The new counter increments on
      // every `prune-dead-urls` audit entry within the 24h rolling window.
      const byFingerprint = new Map<
        string,
        { actions: number; swaps: number; replays: number; prunes: number }
      >();
      for (const e of last24h) {
        const cur = byFingerprint.get(e.bearerFingerprint) ?? {
          actions: 0,
          swaps: 0,
          replays: 0,
          prunes: 0,
        };
        cur.actions += 1;
        if (e.operation === 'pipeline-swap') cur.swaps += 1;
        if (e.operation === 'replay') cur.replays += 1;
        if (e.operation === 'prune-dead-urls') cur.prunes += 1;
        byFingerprint.set(e.bearerFingerprint, cur);
      }
      const byBearer = Array.from(byFingerprint.entries()).map(([bearerFingerprint, counts]) => ({
        bearerFingerprint,
        ...counts,
      }));

      // Phase 29 D-02 part A — pipeline override TTL block removed.
      // The override key has no writers in the codebase; any extant key
      // naturally TTL-expires within 7 days.

      // Adversarial sub-eval — Plan 03 writes a JSON object to this key
      // every cron run. Tolerate raw-string vs already-parsed shapes
      // (Upstash REST may return either depending on serialization).
      let advEval: AdversarialEvalPayload | null = null;
      try {
        const raw = await redis.get<string | AdversarialEvalPayload>(
          'events:llm-eval-adversarial:v3',
        );
        if (raw && typeof raw === 'string') {
          advEval = JSON.parse(raw) as AdversarialEvalPayload;
        } else if (raw && typeof raw === 'object') {
          advEval = raw;
        }
      } catch (err) {
        log.warn({ err }, 'failed to read events:llm-eval-adversarial:v3');
      }

      // Phase 32 Plan 04 — `prune` sibling block (GHOST-03).
      //
      // Three fields:
      //
      //   - `deadUrlCount`  Sidecar O(1) read of `events:url-liveness-count`.
      //                     Maintained by Plan 32-02's `persistLiveness`
      //                     (INCR on live→dead transitions) and Plan 32-03's
      //                     `pruneDeadUrlEvents` (DECRBY on prune). Defensive
      //                     coercion (`Number(raw) || 0` + `Math.max(0, ...)`)
      //                     handles null absence, string drift, NaN garbage,
      //                     and DECR underflow uniformly (T-32-11 mitigation).
      //   - `last24hPrunes` Derived in-memory from the already-parsed `last24h`
      //                     audit entries — zero additional Redis round-trips.
      //   - `deadUrlSample` Bounded drill-down list (cap 20, MAX_SCAN_KEYS=200
      //                     budget) — LOW-03 plan-checker resolution gives
      //                     Plan 32-05's `<ul data-testid="dead-url-list">`
      //                     the per-event shape it needs without a second
      //                     API call.
      //
      // Degrade-open: sidecar read failure is per-block isolated (mirrors
      // `advEval` pattern); SCAN failure inside `buildDeadUrlSample` returns
      // `[]` so the dashboard still renders the count when the sample fails.
      // The route's outer try/catch around 500 stays a backstop — but the
      // happy-path requirement is that this block NEVER bubbles to the 500
      // handler (Pitfall 6 chaos contract for read-only routes).
      let deadUrlCount = 0;
      try {
        const raw = await redis.get<number | string>(URL_LIVENESS_COUNT_KEY);
        deadUrlCount = Math.max(0, Number(raw) || 0);
      } catch (err) {
        log.warn({ err }, 'failed to read events:url-liveness-count');
      }
      const last24hPrunes = last24h.filter((e) => e.operation === 'prune-dead-urls').length;
      const deadUrlSample = await buildDeadUrlSample();
      const prune = { deadUrlCount, last24hPrunes, deadUrlSample };

      res.json({ audit24h, byBearer, advEval, prune });
    } catch (err) {
      log.error({ err }, '/api/operator-status failed');
      res.status(500).json({ error: 'operator_status_failed' });
    }
  },
);
