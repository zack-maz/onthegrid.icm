# Phase 21: Production Review & Deploy Sync - Research

**Researched:** 2026-03-24
**Domain:** Production hardening, Vercel deployment, bundle optimization, Redis budget management
**Confidence:** HIGH

## Summary

Phase 21 is a verification/hardening phase with no new features. The codebase currently has 8 API routes served through a single Vercel serverless function entry point (`server/vercel-entry.ts`), backed by Upstash Redis caching. The primary scaling lever is Vercel edge CDN caching via `Cache-Control: s-maxage` headers -- most client requests should never reach the serverless function. The current bundle is 2,218 KB (607 KB gzipped) with deck.gl and maplibre-gl as the dominant dependencies, well above Vite's 500 KB warning threshold.

The server code uses Express 5.2.1 with a clean `createApp()` factory pattern. Middleware is minimal: CORS (wildcard), rate limiting (`@upstash/ratelimit` sliding window 60/60s), and a basic error handler. There are no security headers, no structured logging, no Cache-Control headers, and no health check beyond `{ status: 'ok' }`. The codebase has 73 test files (42 frontend, 31 server) with 832/838 tests passing (6 failures in ThreatHeatmapOverlay tooltip tests -- pre-existing).

**Primary recommendation:** Add Vercel edge caching headers as the first priority (eliminates thundering herd), then helmet security, then structured logging, then Redis budget monitoring. Bundle optimization and code polish can run in parallel.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Target audience: 1000+ concurrent users (public/viral potential)
- HTTP Cache-Control headers: `s-maxage` per endpoint matching logical TTLs (flights 30s, events 900s, sites 86400s) -- Vercel edge CDN serves cached responses
- Compression: verify whether Vercel auto-compresses responses; add express compression middleware only if needed
- CORS: lock down from wildcard (`*`) to production domain URL via `CORS_ORIGIN` env var
- Security headers: add `helmet` middleware for standard protections (XSS, clickjacking, MIME sniffing)
- Rate limiting: tune per-endpoint limits (flights gets more headroom, sites/news gets less) -- note: upstream APIs are only called once per cache TTL regardless of user count
- Request coalescing: verify if Vercel edge caching (`s-maxage` + stale-while-revalidate) is sufficient to prevent thundering herd; add server-side coalescing only if edge caching isn't enough
- Structured logging: replace console.log/error with structured JSON logs (method, path, status, duration, cache hit/miss)
- Health endpoint: rich `/health` check returning Redis ping status, last successful fetch timestamps per source, cache hit rates, Redis command budget estimate
- Frontend analytics: add `@vercel/analytics` for page views, Web Vitals (LCP, CLS, FID), geographic breakdown
- Code polish scope: comprehensive pass covering correctness, maintainability, AND performance (all three)
- Code polish approach: autonomous -- Claude scans and fixes directly, user reviews diff at the end
- Code polish audit method: fresh full-codebase audit, no pre-specified focus areas
- Bundle optimization: run vite build with rollup-plugin-visualizer, identify large chunks, split lazy-loadable pieces, tree-shake unused code
- Redis budget strategy: optimize TTLs first, upgrade Upstash plan ($10/mo) as fallback if monitoring shows pressure
- Redis budget monitor: add daily Redis command count estimate to `/health` endpoint response
- Redis graceful degradation: if Redis goes down or hits budget limit, serve last known cached data from in-memory fallback with a "data may be outdated" indicator in the client -- no direct upstream fetch fallback
- API smoke tests: local Node script that hits each `/api/*` endpoint against production URL, verifies 200 responses + valid JSON shapes
- Ongoing monitoring: Vercel cron health check that pings endpoints every 5-15min and logs failures
- Visual verification: manual checklist for map overlays, panels, interactions, polling health
- Doc sync: full update of README, PROJECT_STATUS, CHANGELOG before deploying
- Env var audit: cross-check all env vars referenced in server/config.ts against Vercel project settings, flag missing or stale keys
- Error pages: skip custom error pages -- Vercel defaults are fine

### Claude's Discretion
- Exact Cache-Control header values per endpoint (within the "match logical TTLs" strategy)
- Specific rate limit numbers per endpoint
- Bundle splitting strategy (which chunks to lazy-load)
- Structured logging format and library choice
- Cron health check frequency and alerting threshold
- In-memory fallback implementation approach

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core (New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| helmet | ^8.1.0 | Security headers (CSP, XSS, clickjacking, MIME sniffing) | Express official recommendation; 15 headers in one `app.use(helmet())` call |
| @vercel/analytics | ^1.x | Page views, geographic breakdown | Official Vercel package for Vite+React projects |
| @vercel/speed-insights | ^1.x | Core Web Vitals (LCP, CLS, INP) | Official Vercel package, separate from analytics |
| rollup-plugin-visualizer | ^5.x | Bundle analysis treemap | Standard Vite/Rollup plugin for identifying bloat |

### Existing (Already Installed)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| @upstash/ratelimit | 2.0.8 | Rate limiting via Redis | Already wired; needs per-endpoint configuration |
| @upstash/redis | 1.37.0 | Redis client (REST-based) | Core caching; add budget tracking |
| express | 5.2.1 | Server framework | Helmet is compatible with Express 5 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Structured JSON via manual formatting | pino / winston | Over-engineered for serverless; manual `JSON.stringify` is simpler and smaller, no extra dependency |
| rollup-plugin-visualizer | vite-bundle-analyzer | Both work; visualizer is more mature and widely used |

### NOT Needed
| Library | Why Not |
|---------|---------|
| compression (express middleware) | **Vercel automatically compresses** all responses with Brotli/gzip when client sends `Accept-Encoding` header. No middleware needed. |
| express-rate-limit | Already using `@upstash/ratelimit` which is serverless-compatible and persists across function invocations |

**Installation:**
```bash
npm install helmet @vercel/analytics @vercel/speed-insights
npm install -D rollup-plugin-visualizer
```

## Architecture Patterns

### Vercel Edge Caching (Primary Scaling Lever)

**What:** Set `Cache-Control` headers on each API route response so Vercel's CDN serves cached responses at the edge, preventing serverless function invocations for most requests.

**How it works on Vercel:**
1. Serverless function responds with `Cache-Control: public, s-maxage=N, stale-while-revalidate=M`
2. Vercel edge CDN caches the response for `N` seconds
3. During `stale-while-revalidate` window (`M` seconds after `N` expires), CDN serves stale response while revalidating in background
4. After `N+M` seconds with no revalidation, response is truly stale and next request blocks on function

**Recommended Cache-Control values per endpoint:**

| Endpoint | s-maxage | stale-while-revalidate | Rationale |
|----------|----------|------------------------|-----------|
| `/api/flights` | 5 | 25 | Real-time; adsb.lol polls at 30s, match short freshness |
| `/api/ships` | 10 | 20 | 30s client polling; slightly more aggressive cache |
| `/api/events` | 300 | 600 | 15-min GDELT updates; 5-min edge cache is fine |
| `/api/news` | 300 | 600 | 15-min update cycle; same as events |
| `/api/markets` | 30 | 30 | 60s client polling; market data ages fast |
| `/api/weather` | 600 | 1200 | 30-min updates; aggressive edge caching fine |
| `/api/sites` | 3600 | 82800 | Static data; cache for 1 hour, serve stale for 23h |
| `/api/sources` | 60 | 60 | Config data; rarely changes |
| `/health` | 0 | 0 | Never cache health checks |

**Critical gotcha:** Vercel strips `s-maxage` and `stale-while-revalidate` from `Cache-Control` before sending to browser. Use `Vercel-CDN-Cache-Control` header for Vercel-specific cache control if you want different browser vs CDN behavior. For this project, `max-age=0, s-maxage=N, stale-while-revalidate=M` works perfectly -- browsers always fetch fresh (hitting CDN), CDN serves cached.

**Implementation pattern:**
```typescript
// Middleware approach -- add before route handlers
function cacheControl(sMaxAge: number, swr: number) {
  return (_req: Request, res: Response, next: NextFunction) => {
    res.set('Cache-Control', `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${swr}`);
    next();
  };
}

// In createApp():
app.use('/api/flights', cacheControl(5, 25), flightsRouter);
app.use('/api/sites', cacheControl(3600, 82800), sitesRouter);
```

**Thundering herd verdict:** `s-maxage` + `stale-while-revalidate` handles thundering herd at the CDN level. No server-side coalescing needed. When a cached response goes stale, Vercel serves the stale version to all concurrent requesters while triggering exactly one revalidation request to the serverless function.

### Helmet Security Headers

**What:** Single middleware call that sets 15 security headers.
**When to use:** Always, in production Express apps.

```typescript
import helmet from 'helmet';

// In createApp():
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://va.vercel-scripts.com"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://*.amazonaws.com", "https://server.arcgisonline.com"],
      connectSrc: ["'self'", "https://*.tile.openstreetmap.org", "https://*.amazonaws.com", "https://api.open-meteo.com", "https://va.vercel-scripts.com"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));
```

**Key consideration:** Must whitelist all external resources (map tiles, terrain tiles, API endpoints, Vercel analytics script) in CSP directives or they will be blocked.

### Structured Logging (No Extra Dependency)

**What:** Replace `console.log/error` with structured JSON output.
**Why no library:** In serverless, pino/winston add cold start overhead and bundle size for minimal benefit. Manual `JSON.stringify` is sufficient.

```typescript
interface LogEntry {
  level: 'info' | 'warn' | 'error';
  method?: string;
  path?: string;
  status?: number;
  durationMs?: number;
  cacheHit?: boolean;
  message: string;
  timestamp: string;
}

function log(entry: LogEntry) {
  const output = JSON.stringify({ ...entry, timestamp: new Date().toISOString() });
  if (entry.level === 'error') console.error(output);
  else console.log(output);
}
```

**Request logging middleware:**
```typescript
function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    log({
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - start,
      message: `${req.method} ${req.path} ${res.statusCode}`,
    });
  });
  next();
}
```

### Per-Endpoint Rate Limiting

**What:** Different rate limits per API route based on expected polling frequency.
**Current state:** Single `Ratelimit.slidingWindow(60, '60 s')` for all routes.

**Recommended limits:**

| Endpoint | Limit | Window | Rationale |
|----------|-------|--------|-----------|
| `/api/flights` | 120 | 60s | Clients poll every 5-30s; need headroom |
| `/api/ships` | 60 | 60s | 30s polling; standard |
| `/api/events` | 20 | 60s | 15-min polling; low frequency |
| `/api/news` | 20 | 60s | 15-min polling; low frequency |
| `/api/markets` | 30 | 60s | 60s polling; moderate |
| `/api/weather` | 10 | 60s | 30-min polling; very low frequency |
| `/api/sites` | 10 | 60s | One-time fetch; very low |
| `/api/sources` | 30 | 60s | Config check on mount |

**Note:** With edge caching active, most requests never reach the serverless function, so rate limits mainly protect against cache-busting attacks or misconfigured clients.

### Redis Graceful Degradation

**What:** In-memory fallback when Redis is unavailable.
**Pattern:**

```typescript
// In redis.ts -- add in-memory LRU cache as fallback
const memCache = new Map<string, { data: unknown; fetchedAt: number }>();

export async function cacheGetSafe<T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> {
  try {
    const result = await cacheGet<T>(key, logicalTtlMs);
    if (result) {
      memCache.set(key, { data: result.data, fetchedAt: result.lastFresh });
    }
    return result;
  } catch {
    // Redis down -- serve from memory with degraded flag
    const mem = memCache.get(key);
    if (mem) {
      return { data: mem.data as T, stale: true, lastFresh: mem.fetchedAt };
    }
    return null;
  }
}
```

**Client indicator:** Add `degraded?: boolean` flag to API responses when serving from memory fallback. Frontend `StatusPanel` shows an amber indicator.

### Bundle Code Splitting

**Current state:** Single 2,218 KB chunk (607 KB gzipped).

**Strategy:**
1. Run `rollup-plugin-visualizer` to identify top contributors
2. Split deck.gl into a vendor chunk (it's the largest dependency)
3. Split maplibre-gl into a separate vendor chunk
4. Keep React/React-DOM in a core vendor chunk

```typescript
// vite.config.ts
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom'],
        'vendor-maplibre': ['maplibre-gl'],
        'vendor-deckgl': [
          '@deck.gl/core',
          '@deck.gl/layers',
          '@deck.gl/mapbox',
          '@deck.gl/react',
          '@deck.gl/aggregation-layers',
        ],
      },
    },
  },
},
```

**Expected result:** 3-4 vendor chunks that cache independently in the browser. Main app chunk drops significantly. No lazy loading needed since this is a single-page dashboard (no routes to split on).

### Vercel Cron Health Check

**What:** Scheduled cron job that pings health endpoint periodically.
**Vercel Hobby plan limit:** 2 cron jobs, minimum once per day for Hobby. For more frequent monitoring, use external service or Pro plan.

```json
// vercel.json addition
{
  "crons": [
    {
      "path": "/api/cron/health",
      "schedule": "0 */6 * * *"
    }
  ]
}
```

**Limitation:** Hobby plan cron jobs can only run once per day minimum. For 5-15min monitoring, the cron endpoint should check all sources and log results, but won't give real-time alerting. Consider using Vercel's built-in monitoring dashboard instead of custom cron.

### Vercel Analytics Integration

```typescript
// src/App.tsx or src/main.tsx
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

function App() {
  return (
    <>
      <AppShell />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
```

**Note:** Both components are no-ops in development. They only activate when deployed to Vercel.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Security headers | Custom header middleware | `helmet` | 15 headers with correct values; CSP, HSTS, XSS protection |
| Rate limiting | Custom token bucket | `@upstash/ratelimit` | Already using; serverless-safe, persists across invocations |
| Bundle analysis | Manual chunk inspection | `rollup-plugin-visualizer` | Interactive treemap shows exact module sizes |
| Web Vitals tracking | Manual performance API | `@vercel/speed-insights` | Automatic LCP, CLS, INP collection with Vercel dashboard |
| Edge CDN caching | Server-side request coalescing | `Cache-Control: s-maxage` | Vercel CDN handles dedup natively; zero server code |
| Response compression | `compression` middleware | Vercel automatic compression | Vercel CDN compresses with Brotli/gzip automatically |

**Key insight:** Vercel's edge CDN handles two of the biggest scaling challenges (caching and compression) with zero server code -- just response headers.

## Common Pitfalls

### Pitfall 1: CSP Blocking Map Tiles
**What goes wrong:** Helmet's default CSP blocks all external resources, breaking map tiles, terrain, weather API calls, and analytics scripts.
**Why it happens:** Default `helmet()` sets `default-src: 'self'` which blocks cross-origin requests.
**How to avoid:** Explicitly whitelist all external domains in CSP directives (map tile servers, terrain S3 buckets, Open-Meteo API, Vercel analytics script URL).
**Warning signs:** Map shows no tiles, blank terrain, weather overlay missing after adding helmet.

### Pitfall 2: Cache-Control on Error Responses
**What goes wrong:** Setting Cache-Control headers via middleware means error responses (500, 502) also get cached at the edge.
**Why it happens:** Middleware runs before route handler, headers are set regardless of response status.
**How to avoid:** Only set Cache-Control on successful (200) responses, OR set headers inside route handlers after determining success. Vercel CDN only caches specific status codes (200, 301, 302, 307, 308, 404, 410), so 500s are naturally excluded. But 502 from upstream failures could be cached if returned as 200 with stale data.
**Warning signs:** Stale error responses served for extended periods.

### Pitfall 3: Upstash Rate Limit Consuming Redis Commands
**What goes wrong:** `@upstash/ratelimit` uses Redis commands for every rate limit check. With 1000+ users, rate limiting alone could consume significant Redis budget.
**Why it happens:** Each `ratelimit.limit()` call = 2-3 Redis commands (GET + SET + possible EXPIRE).
**How to avoid:** With edge caching active, most requests never hit the serverless function. Rate limit checks only apply to cache misses. Monitor via `/health` endpoint.
**Warning signs:** Redis command count rising faster than expected.

### Pitfall 4: Helmet Breaks Inline Styles
**What goes wrong:** CSP `style-src` directive blocking Tailwind's runtime-injected styles or inline styles used by deck.gl.
**Why it happens:** Tailwind v4 uses `@tailwindcss/vite` plugin which may inject inline `<style>` tags.
**How to avoid:** Include `'unsafe-inline'` in `style-src` directive. This is acceptable for a dashboard application.
**Warning signs:** Styles missing, unstyled content flash after adding helmet.

### Pitfall 5: `set-cookie` Header Preventing CDN Caching
**What goes wrong:** Vercel CDN will NOT cache any response that includes a `set-cookie` header.
**Why it happens:** Express session middleware or other middleware might set cookies.
**How to avoid:** Ensure no middleware sets cookies on API routes. Currently no session middleware is used -- keep it that way.
**Warning signs:** `x-vercel-cache: MISS` on every request despite Cache-Control headers.

### Pitfall 6: manualChunks Breaking Module Initialization
**What goes wrong:** Splitting React into a separate chunk can cause "Cannot access before initialization" errors.
**Why it happens:** Module evaluation order changes when chunks are split; circular dependencies surface.
**How to avoid:** Test the build locally with `vite preview` after adding manualChunks. Keep React and React-DOM together. Keep deck.gl packages together (they have internal cross-imports).
**Warning signs:** Runtime errors on page load that don't occur in dev mode.

### Pitfall 7: Vercel Hobby Cron Limitations
**What goes wrong:** Expecting 5-15 minute cron monitoring on Hobby plan.
**Why it happens:** Hobby plan limits cron to once-per-day minimum frequency, max 2 cron jobs.
**How to avoid:** Use cron for daily health summaries only. For real-time monitoring, rely on Vercel's built-in monitoring or external uptime services (e.g., UptimeRobot free tier).
**Warning signs:** Cron job not triggering as frequently as configured.

## Code Examples

### Cache-Control Middleware
```typescript
// Source: Vercel CDN Cache docs (https://vercel.com/docs/caching/cdn-cache)
import type { Request, Response, NextFunction } from 'express';

export function cacheControl(sMaxAge: number, staleWhileRevalidate: number) {
  return (_req: Request, res: Response, next: NextFunction) => {
    // max-age=0 ensures browsers always revalidate with CDN
    // s-maxage controls Vercel edge CDN TTL
    // stale-while-revalidate enables background refresh
    res.set(
      'Cache-Control',
      `public, max-age=0, s-maxage=${sMaxAge}, stale-while-revalidate=${staleWhileRevalidate}`,
    );
    next();
  };
}
```

### Rich Health Endpoint
```typescript
// Source: Project-specific pattern
app.get('/health', async (_req, res) => {
  const start = Date.now();
  let redisOk = false;
  try {
    await redis.ping();
    redisOk = true;
  } catch { /* Redis down */ }

  res.json({
    status: redisOk ? 'ok' : 'degraded',
    redis: redisOk,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    latencyMs: Date.now() - start,
    // Per-source last-fetch timestamps from cache entries
    sources: {
      flights: await getLastFreshTimestamp('flights:adsblol'),
      ships: await getLastFreshTimestamp('ships:ais'),
      events: await getLastFreshTimestamp('events:gdelt'),
      news: await getLastFreshTimestamp('news:feed'),
      markets: await getLastFreshTimestamp('markets:yahoo:1d'),
      weather: await getLastFreshTimestamp('weather:open-meteo'),
      sites: await getLastFreshTimestamp('sites:v2'),
    },
  });
});
```

### Smoke Test Script
```typescript
// scripts/smoke-test.ts
// Run: npx tsx scripts/smoke-test.ts https://your-app.vercel.app

const BASE_URL = process.argv[2];
const endpoints = [
  '/api/flights',
  '/api/ships',
  '/api/events',
  '/api/news',
  '/api/markets',
  '/api/weather',
  '/api/sites',
  '/api/sources',
  '/health',
];

for (const path of endpoints) {
  const res = await fetch(`${BASE_URL}${path}`);
  const ok = res.ok;
  const json = await res.json();
  const hasData = 'data' in json || 'status' in json || 'opensky' in json;
  console.log(`${ok && hasData ? 'PASS' : 'FAIL'} ${path} (${res.status})`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `express-rate-limit` (in-memory) | `@upstash/ratelimit` (Redis-backed) | 2024 | Serverless-compatible rate limiting |
| Manual security headers | `helmet` v8+ | Ongoing | 15 headers with one call |
| Server-side response compression | Vercel automatic Brotli/gzip | Always on Vercel | No middleware needed; 14-21% smaller than gzip |
| `Cache-Control: s-maxage` only | `s-maxage` + `stale-while-revalidate` | Vercel CDN standard | Background revalidation eliminates thundering herd |
| `Vercel-CDN-Cache-Control` | `Cache-Control` with `s-maxage` | Current | Vercel strips `s-maxage` from browser response automatically |

**Verified:** Vercel auto-compresses all JSON/text responses when `Accept-Encoding` is present. No `compression` middleware needed. (Source: Vercel CDN Compression docs)

## Open Questions

1. **Upstash Free Tier vs $10/mo Plan**
   - What we know: Free tier = 500K commands/month. $10/mo fixed plan = no command-count billing (unlimited within bandwidth/data limits).
   - What's unclear: Exact current monthly command usage. STATE.md notes "~92% capacity after 6 polling sources."
   - Recommendation: Rich `/health` endpoint should estimate daily command count. If approaching 500K/mo, upgrade to $10/mo fixed plan where commands are unlimited.

2. **Exact CSP Whitelist**
   - What we know: Map tiles come from various CDNs (CARTO, OpenStreetMap, AWS S3 for terrain), weather from Open-Meteo, analytics from Vercel.
   - What's unclear: Full list of all external domains currently referenced in the codebase.
   - Recommendation: Code polish audit should grep for all external URLs and compile complete CSP whitelist. Start permissive, tighten after testing.

3. **Pre-existing Test Failures**
   - What we know: 6 tests in `ThreatHeatmapOverlay.test.tsx` fail (tooltip rendering assertions). All other 832 tests pass.
   - What's unclear: Whether these are regressions from Phase 20 or pre-existing.
   - Recommendation: Fix during code polish wave. The tests expect specific tooltip text that doesn't match current component output.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 with jsdom (frontend) and node (server) |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

This is a verification phase with no formal requirement IDs. Validation is structured around the locked decisions:

| Area | Behavior | Test Type | Automated Command | File Exists? |
|------|----------|-----------|-------------------|-------------|
| Edge caching | Cache-Control headers set on each route | integration | `npx vitest run server/__tests__/` | Wave 0 |
| Security headers | Helmet headers present in responses | integration | `npx vitest run server/__tests__/` | Wave 0 |
| Rate limiting | Per-endpoint limits enforced | unit | `npx vitest run server/__tests__/rateLimit.test.ts` | Exists (needs update) |
| Health endpoint | Rich health response shape | integration | `npx vitest run server/__tests__/` | Wave 0 |
| Smoke tests | All production endpoints return valid JSON | e2e (script) | `npx tsx scripts/smoke-test.ts $URL` | Wave 0 |
| Bundle size | Main chunk under warning threshold | build | `npx vite build` | N/A (build output check) |
| Redis fallback | In-memory fallback on Redis failure | unit | `npx vitest run server/__tests__/redis-cache.test.ts` | Exists (needs update) |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run` + `npx vite build`
- **Phase gate:** Full suite green + successful production deploy + smoke test pass

### Wave 0 Gaps
- [ ] `server/__tests__/middleware/cacheControl.test.ts` -- covers edge caching header verification
- [ ] `server/__tests__/health.test.ts` -- covers rich health endpoint response shape
- [ ] `scripts/smoke-test.ts` -- production endpoint smoke test script
- [ ] Fix 6 failing ThreatHeatmapOverlay tests (pre-existing)

## Existing Code Inventory (for Code Polish)

### Server Files (31 source files)
- `server/index.ts` -- Express app factory (`createApp`)
- `server/vercel-entry.ts` -- Vercel serverless entry point
- `server/config.ts` -- Env var loading with graceful defaults
- `server/constants.ts` -- Cache TTLs, bbox, unit conversions
- `server/types.ts` -- Shared type definitions
- `server/cache/redis.ts` -- Upstash Redis client + cache helpers
- `server/middleware/rateLimit.ts` -- Rate limiting (single config)
- `server/middleware/errorHandler.ts` -- Minimal error handler
- 8 route files (`flights`, `ships`, `events`, `news`, `markets`, `weather`, `sites`, `sources`)
- 8 adapter files (OpenSky, ADS-B Exchange, adsb.lol, AISStream, GDELT, GDELT DOC, RSS, Yahoo Finance, Open-Meteo, Overpass)
- 2 lib files (`newsFilter`, `newsClustering`)

### Env Vars Inventory (for Vercel audit)
| Variable | Used In | Required |
|----------|---------|----------|
| `UPSTASH_REDIS_REST_URL` | `server/cache/redis.ts` | Yes (crashes without) |
| `UPSTASH_REDIS_REST_TOKEN` | `server/cache/redis.ts` | Yes (crashes without) |
| `CORS_ORIGIN` | `server/index.ts`, `server/config.ts` | No (defaults to `*`) |
| `PORT` | `server/index.ts`, `server/config.ts` | No (defaults to 3001) |
| `OPENSKY_CLIENT_ID` | `server/config.ts`, `server/routes/flights.ts` | No (OpenSky disabled) |
| `OPENSKY_CLIENT_SECRET` | `server/config.ts`, `server/routes/flights.ts` | No (OpenSky disabled) |
| `ADSB_EXCHANGE_API_KEY` | `server/adapters/adsb-exchange.ts`, `server/routes/flights.ts` | No (ADS-B Exchange disabled) |
| `AISSTREAM_API_KEY` | `server/adapters/aisstream.ts` | No (ships disabled without) |
| `AISSTREAM_COLLECT_MS` | `server/adapters/aisstream.ts` | No (defaults to internal value) |
| `ACLED_EMAIL` | `server/config.ts` | No (ACLED not active) |
| `ACLED_PASSWORD` | `server/config.ts` | No (ACLED not active) |

### Bundle Composition (estimated)
| Dependency | Approx Size | Splittable |
|------------|-------------|-----------|
| deck.gl (5 packages) | ~800-1000 KB | Yes -- vendor chunk |
| maplibre-gl | ~500-700 KB | Yes -- vendor chunk |
| React + React-DOM | ~140 KB | Yes -- vendor chunk |
| Zustand | ~5 KB | No (too small) |
| Tailwind CSS runtime | ~100 KB | No (CSS, not JS) |
| App code | ~200-400 KB | Partially (lazy components) |

## Sources

### Primary (HIGH confidence)
- [Vercel CDN Cache docs](https://vercel.com/docs/caching/cdn-cache) -- Edge caching with `s-maxage`, `stale-while-revalidate`, response criteria, CDN-Cache-Control
- [Vercel CDN Compression docs](https://vercel.com/docs/compression) -- Automatic Brotli/gzip compression for all responses
- [Vercel Cron Jobs Quickstart](https://vercel.com/docs/cron-jobs/quickstart) -- `vercel.json` cron configuration, Hobby plan limits
- [Upstash Redis Pricing](https://upstash.com/docs/redis/overall/pricing) -- Free tier 500K commands/month, $10/mo fixed plan unlimited commands
- Codebase analysis -- Direct inspection of all server files, routes, middleware, tests

### Secondary (MEDIUM confidence)
- [Vercel Analytics Quickstart](https://vercel.com/docs/analytics/quickstart) -- `@vercel/analytics` React component setup
- [Vercel Speed Insights](https://vercel.com/docs/speed-insights/quickstart) -- `@vercel/speed-insights` React component setup
- [Helmet.js official site](https://helmetjs.github.io/) -- Express security middleware, 15 headers
- [rollup-plugin-visualizer GitHub](https://github.com/btd/rollup-plugin-visualizer) -- Vite/Rollup bundle analysis plugin

### Tertiary (LOW confidence)
- Vercel Hobby plan cron frequency limits -- multiple community sources suggest once-per-day minimum on Hobby, but official docs don't state this clearly

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries verified via official docs and npm
- Architecture: HIGH -- Vercel CDN caching pattern verified via official docs with code examples
- Pitfalls: HIGH -- derived from direct codebase analysis + official docs on caching criteria
- Bundle optimization: MEDIUM -- manualChunks approach verified but exact sizes need visualizer confirmation
- Cron monitoring: LOW -- Hobby plan cron frequency limits unclear from official sources

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable patterns; Vercel CDN and Upstash unlikely to change)
