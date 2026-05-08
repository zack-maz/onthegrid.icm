# Iran Conflict Monitor

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
- **`src/lib/colorBridge.ts`** — module-load CSS-var reader. Reads each `--color-*` var ONCE via `getComputedStyle(document.documentElement)`, parses to `[r, g, b]` tuples for deck.gl `getColor` callbacks (no per-frame `getComputedStyle` cost) and re-exports as hex strings for HTML/CSS consumers. SSR/jsdom fallback returns the TS-literal default (byte-identical to runtime).
- **Consumers** — `src/components/map/layers/constants.ts ENTITY_COLORS` / `ENTITY_DOT_COLORS` (deck.gl IconLayer + toggle dots), `src/lib/factions.ts FACTION_COLORS` (Phase 24 political boundaries), `src/lib/ethnicGroups.ts ETHNIC_GROUPS` (Phase 25 ethnic overlay) all source from `colorBridge` — no inline hex/RGBA literals remain in the consumers.
- **Byte-identity sentinel** — `src/__tests__/lib/colorBridge.test.ts` asserts every bridge fallback default matches the corresponding `ENTITY_COLORS` / `ENTITY_DOT_COLORS` / `FACTION_COLORS` / `ETHNIC_GROUPS` value at runtime. Drift in any direction fails the test on the next `vitest run`.
- **Stays as TS literals** (per CONTEXT D-13) — `ICON_SIZE`, `PULSE_CONFIG`, `altitudeToOpacity` in `layers/constants.ts` are deck.gl rendering props, not styling. `SITE_SUBTYPE_COLORS` / `WATER_TYPE_COLORS` (Phase 15 / 26) are out of D-13 scope. `ETHNIC_GROUPS` alpha (140 / ~55%) is owned by `ethnicGroups.ts`, not by `@theme` (alpha is a rendering attribute, not a brand color).

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
- `src/components/layout/StatusDropdown.tsx` — Topbar HUD status dropdown (visible entity counts + connection dots; replaces Phase 19-displaced StatusPanel)
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
- **Entity types**: `flight`, `ship`, plus 11 `ConflictEventType` values, plus `site` (separate from MapEntity union)
- **FlightEntity.data** — includes `unidentified: boolean` flag for hex-only/no-callsign flights
- **API endpoints**: `/api/flights`, `/api/ships`, `/api/events`, `/api/sites`, `/api/news` (separate, independent caching)
- **Phase 28.2 endpoints**: `/api/audit-status` (CI connectivity audit sidecar, GET only, no Bearer required — read-only Redis sidecar key reader; degrade-open on parse fail; surfaced as the merged API Health tab's audit-result banner). `/api/operator-status` (operator metrics aggregator, GET only, Bearer-required — returns `{audit24h, byBearer, pinTtl, advEval}` aggregating operator:audit-log + events:llm-pipeline-override TTL + events:llm-eval-adversarial:v3 in one fetch).
- **IRAN_BBOX** — covers Greater Middle East + Mediterranean + Arabian Sea (south:0.0, north:50.0, west:20.0, east:80.0), defined in `src/lib/domain.ts` as of Phase 28.1 W5 D-11. Note: prior CLAUDE.md drafts said "(south:15, north:42, west:30, east:70)" — that was doc drift; the (0,50,20,80) values are the authoritative runtime behavior preserved through Phase 28.1.
- **IRAN_CENTER** — (28.0, 45.0) with 1200 NM radius for ADS-B queries. Defined in `src/lib/domain.ts` as of Phase 28.1 W5 D-11 (canonical home moved from server/config.ts; server retains a byte-identical copy enforced by the parity test in `src/__tests__/domain.test.ts`). Note: prior CLAUDE.md drafts said "(30.0, 50.0) with 500 NM" — that was doc drift; the (28.0, 45.0) + 1200 NM values are the authoritative runtime behavior preserved through Phase 28.1.

## Flight Data Patterns (Phase 4+)

- **Polling** — recursive `setTimeout` (not `setInterval`) to avoid overlapping async fetches
- **Tab visibility** — polling pauses on `document.visibilitychange` hidden, immediate fetch on visible
- **Cache-first route** — server checks Redis cache before upstream call to conserve API credits
- **Connection state** — `ConnectionStatus` type: `'connected' | 'stale' | 'error' | 'loading'`
- **Stale threshold** — 60s of no fresh data → clear flights entirely (prevents showing dangerously outdated positions)
- **Full replace** — each poll replaces entire flights array atomically (no merge-by-ID)
- **Ground traffic filtering** — moved from server to client-side (`useEntityLayers` filters by `showGroundTraffic` toggle)
- **RateLimitError** — OpenSky adapter throws `RateLimitError` on 429 responses (consistent with ADS-B Exchange pattern)

## Multi-Source Flight Data (Phase 6-7)

- **Three flight sources**: OpenSky, ADS-B Exchange (RapidAPI), adsb.lol (free, default)
- **FlightSource type** — defined in `src/types/ui.ts` to avoid circular imports with server types
- **Polling intervals** — OpenSky 5s, ADS-B Exchange 260s, adsb.lol 30s
- **V2 normalizer** — shared normalizer in `server/adapters/adsb-v2-normalize.ts` for ADS-B Exchange and adsb.lol
- **StatusDropdown** — Topbar-housed 3-line HUD (flights/ships/events with colored health dots; introduced Phase 19 to replace StatusPanel + SourceSelector)
- **/api/sources** — returns per-source configuration status
- **Persistence** — selected flight source stored in `localStorage`

## Ship & Event Data (Phase 8+)

- **Ship store** — `src/stores/shipStore.ts` with 120s stale threshold
- **Event store** — `src/stores/eventStore.ts` with no stale clearing (historical data)
- **Polling hooks** — `useShipPolling` (30s), `useEventPolling` (900s / 15 min)
- **AppShell** — wires all four: `useFlightPolling()`, `useShipPolling()`, `useEventPolling()`, `useSiteFetch()`
- **Entity colors** — flights yellow (#eab308), unidentified shiny bright yellow (#ffff64 — see Color Tokens), ships purple (#a78bfa), airstrikes bright red (#ff3b30), on_ground dark burnt red (#b43214), explosion vibrant orange-red (#ff5f19), targeted dark crimson (#8b1e1e), other light red (#dc5a5a). All sourced from CSS `@theme` via `src/lib/colorBridge.ts` (Phase 28.1 W6 D-13).
- **Entity icons** — flights/ships use chevron, airstrikes use starburst, ground combat uses explosion, targeted uses crosshair, other conflict uses xmark
- **Icon sizing** — flights/ships 4000m base (minPixels:24, maxPixels:160); events 3000m base (minPixels:16, maxPixels:120); sites 2000m base (minPixels:12, maxPixels:80)

## Conflict Event Data (Phase 8.1+)

- **GDELT v2** — default conflict event source (free, no auth, 15-min updates)
- **ACLED** — adapter preserved in `server/adapters/acled.ts` but not active (requires account approval)
- **GDELT adapter** — `server/adapters/gdelt.ts`, fetches lastupdate.txt → downloads ZIP → parses CSV → filters Middle East conflicts
- **GDELT endpoint** — `http://data.gdeltproject.org/gdeltv2/lastupdate.txt` (HTTP, not HTTPS — TLS cert issues)
- **ConflictEventType** — 5 attack-vector types: `airstrike`, `on_ground`, `explosion`, `targeted`, `other` (Phase 27 replaced 11 CAMEO types)
- **classifyByBaseCode** — maps CAMEO EventBaseCode (3-digit) → ConflictEventType, retained as fallback when LLM unavailable
- **CONFLICT_TOGGLE_GROUPS** — 5 groups: showAirstrikes (`airstrike`), showGroundCombat (`on_ground`), showExplosions (`explosion`), showTargeted (`targeted`), showOther (`other`)
- **isConflictEventType** — type guard derived from CONFLICT_TOGGLE_GROUPS (single source of truth)
- **EVENT_TYPE_LABELS** — human-readable display labels for all 5 types
- **FIPS codes** — GDELT uses FIPS 10-4 (IZ=Iraq, TU=Turkey, IS=Israel), not ISO
- **adm-zip** — required for ZIP decompression (Node zlib only handles gzip/deflate)
- **Deduplication** — GDELT rows deduplicated by date+CAMEO+lat/lng, keeping highest NumMentions row

## LLM Event Pipeline (Phase 27)

- **Providers** — Cerebras primary (gpt-oss-120b, 1M TPD free), Groq fallback (openai/gpt-oss-120b, 200K TPD free)
- **LLM adapter** — `server/adapters/llm-provider.ts`, OpenAI SDK with baseURL swap for both providers
- **Event grouping** — `server/lib/eventGrouping.ts`, clusters GDELT rows by date + CAMEO root + 50km proximity
- **LLM extractor** — `server/lib/llmEventExtractor.ts`, batch processing (8 groups/call), Zod-validated output
- **Forward geocoding** — Nominatim search API via `server/adapters/nominatim.ts` `forwardGeocode()`, 1 req/s, Redis-cached 30d
- **Processing trigger** — Lazy on `/api/events` cache miss, 15-min cooldown (`events:llm-process-ts` Redis key)
- **Dual cache** — `events:llm` (LLM-enriched, preferred) + `events:gdelt` (raw fallback)
- **Graceful degradation** — LLM down -> serve raw GDELT -> same as pre-Phase-27 behavior. Map never goes blank.
- **5-type ontology** — `airstrike`, `on_ground`, `explosion`, `targeted`, `other` (replaces 11 CAMEO types)
- **Precision** — `exact` | `neighborhood` | `city` | `region`, shown as radius rings on map
- **PrecisionRingLayer** — `src/components/map/PrecisionRingLayer.tsx`, ScatterplotLayer with radiusUnits: 'meters'
- **Toggle system** — master `showEvents` + 5 sub-toggles (one per type) in filterStore
- **Event colors** — red spectrum: airstrike bright red (#ff3b30), on_ground dark burnt red (#b43214), explosion vibrant orange-red (#ff5f19), targeted dark crimson (#8b1e1e), other light red (#dc5a5a). Phase 28.1 W6 surfaced doc-drift here vs CONTEXT D-13's spec values (#c0392b/#e74c3c/#dc143c/#800000); per W5 Pattern 3, runtime hex values were preserved and CLAUDE.md updated to match. All values live in `src/styles/app.css` `@theme` block; see Color Tokens.
- **Event color exports** — `src/components/map/layers/constants.ts ENTITY_COLORS` (RGBA tuples for deck.gl) and `ENTITY_DOT_COLORS` (hex strings for toggles), both sourced from `src/lib/colorBridge.ts`. There is no separate `src/lib/eventColors.ts` file (CONTEXT D-13's reference to it is doc drift; Phase 28.1 W6 confirmed absent).

## Layer Controls & Tooltips (Phase 9-10)

- **LayerTogglesSlot** — `src/components/layout/LayerTogglesSlot.tsx`, toggle rows in OverlayPanel
- **Toggle rows** — Flights, Ground (indented), Unidentified (indented), Ships, Events (master) + 5 sub-toggles (Airstrikes, Ground Combat, Explosions, Targeted, Other), Sites, Nuclear/Naval/Oil/Airbase/Port (indented), Hit Only (indented)
- **Toggle behavior** — opacity dims to 40% when OFF, smooth transition, persisted to localStorage
- **Layer visibility** — `useEntityLayers` sets `visible` prop per toggle; ground/airborne filtering in `useMemo`
- **Unidentified filter precedence** — unidentified flights stay visible when Ground is OFF (if pulse toggle ON)
- **Conflict toggle gating** — per-category toggles gate tooltips (replaces old showNews toggle)
- **EntityTooltip** — `src/components/map/EntityTooltip.tsx`, renders per-type content (flight metadata, ship AIS, GDELT event data with source link)
- **Hover/highlight** — glow (2x, alpha 60) + highlight (1.2x, full alpha) layers with `pickable: false` to prevent blink
- **Active entity dimming** — non-active entities dim to alpha 80; active entity stays full opacity (no alpha=0)
- **StatusDropdown counts** — derived from actual entity arrays filtered by toggle state and entity type
- **Zoom controls** — NavigationControl showZoom enabled
- **localStorage migration** — old showDrones/showMissiles/showNews keys auto-detected and reset to new defaults

## Detail Panel (Phase 10)

- **DetailPanelSlot** — `src/components/layout/DetailPanelSlot.tsx`, 360px right-side slide-out
- **Per-type content** — FlightDetail, ShipDetail, EventDetail with section headings
- **FlightDetail** — dual units (ft/m, kn/m-s, ft-min/m-s), data source from flightStore.activeSource
- **ShipDetail** — name, MMSI, speed, course, heading, "AISStream" source
- **EventDetail** — type label (EVENT_TYPE_LABELS), CAMEO code, Goldstein scale, actors, "GDELT v2" source, "View source" link
- **DetailValue** — `src/components/detail/DetailValue.tsx`, reusable value cell with flash-on-change animation
- **useSelectedEntity** — `src/hooks/useSelectedEntity.ts`, cross-store lookup with lost contact tracking via useRef
- **Dismiss** — Close button (×) and Escape key both call closeDetailPanel + selectEntity(null)
- **Copy coordinates** — clipboard button with 2s "Copied!" feedback
- **Lost contact** — grayscale + opacity-50 overlay with "LOST CONTACT" banner when entity disappears
- **Relative timestamp** — "Updated Xs ago" ticking every second
- **Instant swap** — content changes on entity switch, slide animation only on open/close

## Analytics Counters (Phase 12)

- **CountersContent** — `src/components/layout/Sidebar.tsx` (function at line 76), inline section in Sidebar with Flights + Events panels (replaced standalone CountersSlot in Phase 23.1+)
- **CounterRow** — `src/components/counters/CounterRow.tsx`, label + value with fixed-width label column (w-24) for vertical alignment, green +N delta with 3s fade animation
- **useCounterData** — `src/components/counters/useCounterData.ts`, derives visible-only counts from filtered entities + toggle state
- **Visibility-aware** — counters reflect only visible entities (smart filters + toggle gating matching useEntityLayers logic)
- **Flight counters** — Iranian (originCountry === 'Iran'), Unidentified (data.unidentified flag); gated by showFlights/showGroundTraffic/pulseEnabled
- **Event counters** — Airstrikes, Ground Combat, Targeted, Fatalities; gated by showEvents + per-category toggles
- **Delta animation** — `@keyframes delta-fade` in app.css, 3s ease-out forwards via `animate-delta` class

## Serverless Cache (Phase 13)

- **Upstash Redis** — REST-based client (`@upstash/redis`) for serverless compatibility
- **CacheEntry<T>** — stores `{data, fetchedAt}` for staleness computation; hard Redis TTL = 10x logical TTL
- **Cache keys** — `flights:SOURCE`, `ships:ais`, `events:gdelt`, `sites:overpass`, `news:gdelt`, `markets:yahoo`, `geocode:LAT,LON`
- **Redis module** — `server/cache/redis.ts` exports `cacheGet<T>`, `cacheSet<T>`, `redis` instance
- **AISStream on-demand** — connect, collect for N ms, close per request (no persistent WebSocket)
- **Ship merge/prune** — fresh ships merged with cached by MMSI, 10 min stale threshold
- **Events accumulator** — merge-by-ID upsert with WAR_START pruning
- **GDELT backfill** — lazy on-demand via `backfillEvents()` on cache miss; direct URL construction (4 files/day sampling), batched concurrent downloads; `?backfill=true` query param forces re-run
- **Backfill cooldown** — 1 hour via `events:backfill-ts` Redis key
- **parseSqlDate** — uses `Date.UTC()` (not local time) for consistent timestamp comparisons
- **`operator:audit-log` (Phase 28.2 W3)** — SADD bounded set, 500 entries cap, 30d TTL. Operator-action audit log: every successful POST /api/events/llm-pipeline + POST /api/events/llm-replay writes a structured entry `{timestamp, bearerFingerprint, operation, args, result}` synchronously before HTTP response. Surfaced via /api/operator-status to the merged API Health tab's Operator Actions block.
- **`operator:replay-quota:{bearerFingerprint}:{YYYY-MM-DD}` (Phase 28.2 W3)** — Redis INCR counter, 48h TTL on first set. Per-Bearer replay rate-limit: 50 calls / 24h rolling window, identified by SHA-256 fingerprint of DASHBOARD_PASSWORD truncated to 8 hex chars. At cap, /api/events/llm-replay returns HTTP 429 with `Retry-After` header.
- **`audit:connectivity:last-result` (Phase 28.2 W6)** — CI workflow → /api/audit-status sidecar, 7d TTL. Written by `.github/workflows/prod-connectivity-audit.yml` after each manual prod-audit run. Shape: `{status: 'pass'|'fail', runId, timestamp, endpoints: {[path]: 'pass'|'fail'}, durationMs}`. Reader: `server/routes/audit-status.ts` (GET /api/audit-status — no auth gate; degrade-open on parse fail). Surfaced as the audit-result banner in the merged API Health tab. JSON shape pinned by W-3 contract test in `server/routes/__tests__/audit-status.test.ts` so either-side drift fails LOUDLY.
- **`events:llm-eval-adversarial:v3` (Phase 28.2 W3)** — 90d TTL, mirrors `events:llm-eval-baseline:v3` pattern. Result of `runAdversarialEval()` against ~10 prompt-injection fixtures at `.planning/eval/adversarial-injections.json`; folded into `/api/cron/health` daily run after `runEval()`. Shape: `{total, blocked, leaked, score, byCategory, generatedAt}`. Surfaced in the eval-score block as `Prompt-injection robustness: blocked/total`.
- **`cron:lastTick:<name>` (Phase 28.2.7)** — `cacheSetSafe(value: Date.now(), ttlSec: CRON_LASTTICK_TTL_SEC)` writers in all 3 Vercel cron handlers. 7d TTL (`CRON_LASTTICK_TTL_SEC = 7 * 24 * 60 * 60`, declared in `server/lib/healthSources.ts`). Names: `cron:lastTick:health` (written at end of `/api/cron/health` after eval blocks complete), `cron:lastTick:warm` (written inside `if (partialOrBetter)` guard in `/api/cron/warm`), `cron:lastTick:refresh-events` (written inside try block AFTER `runRefreshExtraction` resolves in `/api/cron/refresh-events`, NOT in catch — D-03 honest-failure semantics). Reader: `probeCronTick` in `server/routes/health.ts:182`. Without these writers the `cron` tier in `/api/health` was permanently `unknown` by construction (1 reader, 0 writers); after Phase 28.2.7 the tier flips from `unknown` → `healthy` once each cron has fired at least once.
- **`llm:lastProgress` (Phase 28.2.7)** — Redis-backed write-through for `llmProgress` singleton so `probeLlmStatus()` survives Vercel Fluid Compute cold starts. `LLM_LASTPROGRESS_KEY = 'llm:lastProgress'` + `LLM_LASTPROGRESS_TTL_SEC` declared in `server/lib/llmProgress.ts`. Shape: `{startedAt: number | null, completedAt: number | null}`. Write-through fires (a) inside `resetProgress()` always (D-01 — every `startedAt`-set transition lands in Redis) and (b) inside `updateProgress()` only when `partial.completedAt !== undefined` (D-02 — terminal-transition guard prevents mid-run thrash). Reader: async `probeLlmStatus()` at `server/routes/health.ts:141-171` does `cacheGetSafe<{startedAt, completedAt}>(LLM_LASTPROGRESS_KEY, ...)` first, falls back to in-memory singleton with `latest = redisLatest ?? memLatest`, returns `null` when both null (D-09). Probe is read-only — does not backfill the in-memory singleton (D-10). Pre-Phase-28.2.7 `probeLlmStatus` read the in-memory singleton directly which reset on every cold-started function instance, causing the `llmStatus` row to flap between `healthy` and `unknown` opportunistically.
- **`probeProbeOnly` honest-stub (Phase 28.2.7)** — `probeProbeOnly()` at `server/routes/health.ts:211-219` returns `freshnessMs: 0` (was `null`) so the `deriveStatus(0, 0, false)` chain evaluates to `'healthy'` instead of `'unknown'`. Mirrors `probeSources` canon pattern (also `freshnessMs: 0` because both probes are config-introspection-only — no upstream call, nothing to be "stale" relative to).

## Vercel Deployment (Phase 14)

- **Entry point** — `server/vercel.ts` exports Express app via `createApp()` factory in `server/app.ts`
- **Bundle** — tsup bundles `server/vercel.ts` → `dist-server/vercel.cjs` (CommonJS for Vercel)
- **vercel.json** — rewrites `/api/*` → serverless function, everything else → SPA `index.html`
- **Rate limiting** — `express-rate-limit` middleware in `server/middleware/rateLimiter.ts`
- **Bearer bypass on global tier (Phase 28.2 W2)** — `rateLimiters.public` global tier (60-req/min) skipped when valid `DASHBOARD_PASSWORD` Bearer is present in `Authorization` header; per-endpoint tiers (flights 120/min, ships 60/min, events 20/min, etc.) unaffected. Bypass uses `timingSafeEqual` constant-time compare. Bypass scope is keyed off the `'ratelimit:public'` prefix so the branch is dead code for the per-endpoint limiters at module load — defense in depth keeps a leaked Bearer from exhausting per-route budgets. Empty `DASHBOARD_PASSWORD` falls through to the existing limiter (NOT a 503 — differs from `dashboardAuth.ts` which fail-closes on missing config). Companion test at `src/__tests__/rate-limit.test.ts` exercises both directions: 70 unauth bursts → ≥1 returns 429 (B-6 target `/api/health` has no per-endpoint cap); 70 Bearer bursts → 0 return 429.
- **Fail-fast config** — Phase 26.3+ `parseEnv()` (Zod) throws on missing/malformed env vars at startup; the prior "Graceful config" defaults pattern was retired (see Phase 28.1 W7 SUMMARY).
- **Node engine** — pinned `>=20` in package.json
- **Build** — `npm run build` runs Vite (frontend) + tsup (server) + tsc (typecheck)

## Key Sites Overlay (Phase 15)

- **Overpass adapter** — `server/adapters/overpass.ts`, queries OpenStreetMap for infrastructure sites across Middle East
- **Site types** — `SiteType`: `nuclear`, `naval`, `oil`, `airbase`, `desalination`, `port`
- **SiteEntity** — separate from MapEntity union (not a discriminated union member); has `siteType`, `operator`, `osmId` fields
- **One-time fetch** — `useSiteFetch` hook fetches once on mount (sites are static infrastructure, no polling)
- **Redis cache** — 24h TTL for site data via `sites:overpass` cache key
- **Overpass fallback** — primary API → `private.coffee` mirror on failure
- **Country filtering** — Overpass area union with `ISO3166-1` tags for Middle East countries
- **Attack status** — `src/lib/attackStatus.ts` cross-references site locations with recent GDELT events within 5km radius
- **Site toggles** — 6 category toggles (Nuclear, Naval, Oil, Airbase, Desalination, Port) + "Hit Only" filter
- **Site icons** — 6 distinct icons: nuclear hazard, anchor, oil drop, jet, water drop, bollard
- **Site colors** — healthy green (#22c55e), attacked orange (#f97316)
- **Icon sizing** — sites 2000m base (minPixels:12, maxPixels:80); flights/ships reduced to 4000m; events to 3000m
- **SiteDetail** — detail panel with site type, operator, coordinates, attack status
- **siteStore** — `src/stores/siteStore.ts` with `SiteConnectionStatus` including `'idle'` state
- **CONFLICT_TOGGLE_GROUPS** — simplified to 3 groups (showOtherConflict types merged into showGroundCombat)

## News Feed (Phase 16)

- **GDELT DOC adapter** — `server/adapters/gdelt-doc.ts`, fetches GDELT DOC 2.0 ArtList mode for conflict news articles
- **RSS adapter** — `server/adapters/rss.ts`, fetches from 5 feeds (BBC, Al Jazeera, Tehran Times, Times of Israel, Middle East Eye)
- **NewsArticle** — `server/types.ts`, includes `sourceCountry?: string` field populated from GDELT `sourcecountry` or RSS feed config
- **English filter** — GDELT queries include `sourcelang:english` inline modifier
- **Keyword filter** — `server/lib/newsFilter.ts`, conflict-relevant keyword filtering
- **Dedup/clustering** — `server/lib/newsClustering.ts`, Jaccard similarity (threshold 0.8, 5-token min) with 7-day sliding window
- **Cache** — `news:gdelt` Redis key, 15-min TTL matching GDELT DOC update frequency
- **Route** — `/api/news` returns `CacheResponse<NewsCluster[]>`
- **newsStore** — `src/stores/newsStore.ts`, Zustand store with ConnectionStatus
- **useNewsPolling** — `src/hooks/useNewsPolling.ts`, 15-min polling interval
- **RSS_FEEDS** — each entry has `country` field for sourceCountry tagging

## Notification Center (Phase 17)

- **Severity scoring** — `src/lib/severity.ts`, formula: typeWeight × log(mentions+1) × log(sources+1) × recencyDecay
- **Type weights** — airstrike 10, wmd 10, ground_combat 8, shelling 8, bombing 8, mass_violence 9, assassination 7, others 3-5
- **Recency decay** — exponential decay; default half-life 24h via `VITE_SEVERITY_HALF_LIFE_HOURS` (Phase 28.1 W5 D-12). Note: prior CLAUDE.md drafts said "halfLife = 6h" — that was doc drift; the 24h scale is the authoritative runtime behavior preserved through Phase 28.1.
- **News matching** — `src/lib/newsMatching.ts`, correlates GDELT events with news clusters by temporal proximity (±6h) + geographic/keyword overlap
- **Time grouping** — `src/lib/timeGroup.ts`, buckets: "Last hour", "Last 6 hours", "Last 24 hours"
- **notificationStore** — `src/stores/notificationStore.ts`, derives scored notifications from eventStore + newsStore
- **useNotifications** — `src/hooks/useNotifications.ts`, connects stores, derives notifications, provides mark-read and fly-to actions
- **NotificationBell** — `src/components/layout/NotificationBell.tsx`, bell icon with unread badge, click opens dropdown
- **NotificationCard** — `src/components/notifications/NotificationCard.tsx`, severity-scored card with event type and matched news headlines
- **Proximity alerts** — `src/hooks/useProximityAlerts.ts`, detects flights/ships within `VITE_PROXIMITY_ALERT_KM` of key sites (default 5km — Phase 28.1 W5 D-12). Note: prior CLAUDE.md drafts said "within 50km of key sites" — that was doc drift; the 5km radius is the authoritative runtime behavior preserved through Phase 28.1.
- **ProximityAlertOverlay** — `src/components/map/ProximityAlertOverlay.tsx`, animated warning badges on map with expand/collapse popover
- **24h default window** — `useFilteredEntities` applies 24h recency filter when no custom date range is active
- **Fly-to-event** — clicking notification flies map to event coordinates and opens detail panel
- **useSiteImage** — `src/hooks/useSiteImage.ts`, ArcGIS World Imagery tile URLs for satellite thumbnails
- **Dev score display** — NotificationCard shows severity score in dev mode only (hidden in production)

## Oil Markets Tracker (Phase 18)

- **Yahoo Finance adapter** — `server/adapters/yahoo-finance.ts`, unofficial API for commodity prices
- **Instruments** — Brent Crude (BZ=F), WTI Crude (CL=F), XLE, USO, XOM
- **marketStore** — `src/stores/marketStore.ts`, Zustand store with ConnectionStatus
- **useMarketPolling** — 60s recursive setTimeout
- **MarketsSlot** — `src/components/layout/MarketsSlot.tsx`, collapsible overlay panel with sparkline charts
- **Cache** — `markets:yahoo` Redis key, 60s TTL
- **Route** — `/api/markets` returns market data with sparkline history

## Search & Filter System (Phase 19+)

- **searchStore** — `src/stores/searchStore.ts`, raw query string, parsed AST, recent tags
- **SearchModal** — `src/components/search/SearchModal.tsx`, Cmd+K activated, keyboard navigation
- **Tag language** — ~25 prefixes: `type:`, `site:`, `country:`, `near:`, `callsign:`, `icao:`, `mmsi:`, `name:`, `cameo:`, `mentions:`, `heading:`, `speed:`, `altitude:`, `severity:`, etc.
- **Implicit OR** — all tags evaluated as OR across entity types (no AND/NOT operators)
- **Bidirectional sync** — `src/hooks/useQuerySync.ts` syncs search bar tags ↔ sidebar filter toggles
- **Autocomplete** — `src/components/search/AutocompleteDropdown.tsx`, two-stage (prefix → values with counts)
- **near: queries** — supports site names and cities, drops proximity pin with 100km radius, auto-opens filter panel
- **filterStore** — `src/stores/filterStore.ts`, per-entity filter fields (flights, ships, events, sites)
- **FilterPanelSlot** — `src/components/layout/FilterPanelSlot.tsx`, grouped sections with Reset All
- **useFilteredEntities** — `src/hooks/useFilteredEntities.ts`, applies all active filters to entity arrays
- **useSearchResults** — `src/hooks/useSearchResults.ts`, evaluates search AST against entities

## Visualization Layers (Phase 20)

- **layerStore** — `src/stores/layerStore.ts`, `Set<VisualizationLayerId>` for active layers
- **VisualizationLayerId** — `geographic`, `weather`, `threat`, `political`, `ethnic`, `satellite`, `water`
- **LayerTogglesSlot** — `src/components/layout/LayerTogglesSlot.tsx`, toggle rows with color dots and "coming soon" labels
- **Geographic overlay** — `src/components/map/layers/GeographicOverlay.tsx`, elevation color-relief tinting, maplibre-contour lines, geographic feature labels (deserts, ranges, seas)
- **Weather overlay** — `src/components/map/layers/WeatherOverlay.tsx`, Open-Meteo grid with wind barbs (deck.gl IconLayer) + invisible picker for tooltips
- **WeatherHeatmap** — `src/components/map/layers/WeatherHeatmap.tsx`, MapLibre image source with bilinear-interpolated temperature canvas, drapes onto terrain
- **Threat clusters** — `src/components/map/layers/ThreatHeatmapOverlay.tsx`, ScatterplotLayer with RadialGradientExtension (custom GLSL shader), BFS cluster merging on 0.25° grid
- **Threat weight formula** — `computeThreatWeight`: typeWeight × log2(mentions) × log2(sources) × fatalityFactor × goldsteinHostility (no temporal decay)
- **Layer stacking** — zoom-dependent: `[...threatLayers, ...entityLayers]` below zoom 9, `[...entityLayers, ...threatLayers]` above zoom 9
- **Filter independence** — entity toggles (flights, ships, events, sites) operate independently from visualization layer toggles
- **FilterButton** — `src/components/filter/FilterButton.tsx`, pill toggle with color dot for entity category filters
- **SliderToggle** — `src/components/filter/SliderToggle.tsx`, iOS-style switch for boolean filter options

## Counter Entity Dropdowns (Phase 19.2)

- **CountersContent** — accordion dropdowns showing individual entities per counter row (rendered inline in `src/components/layout/Sidebar.tsx`)
- **Fly-to** — clicking entity in dropdown flies map and opens detail panel
- **Proximity sorting** — flights/events sorted by distance from Tehran, ships from Strait of Hormuz, sites by attack count
- **Scrollable lists** — 8+ items show scrollable container with "Showing X-Y of Z" indicator

## Date Range Filter (Phase 11+13)

- **filterStore** — `dateStart: null` and `dateEnd: null` defaults (no filtering)
- **Custom range mode** — activates when either dateStart or dateEnd becomes non-null; saves and suppresses flight/ship toggles
- **Deactivation** — both must return to null (via Clear button or slider reset)
- **Lo slider at WAR_START** — sends `null` dateStart (no lower bound)
- **Hi slider at "now"** — sends `null` dateEnd (NOW_THRESHOLD_MS = 60s snap)
- **DateRangeFilter** — custom pointer-based dual-thumb slider with granularity toggle (Min/Hr/Day)
- **Granularity** — `STEP_MS` record, `snapToStep` floors timestamps to step boundary

## Threat Density Improvements (Phase 23+23.2)

- **RadialGradientExtension** — `src/components/map/layers/RadialGradientExtension.ts`, deck.gl LayerExtension with GLSL fragment shader injecting radial alpha falloff via `fs:DECKGL_FILTER_COLOR`
- **Gradient falloff** — `smoothstep(0.3, 1.0, dist)`: center 30% at full opacity, soft fade to transparent edge
- **Additive blending** — `blendColorDstFactor: 'one'` makes overlapping clusters intensify naturally
- **4-stop thermal palette** — deep purple → magenta → orange → bright red (simplified from 8-stop FLIR Ironbow)
- **Dual-dimension encoding** — radius = geographic spread (bbox diagonal + sqrt(eventCount) density boost), color = threat weight (P90 normalized)
- **Meter-based radius** — `radiusUnits: 'meters'` with `radiusMinPixels: 20`, `radiusMaxPixels: 200`; 30km floor for single-cell clusters
- **Cluster centroid** — bounding box center (not weight-averaged) for visual centering on event dispersion
- **Zoom z-order crossover** — clusters on top below zoom 9, behind event markers above zoom 9; `isBelowZoom9` boolean in mapStore with ref-based threshold crossing
- **Hover dimming** — hovered cluster 255 alpha, non-hovered 102 (40%); managed as local state in BaseMap
- **Cluster selection dimming** — selecting a cluster grays out all non-cluster events + flights/ships/sites via `clusterEventIds` Set in useEntityLayers
- **ThreatClusterDetail enrichment** — type breakdown bars (horizontal, sorted by count), geographic context (site-in-bbox first → Nominatim fallback), events sorted by threat weight
- **useGeoContext** — `src/hooks/useGeoContext.ts`, two-tier: synchronous siteStore bbox check → async `/api/geocode` Nominatim fallback
- **Nominatim geocoding** — `server/adapters/nominatim.ts` + `server/routes/geocode.ts`, coordinate quantization (2 decimal places), Redis cache 30-day logical / 90-day hard TTL
- **Cache key** — `geocode:${lat},${lon}` with quantized coordinates

## Detail Panel Navigation Stack (Phase 23.1)

- **PanelView** — `src/types/ui.ts`, `{ entityId, cluster, breadcrumbLabel }` — represents a saved detail panel state
- **navigationStack** — `uiStore.navigationStack: PanelView[]`, push/pop actions for back navigation
- **pushView** — saves current panel state (entity or cluster) before navigating to a new entity; called from 7 sites (ThreatClusterDetail, SearchModal, Sidebar incl. inline CountersContent, SiteDetail, ProximityAlertOverlay, plus BaseMap click)
- **popView** — restores previous panel state from stack; wired to back button in BreadcrumbRow
- **BreadcrumbRow** — `src/components/detail/BreadcrumbRow.tsx`, shows breadcrumb trail with back arrow + label from `panelLabel.ts`
- **panelLabel** — `src/lib/panelLabel.ts`, `getCurrentPanelView()` derives breadcrumb label from current entity/cluster state across all stores
- **slideDirection** — `uiStore.slideDirection: 'forward' | 'back' | null`, drives CSS slide-in/slide-out animations
- **CSS animations** — `@keyframes slide-in-right`, `slide-out-left`, `slide-in-left`, `slide-out-right` in `app.css`
- **Escape key** — pops navigation stack if non-empty, otherwise closes panel (existing behavior)

## Political Boundaries Layer (Phase 24)

- **deck.gl GeoJsonLayer** — country fills rendered via `usePoliticalLayers` hook (not MapLibre fill layers — those are invisible with terrain)
- **3-tier factions** — US-aligned (blue #3b82f6), Iran-aligned (red #dc2626), Neutral (gray #64748b)
- **US-aligned** — ISR, SAU, ARE, BHR, JOR, KWT, EGY
- **Iran-aligned** — IRN, SYR, YEM
- **Neutral** — all others in region (TUR, QAT, OMN, PAK, AFG, IRQ, LBN, TKM, AZE, ARM, GEO, etc.)
- **Faction data** — `src/lib/factions.ts`, `Record<string, Faction>` keyed by ISO A3 code, separate from GeoJSON. Phase 28.1 W6 D-13 — `FACTION_COLORS` hex map sources from `src/lib/colorBridge.ts` (`COLOR_FACTION_*_HEX`); CSS `@theme` block in `src/styles/app.css` is the single source of truth (`--color-faction-{us,iran,neutral,disputed}-aligned/disputed`).
- **GeoJSON sources** — Natural Earth 110m (countries) + 10m disputed areas, static imports via Vite
- **Fill opacity** — ~15% (alpha 38/255), borders ~60% (alpha 153/255), faction-colored
- **Disputed territories** — Gaza, West Bank, Golan Heights from Natural Earth `ne_10m_admin_0_disputed_areas`; amber fill (#f59e0b — also in `@theme` as `--color-faction-disputed`)
- **Non-interactive** — no hover/click on country polygons; entity tooltips remain primary
- **Layer stacking** — political layers first in DeckGLOverlay array (renders below all entity/weather/threat layers)
- **Legend** — discrete swatch legend in bottom-left via LEGEND_REGISTRY (4 swatches: US, Iran, Neutral, Disputed)
- **Toggle** — `comingSoon` removed from political entry in LayerTogglesSlot; instant toggle (no fade)
- **Threat centroid fix** — cluster centroids now use mean of actual event coordinates (`realLatSum`/`realLngSum` in ThreatZoneData) instead of bounding box center of grid cells

## Ethnic Distribution Layer (Phase 25)

- **deck.gl GeoJsonLayer + FillStyleExtension** — hatched polygon fills via `useEthnicLayers` hook with `fillPatternMask: true`
- **10 ethnic zones** — Kurdish, Arab, Persian, Baloch, Turkmen, Druze, Alawite, Yazidi, Assyrian, Pashtun
- **Data source** — GeoEPR 2021 (ETH Zurich), extracted via `scripts/extract-ethnic-data.ts`, static `src/data/ethnic-zones.json`
- **Overlap zones** — 23 multi-group features with `properties.groups: string[]`; rendered as stacked GeoJsonLayers with `getFillPatternOffset` for interleaved colored stripes
- **Single-group features** — `properties.group: string` + `properties.label: string`
- **Canvas hatch atlas** — 32x32 diagonal line pattern (4px width, 10px spacing), `fillPatternScale: 200`, created once at module load
- **RGBA alpha** — 140/255 (~55%) for visible hatching; thicker lines than political layer's solid fills
- **Labels** — TextLayer at polygon centroids, zoom-responsive (10-24px), single-group zones only (no labels on overlap areas)
- **Hover tooltips** — `EthnicTooltip` component shows group name, population, context; overlap zones list all groups
- **Tooltip priority** — Entity > Threat > Ethnic > Weather; ethnic tooltip only on empty map areas
- **Click guard** — `handleDeckClick` returns early for `ethnic-*` layer IDs to prevent crash
- **Layer stacking** — ethnic layers after political in DeckGLOverlay array (ethnic hatching on top of political fills)
- **Legend** — discrete 10-swatch entry via `LEGEND_REGISTRY`
- **Ethnic group config** — `src/lib/ethnicGroups.ts`, `EthnicGroup` type, `ETHNIC_GROUPS` record with color/rgba/population/context. Phase 28.1 W6 D-13 — color and rgba fields source from `src/lib/colorBridge.ts` (`COLOR_ETHNIC_*` tuples + `COLOR_ETHNIC_*_HEX` strings); CSS `@theme` block declares 10 `--color-ethnic-*` vars. The fixed alpha=140 (~55% fill) is owned by `ethnicGroups.ts`, not by `@theme`.
- **Yazidi absent** — GeoEPR maps Yazidi under Kurdish ("Kurds/Yezidis"); deferred to future patch

## Water Stress Layer (Phase 26)

- **Point-based approach** — stress shown at specific water facilities (dams, reservoirs, treatment plants, canals, desalination), NOT polygon fills
- **WRI Aqueduct 4.0** — baseline water stress + drought risk + groundwater depletion + seasonal variability; basin-level data in `src/data/aqueduct-basins.json` (6377 entries)
- **Basin lookup** — `server/lib/basinLookup.ts`, assigns WRI stress to each facility by nearest country-centroid basin match
- **Composite health** — `src/lib/waterStress.ts`, combines WRI baseline stress + Open-Meteo precipitation anomaly into health score
- **Color ramp** — continuous gradient from black (extreme stress) to light blue (healthy); `stressToRGBA()` interpolation
- **Open-Meteo precipitation** — `server/adapters/open-meteo-precip.ts`, 30-day anomaly with 100-location batching, 6h polling
- **Overpass water adapter** — `server/adapters/overpass-water.ts`, queries 5 facility types with `["name"]` filter (~4300 named facilities), 120s timeout
- **Desalination migrated** — removed from SiteType/siteStore, now exclusively under Water layer
- **Rivers** — 6 major rivers (Tigris, Euphrates, Nile, Jordan, Karun, Litani) as GeoJSON line features in `src/data/rivers.json`, stress-colored by watershed
- **waterStore** — `src/stores/waterStore.ts`, Zustand store with facility lifecycle and precipitation merge
- **useWaterFetch** — one-time fetch on mount via `/api/water` (24h Redis cache)
- **useWaterPrecipPolling** — 6h recursive setTimeout for `/api/water/precip`
- **useWaterLayers** — deck.gl GeoJsonLayer (rivers) + IconLayer (facilities) + TextLayer (river labels in italic)
- **WaterFacilityDetail** — detail panel with all Aqueduct indicators, precipitation, attack status, coordinates
- **Full integration** — counters, search (type:dam, stress:high, name:, near:), proximity alerts — gated by water layer active
- **Attack status** — cross-references water facilities with GDELT events within 5km
- **Legend** — gradient bar from black to light blue via LEGEND_REGISTRY
- **Click guard** — `handleDeckClick` returns early for `water-river*` layer IDs
- **Layer stacking** — rivers after ethnic, water facilities at same z-level as entities
- **Phase 27.3.2 Latin-label admission gate** — Non-desalination facilities must carry a Latin-script value in `name:en` / `name` / `operator`. `hasLatinLabel(tags)` helper + new `no_resolved_name` rejection bucket in `WaterFilterStats.rejections` and `byTypeRejections`. Desalination exempt (sparse OSM coverage; ~63 raw elements).
- **Server-owned label synthesis for desalination** — `extractLabel(tags, facilityType, lat, lng, nearestCity)` synthesizes `"Desalination Plant near {city}"` (150km city lookup) or `"Desalination Plant at {lat}°{N|S}, {lng}°{E|W}"` fallback for the non-Latin exempt desal. Non-desal never reaches synthesis — rejected at admission.
- **Client label collapsed to one-liner** — `src/lib/waterLabel.ts` `getWaterFacilityDisplayName` returns `facility.label?.trim() || FACILITY_TYPE_LABELS[facility.facilityType]`. `WATER_TYPE_LABELS`, `NEAR_UNKNOWN_RE`, `GENERIC_TYPE_RE` and the 3-branch river/city/coord fallback chain are all deleted.
- **Redis key v3 bump** — `water:facilities:v2` → `water:facilities:v3` (server/routes/water.ts) forces cold-fill of the new `no_resolved_name` bucket. Sites key (`sites:v3`) unchanged.
- **Snapshot regenerated to ~305 facilities** — 436 → 305 (241 dams + 49 reservoirs + 15 desalination) under the tightened admission rules. `no_resolved_name` bucket caught 979 non-Latin non-desal elements.
- **Phase 27.3.3 deferred — romanization of non-Latin names** — Per 27.3.2 D-18, a dedicated phase will add transliteration to `extractLabel` so `سد سعد` → `Saad Dam` and re-admits under the Latin gate. Expected impact: snapshot climbs from ~305 back toward ~430.

## LLM Enrichment v2 + Runtime Toggle (Phase 27.4)

- **Flag-gated v2 pipeline** — `LLM_PIPELINE_V2` env flag (default `true` post-debug 2026-04-21); `isPipelineV2()` sync helper in `server/config.ts` reads in-memory override first (set by POST `/api/events/llm-pipeline`), falls back to env. V1 extractor preserved at `server/lib/llmEventExtractor.v1.ts` for rollback (D-26/D-40).
- **Cache versioning** — v2 Redis keys `events:llm:v2` + `events:llm-summary:v2` coexist with v1 `events:llm` + `events:llm-summary`. V1→V2 graceful fallback: Pitfall 1 bridge serves v1 cache when v2 is empty (map never goes blank).
- **Zod schema v2** — `server/lib/llmSchema.ts` exports `enrichedEventAny` discriminated union (v1 + v2 branches). V2 schema `.strict()` rejects LLM-emitted coords (D-05) — structured hierarchy `{country, admin1, city, neighborhood, landmark, confidence}`. `derivePrecision` + `deriveSuspect` pure server-side functions. Six-value `GeocodeProvenance` enum. `reasoning` uses `z.string().transform((s) => s.length > 200 ? s.slice(0,197) + '…' : s)` — truncate, don't reject, to avoid batch-wide DLQ.
- **JSON Schema wire contract** — `EVENT_EXTRACTION_SCHEMA_V2` in `server/lib/llmSchema.ts`. NO `maxLength` on `reasoning` — Cerebras qwen rejects it with `wrong_api_format`. Zod enforces length post-parse.
- **6-path resolver** — `server/lib/llmResolver.ts` `resolveLocation(hierarchy, ctx)` dispatches to: `own-site-snapshot`, `poi-amenity-nominatim`, `nominatim-direct`, `nominatim-verified-2pass`, `gdelt-actiongeo-fallback`, `bellingcat-coord-passthrough`. Never returns a coord without provenance. 1-req/s Nominatim throttle via module-level spacer. Redis cache at `geocode:fwd:constrained:<hash>`. Single-candidate Nominatim verify accepts directly (no LLM reranker call).
- **Nominatim extension** — `server/adapters/nominatim.ts` exports `forwardGeocodeConstrained(placeName, opts)` — server-owned ME viewbox + 22 country codes (never user-overridable, T-27.4-04-01). `amenity=` POI mode + top-N candidate return.
- **V2 extractor** — `server/lib/llmEventExtractor.v2.ts` `processEventGroupsV2` — BATCH_SIZE=2 (down from v1's 8). 3 prompt enrichment blocks: NEWS (tier-tagged from `news:gdelt`, ±24h window), BELLINGCAT (extractBellingcatGeo matched), TEMPORAL (last 3 events in same region + 72h). Per-event `resolveLocation` call. Barrel `server/lib/llmEventExtractor.ts` routes by `isPipelineV2()`.
- **Reliability primitives** — `server/lib/llmCircuitBreaker.ts` (sliding 10-call window, paused 5min on >30% error rate), `server/lib/llmDLQ.ts` (Redis SADD bounded set at `events:llm-dlq`, 200 entry cap, 7d TTL, `lastError` capped at 500 chars, raw-string srem eviction), `server/lib/llmTokenBudget.ts` (Cerebras 1M/day, Groq 200K/day, soft 0.8, hard 0.95 caps, 48h TTL on `llm:tokens:{provider}:YYYY-MM-DD`).
- **callLLM cascade** — `server/adapters/llm-provider.ts`. Per-event retry budget 2 attempts × 1s/4s exp backoff + ±250ms jitter. Providers tried in order `[cerebras, groq]` — each gated on `isAvailable` (breaker) + `budgetState !== 'hard'`. Synthetic `skipReason: 'breaker' | 'hard_cap' | 'no_client'` entries appended to `callHistory` when a provider is bypassed without network activity (so `stage:error`/`enrichedCount:0` runs always have diagnosable telemetry).
- **Cerebras model** — `CEREBRAS_MODEL = 'qwen-3-235b-a22b-instruct-2507'` (open on default Cerebras tier). `gpt-oss-120b` is gated to paid tiers and returned `model_not_found` on the project's key.
- **Accuracy eval harness** — `server/lib/llmEvalHarness.ts` `runEval()` runs `.planning/eval/ground-truth-events.json` (50 curated events across 11 countries — user-approved after 4 curation iterations) through the RESOLVER ONLY (per A6 / Pitfall 8; avoids doubling daily token spend). Scores at 5/20/100km thresholds via inline haversine. Writes `evalScore` to `llmProgress` + persists baseline to `events:llm-eval-baseline:v2` (90d TTL).
- **Prompt replay endpoint** — `POST /api/events/llm-replay/:groupKey` (dev-only, dual-gate per Pitfall 6: registered only when `NODE_ENV !== 'production'` AND in-handler 404 check). Re-extracts single group with current prompt, returns `{old, new}` WITHOUT writing to `events:llm:v2` cache (Pitfall 6 defense-in-depth).
- **Runtime v1/v2 toggle** — `POST /api/events/llm-pipeline {version: 'v1'|'v2'|null}` writes to Redis `events:llm-pipeline-override` (7d TTL) + in-memory `setPipelineOverride()`. `refreshPipelineOverride()` called at top of `/api/events` and `/llm-status` handlers for cross-worker coherence. Clears on `{version:null}`.
- **DevApiStatus Events tab** — `src/components/ui/DevApiStatus.tsx`. Always visible whenever the dashboard surface itself renders (`shouldRenderDashboard()` — dev OR prod-with-Bearer). Body defaults to `EventsFiltersSectionV3` when `schemaVersion` is unset (cold start, post-deploy before first cron tick); `'v2'` is the explicit V2 override. Phase 27.4.6 dropped the prior `schemaVersion === 'v2' && import.meta.env.DEV` gate that hid the tab on cold start. Eight blocks: pipeline waterfall (D-16), precision+confidence+source-tier+casualty histograms via ProgressBar (D-17), per-event drill-down last 50 with copy-prompt button (D-18), LLM call log last 20 with amber `⊘` skip-entry glyph (D-19), per-provider budget bars with pause badge (D-36), eval score summary with D-25 PASS/FAIL gate (D-20), DLQ recent list (D-30), suspect count badge (D-23).
- **DevApiStatus Water tab** — also always visible (Phase 27.4.6). Was previously gated on `useLayerStore.activeLayers.has('water')`, which hid the tab on cold start before the operator toggled the Water visualization layer on. The dashboard surface is operator observability, decoupled from layer-state.
- **Topbar pipeline pill** — `src/components/layout/Topbar.tsx` `PipelineVersionPill` next to `DevApiStatusTrigger`. Dev-only. Post-Phase-27.4.1: **read-only indicator** (onClick handler stripped per D-20). Version still settable via `LLM_PIPELINE_V2` env var + `GET/POST /api/events/llm-pipeline` endpoints for scripted/operator use.

## Parallel v3 Batch Processing (Phase 27.4.4 Plan 02)

- **Concurrency limiter** — `server/lib/concurrencyLimit.ts` `createLimit(maxConcurrent)` returns a `<T>(fn) => Promise<T>` wrapper that caps simultaneous in-flight async tasks. ~30-LOC primitive with FIFO queue; no `p-limit` dependency.
- **v3 extractor parallel loop** — `server/lib/llmEventExtractor.v3.ts:545` was a serial `for-await` loop running ~2 req/min against NIM's 40 req/min ceiling (~95% rate budget unused). Refactored to push `tasks.push(limit(async () => /* per-batch body */))` then `await Promise.all(tasks)` post-loop. Drives 197-batch dev runs from ~95 min → ~10 min.
- **`LLM_V3_CONCURRENCY` env var** — default 12 (~26 req/min steady-state with 27s/batch latency, well under the 40 cap). `LLM_V3_CONCURRENCY=1` reverts to fully sequential; `=20` saturates NIM and risks 429s.
- **Race-safety contract** — JS event loop is single-threaded so `updateProgress` R-M-W expressions like `(llmProgress.x ?? 0) + 1` evaluate synchronously between awaits and serialize correctly under concurrency. The shared `results` array, `allFailed` flag, `matchedNewsByGroup`/`bellingcatByGroup` maps, and all `llmProgress` mutations rely on this. `completedBatchesCounter` flows through `finishBatch()` so `onBatchComplete` + `writePartialCache` see monotonically-increasing counts instead of per-batch indices (which would jump out of order under concurrency). `events:llm:v3:partial` writes use last-writer-wins (observability-only key).
- **Rollback path** — `LLM_V3_CONCURRENCY=1` reverts to per-batch await semantics for any incident requiring single-flight diagnosis.

## Cron-Driven Pipeline Trigger (Phase 27.4.6)

- **`/api/events` is cache-only** — the fire-and-forget LLM extraction block (formerly at `events.ts:~1042-1307`) is removed. The route now serves whatever is in `events:llm:v3` (or bridges to `events:llm:v2` / `events:llm` / raw GDELT per Pitfall 1) and never triggers an LLM run.
- **Daily 4am UTC cron** — `vercel.json` schedules `/api/cron/refresh-events` at `0 4 * * *`. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
- **Shared helper** — `server/lib/llmExtractionPipeline.ts` exports `runRefreshExtraction({triggeredBy, forceCooldown})`. The cron route is the only caller; the helper's body is the verbatim port of the prior fire-and-forget code (D-04: zero re-implementation).
- **Cold-cache self-heal (D-10)** — `runRefreshExtraction` probes `events:llm:v3` BEFORE the cooldown check. Empty cache → bypass cooldown automatically. The first cron invocation after a fresh deploy always populates the cache, regardless of timing relative to the next 4am tick.
- **Operator force-trigger (D-11)** — `GET /api/cron/refresh-events?force=true` with valid Bearer skips the 15-min cooldown. Use cases: post-bug-fix re-extraction, post-cache-flush warm-up, testing during deploys. Replaces `redis-cli del events:llm-process-ts`.
- **Eval-drift folds into cron-health (D-09)** — `runEval()` is called inside `server/routes/cron-health.ts` after the Redis ping + source freshness check. Frees a vercel.json cron slot (Hobby cap = 3) without dropping `cron-warm` (which pre-warms `sites:v2` 3-day TTL + `water:facilities`). The `/api/cron/eval` Express route is preserved for manual ops; only its scheduled trigger moved.
- **NIM-throttle accept-and-fallback (D-08)** — when the 4am tick lands during NIM's documented ~24h throttle window, the watchdog kills batches, DLQ fills, breaker trips. Cron returns 200 with the failure recorded in `llmProgress.dlqCount` + DLQ Redis set. `/api/events` continues serving raw GDELT (Pitfall 1 bridge); map never goes blank. Next tick is 24h later. If that also fails, the operator triggers manually via `?force=true` after NIM recovers. **Pre-flight NIM probes and retry queues are intentionally NOT built** — the surface is small enough that a 30-second manual curl is the right tool.
- **Final cron schedule (Hobby-compliant, 3 entries)**:
  - `/api/cron/health` at `0 0 * * *` (Redis ping + source freshness + eval-drift)
  - `/api/cron/warm` at `0 12 * * *` (Overpass sites + water pre-warm)
  - `/api/cron/refresh-events` at `0 4 * * *` (LLM v3 extraction)
- **Anti-pattern #17** — do not re-introduce fire-and-forget extraction back into `/api/events`. The route is cache-only after this phase; cache-write happens only in the cron path.
- **Anti-pattern #18** — cron must respect `events:llm-process-ts` cooldown unless `forceCooldown === true` OR cache is empty. No parallel runs.

## V2 Extractor Watchdog (Phase 27.4.1)

- **Shared watchdog helper** — `server/lib/llmExtractorWatchdog.ts` exports `withBatchWatchdog(batchFn, opts)`. Wraps any per-batch Promise with `Promise.race([batchCall, timeoutPromise])` + AbortController/generation-counter late-resolve guard so a timed-out Cerebras call that eventually resolves 10+ min later cannot clobber the cache or propagate stale events (D-05). Applied symmetrically to both `llmEventExtractor.v1.ts` and `llmEventExtractor.v2.ts` so the rollback path stays reliable (D-11/D-12).
- **Timeout tuning** — Default 90s hard-kill + 60s soft-warn (amber `⊘` callHistory entry with `provider: 'cerebras' as const, model: 'watchdog-soft-warn'`). Env override `LLM_BATCH_TIMEOUT_MS` (D-01/D-02/D-03) allows in-incident tuning without code change.
- **DLQ routing** — timed-out batches enqueue each group with `reason: 'timeout_watchdog'` via existing `llmDLQ.ts`; `llmProgress.watchdogTimeoutCount` increments (D-04/D-06). Loop continues to next batch — timeout on batch N does NOT abort the run.
- **Per-batch cache flush** — `events:llm:v2:partial` receives LLMCachePayload envelopes `{events: EnrichedEventV2[], progress: 'N/M', complete: boolean, generatedAt}` after every successful batch (null-content, zod-fail, success) + once more with `complete: true` after the final batch (D-07/D-08/D-10). Observability-only — never served to users.
- **Two-key discipline** — `events:llm:v2` (terminal, `ConflictEventEntity[]` from events.ts:1016) and `events:llm:v2:partial` (observability-only, `LLMCachePayload`) have non-overlapping writers and readers. Original Plan 03 wrote the envelope to the terminal key, which crashed every consumer (`events.map is not a function`, `llmCachedRef.data is not iterable`). Key split landed 2026-04-24 in commit `a5c8846`.
- **Reader defense-in-depth** — `server/routes/events.ts` exports `toEntityArray(data)` + `coerceCachedEvents(cached)` helpers (commit `e26ceca`). Applied at all 3 `events:llm:v2` read sites (loadRecentEnrichedEvents, /llm-replay, main /api/events). The main-handler coerce happens immediately after read so the sync HTTP path, Pitfall 1 bridge promotion, AND the fire-and-forget `llmCachedRef` iterations (lines ~854, ~1007) all see a guaranteed `ConflictEventEntity[]` — if any future regression reintroduces envelope writes, downstream consumers degrade to "serve empty / let Pitfall 1 bridge take over" instead of HTTP 500.
- **V1 TS cleanup** — 20 pre-existing `noUncheckedIndexedAccess` errors in `llmEventExtractor.v1.ts` fixed via D-15 local-bind + early-continue (`const current = arr[i]; if (!current) continue;`). Audit confirmed D-16 Zod schema tightening was NOT needed — all 20 were Category A compile-time noise, not runtime possibly-undefined. Total server TS error count: 29 → 8 (remaining 8 are `useEntityLayers.ts` `depthTest` deck.gl v9 drift, deferred to Phase 27.4.3).

## Phase 28.1 Cleanup Sweep — closeout 2026-05-03

Phase 28.1 cleanup sweep complete (all 7 waves). Highlights:

- **API reliability (W2):** `/api/health` aggregate endpoint live at `/health` and `/api/health`. DevApiStatus "All APIs" tab + HealthBanner toast for critical-tier outages. Per-endpoint freshness thresholds + tier classification per D-25/D-26.
- **Ghost code sweep (W3+W4):** modules deleted via knip + ts-prune triage. `server/adapters/acled.ts` preserved as inactive.
- **Hardcode generalization (W5, D-12):** 11 operator-tunable env vars introduced (POLL_FLIGHTS_MS, ATTACK_RADIUS_KM, SEVERITY_HALF_LIFE_HOURS, etc. — see .env.example).
- **Domain constants (W5, D-11):** IRAN_BBOX, IRAN_CENTER, WAR_START, ADSB_RADIUS_NM centralized at `src/lib/domain.ts`; `server/config.ts` re-exports.
- **Drift resolutions (W5):** severity half-life 24h authoritative; ADS-B radius 1200 NM authoritative; IRAN_CENTER (28.0, 45.0) authoritative.
- **CSS @theme migration (W6, D-13):** entity / event / site / faction colors migrated to `src/styles/app.css` `@theme` block; deck.gl bridge via `src/lib/colorBridge.ts`.
- **Normalization pass (W7, D-27):** `tsc --noEmit` 0 errors; `npm run lint` 0 errors and 0 react-hooks/exhaustive-deps warnings (down from 6); ESLint `import/order` rule live with 0 violations across src/ + server/; cron-warm Redis keys aligned with route readers (`sites:v2` → `sites:v3`, `water:facilities` → `water:facilities:v3`); audit doc at `.planning/phases/28.1-cleanup-sweep/28.1-W7-REDIS-AUDIT.md`.
- **Logging convention** — server-side modules use `logger.child({ module: '<name>' })` from the existing `server/lib/logger.ts` pino instance. W7 audit confirmed 0 `console.*` calls in `server/lib/llmEventExtractor.v3.ts`, `server/adapters/*.ts`, and `server/routes/*.ts` (all migrated in earlier phases). Do NOT create `server/lib/log.ts`.
- **Redis key bridge preserved:** all Phase 27.4.x load-bearing keys (events:llm:v3, sites:v3, water:facilities:v3, events:llm:v2, events:llm:v3:partial, events:llm-dlq, events:llm-pipeline-override, events:llm-process-ts, events:llm-eval-baseline:v3, geocode:fwd:constrained:v2:\*, llm:tokens:\*, news:gdelt, news:feed, etc.) UNCHANGED. Audit at `.planning/phases/28.1-cleanup-sweep/28.1-W7-REDIS-AUDIT.md`.

## Phase 28.2 Dev/Prod Sync + Domain Rename — closeout 2026-05-06

Phase 28.2 dev/prod sync sweep complete (all 6 waves; W6 wave-close gate green via prod-connectivity audit). Highlights:

- **Domain rename (W1, D-03):** prod URL renamed `irt-monitoring.vercel.app` → `otg-iran-monitor.vercel.app`. Vercel project recreated as `onthegrid.icm` with alias `otg-iran-monitor.vercel.app`. `scripts/load-test.js` BASE_URL + `scripts/load-test.spec.ts` PROD_URL + `CHANGELOG.md` + `docs/runbook.md` + `memory/reference_deployment.md` all updated. Old domain redirect strategy: hard cutover (project deleted).
- **Rate-limiter Bearer-bypass (W2, D-04):** `rateLimiters.public` global tier (60-req/min) skips when valid `DASHBOARD_PASSWORD` Bearer is present; per-endpoint tiers unaffected. `timingSafeEqual` constant-time compare. See "Vercel Deployment (Phase 14)" section above for full contract.
- **Operator-endpoint hardening (W3, D-08):** `POST /api/events/llm-pipeline` + `POST /api/events/llm-replay/:groupKey` graduated to Bearer-gated prod (Pitfall 6 dual-gate preserved on replay — never writes `events:llm:v3` cache). New primitives: `operatorAudit` (SADD bounded set, 500/30d), `replayQuota` (50/24h INCR counter), `runAdversarialEval()` (~10 prompt-injection fixtures at `.planning/eval/adversarial-injections.json`, folded into `/api/cron/health` daily run).
- **Dev → Bearer-gated prod gate-swaps (W4, D-05/D-06/D-07):** 3 surfaces graduated to Bearer-gated (`EntityTooltip` dev info, `EventDetail` ID + Confidence, `WaterFacilityDetail` OSM ID Path B). Lockdowns preserved per D-07: `MapDevExposer`, `NotificationCard` severity score, `WaterFacilityDetail.notabilityScore` stay dev-only forever.
- **Dashboard merge (W5, D-22/D-23/D-26/D-27):** DevApiStatus `Overview` tab folded into `All APIs` → renamed to **API Health**, first position in tab bar. 4 new D-23 diagnostic blocks: tier-grouped summary banner, per-endpoint quality metrics, manual retry button, recent-fetch sparkline. Confirm modal on Pin-to-v1/v2 + 429 replay-quota alert + Operator Actions block + adversarial eval row. New `/api/operator-status` Bearer-gated aggregator route. HealthStatusProvider single-poll guarantee preserved.
- **Connectivity audit + W6 close gate (W6, D-24/D-25/D-28/D-29/D-30):** `src/__tests__/api-connectivity.test.ts` 16-endpoint smoke suite (Bearer-attached, exercises D-04 bypass) + `src/__tests__/rate-limit.test.ts` D-30 companion (B-6 target `/api/health` — has no per-endpoint cap so 429 there proves global tier is firing). New `GET /api/audit-status` route reads sidecar `audit:connectivity:last-result` Redis key (7d TTL); JSON shape pinned by W-3 contract test in `server/routes/__tests__/audit-status.test.ts` so either-side drift fails LOUDLY. New `.github/workflows/prod-connectivity-audit.yml` manual-trigger workflow runs both suites against prod URL with secrets, writes sidecar via Upstash REST. Merged API Health tab surfaces audit-result banner with verbatim copy from UI-SPEC §10.
- **New API endpoints:** `/api/audit-status` (CI sidecar reader, public, degrade-open) + `/api/operator-status` (operator metrics aggregator, Bearer-required). See "Data Model (Phase 3+)" section above.
- **New Redis keys:** `operator:audit-log`, `operator:replay-quota:{bearerFingerprint}:{YYYY-MM-DD}`, `audit:connectivity:last-result`, `events:llm-eval-adversarial:v3`. See "Serverless Cache (Phase 13)" section above for shapes + TTLs.
- **Phase 27.4.x Redis key bridge preserved:** all load-bearing keys UNCHANGED. Plan 06 only ADDS sidecar keys; never renames or repurposes existing keys.
- **CI surface:** new manual-trigger workflow `.github/workflows/prod-connectivity-audit.yml` is the wave-close gate trigger. Default schedule is manual (operator clicks "Run workflow"); future phase may promote to PR-trigger or scheduled.

## Phase 28.2.5 API Green-Light Prereq Gate — closeout 2026-05-06

Phase 28.2.5 prereq gate complete (5 plans across 4 waves). Highlights:

- **LLM events monitoring (Plan 02, D-06/D-07):** `events:llm:v3` promoted from observability-only to gate-relevant — added to `SOURCE_KEYS` (DRIFT-5), `FRESHNESS_THRESHOLDS_MS` (26h, matches cron triad), `TIER_BY_ENDPOINT` (`'critical'`). DevApiStatus splits the legacy single `Events` row into `Events (raw)` (probes `events:gdelt`) + `Events (LLM)` (probes `events:llm:v3`) — operator gets a one-glance read on enriched-vs-fallback state. New `endpoints.llmEvents` field in the `/api/health` aggregate response. Stayed at `'critical'` tier per RESEARCH Open Question 1; deferred `'critical-llm'` sub-tier per CONTEXT Deferred Ideas.
- **Precipitation registry fix (Plan 01, D-08):** `waterPrecip: 'water:precip'` added to `SOURCE_KEYS` with DRIFT-4 comment. DevApiStatus `Precip` row switched from `useWaterStore` selectors to `/api/health` aggregate consumption — same pattern every other row uses (referencing `aggregateHealth.endpoints.waterPrecip`, the existing alias of the `health` field at L466-475 of DevApiStatus.tsx after the TDZ-safe destructure-block move). `PROBE_STRATEGIES.waterPrecip` aligned to `SOURCE_KEYS.waterPrecip!` indirection (free cleanup per RESEARCH Landmine #3). Plan 01 also lands the **registry-consistency invariant** test that would have caught this drift in the first place: every cache-backed `TIER_BY_ENDPOINT` key MUST have a matching `SOURCE_KEYS` entry.
- **Weather tooltip widening (Plan 03, D-05):** `findNearestPrecip` cutoff widened from 2° to 4° Manhattan degrees so every Iran-bbox cursor position resolves a precip sample. Return shape changed from `PrecipitationData | null` to `{ value: PrecipitationData; distanceKm: number } | null`. Tooltip surfaces a "nearest sample, X km away" hint when the resolved sample is more than 100km from the cursor — UI honesty about the spatial-precision tradeoff. `useWaterPrecipPolling` already fires unconditionally in `AppShell.tsx:45` (RESEARCH Landmine #2 confirmed) — no hydration code change needed.
- **Tier-green gate (Plan 04, D-03/D-04/D-09):** Extended 28.2 W6 `.github/workflows/prod-connectivity-audit.yml` with a tier-green assertion folded INTO Step 3's existing inline node script. Workflow fetches `/api/health` Bearer'd, computes `allTiersGreen` + `tierStatus` against the D-03 truth table (critical=`'healthy'`, non-critical/static∈{`'healthy'`,`'degraded'`}, probe-only=`'healthy'`, cron∈{`'healthy'`,`'degraded'`}), writes both fields into the existing `audit:connectivity:last-result` Redis sidecar payload (7d TTL), then exits non-zero on tier-red AFTER the sidecar write — no Upstash REST replication-lag race. Step 6 "Final status check" reads `steps.sidecar.outcome` in-memory (NOT a round-trip curl). Sidecar shape extension pinned by NEW W-3 contract test in `server/routes/__tests__/audit-status.test.ts` (existing `'matches CI workflow JSON shape contract'` block byte-unchanged). Path B selected (cold-cache self-heal trusted) per RESEARCH Open Question 6 — no `PROD_CRON_SECRET` GitHub Actions secret required. The existing `PROD_DASHBOARD_PASSWORD` secret is reused for the tier-green Bearer fetch.
- **AuditPayload extension:** `server/routes/audit-status.ts` `AuditPayload` interface widened with optional `allTiersGreen?: boolean` + `tierStatus?: { critical, nonCritical, static, probeOnly, cron }` fields — handler logic unchanged (still shape-agnostic `res.json(parsed)` passthrough). The merged API Health tab's audit-result banner picks up the new fields automatically.
- **Phase 27.4.x + 28.1 + 28.2 Redis key bridge preserved:** all load-bearing keys UNCHANGED. Plan 01/02 only ADD entries to the registry; never rename or repurpose existing keys. Pitfall 1 cache-bridge fallback chain at `events.ts:701-731` remains intact as the safety net even when `events:llm:v3` is the gate-relevant probe target.
- **D-10 prod-only gate:** workflow target stays `https://otg-iran-monitor.vercel.app`; dev-side verification of Band-A fixes is by `npx vitest run` + manual smoke. Operator runs `prod-connectivity-audit.yml` once before opening 28.2.5 close PR (proves fixes landed) and again before 28.3 merge (proves the gate held).
- **Phase 28.3 unblocked:** With `allTiersGreen=true` mechanically pinned by the workflow + W-3 contract test, the k6 1-300 VU sweep can start against a coherent prod surface — load-test numbers will measure prod under load, not a half-broken data path.
