# Phase 21: Production Review & Deploy Sync - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Harden the application for 1000+ concurrent users on Vercel, perform a comprehensive code polish (correctness, maintainability, performance), and deploy v1.2 to production with verification. No new features — this is about making what exists production-grade and deployed.

</domain>

<decisions>
## Implementation Decisions

### Scale Hardening
- Target audience: 1000+ concurrent users (public/viral potential)
- HTTP Cache-Control headers: `s-maxage` per endpoint matching logical TTLs (flights 30s, events 900s, sites 86400s) — Vercel edge CDN serves cached responses
- Compression: verify whether Vercel auto-compresses responses; add express compression middleware only if needed
- CORS: lock down from wildcard (`*`) to production domain URL via `CORS_ORIGIN` env var
- Security headers: add `helmet` middleware for standard protections (XSS, clickjacking, MIME sniffing)
- Rate limiting: tune per-endpoint limits (flights gets more headroom, sites/news gets less) — note: upstream APIs are only called once per cache TTL regardless of user count
- Request coalescing: verify if Vercel edge caching (`s-maxage` + stale-while-revalidate) is sufficient to prevent thundering herd; add server-side coalescing only if edge caching isn't enough
- Structured logging: replace console.log/error with structured JSON logs (method, path, status, duration, cache hit/miss)
- Health endpoint: rich `/health` check returning Redis ping status, last successful fetch timestamps per source, cache hit rates, Redis command budget estimate
- Frontend analytics: add `@vercel/analytics` for page views, Web Vitals (LCP, CLS, FID), geographic breakdown

### Code Polish
- Scope: comprehensive pass covering correctness, maintainability, AND performance (all three)
- Approach: autonomous — Claude scans and fixes directly, user reviews diff at the end
- Audit method: fresh full-codebase audit, no pre-specified focus areas
- Bundle optimization: run vite build with rollup-plugin-visualizer, identify large chunks, split lazy-loadable pieces, tree-shake unused code

### Redis Budget Protection
- Strategy: optimize TTLs first, upgrade Upstash plan ($10/mo) as fallback if monitoring shows pressure
- Budget monitor: add daily Redis command count estimate to `/health` endpoint response
- Graceful degradation: if Redis goes down or hits budget limit, serve last known cached data from in-memory fallback with a "data may be outdated" indicator in the client — no direct upstream fetch fallback

### Deploy Verification
- API smoke tests: local Node script that hits each `/api/*` endpoint against production URL, verifies 200 responses + valid JSON shapes
- Ongoing monitoring: Vercel cron health check that pings endpoints every 5-15min and logs failures
- Visual verification: manual checklist for map overlays, panels, interactions, polling health
- Doc sync: full update of README, PROJECT_STATUS, CHANGELOG before deploying
- Env var audit: cross-check all env vars referenced in server/config.ts against Vercel project settings, flag missing or stale keys
- Error pages: skip custom error pages — Vercel defaults are fine

### Claude's Discretion
- Exact Cache-Control header values per endpoint (within the "match logical TTLs" strategy)
- Specific rate limit numbers per endpoint
- Bundle splitting strategy (which chunks to lazy-load)
- Structured logging format and library choice
- Cron health check frequency and alerting threshold
- In-memory fallback implementation approach

</decisions>

<specifics>
## Specific Ideas

- Server's cache-first pattern already means upstream APIs are only called once per cache TTL regardless of user count — scale pressure is on Redis reads and serverless function invocations, not upstream APIs
- Edge caching via `s-maxage` is the primary scaling lever — most client requests should never reach the serverless function
- Redis graceful degradation should show a visual "stale data" indicator, not silently serve outdated info

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/cache/redis.ts`: Upstash REST client with `cacheGet<T>`, `cacheSet<T>` — add budget tracking here
- `server/middleware/rateLimit.ts`: express-rate-limit with single 60/60s config — refactor to per-endpoint
- `server/middleware/errorHandler.ts`: minimal error handler — enhance with structured logging
- `server/config.ts`: env var loading with graceful defaults — audit against Vercel settings
- `server/vercel-entry.ts`: Vercel serverless entry point — add middleware (helmet, cache headers, compression)
- `server/app.ts`: Express app factory with `createApp()` — wire new middleware here

### Established Patterns
- Cache-first route pattern: all `/api/*` routes check Redis before upstream fetch
- `CacheEntry<T>` with `fetchedAt` timestamp for staleness computation
- Recursive `setTimeout` polling (not `setInterval`) — avoids overlapping async fetches
- Zustand stores with `ConnectionStatus` type for health tracking
- `StatusPanel` already shows connection dots — could show degradation state

### Integration Points
- `vercel.json` rewrites: all `/api/*` → serverless function, SPA catch-all → `index.html`
- Build pipeline: `vite build` (frontend) + `tsup` (server) + `tsc` (typecheck)
- 8 polling API routes: flights, ships, events, sites, news, markets, weather, sources

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 21-production-review-deploy-sync*
*Context gathered: 2026-03-24*
