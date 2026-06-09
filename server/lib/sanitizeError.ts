/**
 * Sanitize an error message before publishing it on the wire (T-28.1-W2-01).
 * Strips Bearer tokens, query-string api keys, and Upstash REST URLs (which
 * carry the database identifier), then truncates to 200 chars. Mirrors the
 * project's redaction posture established by `server/lib/logger.ts`.
 *
 * Use this for ANY error tail returned in an HTTP response body — especially
 * on the Bearer-gated operator endpoints (replay / prune / operator-status),
 * where raw `@upstash/redis` or LLM-SDK errors can otherwise leak infra detail
 * (Phase 38 WR-01). Extracted from `server/routes/health.ts` so route modules
 * share one redaction implementation rather than each rolling their own.
 */
export function sanitizeError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const masked = raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/api[_-]?key=[A-Za-z0-9._-]+/gi, 'api_key=[REDACTED]')
    .replace(/https:\/\/[^\s]*upstash\.io[^\s]*/g, '[upstash url redacted]');
  return masked.length > 200 ? masked.slice(0, 197) + '...' : masked;
}
