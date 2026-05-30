# System Context

The Iran Monitor is a single-page React application backed by a
serverless Express API. All upstream data is fetched through the API layer
so the browser never talks directly to third-party providers, which gives
us a single place to cache, rate-limit, sanitize, and trace every request.

This page answers the top-level question: **what are the moving parts and
who talks to whom?** Zoom in via [`data-flows.md`](./data-flows.md) for
per-source request sequences and [`deployment.md`](./deployment.md) for the
Vercel topology.

## Topology

The C4Context diagram below gives the 10,000-foot view. If your Mermaid
renderer doesn't support `C4Context` (some older ones don't), the flowchart
further down shows the same topology in plain `flowchart` syntax.

```mermaid
C4Context
    title System Context — Iran Monitor

    Person(user, "User", "OSINT analyst or<br/>curious observer")

    System_Boundary(sys, "Iran Monitor") {
        Container(spa, "Vite + React SPA", "TypeScript, MapLibre, deck.gl, Zustand", "2.5D map UI, hosted as static assets on Vercel CDN")
        Container(api, "Express API", "Node 20, TypeScript, tsup bundle", "Serverless function on Vercel — proxy, cache, rate-limit, validate")
        ContainerDb(cache, "Upstash Redis", "REST client", "Stateless cache for upstream responses; hard TTL = 10x logical TTL")
    }

    System_Ext(opensky, "OpenSky Network", "Flight ADS-B feed (auth required)")
    System_Ext(adsblol, "adsb.lol", "Free community ADS-B feed")
    System_Ext(aisstream, "AISStream", "Ship AIS WebSocket stream")
    System_Ext(gdelt, "GDELT v2", "Conflict events CSV export")
    System_Ext(gdeltdoc, "GDELT DOC 2.0", "News article aggregator")
    System_Ext(overpass, "Overpass / OSM", "Infrastructure and water facility queries")
    System_Ext(openmeteo, "Open-Meteo", "Weather grid + precipitation anomaly")
    System_Ext(yahoo, "Yahoo Finance", "Commodity and energy-sector quotes")
    System_Ext(nominatim, "Nominatim", "Reverse geocoding for threat clusters")

    Rel(user, spa, "Uses", "HTTPS")
    Rel(spa, api, "Polls /api/*", "HTTPS via Vercel edge")
    Rel(api, cache, "get / set", "Upstash REST")

    Rel(api, opensky, "fetchFlights", "HTTPS")
    Rel(api, adsblol, "fetchFlights", "HTTPS")
    Rel(api, aisstream, "collectShips", "WebSocket (on-demand)")
    Rel(api, gdelt, "fetchEvents + backfill", "HTTP (TLS cert issues)")
    Rel(api, gdeltdoc, "fetchNews", "HTTPS")
    Rel(api, overpass, "fetchSites / fetchWaterFacilities", "HTTPS")
    Rel(api, openmeteo, "fetchWeather / fetchPrecipitation", "HTTPS")
    Rel(api, yahoo, "fetchMarkets", "HTTPS")
    Rel(api, nominatim, "reverseGeocode", "HTTPS")
```

### Fallback diagram (plain flowchart)

```mermaid
flowchart LR
    user([User browser])

    subgraph vercel[Vercel CDN + Serverless]
        cdn[Edge CDN<br/>Cache-Control s-maxage]
        spa[Vite SPA<br/>static assets]
        api[Express API<br/>api/vercel-entry.js bundle<br/>tsup from server/vercel.ts]
    end

    subgraph upstash[Upstash]
        redis[(Redis REST<br/>cacheGetSafe + mem fallback)]
    end

    subgraph sources[Upstream data sources]
        opensky[OpenSky]
        adsblol[adsb.lol]
        aisstream[AISStream]
        gdelt[GDELT v2]
        gdeltdoc[GDELT DOC]
        overpass[Overpass / OSM]
        openmeteo[Open-Meteo]
        yahoo[Yahoo Finance]
        nominatim[Nominatim]
    end

    user -->|HTTPS| cdn
    cdn -->|/| spa
    cdn -->|/api/*| api
    api --> redis
    api --> opensky
    api --> adsblol
    api --> aisstream
    api --> gdelt
    api --> gdeltdoc
    api --> overpass
    api --> openmeteo
    api --> yahoo
    api --> nominatim
```

## Notes

- **Single control plane.** Every upstream request is brokered by the Express
  API. The browser only ever calls `/api/*` and `/health`, which lets us hide
  API keys, enforce per-endpoint rate limits, and apply a consistent cache
  strategy without touching the client.

- **CDN edge caching.** Vercel's edge CDN sits between the browser and the
  serverless function. Each route emits a `Cache-Control: public,
s-maxage=<N>, stale-while-revalidate=<M>` header via the
  [`cacheControl` middleware](../../server/middleware/cacheControl.ts). This
  absorbs traffic spikes well before a Redis call is needed.

- **Upstash REST, not persistent connections.** Serverless functions can be
  killed at any moment, so we use the Upstash REST client rather than a
  long-lived TCP connection. It's "a fetch that stores bytes."

- **In-memory fallback.** If Upstash is unreachable or a single call hangs
  past `REDIS_OP_TIMEOUT_MS` (2000 ms, see
  [`server/cache/redis.ts`](../../server/cache/redis.ts)), the safe wrappers
  `cacheGetSafe` / `cacheSetSafe` fall through to a process-local `Map`
  cache and mark the response `degraded: true`. This is validated by a chaos
  test that mocks every Redis call to throw, asserting that all 8 cached
  routes return 2xx degraded responses — never a 5xx cascade.

- **Per-endpoint rate limiting.** The
  [`rateLimiters`](../../server/middleware/rateLimit.ts) map provides
  individually-tuned limits per route (flights is chattier than events).
  Limits are IP-scoped and reset on a sliding window — see
  [`server/openapi.yaml`](../../server/openapi.yaml) for the documented
  ceilings.

- **LLM enrichment pipeline (Phase 27 → v3 narrowed Phase 29 / 30.1 / 34).**
  The GDELT event pipeline includes an optional LLM enrichment path: raw GDELT
  rows are grouped, sent through `server/lib/llmEventExtractor.v3.ts` for
  classification into a 5-type taxonomy (`airstrike`, `on_ground`, `explosion`,
  `targeted`, `other`), validated by Zod, and geocoded via the 6-path
  Nominatim-backed resolver. The active runtime cascade is **NIM-only**
  (qwen-235b instruct) — OpenRouter dormant per Phase 30.1 (free tier 90%
  rate-limited; `skipOpenRouter: true` at `server/lib/llmEventExtractor.v3.ts:622, 929`);
  Cerebras + Groq deferred per Phase 34 (operator chose to skip provisioning).
  See [`docs/architecture/llm-pipeline-reliability.md`](./llm-pipeline-reliability.md)
  §"Multi-Provider Cascade (Phase 34)" for the cascade-shape table and
  [ADR-0010](../adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) Phase
  30.1 + 34 sub-blocks for rationale. The raw CAMEO classification tables and
  city-centroid dispersion logic are retained as a graceful fallback via the
  Pitfall 1 cache bridge (`/api/events` serves raw GDELT when `events:llm:v3`
  is empty — the map never goes blank).

## Next steps

- [`data-flows.md`](./data-flows.md) — zoom in on what happens inside each
  `/api/*` call with one Mermaid `sequenceDiagram` per source.
- [`deployment.md`](./deployment.md) — zoom in on the Vercel topology, cron
  jobs, and cache-header table.
- [`ontology/types.md`](./ontology/types.md) — zoom in on the types that
  flow through these arrows.
