# Phase 14: Vercel Deployment - Context

**Gathered:** 2026-03-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Deploy the application to Vercel with serverless functions. Frontend served from Vercel CDN, API routes as serverless functions. This phase adds the Vercel entry point, vercel.json, rate limiting, and .env.example. Does NOT remove flight sources (deferred).

</domain>

<decisions>
## Implementation Decisions

### Function architecture
- Single catch-all serverless function wrapping `createApp()` in `api/index.ts`
- vercel.json rewrites `/api/*` to the catch-all function
- 60s `maxDuration` for API functions (AISStream WebSocket collect needs headroom beyond 10s default)
- Pin Node 22.x in vercel.json for stable ESM support

### Local dev workflow
- Keep current setup unchanged: `concurrently` runs Vite + Express, Vite proxies `/api` to localhost:3001
- No `vercel dev` integration — production config only

### Domain & access
- Vercel free subdomain only (yourapp.vercel.app), no custom domain
- Public access, no authentication layer
- Production deployments only (main branch) — no preview deploys on feature branches

### CORS & origin
- Wildcard `*` CORS origin for public API access
- API is read-only with no user data, server-side secrets only — no security risk from open CORS
- Easy to restrict later by switching to explicit origin list

### Rate limiting
- Basic rate limiting to protect upstream API credits (OpenSky, AISStream) from abuse
- Upstash Redis available as backing store for rate limit counters

### Environment management
- All secrets managed via Vercel CLI (`vercel env add`)
- Add `.env.example` file documenting all required/optional vars with placeholder values
- Required: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Optional: `AISSTREAM_API_KEY`, OpenSky credentials — graceful degradation if missing
- Routes with missing API keys return clear error message, never crash

### Claude's Discretion
- Rate limiting implementation approach (express-rate-limit + Upstash, or Vercel edge config)
- Exact vercel.json rewrite rules and configuration
- Build command configuration for Vercel
- Whether to add a health check or status endpoint for monitoring

</decisions>

<specifics>
## Specific Ideas

- User is considering making this publicly available later — CORS wildcard and rate limiting decisions reflect this
- User wants to remove ADS-B Exchange and adsb.lol flight sources (keep OpenSky only) but that's a separate task before or after deployment

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/index.ts`: `createApp()` factory pattern already exists — catch-all function just wraps it
- `server/cache/redis.ts`: Upstash Redis client already initialized — can back rate limiter
- `server/middleware/errorHandler.ts`: existing error handler middleware

### Established Patterns
- `isMainModule` guard in server/index.ts — `app.listen()` only runs locally, not in serverless
- `process.env.CORS_ORIGIN ?? 'http://localhost:5173'` — env var with fallback already in place
- `"type": "module"` in package.json — ESM throughout, needs Node 22.x for stable support
- Vite proxy config in vite.config.ts — `/api` proxied to localhost:3001 for local dev

### Integration Points
- `api/index.ts` (new) — serverless entry point wrapping createApp()
- `vercel.json` (new) — rewrites, function config, node version
- `.env.example` (new) — documents all env vars
- `package.json` — may need `vercel-build` script if Vite build needs customization

</code_context>

<deferred>
## Deferred Ideas

- Remove ADS-B Exchange and adsb.lol flight sources, keep OpenSky as sole source — quick task before or after deployment
- Custom domain setup — can be added later via Vercel dashboard
- Preview deployments per feature branch — can be re-enabled later

</deferred>

---

*Phase: 14-vercel-deployment*
*Context gathered: 2026-03-19*
