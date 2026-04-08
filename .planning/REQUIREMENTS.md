# Requirements: Iran Conflict Monitor

**Defined:** 2026-03-19
**Core Value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.

## v1.1 Requirements

Requirements for the Intelligence Layer milestone. Each maps to roadmap phases.

### Key Sites

- [x] **SITE-01**: User can see key infrastructure sites (nuclear, naval, oil refinery, airbase, dam, port) on the map via Overpass API with distinct icons per type
- [x] **SITE-02**: User can toggle site visibility per type (parent toggle + 6 sub-toggles: nuclear, oil, naval, airbase, dam, port)
- [x] **SITE-03**: User can click a site marker to inspect its details (name, type, coordinates, operator, OSM link) in the detail panel

### News Feed

- [x] **NEWS-01**: System aggregates conflict news from GDELT DOC API, BBC RSS, and Al Jazeera RSS into a unified feed
- [x] **NEWS-02**: System filters non-conflict articles using keyword whitelist (Iran, Israel, airstrike, military, etc.)
- [x] **NEWS-03**: System deduplicates articles by URL hash across sources

### Notifications

- [x] **NOTF-01**: User can see a bell icon with unread count badge in the top-right corner
- [x] **NOTF-02**: User can open a notification drawer showing severity-scored conflict events (type weight x log mentions x log sources x recency decay)
- [x] **NOTF-03**: User sees 1-3 matched news headlines on each notification card (temporal + geographic/keyword matching)
- [x] **NOTF-04**: User receives proximity alerts when tracked entities (flights, ships) approach key sites within 50km
- [x] **NOTF-05**: Map shows only last 24h of conflict events by default when no custom date filter is set

### Oil Markets

- [x] **MRKT-01**: User can see oil market prices (Brent Crude, WTI Crude, XLE, USO, XOM) in a collapsible overlay panel
- [x] **MRKT-02**: User can see 5-day sparkline trend chart per instrument with color-coded direction (green up, red down)
- [x] **MRKT-03**: User sees green delta animations on price changes matching the existing counter animation pattern

### Search & UI

- [x] **SRCH-01**: User can search across all entity types via Cmd+K global search bar with fuzzy matching and fly-to-entity on selection
- [x] **SRCH-02**: User can reset all active filters with a single "Reset All" button
- [x] **SRCH-03**: Filter panel has grouped sections with scrollable layer toggles and visual hierarchy

### Advanced Search

- [x] **ASRCH-01**: User can type tag-based queries with full boolean expression support (AND/OR/NOT/parentheses)
- [x] **ASRCH-02**: Tags are evaluated against all entity types with the full tag vocabulary (~25 prefixes)
- [x] **ASRCH-03**: Search bar and sidebar filters sync bidirectionally (typing tags activates toggles; toggling adds/removes tags)
- [x] **ASRCH-04**: Two-stage autocomplete suggests tag prefixes then known values with counts from live entity data
- [x] **ASRCH-05**: SearchModal includes chip row, syntax highlighting, autocomplete dropdown, and cheat sheet popover
- [x] **ASRCH-06**: Plain text queries still work as freeform substring search (backward compat with Phase 19)

### Counter Dropdowns

- [x] **CNTR-01**: User can click a counter row to expand a dropdown showing individual entities with label + key metric per type
- [x] **CNTR-02**: Only one counter row can be expanded at a time (accordion behavior)
- [x] **CNTR-03**: User can click an entity in the dropdown to fly the map to it and open the detail panel
- [x] **CNTR-04**: Entities are sorted by proximity per category (flights/events from Tehran, ships from Strait of Hormuz, sites by attack count)
- [x] **CNTR-05**: Zero-count counter rows are disabled and non-expandable; expanded rows that drop to 0 show empty state
- [x] **CNTR-06**: Lists exceeding 8 items show a scrollable container with "Showing X-Y of Z" range indicator

### Layer Purpose Refactor

- [x] **LREF-01**: All entities (flights, ships, events, sites) are always visible on the map -- entity toggle state is fully removed
- [x] **LREF-02**: New visualization layer store exists with on/off toggle state for 6 layer types (geographic, weather, threat, political, satellite, infrastructure)
- [x] **LREF-03**: Sidebar "Layers" section replaced with visualization layer toggles instead of entity visibility toggles
- [x] **LREF-04**: Inline legend framework renders color scale legends for active visualization layers in the bottom-left map corner
- [x] **LREF-05**: Search/filter system is the only mechanism to narrow visible entities on the map

## v1.3 Requirements

Requirements for the Data Quality & Layers milestone.

### Event Quality & OSINT Integration

- [x] **EQ-01**: System parses ActionGeo_Type from GDELT CSV (column 51) and uses it to identify city-centroid events (type 3/4)
- [x] **EQ-02**: City-centroid events are dispersed into concentric rings (6 at 3km, 12 at 6km, 18 at 9km) with deterministic timestamp-sorted positioning
- [x] **EQ-03**: Both original centroid and dispersed coordinates are stored on each event for audit purposes
- [x] **EQ-04**: Event filtering thresholds (confidence, minSources, centroidPenalty, CAMEO exclusions) are config-driven via env vars with safe defaults
- [x] **EQ-05**: Bellingcat RSS feed is integrated as 6th news source and articles flow through existing keyword filter, relevance scoring, and dedup/clustering
- [x] **EQ-06**: GDELT events corroborated by Bellingcat articles receive +0.2 confidence boost (requires temporal AND geographic AND keyword overlap)
- [x] **EQ-07**: CLI audit script (`npx tsx scripts/audit-events.ts`) dumps all cached events with pipeline trace metadata to JSON
- [x] **EQ-08**: Audit output includes both accepted AND rejected events with specific rejection reasons and full pipeline trace
- [x] **EQ-09**: Known true/false positive GDELT fixtures are verified by automated tests (regression suite)

### Political Boundaries Layer

- [x] **POL-01**: User can toggle a political overlay showing country borders color-coded by faction alignment (US-aligned, Iran-aligned, Neutral)
- [x] **POL-02**: Countries are categorized into 3 factions with correct assignments (US-aligned: ISR, SAU, ARE, BHR, JOR, KWT, EGY; Iran-aligned: IRN, SYR, YEM; all others neutral)
- [x] **POL-03**: Disputed territories (Gaza, West Bank, Golan Heights) display with diagonal hatching in yellow/amber
- [x] **POL-04**: Disputed zones show zone name label on hover (only interactive element in the political layer)
- [x] **POL-05**: Discrete swatch legend with faction colors + disputed hatching visible when political layer is active
- [x] **POL-06**: Political layer renders below all other visualization layers and entity markers (background context only)

### Ethnic Distribution Layer

- [x] **ETH-01**: Static GeoJSON ethnic-zones.json contains ethnic boundary polygons extracted from GeoEPR 2021 dataset filtered to Middle East bbox
- [x] **ETH-02**: Cross-border ethnic groups (Kurdish, Arab, Baloch, Turkmen, Pashtun) are merged into single MultiPolygon features per group
- [x] **ETH-03**: Ethnic group config (ethnicGroups.ts) defines all 10 zones with distinct colors, rgba values, population estimates, and context descriptions
- [x] **ETH-04**: User can toggle ethnic overlay showing diagonal-hatched polygons color-coded per ethnic group using FillStyleExtension with fillPatternMask
- [x] **ETH-05**: Zone labels rendered at polygon centroids are always visible when ethnic layer is active with zoom-responsive sizing (10-24px)
- [x] **ETH-06**: Hover tooltip on ethnic zones shows group name, approximate population, and brief geographic context (only when no entity/threat is hovered)
- [x] **ETH-07**: Discrete legend with 10 ethnic group color swatches appears in bottom-left when ethnic layer is active
- [x] **ETH-08**: Ethnic layer stacks on top of political layer but below weather/entity/threat layers in DeckGLOverlay

### Water Stress Layer

- [x] **WAT-01**: Overpass water infrastructure query returns dams, reservoirs, treatment plants, named canals, and desalination plants from Middle East countries
- [x] **WAT-02**: Each water facility is assigned WRI Aqueduct 4.0 basin-level stress indicators (baseline water stress, drought risk, groundwater decline, seasonal variability) via coordinate-to-basin lookup
- [x] **WAT-03**: Open-Meteo 30-day precipitation anomaly is polled every 6 hours and feeds into composite water health score
- [x] **WAT-04**: Composite water health score combines WRI baseline (75% weight) with precipitation anomaly (25% weight) into a 0-1 scale
- [x] **WAT-05**: Water facilities render as type-specific icon markers (dam, reservoir, plant, canal, desalination) tinted by stress color on the black-to-light-blue gradient
- [x] **WAT-06**: Six major rivers (Tigris, Euphrates, Nile, Jordan, Karun, Litani) render as stress-colored line features with italic serif labels when water layer is active
- [x] **WAT-07**: Desalination plants are migrated entirely from the Sites overlay to the Water layer (removed from SiteType, Overpass sites query, site toggles, and site counters)
- [x] **WAT-08**: Clicking a water facility opens WaterFacilityDetail panel showing all WRI indicators, precipitation anomaly, composite health, attack status, and coordinates
- [x] **WAT-09**: Water facilities appear in counters, are searchable (type:dam, stress:high, name:, near:), and trigger proximity alerts -- all gated by water layer being active
- [x] **WAT-10**: Continuous gradient legend (black = extreme stress to light blue = healthy) appears in bottom-left when water layer is active
- [x] **WAT-11**: Water layer toggle in LayerTogglesSlot is functional (no longer "coming soon")

### Water Layer Refinements

- [x] **WR-01**: Overpass queries include treatment_plant (man_made=water_works) for priority countries (IL, JO, LB, SY, IQ, IR, AF) and filter non-priority countries to notable-only dams/reservoirs (require wikidata/wikipedia tags)
- [x] **WR-02**: Desalination facilities pass through unfiltered for all countries regardless of priority tier
- [x] **WR-03**: Vercel cron hits /api/water?refresh=true daily at 06:00 UTC; route-level Promise.race timeout removed; Redis hard TTL extended to 7 days
- [x] **WR-04**: Water stress score scale expanded to 0-10 with score 0 = "Destroyed" triggered by destructive GDELT events (airstrike, bombing, shelling, wmd) within 5km; destroyed facilities render solid black
- [x] **WR-05**: Icon atlas expanded with 4 type-specific water facility icons (dam trapezoid, reservoir pool, treatment plant industrial, desalination factory+droplet) at 32x32 white mask mode
- [x] **WR-06**: WaterFacilityType includes treatment_plant; all WATER_TYPE_LABELS maps updated across tooltip, detail panel, and counters
- [x] **WR-07**: Desalination audit cross-references known major Gulf plants against Overpass results and reports coverage gaps (report-only, no manual data addition)

### Conflict Geolocation Improvement

- [x] **NLP-01**: extractActorsAndPlaces() returns actors and places from a single NLP pass on article titles using compromise
- [x] **NLP-02**: Custom ME city lexicon (from GeoNames) makes compromise .places() recognize Middle East-specific city names (Isfahan, Mosul, Homs, Deir ez-Zor, etc.)
- [x] **GEO-01**: CITY_CENTROIDS expanded from 42 hardcoded entries to 100+ entries sourced from GeoNames dump (pop >= 50k in ME bbox)
- [x] **GEO-02**: Events where NLP-extracted actors clearly contradict the geocoded country are rejected with actor_geo_mismatch pipeline trace
- [x] **GEO-03**: Centroid events are relocated to NLP-extracted city coordinates when article title mentions a specific place name
- [x] **GEO-04**: Cross-border events (e.g., "Israel strikes targets in Syria") are NOT falsely rejected by actor-country validation
- [x] **TITLE-01**: Article titles extracted from GDELT SOURCEURL via HTTP GET of HTML head (og:title or title tag, regex-based, no DOM parser)
- [x] **TITLE-02**: Title extractions cached in Redis (URL hash key, 7-day logical TTL) with batch concurrency limit (10 parallel fetches)
- [x] **PIPE-01**: parseAndFilter includes Phase C NLP cross-validation that rejects actor-geo mismatches and relocates centroid events
- [x] **PIPE-02**: CAMEO codes 182 (physical assault) and 190 (conventional military force NOS) are hard-rejected (added to excluded codes list)
- [x] **PIPE-03**: Pipeline audit trace includes Phase C NLP validation fields (titleFetched, nlpActors, nlpPlaces, validationStatus)
- [x] **SCRIPT-01**: GeoNames extraction script (npx tsx scripts/extract-geonames.ts) produces valid me-cities.json with 100-250 ME cities

### Production Cleanup

- [x] **CLN-01**: Server codebase is free of Phase 26.2 NLP dead code (nlpGeoValidator, titleFetcher, me-cities lexicon, extract-geonames script all deleted; files modified by Phase 26.2 surgically reverted to pre-26.2 state)
- [x] **CLN-02**: All server logging goes through pino structured JSON logger; zero `console.log`/`console.error`/`console.warn` calls remain in server production code
- [x] **CLN-03**: Every HTTP request receives a unique X-Request-ID header (accepted from client or generated via crypto.randomUUID) and the ID appears in all log entries for that request via pino-http request-scoped child loggers
- [x] **CLN-04**: All server error responses follow a consistent `{ error, code, statusCode, requestId }` JSON envelope via an `AppError` class and centralized `errorHandler` middleware; dev mode includes stack traces, production strips them
- [x] **CLN-05**: `server/config.ts` is the single source of truth for env vars and constants, validated at startup via Zod schema; missing required vars (UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN) crash the app at module load; `server/constants.ts` is deleted
- [x] **CLN-06**: All API routes with query parameters use a `validateQuery` Zod middleware; no raw `req.query.X` access remains in route handlers; invalid query params return a consistent 400 error with validation details
- [x] **CLN-07**: `tsconfig.server.json` has `noUncheckedIndexedAccess: true` enabled; `npx tsc -b` exits 0 with zero errors across both server and app tsconfigs
- [x] **CLN-08**: `@vitest/coverage-v8` is installed and configured in `vite.config.ts` with v8 provider, text+lcov reporters, and baseline coverage threshold gates; `npx vitest run --coverage` passes configured thresholds
- [x] **CLN-09**: Server has a SIGTERM graceful shutdown handler (10s force-exit timeout, guarded to local dev only); response compression middleware is active in non-Vercel environments
- [x] **CLN-10**: All per-endpoint rate limiters in `server/middleware/rateLimit.ts` are JSDoc-documented with rationale (polling cadence, upstream cache TTL, cost profile); deprecated `rateLimitMiddleware` export removed
- [x] **CLN-11**: Test suite contains zero `it.todo()` / `test.todo()` stubs; every remaining test asserts real behavior
- [x] **CLN-12**: Hand-written OpenAPI 3.0.3 spec at `server/openapi.yaml` documents all 14 `/api/*` endpoints with request/response schemas, consistent error responses, and the `CacheResponse<T>` wrapper shape
- [x] **CLN-13**: Server TypeScript compiles with zero unused-import or unused-variable warnings; dead code from deleted Phase 26.2 modules is fully purged from the import graph

### Production Presentation

Phase 26.4 — portfolio-grade external artifacts and Palantir-grade engineering gap closure. IDs are non-contiguous (gaps reflect plan-internal grouping with room to grow).

**Plan 01 — Final code cleanup pass**

- [x] **PRES-01**: Repository is fully Prettier-formatted with `eslint --fix` applied repo-wide; flat ESLint config (`eslint.config.js`) and `.prettierrc.json` committed
- [x] **PRES-02**: Zero `TODO`/`FIXME` comments remain except explicitly preserved `TODO(26.2)` GDELT-redo flags and any `TODO(coverage)` placeholders
- [x] **PRES-03**: Zero `console.log`/`console.warn`/`console.error` calls remain in client production code
- [x] **PRES-04**: `knip` reports zero unused files, exports, and devDependencies (or all whitelisted with rationale)
- [x] **PRES-05**: `.env.example` matches every key in `server/config.ts` Zod schema, verified by `scripts/check-env-example.ts`
- [x] **PRES-06**: Tracked file scan finds no `.DS_Store`/`.env.local`/`coverage/`/`dist/` stragglers committed to the repo
- [x] **PRES-07**: `package.json` exposes `lint`, `lint:fix`, `format`, `format:check`, `knip`, `type-coverage` scripts as new entries

**Plan 02 — CI/CD + husky + gitleaks**

- [ ] **PRES-10**: `.github/workflows/ci.yml` runs on every PR with lint, typecheck, full vitest suite, npm audit, and codecov upload jobs
- [ ] **PRES-11**: `.github/workflows/codeql.yml` runs CodeQL JS/TS analysis on every PR and on a weekly schedule
- [ ] **PRES-12**: Codecov badge renders in README from CI uploads; coverage delta is visible on PRs
- [ ] **PRES-13**: `gitleaks` pre-commit hook blocks commits containing planted fake API keys; verified by a removable fixture test
- [ ] **PRES-14**: `husky` v9 pre-commit hook runs `lint-staged` (Prettier + ESLint) on staged files only and completes in under 2 seconds
- [ ] **PRES-15**: Vercel preview deploys are documented as a manual GitHub-integration step (no custom YAML required) in the CI README or repo docs

**Plan 03 — Palantir-grade gap closure**

- [x] **PRES-20**: Pino logger redacts `authorization` headers, `x-api-key`, cookies, `set-cookie`, and known upstream tokens (Upstash, OpenSky, AISStream, ADSB) before any sink output
- [x] **PRES-21**: `server/__tests__/lib/logger-redaction.test.ts` verifies known sensitive paths appear as `[REDACTED]` in captured pino write-stream output
- [x] **PRES-22**: `type-coverage` CLI installed; baseline measured; CI gate set at `floor(baseline)` with TODO note for the 99% target
- [ ] **PRES-23**: Type coverage badge renders in README from a static shields.io badge sourced from the latest measurement
- [x] **PRES-24**: Chaos test `server/__tests__/resilience/redis-death.test.ts` proves all cached routes return 200 (with `degraded: true`) or 503 (never 500) when `@upstash/redis` throws on every call; `/health` reports `redis: false`
- [x] **PRES-25**: A `sendValidated` helper parses outbound API responses through Zod schemas before `res.json()`; dev mode throws on mismatch, prod mode logs warn and sends anyway
- [x] **PRES-26**: At least three representative routes (flights, events, water) are wired to `sendValidated` with response schemas matching `server/openapi.yaml`

**Plan 04 — README + visuals + live demo hardening**

- [ ] **PRES-30**: `README.md` is rewritten as a portfolio-grade hero document with hero block, ToC, structured sections, engineering badges, retrospective, and is at least 200 lines
- [ ] **PRES-31**: `docs/hero.gif` exists, is under 3 MB, and demonstrates a Strait of Hormuz zoom with all visualization layers active
- [ ] **PRES-32**: `docs/screenshots/` contains 4–6 PNG screenshots of distinct visualization layers
- [ ] **PRES-33**: `rateLimiters.public` tier exists with stricter per-IP throttle than per-endpoint limits, JSDoc-documented, with a passing rate-limit test verifying 429 response
- [ ] **PRES-34**: `public/robots.txt` disallows `/api/*` and `/health`; live demo URL is published in README with a "please be gentle" callout

**Plan 05 — Mermaid architecture diagrams + ontology deep dive**

- [x] **PRES-40**: `docs/architecture/README.md` indexes all architecture documents with one-line descriptions
- [x] **PRES-41**: `docs/architecture/system-context.md` contains a Mermaid C4Context (or flowchart fallback) diagram of browser → Vercel edge → Express API → Upstash + 8 upstream APIs
- [x] **PRES-42**: `docs/architecture/data-flows.md` contains at least 8 Mermaid `sequenceDiagram` blocks, one per data source (flights, ships, events, news, sites, water, markets, weather), each naming its adapter file and cache key
- [x] **PRES-43**: `docs/architecture/frontend.md` documents map layer stacking, Zustand store dependency graph, polling hook ownership, and cross-store interactions
- [x] **PRES-44**: `docs/architecture/deployment.md` documents Vercel functions, build pipeline, CDN cache strategy, cron jobs, env vars, and failover behavior
- [x] **PRES-45**: `docs/architecture/ontology/types.md` catalogs every TypeScript discriminated union and entity type with relationships and source pointers
- [x] **PRES-46**: `docs/architecture/ontology/algorithms.md` documents at least 8 hot-path algorithms (threat clustering, GDELT dispersion, severity scoring, news clustering, news matching, basin lookup, water health, time grouping) with rationale
- [x] **PRES-47**: `docs/architecture/ontology/state-machines.md` documents connection lifecycle, polling lifecycle, navigation stack, and cache freshness state machines as Mermaid `stateDiagram-v2` blocks
- [x] **PRES-48**: `docs/architecture/ontology/complexity.md` documents runtime and space complexity for at least 7 hot-path operations in a complexity table

**Plan 06 — ADRs + runbook + degradation contract**

- [ ] **PRES-50**: `docs/adr/template.md` provides a Michael Nygard short-format ADR template; `docs/adr/README.md` indexes all ADRs and documents conventions (status values, immutability rule, numbering scheme)
- [ ] **PRES-51**: ADRs 0001–0004 document infrastructure decisions (Upstash Redis, Vercel serverless, GDELT v2, threat density shader) each at least 40 lines following the template structure
- [ ] **PRES-52**: ADR-0005 documents the Phase 26.2 NLP scrap honestly with Context, Decision, Consequences, and a "What I Learned" section; status `Superseded`; at least 60 lines
- [ ] **PRES-53**: ADRs 0006–0008 document later infrastructure decisions (pino + Zod hardening, water stress as point facilities, ethnic distribution via GeoEPR) each at least 40 lines following the template
- [ ] **PRES-54**: `docs/runbook.md` documents at least 9 failure modes (Upstash unreachable, GDELT 404, Overpass timeout, AISStream disconnect, Yahoo throttle, Vercel function timeout, Upstash budget exhausted, CORS misconfig, cron failure) each with Symptom/Detection/Cause/Remediation/Prevention; at least 150 lines
- [ ] **PRES-55**: `docs/degradation.md` documents the graceful degradation contract for cache, data sources, response validation, and frontend layers with a summary table; at least 60 lines; `README.md` Engineering section links all new artifacts

## v1.2+ Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Intelligence

- **INTL-01**: AI-generated situation briefs using Claude API
- **INTL-02**: Configurable severity weights for notification scoring
- **INTL-03**: Desktop push notifications for critical events

### Visualization

- **VIZL-01**: Historical replay / event timeline with playback controls
- **VIZL-02**: Trajectory arc rendering for flight and missile paths
- **VIZL-03**: 2.5D hexagonal density columns for strike hotspots

### Platform

- **PLAT-01**: Mobile-responsive layout
- **PLAT-02**: Market-closed state dimming with schedule awareness

## Out of Scope

| Feature                               | Reason                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Standalone news feed UI               | Contradicts "numbers over narratives" core value -- news is infrastructure for notifications only |
| Real-time WebSocket for notifications | Polling is sufficient for single-user tool; WebSocket adds serverless complexity                  |
| Paid market data APIs                 | Free-tier constraint; Yahoo Finance unofficial API with graceful degradation                      |
| Full-text article scraping            | Copyright concerns; title + URL linking is sufficient                                             |
| User-configurable alert thresholds    | Over-engineering for single user; hardcoded thresholds in v1.1, configurable in v1.2+             |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase      | Status   |
| ----------- | ---------- | -------- |
| SITE-01     | Phase 15   | Complete |
| SITE-02     | Phase 15   | Complete |
| SITE-03     | Phase 15   | Complete |
| NEWS-01     | Phase 16   | Complete |
| NEWS-02     | Phase 16   | Complete |
| NEWS-03     | Phase 16   | Complete |
| NOTF-01     | Phase 17   | Complete |
| NOTF-02     | Phase 17   | Complete |
| NOTF-03     | Phase 17   | Complete |
| NOTF-04     | Phase 17   | Complete |
| NOTF-05     | Phase 17   | Complete |
| MRKT-01     | Phase 18   | Complete |
| MRKT-02     | Phase 18   | Complete |
| MRKT-03     | Phase 18   | Complete |
| SRCH-01     | Phase 19   | Complete |
| SRCH-02     | Phase 19   | Complete |
| SRCH-03     | Phase 19   | Complete |
| ASRCH-01    | Phase 19.1 | Complete |
| ASRCH-02    | Phase 19.1 | Complete |
| ASRCH-03    | Phase 19.1 | Complete |
| ASRCH-04    | Phase 19.1 | Complete |
| ASRCH-05    | Phase 19.1 | Complete |
| ASRCH-06    | Phase 19.1 | Complete |
| CNTR-01     | Phase 19.2 | Complete |
| CNTR-02     | Phase 19.2 | Complete |
| CNTR-03     | Phase 19.2 | Complete |
| CNTR-04     | Phase 19.2 | Complete |
| CNTR-05     | Phase 19.2 | Complete |
| CNTR-06     | Phase 19.2 | Complete |
| LREF-01     | Phase 20   | Complete |
| LREF-02     | Phase 20   | Complete |
| LREF-03     | Phase 20   | Complete |
| LREF-04     | Phase 20   | Complete |
| LREF-05     | Phase 20   | Complete |
| EQ-01       | Phase 22   | Planned  |
| EQ-02       | Phase 22   | Planned  |
| EQ-03       | Phase 22   | Planned  |
| EQ-04       | Phase 22   | Planned  |
| EQ-05       | Phase 22   | Planned  |
| EQ-06       | Phase 22   | Planned  |
| EQ-07       | Phase 22   | Planned  |
| EQ-08       | Phase 22   | Planned  |
| EQ-09       | Phase 22   | Planned  |
| POL-01      | Phase 24   | Planned  |
| POL-02      | Phase 24   | Planned  |
| POL-03      | Phase 24   | Planned  |
| POL-04      | Phase 24   | Planned  |
| POL-05      | Phase 24   | Planned  |
| POL-06      | Phase 24   | Planned  |
| ETH-01      | Phase 25   | Planned  |
| ETH-02      | Phase 25   | Planned  |
| ETH-03      | Phase 25   | Planned  |
| ETH-04      | Phase 25   | Planned  |
| ETH-05      | Phase 25   | Planned  |
| ETH-06      | Phase 25   | Planned  |
| ETH-07      | Phase 25   | Planned  |
| ETH-08      | Phase 25   | Planned  |
| WAT-01      | Phase 26   | Planned  |
| WAT-02      | Phase 26   | Planned  |
| WAT-03      | Phase 26   | Planned  |
| WAT-04      | Phase 26   | Planned  |
| WAT-05      | Phase 26   | Planned  |
| WAT-06      | Phase 26   | Planned  |
| WAT-07      | Phase 26   | Planned  |
| WAT-08      | Phase 26   | Planned  |
| WAT-09      | Phase 26   | Planned  |
| WAT-10      | Phase 26   | Planned  |
| WAT-11      | Phase 26   | Planned  |
| WR-01       | Phase 26.1 | Planned  |
| WR-02       | Phase 26.1 | Planned  |
| WR-03       | Phase 26.1 | Planned  |
| WR-04       | Phase 26.1 | Planned  |
| WR-05       | Phase 26.1 | Planned  |
| WR-06       | Phase 26.1 | Planned  |
| WR-07       | Phase 26.1 | Planned  |
| NLP-01      | Phase 26.2 | Planned  |
| NLP-02      | Phase 26.2 | Planned  |
| GEO-01      | Phase 26.2 | Planned  |
| GEO-02      | Phase 26.2 | Planned  |
| GEO-03      | Phase 26.2 | Planned  |
| GEO-04      | Phase 26.2 | Planned  |
| TITLE-01    | Phase 26.2 | Planned  |
| TITLE-02    | Phase 26.2 | Planned  |
| PIPE-01     | Phase 26.2 | Planned  |
| PIPE-02     | Phase 26.2 | Planned  |
| PIPE-03     | Phase 26.2 | Planned  |
| SCRIPT-01   | Phase 26.2 | Planned  |
| CLN-01      | Phase 26.3 | Complete |
| CLN-02      | Phase 26.3 | Complete |
| CLN-03      | Phase 26.3 | Complete |
| CLN-04      | Phase 26.3 | Complete |
| CLN-05      | Phase 26.3 | Complete |
| CLN-06      | Phase 26.3 | Complete |
| CLN-07      | Phase 26.3 | Complete |
| CLN-08      | Phase 26.3 | Complete |
| CLN-09      | Phase 26.3 | Complete |
| CLN-10      | Phase 26.3 | Complete |
| CLN-11      | Phase 26.3 | Complete |
| CLN-12      | Phase 26.3 | Complete |
| CLN-13      | Phase 26.3 | Complete |
| PRES-01     | Phase 26.4 | Complete |
| PRES-02     | Phase 26.4 | Complete |
| PRES-03     | Phase 26.4 | Complete |
| PRES-04     | Phase 26.4 | Complete |
| PRES-05     | Phase 26.4 | Complete |
| PRES-06     | Phase 26.4 | Complete |
| PRES-07     | Phase 26.4 | Complete |
| PRES-10     | Phase 26.4 | Planned  |
| PRES-11     | Phase 26.4 | Planned  |
| PRES-12     | Phase 26.4 | Planned  |
| PRES-13     | Phase 26.4 | Planned  |
| PRES-14     | Phase 26.4 | Planned  |
| PRES-15     | Phase 26.4 | Planned  |
| PRES-20     | Phase 26.4 | Complete |
| PRES-21     | Phase 26.4 | Complete |
| PRES-22     | Phase 26.4 | Complete |
| PRES-23     | Phase 26.4 | Planned  |
| PRES-24     | Phase 26.4 | Complete |
| PRES-25     | Phase 26.4 | Complete |
| PRES-26     | Phase 26.4 | Complete |
| PRES-30     | Phase 26.4 | Planned  |
| PRES-31     | Phase 26.4 | Planned  |
| PRES-32     | Phase 26.4 | Planned  |
| PRES-33     | Phase 26.4 | Planned  |
| PRES-34     | Phase 26.4 | Planned  |
| PRES-40     | Phase 26.4 | Planned  |
| PRES-41     | Phase 26.4 | Planned  |
| PRES-42     | Phase 26.4 | Planned  |
| PRES-43     | Phase 26.4 | Planned  |
| PRES-44     | Phase 26.4 | Planned  |
| PRES-45     | Phase 26.4 | Planned  |
| PRES-46     | Phase 26.4 | Planned  |
| PRES-47     | Phase 26.4 | Planned  |
| PRES-48     | Phase 26.4 | Planned  |
| PRES-50     | Phase 26.4 | Planned  |
| PRES-51     | Phase 26.4 | Planned  |
| PRES-52     | Phase 26.4 | Planned  |
| PRES-53     | Phase 26.4 | Planned  |
| PRES-54     | Phase 26.4 | Planned  |
| PRES-55     | Phase 26.4 | Planned  |

**Coverage:**

- v1.1 requirements: 29 total, 29 complete
- v1.2 requirements: 5 total, 5 complete
- v1.3 requirements: 106 total, 19 complete (66 prior + 40 PRES-\* Phase 26.4)
- Total: 140 mapped, 53 complete

---

_Requirements defined: 2026-03-19_
_Last updated: 2026-04-07 -- Phase 26.4 Plan 03 (Palantir gap closure) marked PRES-20..22, 24..26 complete_
