# Iran Conflict Monitor

## What This Is

A personal real-time intelligence dashboard for monitoring the Iran conflict and the Greater Middle East. Displays a 2.5D map with live data from three flight sources (OpenSky, ADS-B Exchange, adsb.lol), AIS ship tracking, and GDELT v2 conflict events. Features smart filters, layer toggles, click-to-inspect detail panels, and analytics counters. Prioritizes concrete data — movement vectors, strike counts, entity positions — over qualitative reporting. Built with Deck.gl + React + MapLibre + Express.

## Core Value

Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## Current Milestone: ✅ v1.4 GDELT Redo & Performance — SHIPPED 2026-05-08

**Outcome:** Conflict event pipeline rebuilt around a structured LLM extraction layer (Cerebras → Groq → NIM v3) with daily cron-driven refresh, durable-dispatch via Vercel `waitUntil`, two-key cache discipline, 6-path geocode resolver, daily eval harness against 50 ground-truth events, adversarial robustness fixtures, circuit-breaker + DLQ + token-budget primitives. Performance & operational hardening sweep complete: cleanup pass, dev/prod sync (domain rename to `otg-iran-monitor.vercel.app`), Bearer-bypass rate limiter, dashboard surface unified into `API Health` tab, manual-trigger `prod-connectivity-audit.yml` with tier-green assertion, audit-tier completeness (cron `lastTick` writers + Redis-first `probeLlmStatus` + honest-stub `probeProbeOnly`).

**Delivered (18 phases):** 27 → 27.1 → 27.2 → 27.3 → 27.3.1 → 27.3.2 → 27.4 → 27.4.1 → 27.4.2 → 27.4.3 → 27.4.4 → 27.4.6 → 28 → 28.1 → 28.2 → 28.2.5 → 28.2.6 → 28.2.7.

**Deferred to backlog (Phase 999.5, was 28.3):** Performance optimization + 1–300 VU k6 sweep. Promotes when `prod-connectivity-audit.yml` is exit-0 green for 3 consecutive runs. Decision lock preserved at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`.

**Audit:** see `.planning/v1.4-MILESTONE-AUDIT.md`. **Changelog entry:** see `CHANGELOG.md` `[v1.4]` section.

**Next milestone (v1.5):** scoped at the next `/gsd-new-milestone` invocation — operator-driven theme selection from the deferred-work pool (Telegram OSINT, GDELT BigQuery, satellite imagery, water-facility romanization, performance load test promotion).

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

### Active

- [ ] Key infrastructure sites overlay (nuclear, naval, oil, airbase, dam, port) via Overpass API
- [ ] Multi-source news feed with conflict noise filtering (GDELT DOC, BBC, Al Jazeera)
- [ ] Notification center with severity scoring, news matching, and 24h event default
- [ ] Oil markets tracker with sparkline charts (Brent, WTI, XLE, USO, XOM)
- [ ] Global search bar with entity filtering
- [ ] Filter panel improvements (Reset All, grouped sections) and UI cleanup

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

Shipped through v1.3 with 41,709 LOC TypeScript across 288 files. 1283 tests passing across 101 files.
Tech stack: Vite 6, React 19, TypeScript 5.9, Zustand 5, Deck.gl 9, MapLibre 5, Tailwind CSS 4, Express 5, pino, Zod, Upstash Redis.
Data sources: OpenSky Network, adsb.lol (default), AISStream, GDELT v2, GDELT DOC 2.0, RSS (5 feeds), Yahoo Finance, Open-Meteo, Overpass API, WRI Aqueduct 4.0.
Coverage area: Greater Middle East (15-42°N, 30-70°E) with 500 NM radius ADS-B queries from Iran center.
Visualization layers: Geographic (terrain + contours), Weather (wind barbs + temp heatmap), Political (3-faction), Ethnic (GeoEPR 2021), Water stress (WRI + Open-Meteo), Threat density (RadialGradientExtension).
CI/CD: GitHub Actions (lint + test + codecov + CodeQL), husky + lint-staged + gitleaks pre-commit, Vercel serverless deployment.
Portfolio: 564-line README with hero GIF, 10-file Mermaid architecture deep dive, 8 ADRs, SRE runbook, degradation contract.

## Constraints

- **Data sources**: Public APIs only — no classified or paid intelligence feeds
- **Cost**: Free-tier APIs where possible (MapLibre over Mapbox, adsb.lol as default)
- **Platform**: Browser-based web application (React)
- **Single user**: No auth, no multi-tenancy, no collaboration features

## Key Decisions

| Decision                              | Rationale                                             | Outcome                                          |
| ------------------------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| Deck.gl + MapLibre for map            | GPU-accelerated 2.5D, free, native layer system       | ✓ Good — smooth rendering, zoom-responsive icons |
| React 19 + Vite 6 + Zustand 5         | Modern stack, fast HMR, minimal boilerplate           | ✓ Good — curried store pattern works well        |
| Express 5 API proxy                   | CORS handling, API key protection, data normalization | ✓ Good — clean adapter pattern                   |
| Mixed refresh rates                   | Flights ~5-30s, ships 30s, events 15min               | ✓ Good — independent polling loops               |
| adsb.lol as default flight source     | Free, no API key, community-driven                    | ✓ Good — best out-of-box experience              |
| GDELT v2 over ACLED                   | Free, no auth, 15-min updates, CAMEO codes            | ✓ Good — replaced ACLED which needs approval     |
| Hide non-stat news by default         | Core value is mathematical data, not narratives       | ✓ Good — clean default view                      |
| No people tracking                    | Dropped — unclear data sources, high complexity       | ✓ Good — kept scope manageable                   |
| Recursive setTimeout over setInterval | Prevents overlapping async fetches                    | ✓ Good — no race conditions                      |
| Tailwind CSS v4 CSS-first config      | No tailwind.config.js, @theme in CSS                  | ✓ Good — cleaner setup                           |
| TypeScript pinned to ~5.9.3           | Avoid TS 6.0 breaking changes                         | ✓ Good — stable build                            |

---

_Last updated: 2026-04-26 after Phase 27.4.3 close (free-claude-code routing evaluation — 5/6 plans full + 1 partial; vendored NVIDIA NIM + OpenRouter router at server/lib/freeClaudeRouter.ts; v3 enrichment pipeline shipped under env override (LLM_PIPELINE_V3=true); 7-block DevApiStatus v3 dashboard + Topbar pill v3; D-17 auto-rollback wired and FIRED CORRECTLY in production during Gate B (watchdog_recurrence trigger); bake-off scored 7 NVIDIA NIM candidates, locked qwen/qwen3.5-397b-a17b winner; Gate A passed (0.940 eval parity); Gate B FAILED on latency (p99 929s, 11 watchdog timeouts, 218min duration) — cutover deferred to future phase, pipeline override safe on v2; D-21 rollback safety preserved; phase 27.4.2 HUMAN-UAT tests 1+2 remain open pending future cutover)_
