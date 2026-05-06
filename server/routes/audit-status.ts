/**
 * Phase 28.2 W6 Plan 06 Task 5 — `GET /api/audit-status` sidecar reader.
 *
 * Reads the `audit:connectivity:last-result` Redis key written by the
 * `.github/workflows/prod-connectivity-audit.yml` GitHub Actions workflow
 * after each manual prod-audit run. Surfaces the result to the merged
 * DevApiStatus API Health tab for the audit-result banner (D-25).
 *
 * Contract (W-3):
 *   - Read-only — never writes to the Redis key.
 *   - Degrade-open — Redis errors / parse failures return
 *     `{status: 'absent'}` (HTTP 200), NEVER a 500. Banner stays silent.
 *   - 7-day staleness header — `X-Audit-Stale: true` set when the audit
 *     run is older than 7 days. UI can downgrade the green banner.
 *   - JSON shape contract — must match what the GH Actions workflow
 *     writes; the W-3 contract test in __tests__/audit-status.test.ts
 *     pins both sides.
 *   - No auth gate — operator-tier metadata (no PII / secrets);
 *     unauthenticated probes simplify CI feedback and the existing
 *     per-endpoint global rate limit (60/min) protects against abuse.
 *
 * Why a NEW route instead of extending /api/health:
 *   /api/health is critical-tier observability with strict freshness
 *   contracts (Phase 28.1 W2 D-25/D-26). /api/audit-status is optional
 *   CI-fed metadata that may be absent. Coupling them risks /api/health's
 *   freshness budget being polluted by stale audit data, and adding the
 *   audit-status field to HealthResponse Zod schema would churn every
 *   schema consumer (HealthBanner, DevApiStatus, useHealthStatus).
 */
import { Router, type Request, type Response } from 'express';

import { redis } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'audit-status' });

export const auditStatusRouter = Router();

const AUDIT_KEY = 'audit:connectivity:last-result';
const STALE_MS = 7 * 86_400 * 1_000;

interface AuditPayload {
  status?: 'pass' | 'fail' | 'absent';
  runId?: string;
  timestamp?: string;
  lastVerifiedAt?: string;
  endpoints?: Record<string, 'pass' | 'fail'>;
  durationMs?: number;
  [k: string]: unknown;
}

auditStatusRouter.get('/audit-status', async (_req: Request, res: Response): Promise<void> => {
  try {
    // Upstash REST may return either a JSON string OR an already-parsed
    // object depending on serialization. The route tolerates both shapes
    // (verified by the "Upstash already-parsed object passthrough" test).
    let raw: string | AuditPayload | null = null;
    try {
      raw = await redis.get<string | AuditPayload>(AUDIT_KEY);
    } catch (err) {
      log.warn({ err }, 'failed to read audit:connectivity:last-result');
      res.json({ status: 'absent' });
      return;
    }

    if (raw == null) {
      res.json({ status: 'absent' });
      return;
    }

    let parsed: AuditPayload;
    if (typeof raw === 'string') {
      try {
        parsed = JSON.parse(raw) as AuditPayload;
      } catch {
        // Malformed JSON in the sidecar key — degrade-open. The CI
        // workflow's next run will overwrite the key with valid JSON.
        log.warn('audit:connectivity:last-result contained malformed JSON; returning absent');
        res.json({ status: 'absent' });
        return;
      }
    } else if (typeof raw === 'object') {
      parsed = raw;
    } else {
      // Defensive fallback for any other type (e.g., number, boolean).
      log.warn({ rawType: typeof raw }, 'audit:connectivity:last-result returned unexpected type');
      res.json({ status: 'absent' });
      return;
    }

    // Stale check — 7 days. Accept either `lastVerifiedAt` or `timestamp`
    // for resilience to either CI-writer field naming.
    const ageRefIso = parsed.lastVerifiedAt ?? parsed.timestamp;
    if (typeof ageRefIso === 'string') {
      const ts = Date.parse(ageRefIso);
      if (!Number.isNaN(ts)) {
        const ageMs = Date.now() - ts;
        if (ageMs > STALE_MS) {
          res.set('X-Audit-Stale', 'true');
        }
      }
    }

    res.json(parsed);
  } catch (err) {
    log.error({ err }, '/api/audit-status failed unexpectedly');
    res.json({ status: 'absent' });
  }
});
