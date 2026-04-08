---
gsd_state_version: 1.0
milestone: v0.9
milestone_name: milestone
status: unknown
last_updated: '2026-04-08T21:38:13.942Z'
progress:
  total_phases: 13
  completed_phases: 8
  total_plans: 39
  completed_plans: 34
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.

## Current Position

Milestone: v1.3 Data Quality & Layers — IN PROGRESS
Phase 26.4: Plan 05 COMPLETE (Mermaid architecture docs — 10 files, 21 diagrams, ontology deep dive)
Phase 26.4: Plan 03 COMPLETE (Palantir gap closure — redaction, type-coverage gate, chaos test, sendValidated)
Phase 26.4: Plan 02 COMPLETE (CI/CD workflows, husky pre-commit, gitleaks)
Phase 26.4: Plan 01 COMPLETE (final code grooming pass, tooling installed)
Phase 26.3 COMPLETE (6 of 6 plans done)
Phase 26.3: Plan 05 COMPLETE (strict TS + OpenAPI, closes the phase)
Phase 26.3: Plan 06 COMPLETE (5 of 6 plans done; Plan 05 still pending)
Phase 26.3: Plan 04 COMPLETE (4 of 6 plans done)
Phase 26.3: Plan 03 COMPLETE (3 of 6 plans done)
Phase 26.3: Plan 02 COMPLETE (2 of 6 plans done)
Phase 26.3: Plan 01 COMPLETE (1 of 6 plans done)
Phase 26.2 COMPLETE (3 of 3 plans done)
Phase 26.2: Plan 03 COMPLETE (3 of 3 plans done)
Phase 26.2: Plan 02 COMPLETE (2 of 3 plans done)
Phase 26.2: Plan 01 COMPLETE (plans 01+02 done, 1 remaining)
Phase 26.1 COMPLETE (3 of 3 plans done)
Phase 26.1: Plan 02 COMPLETE (2 of 3 plans done)
Phase 26.1: Plan 01 COMPLETE (1 of 3 plans done)
Phase 26: Plan 06 COMPLETE (6 of 6 plans done, gap closure complete)
Phase 25: Plan 01 COMPLETE (1 of 2 plans done)
Phase 24: Plan 01 COMPLETE (1 of 2 plans done)
Phase 23.2: Plan 01 COMPLETE (1 of 2 plans done)
Phase 23 COMPLETE (2 of 2 plans done)
Phase 22.1 COMPLETE (2 of 2 plans done)
Phase 22 COMPLETE (3 of 3 plans done)
Previous: v0.9-v1.2 all shipped (958 tests, p95 153ms)

## v1.3 Phases

| Phase | Name                                    | Status                                        |
| ----- | --------------------------------------- | --------------------------------------------- |
| 22    | GDELT Event Quality & OSINT Integration | COMPLETE (3/3 plans)                          |
| 22.1  | Fixing Dispersion                       | COMPLETE (2/2 plans)                          |
| 23    | Threat Density Improvements             | COMPLETE (2/2 plans)                          |
| 23.2  | Improving Threat Density Scatter Plots  | IN PROGRESS (1/2 plans)                       |
| 24    | Political Boundaries Layer              | IN PROGRESS (1/2 plans)                       |
| 25    | Ethnic Distribution Layer               | IN PROGRESS (1/2 plans)                       |
| 26    | Water Stress Layer                      | IN PROGRESS (6/6 plans, gap closure complete) |
| 26.1  | Water Layer Refinements                 | COMPLETE (3/3 plans)                          |
| 26.2  | Conflict Geolocation Improvement        | COMPLETE (3/3 plans)                          |
| 27    | Performance & Load Testing              | Planned                                       |

## Key Decisions

- GDELT stays on CSV export (no BigQuery) — tune existing pipeline instead
- Bellingcat RSS as sole OSINT gap-filter (no Telegram/GramJS)
- Ethnic layer: hatched overlay regions (Option C) — not solid fills
- Load target: 250 VUs (up from 100 in v1.2)
- Satellite imagery deferred to v1.4
- Dispersion only for ActionGeo_Type 3/4; centroid penalty 0.7x on confidence (multiplicative, not exclusion)
- Bellingcat corroboration uses three-gate matching (temporal AND geographic AND keyword) to prevent false boosts
- RSS_FEEDS changed from const assertion to typed array for extensibility
- parseAndFilterWithTrace kept separate from parseAndFilter to preserve production performance
- Fly-to dedup uses simple lat/lng !== equality (coordinates from lookup table, exact match correct)
- Added else-if branch to reset lastFlownPinRef when near: tag absent from query (deriveFiltersFromAST returns undefined, not null)
- disperseEvents relocated from parseAndFilter to events route for single-pass slot assignment post-merge
- CENTROID_TOLERANCE=0.01 extracted as shared constant between geoValidation.ts and dispersion.ts
- Thermal palette: 8-stop FLIR Ironbow (indigo->purple->violet->magenta->orange->amber->yellow->red) for better threat intensity differentiation
- P90 normalization: colorDomain=[0, p90] prevents high-activity zones from washing out lower-intensity areas
- Temporal decay removed from computeThreatWeight -- age-independent scoring, date filtering handles recency
- ThreatCluster type defined in ui.ts (not ThreatHeatmapOverlay) to avoid circular imports
- Integer grid indices (Math.round) for BFS neighbor lookup to avoid floating-point key mismatch
- selectedCluster and selectedEntityId mutually exclusive in uiStore via cross-clearing
- Cluster picker radius proportional to bounding box diagonal with 50km floor
- smoothstep GLSL falloff for radial gradient (smooth hermite, not quadratic)
- Linear interpolation for cell-count-to-pixel radius (12px single-cell to 100px at 20+ cells)
- Zoom threshold tracked via boolean isBelowZoom9 + ref crossover (not continuous zoom) to prevent 60fps re-renders
- Hover cluster state managed as local React state in BaseMap (not uiStore -- transient visual state)
- 4-stop simplified thermal palette replacing 8-stop FLIR Ironbow (deep purple->magenta->orange->bright red)
- Natural Earth 10m disputed areas file: ne_10m_admin_0_disputed_areas (not breakaway variant)
- Extended filter bbox (lat 0-50, lng 20-80) captures 57 countries for political overlay
- Canvas-generated 16x16 hatching pattern (8px spacing, amber #f59e0b) for disputed territories
- Disputed hover labels via MapLibre feature-state (preferred over always-visible)
- GeoEPR-2021 from ETH Zurich as ethnic boundary data source (1685 features, 596 in ME bbox)
- Douglas-Peucker simplification at epsilon=0.05 degrees reduces ethnic-zones.json from 580KB to 139KB
- Yazidi absent from GeoEPR (mapped as Kurds/Yezidis -> Kurdish); not hand-drawn per CONTEXT.md policy
- Grid-based overlap detection at 0.5-degree resolution identifies 23 overlap zones
- Only removed desalination from SiteType, left WaterFacilityType (added by 26-01) untouched -- clean parallel execution
- Karun and Litani rivers manually defined (not in Natural Earth 10m dataset)
- WRI Aqueduct 4.0 CSV used directly: 6377 basins across 29 ME countries (no fallback needed)
- Country matching for basin filtering uses exact equality (substring "Romania" matching "Oman" was a bug)
- compositeHealth: baseline dominates (75%), precipitation modifier adjusts (25%), clamped [0,1]
- PrecipitationData defined locally in waterStore.ts (not server/types.ts) since 26-03 server plan not yet executed
- Water facility icons now have dedicated shapes: waterDam (trapezoid), waterReservoir (oval), waterTreatment (building+tank), waterDesalination (factory+droplet)
- River labels use serif italic font to distinguish from ethnic overlay sans-serif labels
- Country-centroid basin lookup: WRI Aqueduct lacks lat/lng, so basinLookup uses haversine to nearest country centroid then median-stress basin
- Regional precipitation normals: 20mm/month arid default, 50mm/month Fertile Crescent (lat 30-40, lng 35-50)
- Water API dual-cache: water:facilities (24h) + water:precip (6h) as separate Redis keys
- Water facilities use same proximity alert system as sites (waterToSiteLike adapter pattern)
- Proximity alerts dismissible with 60s cooldown to prevent overwhelm from water facilities
- Alert click selects site/facility (not approaching flight) for detail panel context
- Dark purple [40,20,60] as water stress color floor -- visible on dark terrain while still reading as stressed
- Core/extended Overpass batch split: core 12 countries must succeed, extended 11 is best-effort (partial data > none)
- Route-level 30s timeout returns empty array with stale:true (not 500) -- client degrades gracefully on Overpass failure
- Score 0 (Destroyed) applied externally by useWaterLayers, not by healthToScore -- keeps scoring pure and destruction as separate concern
- STRESS_COLORS array unchanged at 5 stops -- score 0 black is handled separately in legend, not in gradient interpolation
- isPriorityCountry uses full 29-country COUNTRY_CENTROIDS_FULL (duplicated from basinLookup.ts to avoid circular dep)
- isExcludedLocation upgraded to use full centroids -- sparse 5-entry array was falsely excluding Iran/Pakistan/etc.
- Cron refresh=true guarded by vercel-cron user-agent in production; dev always allows refresh
- treatment_plant uses diamond icon placeholder pending dedicated water icons
- Labels already present from Plan 01/02 -- no duplicate changes needed for treatment_plant
- Inline haversine in useWaterLayers avoids cross-type dependency on attackStatus.ts SiteEntity imports
- Desalination audit: 63 OSM elements found but major Gulf plants missing (Israel, Kuwait, Qatar entirely absent); report-only per user decision
- Regex-based HTML title extraction (no DOM parser dep) with og:title priority and entity decoding; SHA-256 prefix cache keys
- GeoNames population threshold 200k (not 50k) to stay in 100-300 city target range; 22 ME country ISO codes for filtering
- Multi-word city substring fallback for names compromise tokenizes (Deir ez-Zor, Mazar-i-Sharif); conflict actor lexicon for Houthi/Hamas/etc.
- me-cities.json as single source of truth for both NLP lexicon and CITY_CENTROIDS (replaces 42 hardcoded entries)
- Cross-border events validated by NLP place country match (not actor country); CAMEO 182/190 hard-excluded; threshold raised 0.35->0.38
- CAMEO_TO_FIPS includes both YMN and YEM mappings for Yemen (GDELT uses both actor codes)
- ISO_TO_FIPS mapping bridges lookupCityCoords ISO codes to FIPS geo codes for NLP validation
- parseAndFilter reverted to synchronous (Phase 26.2 removed) -- was async only for title fetching
- CAMEO exclusion reverted to pre-26.2: ['180','192'] only (182/190 exclusions were 26.2-specific)
- Confidence threshold reverted to 0.35 (from 26.2's 0.38)
- Pre-existing tsc errors fixed alongside 26.2 reversion (unused imports, compromise typing)
- Express 5 req.query is read-only getter -- validateQuery middleware stores parsed data on res.locals.validatedQuery
- Zod v3 pinned (v4 has breaking changes: ZodTypeAny removed, different module structure)
- importOriginal pattern for config mocks to preserve constant re-exports after constants.ts consolidation
- parseEnv test defaults use explicit if-checks (not spread) to avoid env var override order bugs
- Pino logger with level:'silent' in test mode, pino-pretty in dev, raw JSON in production
- Module-level child loggers (not request-scoped) for adapter files lacking req context
- genReqId accepts client-provided X-Request-ID or generates UUID via crypto.randomUUID
- autoLogging ignores /health endpoint to reduce noise
- ParsedQs to Zod inferred type cast uses 'as unknown as' double-cast pattern
- AppError uses explicit property assignment (not parameter properties) due to erasableSyntaxOnly tsconfig
- Compression middleware gated by !VERCEL — Vercel CDN handles edge gzip/brotli, local dev gets compression for realistic testing
- Graceful SIGTERM handler only in isMainModule block — Vercel has its own 500ms window and Upstash Redis is REST-based (no connections to drain)
- Consistent error envelope { error, code, statusCode, requestId } established across all routes and middleware
- AppError(statusCode, code, message) is the canonical pattern for typed route errors
- Coverage thresholds pinned at current baseline (lines 66 / functions 69 / branches 53 / statements 65) as a regression ratchet -- ratchet upward as new tests land toward 80% target
- WAR_START defined locally in src/lib/constants.ts (was re-exported from removed server/constants.js); duplicates server/config.ts to keep frontend tier independent
- vi.useFakeTimers() pattern for tests that compare two computeSeverityScore() calls (eliminates Date.now() microsecond drift between back-to-back invocations)
- noUncheckedIndexedAccess enabled on server tsconfig only — client-side would cascade through deck.gl/maplibre layers where runtime types are looser than declared
- getCol() helper centralizes bounds-checked CSV column reads in GDELT adapter rather than scattering non-null assertions
- Cast-with-comment pattern for deck.gl v9 GeoJsonLayer/IconLayer types (runtime accepts FeatureCollection/HTMLCanvasElement but v9 type defs are stricter)
- Rate limit test fixture swap: rateLimiters.flights aliased locally instead of preserving deprecated rateLimitMiddleware export purely for tests
- OpenAPI 3.0.3 spec hand-written (not zod-to-openapi generated) to avoid code-gen runtime dep and keep editorial descriptions for portfolio review
- allOf composition in OpenAPI for CacheResponse&lt;T&gt; pattern (OpenAPI 3.0 has no generics)
- Prettier 3 + eslint-config-prettier 10 (flat) + knip 5 installed; lint:fix, format, format:check, knip, check:env scripts added (26.4-01)
- eslint argsIgnorePattern '^\_' enforces existing underscore-prefix convention for intentionally-unused identifiers (26.4-01)
- getIconAtlasForLayer() wrapper in icons.ts eliminates 9 iconAtlas `as any` casts across useEntityLayers and useWaterLayers (26.4-01)
- Static GeoJSON imports typed via `as unknown as FeatureCollection` instead of `as any` -- deck.gl v9 type defs are stricter than runtime contract (26.4-01)
- ColorReliefLayer wrapper component isolates the maplibre 5 `color-relief` type cast so @vis.gl/react-maplibre 8 type gap is contained (26.4-01)
- scripts/check-env-example.ts drift checker forces NODE_ENV=test before dynamic import of server/config so parseEnv() returns safe defaults (26.4-01)
- knip.json whitelists tailwindcss / pino-pretty / @types/pino-http -- CSS @import / string-literal / type-only usage cannot be statically detected (26.4-01)
- 81 pre-existing lint errors absorbed into Plan 01 Task 1 commit (26.4-01 cleanup pass intentionally covers pre-existing tech debt)
- Deleted @deck.gl/aggregation-layers and @deck.gl/react deps (genuinely unused; test mocks aliased via vite.config) (26.4-01)
- Pino redactPaths exported from server/lib/logger.ts; redact.paths includes authorization/cookie/x-api-key/set-cookie headers plus wildcard tokens (UPSTASH/OPENSKY/AISSTREAM/ADSB) and production-only req.ip/remoteAddress; redaction proof test uses pino write-stream sink (26.4-03)
- type-coverage baseline measured at 97.05% (7970/8212); CI gate locked at 97 floor as regression ratchet; 99% aspirational target deferred (deck.gl/maplibre v9 type-cast cleanup out of scope) (26.4-03)
- Chaos test server/**tests**/resilience/redis-death.test.ts boots real Express app via supertest + mocked @upstash/redis throwing on every call; asserts all 8 cached routes + /health return 200 degraded or 502/503 — never 500 (26.4-03)
- Chaos test exposed Path A gap in events route (shouldBackfill + backfill-ts writeback calling raw redis.get/set); fixed with try/catch helpers + new recordBackfillTimestamp best-effort helper (26.4-03)
- Chaos test exposed Path B gap in cacheGetSafe/cacheSetSafe — safe wrappers caught sync throws but NOT hung Upstash client calls (client retries internally on undefined URL, blocks forever); added withTimeout Promise.race wrapper with REDIS_OP_TIMEOUT_MS=2000 in server/cache/redis.ts — this is the core production resilience fix, not just test scaffolding (26.4-03)
- 2000ms Redis op timeout chosen as 25x the healthy Upstash RTT (~50-200ms) — zero impact on happy path, caps worst-case hung call, prevents Vercel lambda timeout cascade (26.4-03)
- sendValidated<S>(res, schema, payload) middleware added with dev-throw / prod-warn semantics; dev mismatch throws AppError(500, RESPONSE_SCHEMA_MISMATCH) caught by errorHandler; prod mismatch logs warn via pino child logger and falls through with original payload (26.4-03)
- cacheResponseSchema<T> generic zod wrapper mirrors OpenAPI CacheResponseBase allOf composition; entity schemas (flight, conflict event, water facility) use passthrough() on nested data fields for drift tolerance (26.4-03)
- sendValidated wired into flights, events, water routes as proof-of-concept (3 of 14 cached routes); remaining 11 deferred to future maintenance pass per plan scope (26.4-03)
- Sites route needed no code changes under chaos — its failure was purely the hung cacheGetSafe call which the timeout wrapper closes (26.4-03)
- Stripped 9 debug console.log('[EVENTS] ...') tracer lines from events.ts that were left uncommitted at end of previous session; pre-empted via grep check before commit (26.4-03)
- Mermaid inline architecture docs over committed SVG/PNG — renders natively on GitHub, diffs cleanly in PRs, no build step, evolves with code (26.4-05)
- Ontology documentation split into 4 focused files (types/algorithms/state-machines/complexity) to prevent unreadable monolith; single file approach rejected (26.4-05)
- As-built honesty principle: TODO(26.2) tech debt labeled inline in architecture diagrams (hardcoded CAMEO table in gdelt.ts, centroid dispersion gaps in dispersion.ts, NLP extraction fields in NewsArticle, coarse nearest-country-centroid basin lookup) rather than hidden in issues section (26.4-05)
- C4Context block with plain flowchart fallback in system-context.md because older Mermaid renderers don't support C4 syntax (26.4-05)
- 9 sequenceDiagrams in data-flows.md (plan required 8+) — geocode added as 9th with distinct two-tier lookup pattern (synchronous siteStore bbox check → async Nominatim) (26.4-05)
- Source pointers in architecture docs use relative repo paths so links work both in GitHub rendering and in local editors; no absolute github.com URLs (26.4-05)
- classDiagram mermaid syntax used only for MapEntity discriminated union (the single most important ontology concept); other type catalogs are prose + code blocks to reduce edit burden (26.4-05)
- stateDiagram-v2 preferred over flowchart for lifecycle state machines — semantically correct for finite-state behavior and renders the state transitions more clearly on GitHub (26.4-05)

## Pending Todos

None.

## Blockers/Concerns

- Ethnic distribution GeoJSON data needs manual curation from published maps
- WRI Aqueduct 4.0 format verified: ZIP contains CSV + GeoPackage; CSV has 231 columns, no lat/lng centroids
- Redis command budget at ~92% — monitor with Bellingcat RSS adding another polling source

### Quick Tasks Completed

| #   | Description                                               | Date       | Commit  | Directory                                                                                         |
| --- | --------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------- |
| 1   | add CLN-01..CLN-13 requirement entries to REQUIREMENTS.md | 2026-04-07 | e487029 | [1-add-cln-01-cln-13-requirement-entries-to](./quick/1-add-cln-01-cln-13-requirement-entries-to/) |

## Accumulated Context

### Roadmap Evolution

- Phase 22.1 inserted after Phase 22: fixing dispersion (URGENT)
- Phase 23.1 inserted after Phase 23: detail panel navigation stack (deferred from Phase 23 discussion)
- Phase 26.1 inserted after Phase 26: Water layer refinements (URGENT)
- Phase 26.2 inserted after Phase 26: Conflict geolocation improvement (URGENT)
- Phase 26.2 SCRAPPED and deferred — NLP approach was wrong, patching bad geocoding with more code didn't work
- Phase 26.3 inserted after Phase 26: Production Code Cleanup — portfolio-grade internal quality (URGENT)
- Phase 26.4 inserted after Phase 26.3: Documentation & External Presentation — portfolio-grade external polish
- Phase 26.2 now depends on 26.4 — GDELT redo on clean foundation
