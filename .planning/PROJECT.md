# Iran Conflict Monitor

## What This Is

A personal real-time intelligence dashboard for monitoring the Iran conflict and the Greater Middle East. Displays a 2.5D map with live data from three flight sources (OpenSky, ADS-B Exchange, adsb.lol), AIS ship tracking, and GDELT v2 conflict events. Features smart filters, layer toggles, click-to-inspect detail panels, and analytics counters. Prioritizes concrete data — movement vectors, strike counts, entity positions — over qualitative reporting. Built with Deck.gl + React + MapLibre + Express.

## Core Value

Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## Current Milestone: v1.5 LLM Reliability & Reveal Prep

**Goal:** Make the LLM enrichment pipeline production-stable on v3 with a NIM + OpenRouter chain, prove it's optional (map degrades cleanly to raw GDELT), purge ghost events with dead source URLs, and bring all three documentation surfaces (internal, public, API) up to date for the v1.6 reveal.

**Three tracks:**

1. **LLM reliability (v3 stabilization + LLM-optional architecture)**
   - Tighten the active provider chain to NIM + OpenRouter only; retire Cerebras + Groq from the v3 cascade (kept as deep-rollback safety only).
   - Investigate v3 NIM throttle behavior: pre-flight probes, batch-size tuning, retry/backoff, watchdog tuning.
   - LLM-optional: map renders cleanly on raw GDELT alone; backfill only when LLM is healthy.
   - Acceptance: `prod-connectivity-audit.yml` exit-0 for 3 consecutive runs (the gate that unblocks v1.6's deferred 999.5 load test).

2. **Ghost event cleanup**
   - Surface and prune events whose `sourceURL` is dead (404 / 403 / dead-host).
   - Outbound URL liveness probing or staleness tracking, dashboard-visible.

3. **Documentation cleanup — full sweep across all three surfaces**
   - Internal: CLAUDE.md trim (currently ~30k tokens), inline JSDoc + comments audit.
   - Public: README, 10 architecture markdown files (21 Mermaid diagrams), 676-line SRE runbook, 8 ADRs (+1 new ADR for the v3 + LLM-optional + chain-narrowing decision).
   - API: 1164-line OpenAPI 3.0.3 spec — add `/api/audit-status`, `/api/operator-status`, `/api/events/llm-pipeline`, `/api/events/llm-replay`, `/api/cron/refresh-events`.

**Out of scope for v1.5 (deferred to v1.6 or later):**

- Public reveal polish — v1.6 territory.
- 999.5 performance optimization + k6 load test — stays deferred; promotes after v1.5 hits its acceptance gate.
- v4 multi-provider router (intentionally rejected — no provider expansion).
- Cerebras + Groq as active providers (retired from v3 cascade).
- 27.3.3 water-name romanization — backlog.
- 999.1 / 999.2 / 999.4 backlog items — only pulled in if they directly block reliability.

**Predecessor:** ✅ v1.4 GDELT Redo & Performance — SHIPPED 2026-05-08 (18 phases). Audit at `.planning/milestones/v1.4-MILESTONE-AUDIT.md`. CHANGELOG entry `[v1.4]`.

## Requirements

### Validated

- ✓ 2.5D map with Deck.gl + MapLibre rendering, 3D terrain, pan/zoom/rotate — v0.9
- ✓ Multi-source flight tracking (OpenSky, ADS-B Exchange, adsb.lol) with tab-aware polling — v0.9
- ✓ Ship tracking via AIS data (~30s refresh) — v0.9
- ✓ Conflict event data via GDELT v2 (15-min polling, CAMEO classification) — v0.9
- ✓ Layer toggles for each entity type (flights, ground, unidentified, ships, 4 conflict categories) — v0.9
- ✓ Smart filters (nationality, speed, altitude, proximity, date range) — v0.9
- ✓ Detail panel on entity click (live stats, dual units, lost contact tracking) — v0.9
- ✓ Movement data display (speed, heading, altitude, coordinates) — v0.9
- ✓ Strike/sortie running counters dashboard with delta animations — v0.9
- ✓ Non-statistical news hidden by default with toggle — v0.9
- ✓ Dark theme with clean grid layout (black/white, accent colors) — v0.9
- ✓ Express API proxy for CORS, API key management, data normalization — v0.9
- ✓ Upstash Redis cache + Vercel serverless deployment — v1.0
- ✓ Key infrastructure sites overlay (nuclear, naval, oil, airbase, dam, port) via Overpass API — v1.1
- ✓ Multi-source news feed with conflict noise filtering (GDELT DOC, BBC, Al Jazeera) — v1.1
- ✓ Notification center with severity scoring, news matching, and 24h event default — v1.1
- ✓ Oil markets tracker with sparkline charts (Brent, WTI, XLE, USO, XOM) — v1.1
- ✓ Global search bar with entity filtering and bidirectional filter sync — v1.1
- ✓ Filter panel improvements (Reset All, grouped sections) and UI cleanup — v1.1
- ✓ Visualization layers (geographic, weather, threat density, political, ethnic, water stress) — v1.2 / v1.3
- ✓ Production hardening (Helmet CSP, per-endpoint rate limiting, structured logging, Redis fallback) — v1.2
- ✓ Multi-user load testing (k6 501 VUs + Playwright 3 workers) — v1.2
- ✓ Threat-density radial-gradient cluster heatmap with click-through detail panel — v1.3
- ✓ Pino structured logger + Zod-validated config + AppError envelope across 21 server modules — v1.3
- ✓ CI/CD: GitHub Actions, CodeQL, husky + lint-staged + gitleaks pre-commit — v1.3
- ✓ Portfolio surfaces: 564-line README, 10-file Mermaid architecture, 8 ADRs, SRE runbook — v1.3
- ✓ Structured LLM event extraction pipeline (v1 Cerebras / v2 watchdog / v3 NIM with parallel concurrency) — v1.4
- ✓ 6-path geocode resolver with 30-day Redis cache and 1-req/s Nominatim throttle — v1.4
- ✓ Daily eval harness against 50 ground-truth events + ~10 adversarial fixtures — v1.4
- ✓ Cron-driven pipeline trigger (`/api/cron/refresh-events` daily) with `waitUntil` durability — v1.4
- ✓ Cleanup sweep: 0 TypeScript errors, 0 lint errors, ghost code purged, env vars centralized — v1.4
- ✓ Domain rename to `otg-iran-monitor.vercel.app` + Bearer-bypass rate limiter + `API Health` dashboard — v1.4
- ✓ Manual-trigger `prod-connectivity-audit.yml` workflow with tier-green sidecar assertion — v1.4
- ✓ Audit-tier completeness: cron `lastTick` writers, Redis-first `probeLlmStatus`, honest `probeProbeOnly` — v1.4

### Active

See `.planning/REQUIREMENTS.md` for the full v1.5 requirement set with REQ-IDs and traceability to phases. Summary by track:

- LLM-RELI-\* — v3 stabilization, NIM + OpenRouter chain narrowing, LLM-optional architecture
- GHOST-\* — dead-source-URL probing and event pruning
- ACTOR-\* — actor metadata audit + canonical catalog + eval expansion + dashboard surface
- DOCS-INT-\* — internal docs (CLAUDE.md trim, JSDoc audit, Redis registry verification)
- REDIS-OPT-\* — Redis key inventory + classification + TTL right-sizing + budget delta
- DOCS-PUB-\* — public docs (README, architecture, runbook, ADR-0009, degradation contract)
- DOCS-API-\* — OpenAPI additions for 7 endpoints introduced in v1.4

### Out of Scope

- Significant persons tracking — complexity without clear data sources
- Push/desktop notifications — user monitors actively
- User authentication — personal tool, single user
- Historical playback/replay — live + snapshots covers use case
- Mobile app — web-first desktop monitoring tool
- Real-time chat or collaboration — solo tool
- News aggregation feed — contradicts "numbers over narratives" core value
- Prediction/forecasting — unreliable without classified data

## Context

Shipped through v1.4 (2026-05-08). 2193 vitest tests passing. 0 TypeScript errors. 0 lint errors / 18 advisory warnings. `api/vercel-entry.js` bundle 1.72 MB.
Tech stack: Vite 6, React 19, TypeScript 5.9, Zustand 5, Deck.gl 9, MapLibre 5, Tailwind CSS 4, Express 5, pino, Zod, Upstash Redis.
Data sources: OpenSky Network, adsb.lol (default), AISStream, GDELT v2, GDELT DOC 2.0, RSS (5 feeds), Yahoo Finance, Open-Meteo, Overpass API, WRI Aqueduct 4.0.
Coverage area: Greater Middle East — IRAN_BBOX `(south:0.0, north:50.0, west:20.0, east:80.0)`, IRAN_CENTER `(28.0, 45.0)` with 1200 NM ADS-B radius. Domain constants centralized at `src/lib/domain.ts` with byte-identical server mirror.
Visualization layers: Geographic (terrain + contours), Weather (wind barbs + temp heatmap), Political (3-faction), Ethnic (GeoEPR 2021), Water stress (WRI + Open-Meteo), Threat density (RadialGradientExtension).
LLM pipeline (v1.4): v3 default with NIM primary + OpenRouter fallback (v1 Cerebras / v2 Groq retained as deep-rollback only). Daily `/api/cron/refresh-events` at 04:00 UTC with `waitUntil`. 6-path geocode resolver with 30-day Redis cache. 50-event ground-truth eval + ~10 adversarial fixtures. Pitfall 1 cache bridge guarantees the map never goes blank when LLM is down.
CI/CD: GitHub Actions (lint + test + codecov + CodeQL), husky + lint-staged + gitleaks pre-commit, Vercel serverless deployment on project `onthegrid.icm` aliased at `otg-iran-monitor.vercel.app`. Manual-trigger `prod-connectivity-audit.yml` workflow with tier-green sidecar assertion at `audit:connectivity:last-result`.
Portfolio (v1.3 baseline, not yet refreshed for v1.4 — v1.5 docs sweep target): 564-line README with hero GIF, 10-file Mermaid architecture deep dive, 8 ADRs, 676-line SRE runbook, degradation contract, 1164-line OpenAPI 3.0.3 spec for 14 endpoints.

## Constraints

- **Data sources**: Public APIs only — no classified or paid intelligence feeds
- **Cost**: Free-tier APIs where possible (MapLibre over Mapbox, adsb.lol as default)
- **Platform**: Browser-based web application (React)
- **Single user**: No auth, no multi-tenancy, no collaboration features

## Key Decisions

| Decision                              | Rationale                                                                                                                                                                                                                      | Outcome                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Deck.gl + MapLibre for map            | GPU-accelerated 2.5D, free, native layer system                                                                                                                                                                                | ✓ Good — smooth rendering, zoom-responsive icons |
| React 19 + Vite 6 + Zustand 5         | Modern stack, fast HMR, minimal boilerplate                                                                                                                                                                                    | ✓ Good — curried store pattern works well        |
| Express 5 API proxy                   | CORS handling, API key protection, data normalization                                                                                                                                                                          | ✓ Good — clean adapter pattern                   |
| Mixed refresh rates                   | Flights ~5-30s, ships 30s, events 15min                                                                                                                                                                                        | ✓ Good — independent polling loops               |
| adsb.lol as default flight source     | Free, no API key, community-driven                                                                                                                                                                                             | ✓ Good — best out-of-box experience              |
| GDELT v2 over ACLED                   | Free, no auth, 15-min updates, CAMEO codes                                                                                                                                                                                     | ✓ Good — replaced ACLED which needs approval     |
| Hide non-stat news by default         | Core value is mathematical data, not narratives                                                                                                                                                                                | ✓ Good — clean default view                      |
| No people tracking                    | Dropped — unclear data sources, high complexity                                                                                                                                                                                | ✓ Good — kept scope manageable                   |
| Recursive setTimeout over setInterval | Prevents overlapping async fetches                                                                                                                                                                                             | ✓ Good — no race conditions                      |
| Tailwind CSS v4 CSS-first config      | No tailwind.config.js, @theme in CSS                                                                                                                                                                                           | ✓ Good — cleaner setup                           |
| TypeScript pinned to ~5.9.3           | Avoid TS 6.0 breaking changes                                                                                                                                                                                                  | ✓ Good — stable build                            |
| LLM pipeline v3 NIM + OpenRouter      | v1.4 cutover; bake-off locked qwen/qwen3.5-397b-a17b                                                                                                                                                                           | ⚠️ Revisit — reliability gate unmet, v1.5 target |
| Cron-driven extraction (not on-read)  | `/api/events` is cache-only; daily refresh @ 04:00 UTC                                                                                                                                                                         | ✓ Good — Pitfall 1 bridge keeps map populated    |
| Bearer-bypass on global rate limiter  | Operator dashboard surfaces require Bearer; bypass tier                                                                                                                                                                        | ✓ Good — per-endpoint tiers still enforced       |
| Domain `otg-iran-monitor.vercel.app`  | Old `irt-monitoring` retired; project `onthegrid.icm`                                                                                                                                                                          | ✓ Good — no traffic redirected, hard cutover     |
| Vercel Pro upgrade for v1.5           | 800s `maxDuration` (vs Hobby 300s) gives the daily LLM cron 2.7× wall-clock headroom; tunes against measured NIM throttle instead of around it. $20/mo accepted as v1.5 acceptance-gate enabler. Locks before Phase 30 starts. | — Pending (commit early in Phase 29)             |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-05-08 — milestone v1.5 LLM Reliability & Reveal Prep started (predecessor v1.4 GDELT Redo & Performance shipped same day; 18 phases; 999.5 load test deferred to v1.6 pending v1.5 acceptance gate of 3 consecutive `prod-connectivity-audit.yml` exit-0 runs)._
