---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: GDELT Redo & Performance
status: 'Phase 27 shipped — PR #5'
last_updated: '2026-04-10T04:52:57.728Z'
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 12
  completed_plans: 10
  percent: 83
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.

## Current Position

Milestone: v1.3 Data Quality & Layers — CLOSING (all primary phases shipped; 26.2 GDELT-redo and 27 Performance moved to v1.4 on 2026-04-08)
Milestone: v1.4 GDELT Redo & Performance — PLANNED (Phase 27 = GDELT redo, was 26.2; Phase 28 = Performance & Load Testing, was 27)
Phase 27.1: Plan 01 COMPLETE (1 of 3 plans done — server-side LLM progress module, /api/events/llm-status endpoint, callback-instrumented pipeline, concurrent guard, Redis summary persistence)
Phase 26.4: Plan 04 COMPLETE (6 of 6 plans done — phase execution complete; README 564-line portfolio rewrite, 1354 KB Playwright-captured hero GIF, 6 layer screenshots, rateLimiters.public tier wired globally on /api/\*, public/robots.txt, permanent scripts/capture-hero.ts agentic tooling)
Phase 26.4: Plan 06 COMPLETE (ADRs + runbook + degradation contract + README link closure — 12 new doc files, 2672 lines, ADR-0005 at 300 lines is the highest portfolio signal)
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
Phase 26.2 SCRAPPED (3 of 3 plans originally executed then fully reverted in Phase 26.3 — NLP approach was wrong; artifacts archived at .planning/phases/archive-26.2-nlp-scrapped/; redo renumbered to Phase 27 under v1.4)
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

## Pending Todos

None.

## Blockers/Concerns

- Ethnic distribution GeoJSON data needs manual curation from published maps
- WRI Aqueduct 4.0 format verified: ZIP contains CSV + GeoPackage; CSV has 231 columns, no lat/lng centroids
- Redis command budget at ~92% — monitor with Bellingcat RSS adding another polling source

### Quick Tasks Completed

| #          | Description                                               | Date       | Commit  | Directory                                                                                                           |
| ---------- | --------------------------------------------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| 1          | add CLN-01..CLN-13 requirement entries to REQUIREMENTS.md | 2026-04-07 | e487029 | [1-add-cln-01-cln-13-requirement-entries-to](./quick/1-add-cln-01-cln-13-requirement-entries-to/)                   |
| 260409-jf3 | update events counters to reflect our new ontology        | 2026-04-09 | 4c6c1cb | [260409-jf3-update-events-counters-to-reflect-our-ne](./quick/260409-jf3-update-events-counters-to-reflect-our-ne/) |

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
