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

import { redis } from '../cache/redis.js';
import { logger } from '../lib/logger.js';
import { dashboardAuth } from '../middleware/dashboardAuth.js';

const log = logger.child({ module: 'operator-status' });

export const operatorStatusRouter = Router();

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
  operation: 'pipeline-swap' | 'replay';
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

      const byFingerprint = new Map<string, { actions: number; swaps: number; replays: number }>();
      for (const e of last24h) {
        const cur = byFingerprint.get(e.bearerFingerprint) ?? {
          actions: 0,
          swaps: 0,
          replays: 0,
        };
        cur.actions += 1;
        if (e.operation === 'pipeline-swap') cur.swaps += 1;
        if (e.operation === 'replay') cur.replays += 1;
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

      res.json({ audit24h, byBearer, advEval });
    } catch (err) {
      log.error({ err }, '/api/operator-status failed');
      res.status(500).json({ error: 'operator_status_failed' });
    }
  },
);
