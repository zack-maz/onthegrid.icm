/**
 * Phase 27.4.3 D-15 — pipeline-version flip audit log (B-3 cyclic-import fix).
 *
 * Canonical home for appendPipelineAudit + listPipelineAudit.
 * Imported by:
 *   - server/routes/events.ts (POST /llm-pipeline handler)
 *   - server/lib/llmEventExtractor.v3.ts (Plan 05 D-17 auto-rollback wiring)
 *
 * The original Plan 02 design defined these inside server/routes/events.ts.
 * That created a layering inversion (routes → lib → routes) when Plan 05 needed
 * to call appendPipelineAudit from inside the v3 extractor. Relocating here is
 * the single deterministic import path; routes is a consumer, not a provider.
 */
import { redis } from '../cache/redis.js';

import { logger } from './logger.js';

const PIPELINE_AUDIT_KEY = 'events:llm-pipeline-audit';
const PIPELINE_AUDIT_TTL_SEC = 90 * 24 * 3600;
const PIPELINE_AUDIT_MAX = 200;

export interface PipelineFlipEntry {
  ts: number;
  from: 'v1' | 'v2' | 'v3';
  to: 'v1' | 'v2' | 'v3';
  trigger: 'manual:operator_post' | 'auto:eval_drop' | 'auto:watchdog_recurrence';
  operator: 'dev' | 'production' | 'cron';
  reason?: string;
}

export async function appendPipelineAudit(entry: PipelineFlipEntry): Promise<void> {
  try {
    await redis.lpush(PIPELINE_AUDIT_KEY, JSON.stringify(entry));
    await redis.ltrim(PIPELINE_AUDIT_KEY, 0, PIPELINE_AUDIT_MAX - 1);
    await redis.expire(PIPELINE_AUDIT_KEY, PIPELINE_AUDIT_TTL_SEC);
  } catch (err) {
    const log = logger.child({ component: 'pipeline-audit' });
    log.warn({ err, entry }, 'audit append failed (redis unreachable)');
  }
}

export async function listPipelineAudit(limit: number): Promise<PipelineFlipEntry[]> {
  try {
    const raw = await redis.lrange(PIPELINE_AUDIT_KEY, 0, limit - 1);
    return raw
      .map((s) => {
        try {
          return JSON.parse(typeof s === 'string' ? s : JSON.stringify(s)) as PipelineFlipEntry;
        } catch {
          return null;
        }
      })
      .filter((e): e is PipelineFlipEntry => e !== null);
  } catch {
    return [];
  }
}

export const __testing = { PIPELINE_AUDIT_KEY, PIPELINE_AUDIT_TTL_SEC, PIPELINE_AUDIT_MAX };
