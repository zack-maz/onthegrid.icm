/**
 * Phase 28.1 W2 — Client-side type re-export for the /api/health response.
 *
 * Only TYPES are re-exported across the server/client boundary — the runtime
 * Zod schema stays server-side because the client doesn't validate incoming
 * health responses (it trusts the route's dev-time validation + production
 * pinning of the schema). This keeps the client bundle lean and respects
 * the existing project pattern where shared types come via direct import
 * from `server/types.ts` (see `src/hooks/useNewsPolling.ts:3` for the
 * precedent: `import type { NewsCluster, CacheResponse } from '@/types/entities'`).
 */

export type {
  HealthResponse,
  EndpointHealth,
  HealthStatus,
  HealthTier,
} from '../../server/lib/healthSchema';
