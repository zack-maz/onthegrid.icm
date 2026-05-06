/**
 * Phase 28.2 W5 Plan 05 Task 7.5 — `/api/operator-status` aggregator.
 *
 * Bearer-gated read-only route that surfaces three operator-tier sidecars
 * for the merged DevApiStatus API Health tab's Operator Actions block:
 *
 *   - `operator:audit-log` (SMEMBERS, bounded 500 entries, 30d TTL — written
 *     by Plan 03's `/api/events/llm-pipeline` + `/api/events/llm-replay`
 *     handlers): rolling 24h count + per-Bearer-fingerprint breakdown
 *   - `events:llm-pipeline-override` (TTL — 7d when pinned to a non-default
 *     version): pin TTL countdown + version
 *   - `events:llm-eval-adversarial:v3` (90d TTL — written by Plan 03's
 *     `runAdversarialEval()`): prompt-injection robustness summary
 *
 * The route NEVER writes. It aggregates Redis sidecars in one Bearer-gated
 * fetch so the UI can replace four separate poll cycles with one. Per
 * threat T-28.2-05-02 + T-28.2-05-09 the route is Bearer-gated; per
 * Pitfall 6 dual-gate the read-only contract MUST stay absolute.
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
 */
interface AuditEntry {
  timestamp: number;
  bearerFingerprint: string;
  operation: 'pipeline-swap' | 'replay';
}

/**
 * Adversarial eval payload shape — matches Plan 03's `runAdversarialEval`
 * Redis writer. Optional fields tolerate older / partial payloads.
 */
interface AdversarialEvalPayload {
  total: number;
  blocked: number;
  leaked: number;
  score?: number;
  byCategory?: Record<string, { total: number; blocked: number; leaked: number }>;
  generatedAt?: string;
}

/**
 * Convert a Redis TTL (seconds) into a human-readable countdown string.
 * Returns the sentinel `no pin active` for the absent-key (-2) and
 * no-expiry (-1) cases — the UI renders that string verbatim.
 */
function humanizeTtl(ttlSeconds: number | null): string {
  if (ttlSeconds == null || ttlSeconds <= 0) return 'no pin active';
  const hours = Math.floor(ttlSeconds / 3600);
  const minutes = Math.floor((ttlSeconds % 3600) / 60);
  return `expires in ${hours}h ${minutes}m`;
}

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

      // Pipeline override TTL — Redis returns -2 if key absent, -1 if no
      // TTL set. Both map to `pinTtl: null` per UI-SPEC contract; the UI
      // renders `no pin active` in that case.
      let pinTtlRaw: number = -2;
      try {
        pinTtlRaw = (await redis.ttl('events:llm-pipeline-override')) as number;
      } catch (err) {
        log.warn({ err }, 'failed to read events:llm-pipeline-override TTL');
      }
      let pinVersion: string | null = null;
      if (pinTtlRaw > 0) {
        try {
          const v = await redis.get<string>('events:llm-pipeline-override');
          pinVersion = typeof v === 'string' ? v : null;
        } catch (err) {
          log.warn({ err }, 'failed to read events:llm-pipeline-override value');
        }
      }
      const pinTtl =
        pinTtlRaw > 0
          ? {
              version: pinVersion,
              ttlSeconds: pinTtlRaw,
              human: humanizeTtl(pinTtlRaw),
            }
          : null;

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

      res.json({ audit24h, byBearer, pinTtl, advEval });
    } catch (err) {
      log.error({ err }, '/api/operator-status failed');
      res.status(500).json({ error: 'operator_status_failed' });
    }
  },
);
