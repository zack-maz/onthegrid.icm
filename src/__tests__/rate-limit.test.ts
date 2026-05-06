/**
 * Phase 28.2 W6 Plan 06 Task 3 — D-30 companion rate-limit defense test (B-6).
 *
 * Per CONTEXT D-30 + checker B-6: validates that Plan 02's
 * `rateLimiters.public` global tier (60 req / 60s) is firing for
 * unauthenticated traffic AND being skipped (Bearer-bypassed) for
 * privileged operator traffic.
 *
 * Target endpoint is `/api/health` per checker B-6:
 *
 *   The flights route has its own 120/min per-endpoint cap (defined in
 *   server/middleware/rateLimit.ts) that triggers BEFORE the 60/min
 *   global tier; a 429 from flights does not unambiguously prove
 *   `rateLimiters.public` (the global tier — Plan 02's surface) is firing.
 *
 *   `/api/health` has NO per-endpoint cap (only the global tier applies).
 *   A 429 here proves the global tier is firing — exactly the D-30 contract.
 *
 * Two named test files (this one + api-connectivity.test.ts), two atomic
 * commits per CONTEXT <specifics> "D-30 two-pass audit".
 *
 * To run:
 *   API_BASE_URL=http://localhost:5173 RUN_RATE_LIMIT_TEST=1 \
 *     DASHBOARD_PASSWORD=<secret> npx vitest run src/__tests__/rate-limit.test.ts
 *
 * To run against prod (CI workflow does this with secrets):
 *   API_BASE_URL=https://otg-iran-monitor.vercel.app RUN_RATE_LIMIT_TEST=1 \
 *     DASHBOARD_PASSWORD=<secret> npx vitest run src/__tests__/rate-limit.test.ts
 */
// @vitest-environment node
import { describe, it, expect } from 'vitest';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:5173';
const BEARER = process.env.DASHBOARD_PASSWORD ?? '';
const RUN = process.env.RUN_RATE_LIMIT_TEST === '1';

/**
 * Number of bursts. 70 is just above the 60/min global ceiling so the
 * sliding-window counter trips during the burst. Below ANY reasonable
 * DDoS threshold and below per-endpoint caps for the routes flights/ships
 * (which we explicitly do NOT target — see B-6 above).
 */
const BURST_SIZE = 70;

describe.skipIf(!RUN)('Rate limit (D-30 companion, B-6: /api/health target)', () => {
  it('public tier throttles unauthenticated burst on /api/health (B-6)', async () => {
    // Note: target `/api/health` per checker B-6.
    // The flights route has its own 120/min per-endpoint cap that triggers
    // BEFORE the 60/min global tier; a 429 there does not unambiguously prove
    // rateLimiters.public (the global tier — Plan 02's surface) is firing.
    // `/api/health` has NO per-endpoint cap — only the global tier applies.
    // A 429 here proves the global tier is firing — exactly the D-30 contract.
    const responses = await Promise.all(
      Array.from({ length: BURST_SIZE }, () => fetch(`${API_BASE_URL}/api/health`)),
    );
    const throttled = responses.filter((r) => r.status === 429);
    expect(
      throttled.length,
      `expected ≥1 of ${BURST_SIZE} unauthenticated /api/health bursts to return 429 ` +
        `(global tier defends); got ${throttled.length}. ` +
        `If running locally, ensure NODE_ENV=production+VERCEL=1 are set so the ` +
        `dev short-circuit doesn't bypass the limiter.`,
    ).toBeGreaterThanOrEqual(1);
  }, 60_000);

  it('Bearer bypasses public tier on /api/health (D-04 positive path)', async () => {
    if (BEARER === '') {
      // Skip when no secret in env — local dev short-circuits the limiter
      // entirely, so the bypass branch isn't exercised. CI workflow always
      // attaches the secret so this assertion runs in prod.

      console.warn('Skipping Bearer-bypass positive-path assertion — DASHBOARD_PASSWORD not set.');
      return;
    }
    const responses = await Promise.all(
      Array.from({ length: BURST_SIZE }, () =>
        fetch(`${API_BASE_URL}/api/health`, {
          headers: { Authorization: `Bearer ${BEARER}` },
        }),
      ),
    );
    const throttled = responses.filter((r) => r.status === 429);
    expect(
      throttled.length,
      `expected 0 of ${BURST_SIZE} Bearer-attached /api/health bursts to return 429 ` +
        `(global tier should be bypassed); got ${throttled.length}. ` +
        `If failing, the D-04 Bearer-bypass branch in rateLimiters.public is broken.`,
    ).toBe(0);
  }, 60_000);
});
