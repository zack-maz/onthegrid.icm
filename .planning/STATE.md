---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: LLM Reliability & Reveal Prep
status: planning
last_updated: "2026-05-17T18:36:49.075Z"
last_activity: 2026-05-17
progress:
  total_phases: 14
  completed_phases: 2
  total_plans: 24
  completed_plans: 20
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.

## Current Position

Phase: 999.1
Plan: Not started
Status: Ready to plan
Last activity: 2026-05-17

Predecessor: v1.4 GDELT Redo & Performance shipped 2026-05-08 (18 phases). Audit at .planning/milestones/v1.4-MILESTONE-AUDIT.md.

Acceptance gate (set at milestone start, blocks v1.6 promotion): prod-connectivity-audit.yml exit-0 with allTiersGreen=true for 3 consecutive runs (LLM-RELI-07; observed in Phase 36 closeout).

## v1.5 Phases (planned)

| Phase | Name                                                                  | Requirements                                                  | Status      |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------- | ----------- |
| 29    | LLM Provider Chain Narrowing & LLM-Optional Architecture & CLAUDE.md Trim | LLM-RELI-01, LLM-RELI-05, SIMPLIFY-04, SIMPLIFY-06, DOCS-INT-01 | Context gathered |
| 30    | NIM Throttle Characterization & Cascade Tuning                        | LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03 | Waves 1-3 complete (4/7 plans) |
| 31    | Cron Stability Validation (7-day Watch)                               | LLM-RELI-06                                                   | Not started |
| 32    | Ghost Event URL Liveness, Dashboard & Prune                           | GHOST-01..05                                                  | Not started |
| 33    | Actor Metadata Audit, Canonical Catalog & Eval Expansion              | ACTOR-01..05                                                  | Not started |
| 34    | Internal Docs (JSDoc) + Redis Registry Verification + Redis Optimization | DOCS-INT-02, DOCS-INT-03, REDIS-OPT-01..04, SIMPLIFY-02, SIMPLIFY-05, SIMPLIFY-07 | Not started |
| 35    | Public Docs Sweep + OpenAPI Additions                                 | DOCS-PUB-01, 02, 03, 05, DOCS-API-01..07                      | Not started |
| 36    | ADR-0009 + Acceptance Gate Closeout                                   | DOCS-PUB-04, LLM-RELI-07                                      | Not started |

**Sequencing:** 29 → 30 → 31 → 36 is the LLM-RELI spine (must run in order). Phases 32, 33, 34 are independent of the spine and can run in parallel with 29/30/31. Phase 35 lands after 29/30/31 close so docs reflect shipped state. Phase 36 is the milestone-close gate by construction.

Backlog still parked (not in v1.5 unless they block reliability):

- 999.1 rate-limiter-public-global-blocks-operator
- 999.2 api-vercel-entry-rebuild-discipline
- 999.3 phase-27-4-6-cron-first-tick-verification
- 999.5 performance-load-test (promotes to v1.6 once acceptance gate is hit)

Deferred to future milestone: 27.3.3 romanization of non-Latin water facility names.

## v1.3 Phases

| Phase | Name                                    | Status                                     |
| ----- | --------------------------------------- | ------------------------------------------ |
| 22    | GDELT Event Quality & OSINT Integration | COMPLETE (3/3 plans)                       |
| 22.1  | Fixing Dispersion                       | COMPLETE (2/2 plans)                       |
| 23    | Threat Density Improvements             | COMPLETE (2/2 plans)                       |
| 23.2  | Improving Threat Density Scatter Plots  | IN PROGRESS (1/2 plans)                    |
| 24    | Political Boundaries Layer              | IN PROGRESS (1/2 plans)                    |
| 25    | Ethnic Distribution Layer               | IN PROGRESS (1/2 plans)                    |
| 26    | Water Stress Layer                      | COMPLETE (6/6 plans, gap closure complete) |
| 26.1  | Water Layer Refinements                 | COMPLETE (3/3 plans)                       |
| 26.3  | Production Code Cleanup                 | COMPLETE (6/6 plans)                       |
| 26.4  | Documentation & External Presentation   | COMPLETE (6/6 plans)                       |

_Phase 26.2 was scrapped and renumbered to Phase 27 under v1.4 on 2026-04-08. Original Phase 27 (Performance & Load Testing) was also moved to v1.4 as Phase 28 on the same date._

## v1.4 Phases (planned)

| Phase | Name                                          | Status  |
| ----- | --------------------------------------------- | ------- |
| 27    | Conflict Geolocation Improvement (GDELT Redo) | Planned |
| 28    | Performance & Load Testing                    | Planned |

## Key Decisions

- Source tier registry as standalone module (sourceTiers.ts) rather than extending relevanceScorer.ts — cleaner separation of classification vs scoring
- Tier pre-filter runs before keyword/NLP scoring in filterAndScoreArticles — early exit saves NLP compute on unknown sources
- Unknown sourceTier defaults to tier 2 (neutral 1.0x multiplier) in severity scoring — conservative default avoids penalizing events where source URL is missing
- FACILITY_TYPE_LABELS exported from overpass-water.ts for shared detection of unnamed facilities in water route reverse geocoding
- labelUnnamedFacilities runs after fetch, before cache — Redis stores labeled facilities so reverse geocoding only runs on 24h cold cache
- Stress level thresholds: <=0.33 High, <=0.66 Medium, >0.66 Low (simple thirds of compositeHealth)
- Callback injection pattern for LLM pipeline progress instrumentation — keeps processEventGroups/geocodeEnrichedEvents pure and testable without module-level state mocks
- Module-level singleton for LLM progress (not Map) — simpler API, single pipeline per Vercel instance, warm-start persistence
- /api/events/llm-status gated by NODE_ENV !== 'production' — returns 404 in prod per threat model T-27.1-01
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
- ADR-0005 written at 300 lines (5x minimum) as the honest Phase 26.2 NLP-scrap retrospective — names every file deleted, the 2-week time invested, includes a 4-lesson "What I Learned" section with rules for next time (patching downstream of bad signals compounds the problem, spike before commit, killing your darlings is a portfolio signal, cleanup phases are part of the product), and a forward-looking "what to do instead" section naming upstream NumSources + noisy-CAMEO filter as the leading redo candidate — explicitly identified as the highest-portfolio-signal artifact in Phase 26.4 (26.4-06)
- ADR-0001 Consequences section integrates the Plan 03 REDIS_OP_TIMEOUT_MS 2000ms Promise.race hardening as production resilience work rather than creating a separate ADR-0009 — keeps the decision record coherent ("we chose Upstash and here is how the choice has evolved") (26.4-06)
- Runbook failure modes grounded in specific code paths with line numbers (server/cache/redis.ts lines 19-42 for REDIS_OP_TIMEOUT_MS, server/middleware/rateLimit.ts lines 100-120 for rateLimiters.public, server/adapters/overpass.ts private.coffee mirror, server/routes/events.ts shouldBackfill/recordBackfillTimestamp helpers) rather than generic SRE advice — reviewable claims not hand-waving (26.4-06)
- degradation.md summary table includes a "Proof" column mapping each layer contract to a specific test file or code line — belt-and-suspenders documentation that is only believable if it points at proof; mirrors ADR-0001 Consequences structure for cross-document consistency (26.4-06)
- ADR template uses Positive/Negative/Neutral consequence split (not unstructured "Consequences") to force honest tradeoff consideration; ADR index README documents immutability rule (status line mutable, body frozen) and numbering convention (4-digit zero-padded) so future ADRs have clear conventions (26.4-06)
- README Plan 06 edits are additive and scoped: new Engineering Documentation subsection after Graceful Degradation with headline-linked paragraphs for architecture/adr/runbook/degradation, upgraded Architecture section prose to clickable per-file links, and ADR-0005 blockquote at the top of the Phase 26.2 retrospective — does NOT touch hero GIF area, Quick Start, or test metrics table from Plan 04 (26.4-06)
- ADR cross-referencing pattern established: ADRs link to each other (ADR-0003 ↔ ADR-0005), to runbook failure modes, to architecture data-flow diagrams, and to specific code files — the ADR directory is navigable from any entry point rather than a flat list (26.4-06)
- Agentic hero GIF capture via Playwright (scripts/capture-hero.ts, 527 lines, `npm run capture:hero`) chosen over manual Kap recording — ~45s repeatable regeneration survives UI changes, committed as permanent portfolio tooling rather than a one-off recording (26.4-04)
- Playwright recordVideo does not work for WebGL content in headless + software-GL mode (produces all-black frames because the compositor receives zeroed frames for WebGL canvases) — `page.screenshot()` frame-sequence stitched by gifski is the reliable fallback because screenshot reads the canvas backbuffer synchronously (26.4-04)
- Skip ffmpeg in the gifski pipeline — gifski accepts PNG frames directly on stdin and handles lanczos scaling via `--width`, avoiding rgb24→yuv4mpegpipe pixel-format errors and reducing the pipeline to 2 processes (Playwright → gifski) (26.4-04)
- MapDevExposer dev-only React component added to src/components/map/BaseMap.tsx, gated by `import.meta.env.DEV`, exposes the maplibre Map instance on `window.__map` for programmatic flyTo and layer toggling during capture — Vite tree-shakes entirely out of production builds, zero bundle impact (26.4-04)
- rateLimiters.public tier (6 req/min per-IP, prefix `ratelimit:public`) wired globally on `/api/*` BEFORE per-endpoint limiters in server/index.ts — protects the Upstash command budget from scraper abuse on the live demo URL while leaving per-endpoint budgets intact for legitimate high-volume users; paired with public/robots.txt disallowing /api/ and /health for polite crawlers (26.4-04)
- README live demo URL left as `_TBD_` placeholder (commit bd453cf replaced an earlier hardcoded URL) — user will substitute the actual Vercel URL at publication time rather than committing hardcoded production URLs mid-plan (26.4-04)
- REV-5 root cause: `DESTRUCTIVE_EVENT_TYPES` was `['airstrike', 'explosion']` but targeted precision strikes and ground combat near infrastructure were silently ignored for water facility attack detection; expanded to `ATTACK_EVENT_TYPES` combining destructive+combat sets (27.3-02)
- Dev-mode `console.debug('[useWaterLayers] attack detection:', ...)` added unthrottled per-render — acceptable because Vite strips it from production builds via `import.meta.env.DEV` (27.3-02)
- `filterStats` guarded with `!== undefined` in useWaterFetch — cached responses (Redis/dev-file-cache) don't carry the field, so the null fallback keeps the DevApiStatus Water Filters panel from rendering stale zeros (27.3-02)
- WaterFacilityDetail enrichment sections use the existing `<h3>` + DetailValue pattern (NOT a DetailSection component) — matches established convention in that file; DetailSection is not a component in this codebase (27.3-02)
- waterTreatment atlas slot at x=480 left intact (canvas draw code retained, harmless dead pixels) when removing treatment_plant from ICON_MAPPING — removing the shape would require renumbering downstream x-offsets (waterDesalination 512, triangle 544) for zero functional gain (27.3-02)
- Master `showSites` toggle wired into useEntityLayers visibleSites memo — previously the filter store had the field but the layer didn't consult it, so toggling the master sites control had no effect on the map (27.3-02, consistency fix bundled with Task 1)
- Proximity pin filter added to useWaterLayers — water facilities were the only entity type not honoring the pin (parity with flights/ships/events/sites via entityPassesFilters pattern) (27.3-02)
- WATER_ATTACK_EVENT_TYPES extracted to `src/lib/waterAttackEvents.ts` as single source of truth shared by useWaterLayers (map), WaterFacilityDetail (panel isDestroyed), useCounterData (counter score); the REV-5 expansion now reaches all three consumers so a facility near a `targeted` or `on_ground` event shows attacked/destroyed across map + detail + counter dropdown (27.3-03, WR-01)
- Water route test emptyStats fixture added: a well-formed WaterFilterStats stub (5 required sub-fields, all zero) replaces the `stats: {}` literal that violated waterFilterStatsSchema under NODE_ENV=test — chosen over `stats: undefined` so future tests have a reference payload; mock return type narrowed from `stats: unknown` to `stats: typeof emptyStats` (27.3-03, G-01/WR-02, IN-03)
- hasCapacityData(tags) exported from overpass-water.ts — returns true when any of height|volume|capacity|area tags has a non-empty trimmed value; used inside the D-06 compound admission gate and exported for Plan 06's computeAdmissionDecision consolidation (27.3.1-02, R-03)
- Admission gate restructured from three scattered branches (REV-2 reservoir + dam-only no-name + score floor) into a single three-stage unified gate: D-05 hasName mandatory → D-06 `isNotable OR isPriorityCountry OR hasCapacityData` → D-08 MIN_NOTABILITY_SCORE secondary floor; Round 3 Package A's bare-name-in-non-priority reservoir relaxation explicitly reverted (27.3.1-02, R-03)
- MIN_NOTABILITY_SCORE kept at 15 but demoted to secondary guard (D-08) — redundant in practice since D-06 clearance implies score≥15, but retained so regressions surface as low_score++ rather than silent admission (27.3.1-02, R-03)
- GENERIC_TYPE_RE fallback in src/lib/waterLabel.ts audited per D-10 and KEPT (not deleted): still reachable via the non-Latin-only OSM name path (hasName accepts any script, extractLabel's isLatin guard drops non-Latin names for display → bare-type fallback); inline comment now names the reach path and stamps the audit date, regression test proves the fallback chain handles the case (27.3.1-02, R-03)
- R-02 calibration tightened D-06 compound from 1-of-3 OR (`isNotable || inPriority || hasCapacityData`) to 2-of-3 signal-count (`signalCount = [...].filter(Boolean).length; if (signalCount < 2) reject`) with per-type exemption for desalination — closes the priority-country single-OR floodgate (Run 1 had Turkey 509 / Saudi Arabia 262 / Iran 234 admits via `isPriorityCountry` alone). Final post-calibration counts: dams=515, reservoirs=73, desalination=15. Branch 2b-(ii) over Branch 2b-(i) chosen because MIN_NOTABILITY_SCORE bump would lack per-type granularity and would slice desalination further. Outcome: single_tune. (27.3.1-04, R-02)
- Desalination exemption added to D-06 compound: `if (facilityType !== 'desalination') { 2-of-3 check }` — desal sparse OSM coverage (~63 raw) means name+type combination carries enough notability signal alone. Preserves D-05 hasName floor (regression test "still rejects unnamed desalination" proves it). Established the per-type exemption pattern as the prototype for Plan 06's planned `computeAdmissionDecision` consolidation. (27.3.1-04, R-02)
- MIN_NOTABILITY_SCORE confirmed redundant in production data — `low_score: 0` in both Run 1 and Run 2 of the calibration. Plan 06 cleanup (D-22) decision: drop the secondary floor or keep as defense-in-depth sentinel. Compound gate fully subsumes the score floor for non-desal types; desal exemption skips both gates (only D-05 hasName applies). (27.3.1-04, R-02 → R-06)
- Reservoirs at 73 admit count (below 300 floor) accepted per CONTEXT.md D-04 calibration philosophy ("err high not low — willing to go below 400 for those entities" + "Target is the ceiling, not the floor — UNDER-pulling is fine if every facility has a real name + notability signal"). All 73 clear D-05 hasName + 2-of-3 compound; quality > count. (27.3.1-04, R-02)
- R-04 committed snapshot shipped — `src/data/water-facilities.json` (337 KB, 602 facilities: 516 dams + 71 reservoirs + 15 desalination, sorted by id, coords rounded to 6dp, 2-space pretty-print). Generated by `npm run refresh:water` via `scripts/refresh-water-facilities.ts` running the full fetchWaterFacilities + labelUnnamedFacilities pipeline with atomic tempfile+rename write. Route tier is Redis → devFileCache (dev) → snapshot → Overpass (refresh gate only); snapshot loader forces `stats.source='snapshot'` defensively. (27.3.1-05, R-04)
- R-07 multi-user-resilience invariant documented inline in `server/routes/water.ts` and proven end-to-end via curl: cold Redis + snapshot present → `source: snapshot`, Overpass untouched; second hit → `source: redis` (snapshot populated Redis on first hit). `?refresh=true` still bypasses snapshot + devFileCache for cron/dev. Production NODE_ENV: Tier 4 Overpass is completely gated off for user requests — `npm run refresh:water` is the only developer-facing path. (27.3.1-05, R-07)
- `labelUnnamedFacilities` extracted from `server/routes/water.ts` into `server/lib/waterLabeling.ts` so refresh script + route share the identical pipeline. Preserves Phase 27.3 truth-19 ("never writes 'Unknown'") by sharing the exact function instead of re-implementing. (27.3.1-05, R-04)
- Plan 03's TODO flipped in water route: dev file cache branch now reports `source='snapshot'` (was `'redis'`). Dev file cache semantically shadows the snapshot tier — they're both cold-start floor, just ephemeral vs committed. (27.3.1-05, R-08 D-30 refinement)
- Redis-death chaos test updated to mock `loadWaterSnapshot → null`. Pre-Plan-05 the test passed because there was no snapshot tier; with a real 602-facility snapshot on disk, under Redis death `labelUnnamedFacilities` would trigger 134 consecutive 2000ms safe-timeout waits blowing past the 10s test timeout. Mocking preserves the test's original intent (prove no HTTP 500). (27.3.1-05)
- SitesFiltersSection mirrors WaterFiltersSection layout in DevApiStatus.tsx with intentional 4-bucket rejection asymmetry (excluded_turkey / no_coords / no_type / duplicate) — no synthetic water-style buckets (no_name, not_notable, low_score, no_city) per Plan 07 handoff guidance. Sites has genuinely narrower rejection surface because the adapter uses a single combined Overpass query across 5 types with no compound admission gate, no scoring, and no nearestCity requirement. No per-type byTypeRejections split for the same reason (per-type would require restructuring fetchSites). Module-scope `relativeTime` helper from Plan 03 reused without duplication — confirmed hoisted correctly at import time. (27.3.1-08, R-05 UI layer)
- Phase 27.3.1 Plan 08 chose a dedicated test file `src/__tests__/sitesFiltersSection.test.tsx` rather than extending the pre-existing failing `devApiStatus.test.tsx` — keeps sites section regression surface independent of the stale `parsed.sources.length === 8` assertion (current rows array has 9 entries including Precip; that failure is pre-existing baseline per deferred-items.md and not fixed by Plan 08). (27.3.1-08)
- Phase 27.3.2 Plan 04 inserted new admission branch "step 3b" in computeAdmissionDecision between step 3 (no_name) and step 4 (not_notable) — non-desal facilities failing hasLatinLabel(tags) now reject to no_resolved_name bucket; desalination unconditionally bypasses step 3b per D-03 exemption (sparse OSM coverage — 5 of 15 desal admits are non-Latin, dropping them would cost strategic infrastructure visibility); linkedRiver is NOT consulted at admission per D-02 river-rescue kill (linkedRiver enrichment survives post-admission in normalizeWaterElement for detail panel only); computeAdmissionDecision signature unchanged (no new linkedRiver param); all 151 existing adapter tests pass because prior fixtures used Latin names so Plan 06 test-extension becomes pure-addition with zero remediation. (27.3.2-04, D-01/D-02/D-03/D-05)
- hasLatinLabel(tags) exported from overpass-water.ts mirroring hasName/hasCapacityData shape: returns true when name:en/name/operator is non-empty trimmed AND passes the isLatin script guard (hoisted function declaration, reused verbatim from line 357, no new regex). Placed after hasCapacityData (line 192) to keep admission-decision helper exports clustered in first ~200 lines. (27.3.2-04, D-01)
- Phase 27.3.2 Plan 05 extended extractLabel in overpass-water.ts from 2-arg `(tags, facilityType)` to 5-arg `(tags, facilityType, lat, lng, nearestCity: ReturnType<typeof findNearestCity>)` with two desal-only synthesis branches inserted between the three existing Latin-check branches and the preserved bare FACILITY_TYPE_LABELS fallback: branch 4 returns `"Desalination Plant near ${nearestCity.name}"` when nearestCity resolves, branch 5 returns `"Desalination Plant at ${Math.abs(lat).toFixed(2)}°${N|S}, ${Math.abs(lng).toFixed(2)}°${E|W}"` when it doesn't — byte-identical to src/lib/waterLabel.ts lines 87-89 pre-Plan-07 so stale cached labels rehydrate character-identically. Non-desal facilities can't reach branches 4-5 (rejected at admission by Plan 04's step 3b), but branch 6 retained as defense-in-depth. (27.3.2-05, D-06/D-07)
- Phase 27.3.2 Plan 05 kept extractLabel module-private per plan directive — Plan 06 will decide export-for-unit-testing separately; current call graph is extractLabel ← normalizeWaterElement only, so private visibility costs nothing and Plan 06 has flexibility to either export for direct unit testing or mock through normalizeWaterElement. (27.3.2-05, D-07)
- Phase 27.3.2 Plan 05 typed the new nearestCity parameter as `ReturnType<typeof findNearestCity>` (per PATTERNS.md Pattern 3 prescription) rather than duplicating the inline `{ name, distanceKm, population } | null` shape. Keeps the type tethered to findNearestCity so any future field addition to the return shape propagates automatically to extractLabel. (27.3.2-05, D-07)
- Phase 27.4.2 Plan 06 baseline locked: resolver eval = 38/38/41/50 (within 5/20/100km), +5pp absolute target = 0.810 (≥41/50 within 20km), production fallback% = 9.7% (23/237) ALREADY << 25% target. Wave 2 stop condition (D-13) only requires eval-at-20km uplift of 3 events; fallback% gate is no longer binding. Reused existing v2 production run summary (events:llm-summary:v2 from 2026-04-25T02:00:49Z) instead of duplicating ~300K Cerebras token spend per Pitfall 4. watchdogTimeoutCount=0 satisfied inferentially via empty events:llm-dlq Redis key. (27.4.2-06)
- Phase 27.4.2 Plan 06 inner-loop ergonomic: `npm run eval:replay` runs `runEval()` resolver-only via `scripts/eval-replay.ts` and prints per-distance JSON + the D-25 deploy-gate ratio. Cost ~50s on cold Nominatim cache, instant on warm. Zero LLM token spend per A6 / Pitfall 8. Used between every Wave 2 sub-lever change per D-12 micro-iteration cadence. Mirrors `scripts/refresh-water-facilities.ts` shape with `node --env-file-if-exists=.env --import tsx/esm` runner pattern. (27.4.2-06)
- Phase 27.4.2 Plan 06 D-07 hang-recurrence response: `setProviderOrderOverride([groq, cerebras])` is the canonical incantation when `watchdogTimeoutCount ≥ 3` is observed in a run. Module-level `_providerOrderOverride` in `server/adapters/llm-provider.ts` mirrors `setPipelineOverride` from `server/config.ts:230-242`, no Redis persistence (wave-scoped, ops-managed). Cold-start naturally clears it. Phase close runbook restores `setProviderOrderOverride(null)` per T-27.4.2-03 mitigation. (27.4.2-06)
- Phase 27.4.2 Plan 06 closed RESEARCH §6 Pitfall 3: `watchdogTimeoutCount` field added to `LLMRunSummary` interface + `buildSummary()` body in `server/lib/llmProgress.ts` + frontend mirror in `src/hooks/useLLMStatusPolling.ts` per A9 sync rule. Pre-Plan-06 the field was set on the live singleton but lost across the idle transition because `buildSummary()` did not thread it. Now operator-checkable post-run via `/api/events/llm-status` and DevApiStatus dashboard. (27.4.2-06)

## Pending Todos

None.

## Deferred Items

Items acknowledged and deferred at v1.4 milestone close on 2026-05-08:

| Category | Count | Notes |
|----------|-------|-------|
| Debug sessions | 10 | Historical breadcrumbs — all `diagnosed` / `root_cause_found` / `resolved-pending-user-verification`; root causes captured in commits or merged phases |
| Quick tasks (legacy) | 11 | Pre-`/gsd-add-todo` slugs (TBV-*, M00-*, MN4-*, etc.) — superseded by phase work that landed |
| Pending todos | 3 | `phase-27.4.2-ci-health` / `phase-27.4.3-deckgl-v9-type-drift` / `phase-27.4.5-llm-pipeline-observability` — all phases shipped except 27.4.5 (subsumed by 27.4 family observability work) |
| UAT gaps (resolved) | 4 | 27.3.1, 27.3.2, 27.4, 27.4.2 — human-checked at the time of phase close |
| UAT gaps (partial, post-deploy) | 2 | 28.2.6 (2 pending), 28.2.7 (4 pending) — operator-driven verification items that surface in `/gsd-progress` until manually checked via `/gsd-verify-work` |
| Verification gaps (`human_needed`) | 6 | 27.3.1, 27.4, 27.4.2, 28.2, 28.2.6, 28.2.7 — expected status for phases with operator-driven post-deploy items; code-level verification PASSED in each |

Per Phase 28.2.7 close convention: `human_needed` is not a defect — it's the verifier's signal that some acceptance criteria require operator action against deployed prod. Marked here so they surface in `/gsd-audit-uat` and `/gsd-progress` until the operator confirms via `/gsd-verify-work`.

## Blockers/Concerns

- Ethnic distribution GeoJSON data needs manual curation from published maps
- WRI Aqueduct 4.0 format verified: ZIP contains CSV + GeoPackage; CSV has 231 columns, no lat/lng centroids
- Redis command budget at ~92% — monitor with Bellingcat RSS adding another polling source

### Quick Tasks Completed

| #          | Description                                                                                                      | Date       | Commit  | Directory                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 1          | add CLN-01..CLN-13 requirement entries to REQUIREMENTS.md                                                        | 2026-04-07 | e487029 | [1-add-cln-01-cln-13-requirement-entries-to](./quick/1-add-cln-01-cln-13-requirement-entries-to/)                   |
| 260409-jf3 | update events counters to reflect our new ontology                                                               | 2026-04-09 | 4c6c1cb | [260409-jf3-update-events-counters-to-reflect-our-ne](./quick/260409-jf3-update-events-counters-to-reflect-our-ne/) |
| 260411-m00 | Fix threat density cluster sizes to scale with event count while remaining zoom-independent                      | 2026-04-11 | c68d12a | [260411-m00-fix-threat-density-cluster-sizes-to-scal](./quick/260411-m00-fix-threat-density-cluster-sizes-to-scal/) |
| 260411-m4j | Threat density clusters use meter-based radius from bbox diagonal so they never shrink below their event spread  | 2026-04-11 | 475f900 | [260411-m4j-threat-density-clusters-use-meter-based-](./quick/260411-m4j-threat-density-clusters-use-meter-based-/) |
| 260411-ma5 | Remove radiusMaxPixels cap so threat density clusters never shrink below event spread                            | 2026-04-11 | 86b648f | [260411-ma5-remove-radiusmaxpixels-cap-so-threat-den](./quick/260411-ma5-remove-radiusmaxpixels-cap-so-threat-den/) |
| 260411-mh0 | Add Open-Meteo precipitation to API observability dashboard                                                      | 2026-04-11 | 7d73360 | [260411-mh0-add-open-meteo-precipitation-to-api-obse](./quick/260411-mh0-add-open-meteo-precipitation-to-api-obse/) |
| 260411-mn4 | Show precipitation in weather tooltip always, using raw precip data instead of facility lookup                   | 2026-04-11 | 490561f | [260411-mn4-show-precipitation-in-weather-tooltip-al](./quick/260411-mn4-show-precipitation-in-weather-tooltip-al/) |
| 260415-uzj | In our status line, keep the version number but remove the version title                                         | 2026-04-16 | 2c75caf | [260415-uzj-in-our-status-line-keep-the-version-numb](./quick/260415-uzj-in-our-status-line-keep-the-version-numb/) |
| 260417-dtt | Reorder water filter toggles (healthy above attacked) and make the attacked toggle dot black                     | 2026-04-17 | f9f169b | [260417-dtt-for-the-water-filters-let-s-move-the-att](./quick/260417-dtt-for-the-water-filters-let-s-move-the-att/) |
| 260417-fap | Make attacked (0-stress) water facilities deep dark purple on the map, in the legend, and on the Attacked toggle | 2026-04-17 | d3f5e4b | [260417-fap-make-attacked-0-stress-water-sites-deep-](./quick/260417-fap-make-attacked-0-stress-water-sites-deep-/) |

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
- Milestone v1.4 created (2026-04-08): Phase 26.2 renumbered to Phase 27 (Conflict Geolocation Improvement / GDELT Redo) and original Phase 27 renumbered to Phase 28 (Performance & Load Testing). Both moved out of v1.3 so v1.3 can close with its delivered phases (26.3 code cleanup and 26.4 documentation shipped as planned). Scrapped 26.2 artifacts archived to .planning/phases/archive-26.2-nlp-scrapped/. Historical references (ADR-0005, SUMMARY.md files, TODO(26.2) code markers) preserve the old number intentionally.
- Phase 27.1 inserted after Phase 27: Dev Observability and LLM Pipeline Status (URGENT) — server-side LLM progress tracking, /api/events/llm-status endpoint, granular DevApiStatus panel with completion %, ETA, historical success rates
- Phase 27.2 inserted after Phase 27.1: Event Quality and Water Data Improvements (URGENT) — high-tier news sources, richer LLM enrichment, precision ring UX, zoom icon fix, date slider styling, more dams/treatment plants, water filter parity, icon sizing
- Phase 27.3.1 inserted after Phase 27.3: Water Facility Retry and Cleanup (URGENT) — Package A verification blocked by Overpass outage 2026-04-18 15:15 PT; calibrate to ~100–500 dams / ~100–500 reservoirs, persist committed JSON snapshot to decouple cold-starts from Overpass, same treatment for sites, clean up overpass-water.ts ghost code from 5 plans + 2 debug rounds, prepare for multi-user concurrency
- Phase 27.4.2 inserted after Phase 27.4.1 (2026-04-24): CI Health + LLM v2 Quality Tuning — bundled phase greens main CI (32 filter-test failures, 4 npm-audit vulns, prettier format drift, lint warnings) so regression-watch is trustworthy during Track B — then runs one clean 184-batch v2 extraction to capture eval baseline and iterates prompts/resolver until eval ≥v1+5pp AND gdelt-actiongeo-fallback provenance <25%. Scope levers + hang-recurrence policy open for /gsd-discuss-phase. Out-of-scope: 27.4.3 (deck.gl v9 TS drift), 27.4.5 (LLM flight-recorder), 27.3.3 (romanization).
- Phase 27.4.3 inserted after Phase 27.4.2 (2026-04-25): free-claude-code Routing Evaluation (URGENT) — pivoted from the originally-deferred "Cerebras hang root-cause investigation" to evaluate https://github.com/Alishahryar1/free-claude-code as a replacement for the manual Cerebras/Groq routing in `server/adapters/llm-provider.ts`. Five evaluation criteria (feasibility, reliability, cost/quota, integration shape, eval quality parity ±5pp of Plan 07's 0.940 baseline). Phase 27.4.2 HUMAN-UAT.md tests 1+2 are blocked on this phase landing. Reassigned 27.4.3 number from the prior deck.gl v9 depthTest TS-drift placeholder to this evaluation; deck.gl v9 work renumbers to 27.4.4.
- Phase 28.2.6 inserted after Phase 28.2.5 (2026-05-07): Fix Vercel cron architecture so events:llm:v3 populates within budget (URGENT) — surfaced during 28.2.5 Plan 05 closeout when force-trigger of /api/cron/refresh-events?force=true returned `dispatched: true` in 400ms but the fire-and-forget IIFE body never executed (Vercel Fluid Compute kills the function once response is sent). Three resolution paths captured in 28.2.5-deferred-items.md for /gsd-discuss-phase 28.2.6 to pick from: (a) incremental terminal-key write refactor (~30 LOC), (b) Vercel Pro plan upgrade ($20/mo for 800s maxDuration), (c) waitUntil migration via @vercel/functions. Phase 28.3 entry now gated on 28.2.6 because the tier-green workflow run that 28.2.5 D-09 set up will keep returning allTiersGreen=false until critical[llmEvents] can flip from `unknown` to `healthy`.
- Phase 30.1 inserted after Phase 30 (2026-05-17): Cascade fallback fix — re-enable OpenRouter or document single-provider reality (URGENT) — surfaced immediately post-Phase-30 by operator review noticing OpenRouter never fired in Run 1 / Run 2 / 04:00 UTC daily cron. Phase 27.4.4's `skipOpenRouter: true` flag is still hardcoded in `server/lib/llmEventExtractor.v3.ts:622, 929`, removing OpenRouter from the cascade entirely. 04:00 UTC cron evidence: NIM 39 rate-limit errors → breaker tripped → 50+ batches `skipped:breaker` → 0 OpenRouter attempts. Phase 30's tuning therefore tunes a single-provider pipeline, not a cascade. Seed context at .planning/phases/30.1-cascade-fallback-fix-.../30.1-CONTEXT-SEED.md. Three scope options (minimum/right/full) for /gsd-discuss-phase 30.1 to pick from.

**Planned Phase:** 30.1 (Cascade fallback fix — re-enable OpenRouter or document single-provider reality) — 4 plans — 2026-05-17T18:36:49.062Z
