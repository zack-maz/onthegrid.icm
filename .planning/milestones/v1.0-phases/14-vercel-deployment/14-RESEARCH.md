# Phase 14: Vercel Deployment - Research

**Researched:** 2026-03-19
**Domain:** Vercel serverless deployment (Express + Vite React SPA)
**Confidence:** HIGH

## Summary

Deploying this project to Vercel requires combining a Vite React SPA frontend with an Express API backend as a single serverless function. Vercel auto-detects Vite as the frontend framework and builds it via `vite build` (outputting to `dist/`). The Express API must be placed in an `api/index.ts` file that exports default the Express app, with `vercel.json` rewrites routing `/api/*` requests to the serverless function.

The existing codebase is well-structured for this migration. The `createApp()` factory in `server/index.ts` already separates Express setup from `app.listen()`, and the `isMainModule` guard prevents listening in serverless. The main technical challenge is that `server/config.ts` uses `required()` validators that throw on missing env vars (OpenSky, AISStream), which contradicts the graceful degradation requirement. This must be fixed so the serverless function boots successfully even with only Upstash Redis credentials configured.

**Primary recommendation:** Create `api/index.ts` as a thin wrapper that imports `createApp()` and exports default the app. Fix `server/config.ts` to make all API keys optional. Add `@upstash/ratelimit` middleware to protect upstream API credits. Configure `vercel.json` with rewrites and function settings.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Single catch-all serverless function wrapping `createApp()` in `api/index.ts`
- vercel.json rewrites `/api/*` to the catch-all function
- 60s `maxDuration` for API functions (AISStream WebSocket collect needs headroom beyond 10s default)
- Pin Node 22.x in vercel.json for stable ESM support
- Keep current local dev setup unchanged: `concurrently` runs Vite + Express, Vite proxies `/api` to localhost:3001; no `vercel dev` integration
- Vercel free subdomain only (yourapp.vercel.app), no custom domain
- Public access, no authentication layer
- Production deployments only (main branch) -- no preview deploys on feature branches
- Wildcard `*` CORS origin for public API access
- Basic rate limiting to protect upstream API credits using Upstash Redis
- All secrets managed via Vercel CLI (`vercel env add`)
- Add `.env.example` file documenting all required/optional vars
- Required env vars: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`
- Optional env vars: `AISSTREAM_API_KEY`, OpenSky credentials -- graceful degradation if missing
- Routes with missing API keys return clear error message, never crash

### Claude's Discretion
- Rate limiting implementation approach (express-rate-limit + Upstash, or @upstash/ratelimit directly)
- Exact vercel.json rewrite rules and configuration
- Build command configuration for Vercel
- Whether to add a health check or status endpoint for monitoring

### Deferred Ideas (OUT OF SCOPE)
- Remove ADS-B Exchange and adsb.lol flight sources, keep OpenSky as sole source
- Custom domain setup
- Preview deployments per feature branch
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Vercel Platform | N/A | Hosting (CDN + serverless) | Zero-config Vite detection, native Express support |
| @upstash/ratelimit | ^2.0.8 | API rate limiting | HTTP-based, designed for serverless, works with existing Upstash Redis |
| Node.js | 22.x | Runtime | Stable ESM + `"type": "module"` support, LTS on Vercel |

### Already Present (no new installs needed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @upstash/redis | ^1.37.0 | Redis client | Already used for caching; reused for ratelimit backing store |
| express | ^5.2.1 | API framework | Already deployed with `createApp()` factory pattern |
| vite | ^6.3.5 | Frontend build | Vercel auto-detects and runs `vite build` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| @upstash/ratelimit | express-rate-limit + rate-limit-redis | express-rate-limit needs TCP Redis (ioredis), not HTTP-based Upstash; @upstash/ratelimit is purpose-built for serverless |
| Single catch-all function | Per-route serverless functions | More cold starts, harder to share middleware; catch-all is simpler and matches Express's routing model |
| api/index.ts approach | Native Express framework detection (src/index.ts) | Native detection conflicts with Vite framework detection on the same project; api/ directory is the reliable pattern for mixed frontend+backend |

**Installation:**
```bash
npm install @upstash/ratelimit
```

## Architecture Patterns

### Recommended Project Structure
```
/
+-- api/
|   +-- index.ts          # NEW: serverless entry point (export default app)
+-- server/
|   +-- index.ts           # EXISTING: createApp() factory (unchanged)
|   +-- config.ts          # MODIFY: make API keys optional
|   +-- middleware/
|   |   +-- errorHandler.ts  # EXISTING
|   |   +-- rateLimit.ts     # NEW: rate limiting middleware
|   +-- routes/             # EXISTING: flights, ships, events, sources
|   +-- adapters/           # EXISTING: opensky, adsb-*, aisstream, gdelt
|   +-- cache/redis.ts      # EXISTING: Upstash Redis client
+-- src/                    # EXISTING: React frontend (untouched)
+-- vercel.json             # NEW: deployment configuration
+-- .env.example            # MODIFY: add descriptions for required vs optional
```

### Pattern 1: Serverless Entry Point (api/index.ts)
**What:** Thin wrapper that imports `createApp()` and re-exports the Express app for Vercel
**When to use:** Always -- this is the Vercel serverless function entry point

```typescript
// Source: https://vercel.com/docs/frameworks/backend/express
import { createApp } from '../server/index.js';

const app = createApp();
export default app;
```

Vercel's Express framework integration detects `export default app` and wraps it as a serverless function. The app handles all routing internally via Express's router.

**CRITICAL:** The file MUST use `export default app` (ESM default export). This is required because `package.json` has `"type": "module"`. Vercel's runtime expects either `module.exports = app` (CJS) or `export default app` (ESM).

### Pattern 2: vercel.json Rewrites
**What:** Route API requests to the catch-all function, let Vite static assets serve from CDN
**When to use:** Always -- this bridges Vercel's CDN routing to the Express function

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "functions": {
    "api/index.ts": {
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

**Rewrite order matters:** Vercel evaluates rewrites top-to-bottom. `/api/*` must come first so API calls hit the serverless function. The SPA fallback `/(.*) -> /index.html` catches all other routes for client-side routing.

### Pattern 3: Rate Limiting with @upstash/ratelimit
**What:** HTTP-based rate limiting using the existing Upstash Redis instance
**When to use:** Apply as Express middleware before API routes

```typescript
// Source: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../cache/redis.js';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '60 s'), // 60 requests per 60 seconds
  prefix: 'ratelimit',
});

// Express middleware
export async function rateLimitMiddleware(req, res, next) {
  const identifier = req.ip || req.headers['x-forwarded-for'] || 'anonymous';
  const { success, limit, remaining, reset } = await ratelimit.limit(String(identifier));

  res.setHeader('X-RateLimit-Limit', limit);
  res.setHeader('X-RateLimit-Remaining', remaining);
  res.setHeader('X-RateLimit-Reset', reset);

  if (!success) {
    return res.status(429).json({ error: 'Too many requests' });
  }
  next();
}
```

### Pattern 4: Graceful Degradation for Missing API Keys
**What:** Routes return informative errors instead of crashing when optional API keys are absent
**When to use:** For all routes that depend on external APIs

The flights route already checks `process.env.OPENSKY_CLIENT_ID` before calling the adapter and returns `503` if missing. This pattern is correct. The ships route's `collectShips()` throws on missing `AISSTREAM_API_KEY` but the route's try/catch returns a 500. The events route (GDELT) needs no API key.

**The `server/config.ts` issue:** `loadConfig()` calls `required()` for OPENSKY and AISSTREAM, meaning accessing ANY `config` property triggers ALL validations. Fix: make all API keys optional strings (nullable) in `loadConfig()`, using `process.env.X ?? ''` or `process.env.X ?? null`.

### Anti-Patterns to Avoid
- **Using `vercel dev` for local development:** The user explicitly decided against this. Keep `concurrently` + Vite proxy.
- **Putting `app.listen()` in api/index.ts:** Vercel handles the server lifecycle. Only export the app.
- **Using `express.static()` in serverless:** Vercel ignores `express.static()`. Static assets must go in `public/` directory and are served by CDN.
- **Importing config.ts at module level in api/index.ts:** This triggers env var validation at cold start. Only createApp() should be called, and config should be lazy.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rate limiting counters | Custom Redis INCR/EXPIRE logic | @upstash/ratelimit | Handles sliding windows, race conditions, distributed counting; 1 line to configure |
| Serverless Express adapter | Custom req/res translation | Vercel's native Express detection | `export default app` is all that's needed; Vercel handles the rest |
| SPA routing fallback | Custom middleware for 404 -> index.html | vercel.json rewrites | `{ "source": "/(.*)", "destination": "/index.html" }` handles this at CDN level |
| Environment variable validation | Custom validators | Direct `process.env` checks in routes | Routes already do this; the config.ts centralized validation is the problem |

**Key insight:** Vercel's Express integration is extremely thin. The entire serverless adapter is `export default app`. Don't add complexity.

## Common Pitfalls

### Pitfall 1: config.ts Crashing on Cold Start
**What goes wrong:** `server/config.ts` `loadConfig()` calls `required('OPENSKY_CLIENT_ID')` etc. When any adapter property is accessed via the Proxy, ALL required vars must be set. If AISSTREAM_API_KEY is not configured on Vercel, the first request to any adapter-using route crashes the function.
**Why it happens:** The config module was designed for local dev where all env vars are in `.env`. Serverless requires graceful degradation.
**How to avoid:** Change `loadConfig()` to make OpenSky/AISStream/ACLED credentials optional (use `process.env.X ?? ''` or `null`). Routes already check env vars before calling adapters.
**Warning signs:** Function logs show "Missing required env var" errors on cold start.

### Pitfall 2: Framework Detection Conflict
**What goes wrong:** Vercel might detect the project as "Vite" (frontend) and not know how to handle the Express backend, or vice versa.
**Why it happens:** Vercel auto-detects frameworks. With both Vite config and Express in the same repo, detection can be ambiguous.
**How to avoid:** Explicitly set `"framework": "vite"` in vercel.json. The `api/` directory convention is framework-agnostic and works alongside any frontend framework.
**Warning signs:** Build logs show wrong framework detection or missing static output.

### Pitfall 3: CORS Wildcard Not Applied
**What goes wrong:** The existing CORS middleware uses `process.env.CORS_ORIGIN ?? 'http://localhost:5173'`. In production, if CORS_ORIGIN is not set, it falls back to localhost, rejecting real requests.
**Why it happens:** The fallback was designed for local dev.
**How to avoid:** Set `CORS_ORIGIN=*` in Vercel environment variables, or change the fallback to `*` for production.
**Warning signs:** Browser console shows CORS errors on the deployed site.

### Pitfall 4: ESM Import Path Resolution
**What goes wrong:** Vercel's Node.js runtime may not resolve `.ts` imports in the same way as local tsx/esbuild.
**Why it happens:** The `api/index.ts` file imports from `../server/index.js` (using `.js` extension per ESM convention). Vercel compiles `.ts` files but the import paths must be correct.
**How to avoid:** Use `.js` extensions in import paths (already the convention in this project). Verify the relative path from `api/index.ts` to `server/index.ts` is `../server/index.js`.
**Warning signs:** "Cannot find module" errors in function logs.

### Pitfall 5: maxDuration Misunderstanding
**What goes wrong:** Setting maxDuration to 60s when Vercel's current defaults with fluid compute are actually 300s (5 min) for Hobby plan.
**Why it happens:** The CONTEXT.md was written assuming the old 10s default. With fluid compute (enabled by default since April 2025), the default is already 300s.
**How to avoid:** Setting maxDuration to 60 is fine (it's a cap, not a minimum). The AISStream WebSocket collect is 5s by default, well within 60s. The 60s setting protects against runaway requests while allowing headroom.
**Warning signs:** None -- 60s is a reasonable explicit cap even with higher defaults available.

### Pitfall 6: WebSocket in Serverless (AISStream)
**What goes wrong:** AISStream adapter opens a WebSocket, collects for 5s, then closes. This is fine for serverless (it's a short-lived connection), but the function stays running during the collect window.
**Why it happens:** On-demand WebSocket pattern was designed for this serverless model in Phase 13.
**How to avoid:** Keep AISSTREAM_COLLECT_MS at 5000ms (default). The 60s maxDuration provides ample headroom.
**Warning signs:** Ship requests timing out if AISSTREAM_COLLECT_MS is set too high.

## Code Examples

### api/index.ts -- Serverless Entry Point
```typescript
// Source: Vercel Express guide + project createApp() pattern
import { createApp } from '../server/index.js';

const app = createApp();
export default app;
```

### vercel.json -- Full Configuration
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "functions": {
    "api/index.ts": {
      "maxDuration": 60
    }
  },
  "rewrites": [
    { "source": "/api/:path*", "destination": "/api" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

### Node 22.x Configuration
```json
// In package.json (engines field)
{
  "engines": {
    "node": "22.x"
  }
}
```
Source: https://vercel.com/docs/functions/runtimes/node-js/node-js-versions
Node version is set via `engines.node` in package.json or project settings. Vercel auto-detects and uses the specified major version. Current default for new projects is 24.x, so explicitly pinning 22.x is correct per user decision.

### Rate Limiting Middleware
```typescript
// Source: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '../cache/redis.js';
import type { Request, Response, NextFunction } from 'express';

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  prefix: 'ratelimit',
});

export async function rateLimitMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const identifier = req.ip ?? req.headers['x-forwarded-for'] ?? 'anonymous';
  const { success, limit, remaining, reset } = await ratelimit.limit(
    String(identifier),
  );

  res.setHeader('X-RateLimit-Limit', String(limit));
  res.setHeader('X-RateLimit-Remaining', String(remaining));
  res.setHeader('X-RateLimit-Reset', String(reset));

  if (!success) {
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  next();
}
```

### Fixed server/config.ts (Graceful Degradation)
```typescript
// All API keys become optional -- routes check process.env before calling adapters
export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3001),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    opensky: {
      clientId: process.env.OPENSKY_CLIENT_ID ?? '',
      clientSecret: process.env.OPENSKY_CLIENT_SECRET ?? '',
    },
    aisstream: {
      apiKey: process.env.AISSTREAM_API_KEY ?? '',
    },
    acled: {
      email: process.env.ACLED_EMAIL ?? '',
      password: process.env.ACLED_PASSWORD ?? '',
    },
  };
}
```

### .env.example Updates
```bash
# === REQUIRED for deployment ===
# Upstash Redis (create free instance at https://console.upstash.com)
UPSTASH_REDIS_REST_URL=your-upstash-redis-rest-url
UPSTASH_REDIS_REST_TOKEN=your-upstash-redis-rest-token

# === OPTIONAL -- graceful degradation if missing ===
# OpenSky Network (register at https://opensky-network.org)
OPENSKY_CLIENT_ID=your-client-id
OPENSKY_CLIENT_SECRET=your-client-secret

# AISStream.io (register at https://aisstream.io)
AISSTREAM_API_KEY=your-aisstream-api-key

# ADS-B Exchange via RapidAPI
ADSB_EXCHANGE_API_KEY=your-rapidapi-key

# ACLED (not active, preserved for future use)
ACLED_EMAIL=your-email@example.com
ACLED_PASSWORD=your-password

# === SERVER CONFIG (optional -- defaults shown) ===
# PORT=3001              # Local dev only
# CORS_ORIGIN=*          # Wildcard for production, http://localhost:5173 for local dev
# AISSTREAM_COLLECT_MS=5000
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `api/` directory + `@vercel/node` builds | Native Express framework detection (`export default app` from standard locations) | Vercel CLI 47.0.5+ (2025) | Express apps can deploy from root `index.ts` without `api/` directory |
| Separate serverless functions per route | Single catch-all Express function with fluid compute | Fluid compute default (Apr 2025) | Optimized concurrency, fewer cold starts, background processing |
| 10s default maxDuration (Hobby) | 300s default maxDuration (Hobby with fluid compute) | Apr 2025 | 60s explicit cap is now well under the default, not fighting it |
| Node 20.x default | Node 24.x default (22.x still supported) | Late 2025 | Must explicitly pin 22.x per user decision |
| `module.exports = app` (CJS) | `export default app` (ESM) | Always (ESM convention) | Project uses `"type": "module"` -- ESM export is required |

**Deprecated/outdated:**
- `builds` + `routes` in vercel.json: replaced by `rewrites` + `functions` in modern Vercel
- `@vercel/node` explicit runtime in vercel.json: not needed for standard Node.js functions
- `vercel dev` for mixed projects: user decided against this; keep local concurrently setup

## Open Questions

1. **Health check endpoint location**
   - What we know: `/health` exists in createApp() at the Express level. On Vercel, it would be accessible at `/health` only if there's a rewrite for it, or `/api/health` if we add a route.
   - What's unclear: Should the health check be exposed at the CDN level or only through the API function?
   - Recommendation: Add a `/api/health` route via the Express router (it already has `/health`). The vercel.json rewrite `/api/:path*` will capture it. No additional work needed since `/health` is already mounted inside the Express app.

2. **Rate limit values**
   - What we know: Need to protect upstream API credits (OpenSky, AISStream, ADS-B Exchange). Each has different rate limits.
   - What's unclear: Exact requests/window for the rate limiter.
   - Recommendation: Start with 60 requests per 60 seconds per IP (sliding window). This is generous for a dashboard that polls every 5-30s but prevents abuse. Can be tuned after observing production traffic.

3. **Build command customization**
   - What we know: Vercel auto-detects Vite and runs `npm run build` which is `tsc -b && vite build`. This builds the frontend. The `api/index.ts` serverless function is compiled separately by Vercel's Node.js runtime.
   - What's unclear: Whether `tsc -b` (project references build) might fail on Vercel since `tsconfig.server.json` has `noEmit: true`.
   - Recommendation: The `tsc -b` is a type-check step, not an emit step (all tsconfigs have `noEmit: true`). It should pass. If it fails, override buildCommand to `vite build` only.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 with jsdom (frontend) + node (server) |
| Config file | vite.config.ts (test section) |
| Quick run command | `npx vitest run server/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DEPLOY-01 | api/index.ts exports createApp() as default | unit | `npx vitest run server/__tests__/vercel-entry.test.ts -x` | No -- Wave 0 |
| DEPLOY-02 | Rate limiting returns 429 on excess requests | unit | `npx vitest run server/__tests__/rateLimit.test.ts -x` | No -- Wave 0 |
| DEPLOY-03 | Routes return 503 (not crash) when API keys missing | unit | `npx vitest run server/__tests__/server.test.ts -x` | Yes (partial) |
| DEPLOY-04 | CORS wildcard works in production config | unit | `npx vitest run server/__tests__/server.test.ts -x` | Yes (partial) |
| DEPLOY-05 | All existing API routes still work | integration | `npx vitest run server/` | Yes (144 tests pass) |

### Sampling Rate
- **Per task commit:** `npx vitest run server/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/vercel-entry.test.ts` -- covers DEPLOY-01 (api/index.ts exports app correctly)
- [ ] `server/__tests__/rateLimit.test.ts` -- covers DEPLOY-02 (rate limiting middleware)
- [ ] Update `server/__tests__/server.test.ts` -- covers DEPLOY-03, DEPLOY-04 (graceful degradation with missing env vars, CORS wildcard)

## Sources

### Primary (HIGH confidence)
- [Vercel Express on Vercel Guide](https://vercel.com/docs/frameworks/backend/express) - Express deployment pattern, `export default app`, static assets in `public/`
- [Vercel vercel.json Configuration](https://vercel.com/docs/project-configuration/vercel-json) - rewrites syntax, functions config, maxDuration, framework setting
- [Vercel Node.js Versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions) - Node 22.x supported, 24.x is new default, set via engines.node in package.json
- [Vercel Functions Duration](https://vercel.com/docs/functions/configuring-functions/duration) - Hobby 300s default/max with fluid compute
- [Vercel Functions Limits](https://vercel.com/docs/functions/limitations) - 250MB bundle, 4.5MB request body, 1024 file descriptors
- [Upstash Ratelimit Getting Started](https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted) - slidingWindow, constructor with existing Redis, limit() method
- [Upstash Ratelimit GitHub](https://github.com/upstash/ratelimit-js) - v2.0.8, connectionless HTTP-based

### Secondary (MEDIUM confidence)
- [Vercel Vite Documentation](https://vercel.com/docs/frameworks/frontend/vite) - Vite auto-detection, SPA rewrite pattern
- [Vercel Functions Overview](https://vercel.com/docs/functions) - Fluid compute default since Apr 2025, function lifecycle

### Tertiary (LOW confidence)
- Community examples of Express + Vite on Vercel (multiple consistent sources confirm api/ directory + rewrites pattern)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Vercel docs confirm Express + Vite pattern, Upstash docs confirm ratelimit API
- Architecture: HIGH - `api/index.ts` + `export default app` is documented in official Express on Vercel guide
- Pitfalls: HIGH - config.ts issue verified by reading source code; framework detection conflict well-documented
- Rate limiting: MEDIUM - @upstash/ratelimit API confirmed; exact Express middleware pattern assembled from docs + types (not a verbatim official example)

**Research date:** 2026-03-19
**Valid until:** 2026-04-19 (Vercel platform is stable; 30-day validity)
