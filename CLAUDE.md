# Iran Monitor

## Project Context

Personal real-time intelligence dashboard for monitoring the Iran conflict. 2.5D map with live data from public APIs. Numbers over narratives.

## Conventions

- **TypeScript strict mode** — always enabled
- **Zustand stores** — curried `create<T>()()` pattern for type inference
- **Zustand selectors** — `s => s.field` pattern to minimize re-renders
- **Tailwind CSS v4** — CSS-first `@theme` configuration, no tailwind.config.js
- **Z-index** — scale defined as CSS custom properties for consistent overlay layering
- **Commits** — conventional commits format (`feat(phase):`, `fix(phase):`, `docs(phase):`)
- **Branches** — one feature branch per phase (`feature/XX-description`), never commit to main directly
- **Phase boundaries** — before starting a new phase: commit, push, merge previous phase to main, update all docs, then create new branch from main
- **TypeScript** — pinned to ~5.9.3 to avoid TS 6.0 breaking changes

## Environment Variables (Phase 28.1+)

Operator-tunable runtime levers introduced in Phase 28.1 W5 D-12. All have working defaults; override at Vercel deploy time only when tuning incident response. Client-tier vars use the `VITE_*` prefix so Vite exposes them to the browser bundle.

- **Polling intervals (ms):** `VITE_POLL_FLIGHTS_MS` (5000), `VITE_STALE_FLIGHT_MS` (60000), `VITE_POLL_SHIPS_MS` (30000), `VITE_POLL_EVENTS_MS` (900000), `VITE_POLL_NEWS_MS` (900000), `VITE_POLL_MARKETS_MS` (300000), `VITE_POLL_WATER_PRECIP_MS` (21600000), `VITE_POLL_WEATHER_MS` (1800000), `VITE_POLL_LLM_STATUS_ACTIVE_MS` (5000), `VITE_POLL_LLM_STATUS_IDLE_MS` (30000)
- **Spatial thresholds (km):** `VITE_ATTACK_RADIUS_KM` (5), `VITE_PROXIMITY_ALERT_KM` (5)
- **Severity scoring (hours):** `VITE_SEVERITY_HALF_LIFE_HOURS` (24)

See `.env.example` for current defaults and one-line purposes. Domain-definitional constants (`IRAN_BBOX`, `IRAN_CENTER`, `WAR_START`, `ADSB_RADIUS_NM`) are NOT env-tunable per D-11; they live in `src/lib/domain.ts` (canonical) with a byte-identical mirror in `server/config.ts` enforced by `src/__tests__/domain.test.ts`.

## Color Tokens (Phase 28.1+)

D-13 single source of truth for all entity / event / site / faction / ethnic colors. Tailwind utilities and deck.gl both pull from one definition; theme drift is mechanically impossible.

- **`src/styles/app.css` `@theme` block** — canonical declaration of 24 entity color CSS vars: `--color-flight`, `--color-flight-unidentified`, `--color-ship`, `--color-event-{airstrike,on-ground,explosion,targeted,other}`, `--color-site-{healthy,attacked}`, `--color-faction-{us,iran,neutral,disputed}-aligned/disputed`, `--color-ethnic-{kurdish,arab,persian,baloch,turkmen,druze,alawite,yazidi,assyrian,pashtun}`. Hex (NOT OKLCH) so the bridge's hex parser can roundtrip cleanly to RGBA tuples.
- **`src/lib/colorBridge.ts`** — module-load CSS-var reader. Reads each `--color-*` var ONCE via `getComputedStyle(document.documentElement)`, parses to `[r, g, b]` tuples for deck.gl `getColor` callbacks and re-exports as hex strings for HTML/CSS consumers. SSR/jsdom fallback returns the TS-literal default (byte-identical to runtime).
- **Consumers** — `src/components/map/layers/constants.ts ENTITY_COLORS` / `ENTITY_DOT_COLORS`, `src/lib/factions.ts FACTION_COLORS`, `src/lib/ethnicGroups.ts ETHNIC_GROUPS` all source from `colorBridge` — no inline hex/RGBA literals remain in the consumers.
- **Byte-identity sentinel** — `src/__tests__/lib/colorBridge.test.ts` asserts every bridge fallback default matches the corresponding consumer value at runtime. Drift fails the test on the next `vitest run`.

## Map Patterns

- **DeckGLOverlay** wraps MapboxOverlay via `useControl` hook from react-maplibre
- **Style customization** — imperative in `onLoad` with `getLayer()` guards, never pre-fetch/modify CARTO style.json
- **CompassControl** — renders null (behavior-only) using `useMap` hook and DOM querySelector
- **Terrain** — AWS Terrarium S3 tiles, `tiles` array + `encoding` prop pattern for raster-dem sources
- **Map mocks** — maplibre-gl and @deck.gl/mapbox mocked via `vite.config.ts` test.alias for jsdom

## Testing

- **Framework**: Vitest with jsdom (frontend), node (server)
- **Run**: `npx vitest run` (all), `npx vitest run server/` (server only)
- **Mocks**: `src/test/__mocks__/` for WebGL-dependent libraries
- **Stubs**: `it.todo()` for unimplemented test stubs

## Key Files

- `src/components/map/constants.ts` — map configuration (terrain, bounds, styles)
- `src/components/map/BaseMap.tsx` — main map component with all overlays
- `src/components/layout/AppShell.tsx` — root layout shell (wires all four polling hooks)
- `src/components/layout/StatusDropdown.tsx` — Topbar HUD status dropdown (visible entity counts + connection dots)
- `src/components/layout/LayerTogglesSlot.tsx` — layer toggle panel (8 rows)
- `src/components/layout/DetailPanelSlot.tsx` — right-side detail panel (360px slide-out)
- `src/hooks/useSelectedEntity.ts` — cross-store entity lookup with lost contact tracking
- `src/components/map/EntityTooltip.tsx` — hover/click tooltip for all entity types
- `src/stores/mapStore.ts` — map state (loaded, cursor position)
- `src/stores/uiStore.ts` — UI state (panels, toggles)
- `src/stores/flightStore.ts` — flight data state (entities, connection health, metadata)
- `src/hooks/useFlightPolling.ts` — 5s recursive setTimeout with tab visibility awareness
- `src/stores/siteStore.ts` — site data state (entities, connection health)
- `src/stores/newsStore.ts` — news data state (clusters, connection health)
- `src/hooks/useNewsPolling.ts` — 15-min recursive setTimeout for news polling
- `src/hooks/useSiteFetch.ts` — one-time site fetch on mount
- `src/lib/attackStatus.ts` — cross-references sites with nearby GDELT events

## Data Model (Phase 3+)

- **MapEntity** — discriminated union with minimal shared fields (`id`, `type`, `lat`, `lng`, `timestamp`, `label`) + nested type-specific data
- **Entity types**: `flight`, `ship`, 5 `ConflictEventType` values (`airstrike`, `on_ground`, `explosion`, `targeted`, `other`), plus `site` (separate from MapEntity union)
- **FlightEntity.data** — includes `unidentified: boolean` flag for hex-only/no-callsign flights
- **API endpoints**: `/api/flights`, `/api/ships`, `/api/events`, `/api/sites`, `/api/news`, `/api/water`, `/api/markets`, `/api/health`, `/api/audit-status`, `/api/operator-status` (Bearer-gated aggregator)
- **Domain constants** — `IRAN_BBOX` covers Greater Middle East + Mediterranean + Arabian Sea (south:0.0, north:50.0, west:20.0, east:80.0). `IRAN_CENTER` (28.0, 45.0) with 1200 NM `ADSB_RADIUS_NM` for ADS-B queries. `WAR_START` 2026-02-28. All defined in `src/lib/domain.ts` (canonical) with byte-identical mirror in `server/config.ts`.

## Flight + Ship + Event Data

- **Polling** — recursive `setTimeout` (not `setInterval`); pauses on `document.visibilitychange` hidden, immediate fetch on visible
- **Connection state** — `ConnectionStatus`: `'connected' | 'stale' | 'error' | 'loading'`; flights stale-clear at 60s (prevents stale positions)
- **Flight sources** — OpenSky (5s), ADS-B Exchange via RapidAPI (260s), adsb.lol free default (30s); shared V2 normalizer in `server/adapters/adsb-v2-normalize.ts`
- **GDELT v2** — default conflict event source (free, no auth, 15-min updates); HTTP not HTTPS (TLS cert issues); `adm-zip` decompresses ZIPs; FIPS 10-4 country codes (IZ=Iraq, TU=Turkey, IS=Israel)
- **5-type ontology** — `airstrike`, `on_ground`, `explosion`, `targeted`, `other`; `classifyByBaseCode` maps CAMEO 3-digit base codes when LLM is unavailable
- **AISStream on-demand** — connect, collect for N ms, close per request (no persistent WebSocket); ships merged by MMSI with 10 min stale prune
- **AppShell wiring** — `useFlightPolling()`, `useShipPolling()`, `useEventPolling()`, `useNewsPolling()`, `useSiteFetch()`, `useWaterFetch()`, `useWaterPrecipPolling()`, `useMarketPolling()`

## LLM Event Pipeline

- **Active providers (Phase 34 close-out)** — qwen-235b instruct model (NIM-only at runtime). OpenRouter dormant (Phase 30.1 — free tier 90% rate-limited). Cerebras + Groq deferred (Phase 34 — operator chose to skip provisioning); see `docs/architecture/llm-pipeline-reliability.md` "Multi-Provider Cascade (Phase 34)" for the cascade-shape table and `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` Phase 34 sub-block for the deferral rationale.
- **Single extractor module** — `server/lib/llmEventExtractor.v3.ts`. Cron-only writer; cache at `events:llm:v3`. v1/v2 modules + runtime toggle deleted Phase 29 (Plans 04-06).
- **callLLM cascade** — `server/adapters/llm-provider.ts`. Per-event retry budget 2 attempts × 1s/4s exp backoff + ±250ms jitter. Providers gated on circuit breaker `isAvailable` + token-budget `budgetState !== 'hard'`. Synthetic `skipReason` entries appended to `callHistory` on bypass.
- **Reliability primitives** — `server/lib/llmCircuitBreaker.ts` (sliding 10-call window, paused 5min on >30% error rate), `server/lib/llmDLQ.ts` (Redis SADD bounded 200 entry / 7d TTL at `events:llm-dlq`), `server/lib/llmTokenBudget.ts` (per-provider daily caps, soft 0.8 / hard 0.95, 48h TTL on `llm:tokens:{provider}:YYYY-MM-DD`).
- **Watchdog** — `server/lib/llmExtractorWatchdog.ts` `withBatchWatchdog`: 90s hard-kill, 60s soft-warn, AbortController + generation counter prevents late-resolve cache clobber. Env override `LLM_BATCH_TIMEOUT_MS`.
- **6-path resolver** — `server/lib/llmResolver.ts` `resolveLocation(hierarchy, ctx)`: `own-site-snapshot`, `poi-amenity-nominatim`, `nominatim-direct`, `nominatim-verified-2pass`, `gdelt-actiongeo-fallback`, `bellingcat-coord-passthrough`. Never returns a coord without provenance. 1-req/s Nominatim throttle. Cache `geocode:fwd:constrained:v2:<hash>`.
- **Parallel batches** — `server/lib/concurrencyLimit.ts` `createLimit(maxConcurrent)` FIFO queue. v3 extractor runs `Promise.all(tasks)` post-loop. `LLM_V3_CONCURRENCY` env (default 12 → ~26 req/min under NIM's 40/min ceiling). Set to `1` for fully sequential rollback.
- **Cron-only trigger** — `/api/events` is cache-only (anti-pattern #17: do NOT re-introduce fire-and-forget). Daily 4am UTC cron `/api/cron/refresh-events` is the sole writer; calls `runRefreshExtraction()` in `server/lib/llmExtractionPipeline.ts`. Cold-cache self-heal bypasses cooldown when `events:llm:v3` is empty. Operator force-trigger: `GET /api/cron/refresh-events?force=true` with Bearer.
- **Cron schedule (3 entries, well under the Pro 40-cron cap)** — `/api/cron/health 0 0 * * *` (Redis ping + freshness + eval-drift via `runEval()` + adversarial eval), `/api/cron/warm 0 12 * * *` (Overpass sites + water pre-warm), `/api/cron/refresh-events 0 4 * * *` (LLM v3 extraction).
- **Graceful degradation** — LLM down → `/api/events` serves raw GDELT via Pitfall 1 bridge (`server/routes/events.ts`). Map never goes blank. ADR-0010 makes raw GDELT the terminal fallback.
- **Eval harness** — `server/lib/llmEvalHarness.ts` `runEval()` against `.planning/eval/ground-truth-events.json` (50 curated events, 11 countries); RESOLVER-ONLY (avoids doubling token spend). Scores at 5/20/100km. Persists baseline `events:llm-eval-baseline:v3` (90d) + adversarial `events:llm-eval-adversarial:v3` (90d) from `runAdversarialEval()` over `.planning/eval/adversarial-injections.json`.
- **Precision + Toggles** — `exact | neighborhood | city | region` rendered as radius rings via `src/components/map/PrecisionRingLayer.tsx`. Master `showEvents` + 5 sub-toggles per type in filterStore.
- **Tuned defaults reference** — [`docs/architecture/llm-pipeline-reliability.md`](docs/architecture/llm-pipeline-reliability.md) records the measured throttle window, RPM ceiling, tuned `LLM_V3_CONCURRENCY` / `LLM_BATCH_SIZE` / `LLM_BATCH_TIMEOUT_MS` / `BACKOFF_MS` defaults, and the retired-mechanism rationale (SIMPLIFY-01 incremental flush, SIMPLIFY-03 soft-warn). Phase 31 appends the 7-day watch there.

## Serverless Cache (Phase 13)

- **Upstash Redis** — REST-based client (`@upstash/redis`) for serverless compatibility
- **CacheEntry<T>** — `{data, fetchedAt}` for staleness computation; hard Redis TTL = 10x logical TTL
- **Module** — `server/cache/redis.ts` exports `cacheGet<T>`, `cacheGetSafe<T>`, `cacheSet<T>`, `cacheSetSafe<T>`, `redis` instance
- **Events accumulator** — merge-by-ID upsert with `WAR_START` pruning; GDELT backfill lazy via `backfillEvents()` on cache miss (4 files/day sampling, 1h cooldown via `events:backfill-ts`); `parseSqlDate` uses `Date.UTC()` not local time

**Active Redis keys (current-state registry):**

- **`events:llm:v3`** — active terminal LLM-enriched cache; cron writer (sole); `/api/events` reader. Only key written by the cascade.
- **`events:llm-summary:v3`** — last-run summary metadata; `/api/events/llm-status` reader.
- **`events:llm-dlq`** — SADD bounded set, 200 cap, 7d TTL; failed extractions with `reason: 'timeout_watchdog'` etc.; `lastError` capped 500 chars.
- **`events:llm-process-ts`** — cooldown sentinel for cron extraction (15-min default; bypassed by `?force=true` or empty cache self-heal).
- **`events:llm:v3:lineage:{eventId}` (Phase 27.4.3 D-13)** — HSET of per-event lineage record (prompt/response/parsed/coord/reasoningTrace/lineageHash); 7d TTL. Writer: `server/lib/llmLineage.ts:57` `appendLineage`. Reader: lineage drill-down (DevApiStatus) + `scripts/snapshot-v3-redis.ts`.
- **`events:llm:v3:lineage-keys` (Phase 27.4.3 D-13)** — ZADD sorted-set index of lineage entries; 7d TTL; capped 500 entries (`LINEAGE_MAX_ENTRIES`). Writer: `server/lib/llmLineage.ts:78`. LRU eviction via `ZREMRANGEBYRANK`.
- **`events:llm:v3:group-lineage:{hash}` (Phase 27.4.4 D-18)** — pre-filter cache for group-level lineage; 7d TTL. Reader: `server/lib/llmEventExtractor.v3.ts:529-587` (`processEventGroupsV3` pre-filter loop). Write side not yet implemented (Plan 02 Gate B follow-up — see `server/lib/llmLineage.ts:104` comment).
- **`events:llm-pipeline-audit` (Phase 27.4.3 D-15)** — LPUSH + LTRIM bounded list (200 cap); 90d TTL. Writer: `server/lib/pipelineAudit.ts:33-35` `appendPipelineAudit`. Reader: `server/lib/pipelineAudit.ts:44` `listPipelineAudit`. Historical record of pipeline-version flips — no new writers expected post-Phase-29.
- **`events:llm-cost-shadow:v3:{YYYY-MM-DD}`** — HSET daily cost roll-up (HINCRBY fields `tokensIn`, `tokensOut`, `usdMicrocents`); 90d TTL. Writer: `server/lib/freeClaudeRouter.ts:669` `accrueShadowCost`. Reader: dashboard via Upstash REST (no production reader in code). Pricing model: tokens_in × $0.20/M + tokens_out × $0.40/M; USD stored as integer microcents (×1e6) to avoid Redis float precision loss.
- **`events:llm-eval-baseline:v3`** — `runEval()` resolver-only accuracy baseline; 90d TTL.
- **`events:llm-eval-adversarial:v3`** — `runAdversarialEval()` prompt-injection robustness (`.planning/eval/adversarial-injections.json` fixtures); 90d TTL; folded into `/api/cron/health`.
- **`events:gdelt`** — raw GDELT cache (15-min logical TTL); polling-layer writer; Pitfall 1 terminal fallback when v3 is empty.
- **`flights:{source}`** — per-source flight cache (OpenSky / ADS-B Exchange / adsb.lol); short TTL.
- **`ships:ais`** — AISStream merged ship cache (10 min stale).
- **`sites:v3`** — Overpass static infrastructure (24h TTL).
- **`water:facilities:v4`** — Overpass water facilities with Latin-label admission gate + desalination synthesis (24h TTL). Phase 42: bumped v3→v4 for the name-aware + deterministic spatial-dedup behavior change.
- **`water:precip`** — Open-Meteo 30-day precipitation anomaly (6h TTL); `findNearestPrecip` 4° Manhattan cutoff.
- **`news:feed`** — clustered render-target cache (RSS + GDELT-DOC merged, Jaccard 0.8 dedup, 7-day window); 15-min TTL. Writer: `server/routes/news.ts:28` (`NEWS_FEED_KEY`). Reader: same file + `server/lib/healthSources.ts:40`.
- **`news:gdelt`** — raw GDELT-DOC LLM-input cache; 15-min TTL. Writer: GDELT-DOC adapter (`server/adapters/gdelt-doc.ts`). Reader: `server/lib/llmEventExtractor.v3.ts:107` (NEWS BLOCK in prompt); `server/routes/events.ts:672` (Pitfall 1 fallback path).
- **`markets:yahoo:{range}`** — Yahoo Finance commodity prices, one key per `range ∈ {1d, 5d, 1mo, ytd}` (4 keys total); 60s TTL. Writer/reader: `server/routes/markets.ts:26` (`cacheKey = \`markets:yahoo:${range}\``).
- **`geocode:{lat},{lon}`** + **`geocode:fwd:constrained:v2:{hash}`** — Nominatim cache (30d logical / 90d hard), 1 req/s throttle, ME-viewbox-constrained forward geocode.
- **`llm:tokens:{provider}:YYYY-MM-DD`** — daily token budget counter; 48h TTL.
- **`llm:lastProgress` (Phase 28.2.7)** — Redis-backed write-through for `llmProgress` singleton so `probeLlmStatus()` survives Vercel Fluid Compute cold starts. Shape `{startedAt, completedAt}`. Write fires in `resetProgress()` always (D-01) and in `updateProgress()` only on terminal transitions (D-02). Reader at `server/routes/health.ts` falls back to in-memory singleton with `latest = redisLatest ?? memLatest`.
- **`llm:calls:history` (Phase 39 OBS-FLIGHT-01)** — LPUSH+LTRIM 500-cap, 30d TTL. LLM call-history flight recorder; entry = `CallHistoryEntry` (the in-memory `callHistory` row fields + `runId` + `batchIndex`). Writer `server/lib/llmCallHistory.ts` `appendCallHistory` (dual-write alongside the in-memory singleton); reader `/api/events/llm-history` + cold-start hydration (`hydrateCallHistoryIfCold` repopulates the cap-20 singleton on first request after a Fluid Compute cold start). Degrade-open — never throws.
- **`llm:runs:history` (Phase 39 OBS-FLIGHT-02)** — LPUSH+LTRIM 200-cap, 30d TTL. Per-run summary flight recorder; entry = `RunHistoryEntry`. Writer `server/lib/llmRunHistory.ts` `openRunRecord` (opens `outcome:'running'` at run start) + `closeRunRecord` (re-LPUSHes the terminal record at run end — NOT LSET, GA-2). Reader `/api/events/llm-history` dedupes by `runId` (head/terminal-first wins); a run killed by Vercel `maxDuration` leaves only the `running` record (the "run that died" signal, Pitfall 5). Degrade-open.
- **`cron:lastTick:{name}` (Phase 28.2.7)** — 7d TTL (`CRON_LASTTICK_TTL_SEC` in `server/lib/healthSources.ts`). Writers in all 3 cron handlers; `name ∈ {health, warm, refresh-events}` — emitted as `cron:lastTick:health`, `cron:lastTick:warm`, `cron:lastTick:refresh-events`. `cron:lastTick:refresh-events` writes only AFTER `runRefreshExtraction` resolves (D-03 honest-failure semantics). Reader `probeCronTick` in `server/routes/health.ts:182`.
- **`operator:audit-log` (Phase 28.2 W3)** — SADD bounded set, 500 cap, 30d TTL. Operator-action audit log (POST `/api/events/llm-replay` writes structured entry `{timestamp, bearerFingerprint, operation, args, result}`). Surfaced via `/api/operator-status` to the API Health tab Operator Actions block.
- **`operator:replay-quota:{bearerFingerprint}:{YYYY-MM-DD}` (Phase 28.2 W3)** — INCR counter, 48h TTL. 50 replay calls / 24h per Bearer. At cap, replay returns 429 + `Retry-After`.
- **`audit:connectivity:last-result` (Phase 28.2 W6)** — 7d TTL. Written by `.github/workflows/prod-connectivity-audit.yml` after each prod-audit run. Shape `{status, runId, timestamp, endpoints, durationMs, allTiersGreen?, tierStatus?}`. Reader `server/routes/audit-status.ts` (no auth gate; degrade-open). Surfaced as audit-result banner. JSON shape pinned by W-3 contract test.
- **`events:url-liveness:{eventId}` (Phase 32 D-19, D-20, D-22; Phase 43 D-04/D-06/D-10/D-16)** — per-event URL liveness probe result; JSON `{status: 'live'|'404'|'403'|'dead-host'|'unknown'|'soft-404'|'no-url', lastProbedAt: ISO8601, attemptCount: number, lastUrlProbed: string|null, lastHttpStatus: number|null, evidence: string|null}`. 7-status taxonomy (Phase 43 adds `soft-404` body-heuristic dead + `no-url` for events with no primary URL); `lastUrlProbed` is null for `no-url`; `evidence` (≤200 chars) carries the verdict provenance (`'http-404'`, `'http-403'`, `'dead-host: fetch failed'`, soft-404 match detail, or null). Tiered TTL: `live` 7d, terminal dead (`404`/`403`/`dead-host`/`soft-404`) 24h, `no-url` 24h, `unknown` 1h. Writer: `server/lib/urlLiveness.ts` (cron probe sweep via `runProbeSweep`); reader: `pruneDeadUrlEvents` + `/api/operator-status` aggregator. Schema pinned by `server/__tests__/lib/urlLiveness.schema.test.ts` + literal-path shim at `src/__tests__/lib/urlLiveness.schema.test.ts`. `attemptCount` semantics: live resets to 0, unknown PRESERVES prior count, dead→dead increments (Phase 43 D-10).
- **`events:url-liveness-count` (Phase 32 Pitfall 3)** — sidecar integer; count of events whose primary URL has terminal-dead status. O(1) read for dashboard polls (avoids N Redis GETs per `/api/operator-status` poll). INCR on live→dead transitions, DECR on dead→non-dead transitions and on prune (floored at 0 against DECR underflow via the lone permitted raw `redis.set(KEY, 0)` call). No TTL (persistent sidecar). Writer: `server/lib/urlLiveness.ts` `persistLiveness` + `pruneDeadUrlEvents`; reader: `server/routes/operator-status.ts`.
- **`operator:prune-quota:{bearerFingerprint}:{YYYY-MM-DD}` (Phase 32 D-15)** — INCR counter; per-Bearer per-day prune quota (50/24h). 48h TTL set on first INCR of each UTC day; second-and-later INCRs do NOT re-issue EXPIRE. Writer/reader: `server/lib/pruneQuota.ts` `checkPruneQuota`. Cron caller (`bearerFingerprint: 'cron:refresh-events'`) BYPASSES the quota check at the endpoint layer.

## Vercel Deployment

- **Entry point** — `api/vercel-entry.js` (bundled output; tsup bundles `server/vercel.ts` → `api/vercel-entry.js`). Express app via `createApp()` factory in `server/app.ts`.
- **Plan + limits** — Vercel **Pro** tier (`otg-iran-monitor` project, alias `otg-iran-monitor.vercel.app`). `vercel.json` `functions.api/vercel-entry.js.maxDuration: 800` (Phase 29 D-08 lock; required for ~10-min LLM extraction runs).
- **Rewrites** — `/api/*`, `/api/cron/*`, `/health` all → `/api/vercel-entry`; everything else → SPA `index.html`. See `vercel.json` for canonical config.
- **Rate limiting** — `express-rate-limit` middleware in `server/middleware/rateLimiter.ts`. `rateLimiters.public` global tier (60-req/min) skipped on valid `DASHBOARD_PASSWORD` Bearer via `timingSafeEqual` constant-time compare; per-endpoint tiers (flights 120/min, ships 60/min, events 20/min) unaffected. Empty `DASHBOARD_PASSWORD` falls through to limiter (NOT a 503 — differs from `dashboardAuth.ts` which fail-closes). Tested by `src/__tests__/rate-limit.test.ts`.
- **Fail-fast config** — Phase 26.3+ `parseEnv()` (Zod) throws on missing/malformed env vars at startup. The prior "Graceful config" defaults pattern was retired (Phase 28.1 W7).
- **Node engine** — pinned `>=20` in `package.json`. Build: `npm run build` runs Vite + tsup + tsc typecheck.

---

For pre-Phase-29 phase history (Phases 4–28.2.5: flight sources, ship/event data, conflict event ontology, layer controls, detail panel, analytics counters, news feed, notification center, oil markets, search/filter, visualization layers, key sites, political boundaries, ethnic distribution, water stress, threat density, navigation stack, LLM v1/v2 pipelines, watchdog, parallel batches, cron-driven pipeline, cleanup sweep, dev/prod sync, API green-light prereq gate), see [.planning/milestones/v1.4-ROADMAP.md](.planning/milestones/v1.4-ROADMAP.md) and the per-phase folders under [.planning/milestones/v1.4-phases/](.planning/milestones/v1.4-phases/).

For Phase 29 (LLM provider chain narrowing, LLM-optional architecture, Vercel Pro upgrade, domain rename), see [docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md](docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) and [docs/runbook.md](docs/runbook.md).
