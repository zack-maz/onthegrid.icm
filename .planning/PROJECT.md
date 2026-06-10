# Iran Monitor

## What This Is

A personal real-time intelligence dashboard for monitoring the Iran conflict and the Greater Middle East. Displays a 2.5D map with live data from three flight sources (OpenSky, ADS-B Exchange, adsb.lol), AIS ship tracking, GDELT v2 conflict events, structured LLM event extraction with canonical actor catalog + per-event `actorConfidence`, news clustering, oil markets, water stress, ethnic distribution, and threat density. Features smart filters, layer toggles, click-to-inspect detail panels, analytics counters, and a unified API Health dashboard with operator-only Bearer-gated actions (replay, prune, force-trigger). Prioritizes concrete data — movement vectors, strike counts, entity positions, dead-link counts, eval scores — over qualitative reporting. Built with Deck.gl + React + MapLibre + Express on Vercel Pro with Upstash Redis.

## Core Value

Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## Current State

**Shipped through v1.6 Production Hardening (2026-06-09).** 4 phases (38–41), 56/56 required requirements satisfied (1 optional CRON-WATCH-01 deferred to v1.7). Shipped to production via PR #40 (deploy `32017ef`). Six honest-signal LLM bug fixes + GDELT source matching; water-facility name romanization (`nameLatin`) through the Overpass Latin-label gate; safe Vercel Pro cleanup (risky vercel.ts/Build-Output migrations explicitly deferred per D-09); operator visibility — token-budget + cost-shadow surface and a Redis-backed LLM flight recorder (call-history + run-history rings surviving Fluid Compute cold starts); dashboard UI polish + API-Health subtab consolidation with WAI-ARIA tablist; and the public-reveal portfolio surface (first-visit IntroOverlay, re-openable driver.js GuidedTour, OG/Twitter share card, BUILDING-WITH-CLAUDE-CODE / SHOWCASE / JOURNEY / concepts / COSTS / operator-guide / LESSONS docs). Milestone audit PASSED; cross-phase integration verified; Phase 41 human-verified on live prod (intro/tour/OG/secrets).

**v2.0 progress:** Phase 42 (Water Filter Fix) complete 2026-06-10 — telemetry-diagnosed and fixed the name-blind, order-dependent spatial-dedup loop (exported pure `spatialDedup()`, name-aware + deterministic survivor), bumped `water:facilities:v3` → `v4` across all 10 lockstep surfaces, regenerated the cold-start snapshot (304 → 460 admitted facilities). WATER-FILTER-01..04 validated (8/8 must-haves verified).

**v1.6 milestone archives:** `.planning/milestones/v1.6-ROADMAP.md` · `.planning/milestones/v1.6-REQUIREMENTS.md` · `.planning/milestones/v1.6-MILESTONE-AUDIT.md` · `.planning/milestones/v1.6-phases/` · `CHANGELOG.md` §`[v1.6]`.

**v1.5 milestone archives:** `.planning/milestones/v1.5-ROADMAP.md` · `.planning/milestones/v1.5-REQUIREMENTS.md` · `.planning/milestones/v1.5-phases/` · `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` · `CHANGELOG.md` §`[v1.5]`.

## Current Milestone: v2.0 Final Hardening

**Goal:** Close out the production punch-list — fix the remaining data-quality bugs (water filter, ghost links), make the API-Health dashboard readable, prove ~100-concurrent-user capacity, and finish hardening + docs.

**Target features (operator-locked priority order):**

1. Water filter fix — facilities layer intermittently drops entries (admission gate / Latin-label gate / desalination synthesis path)
2. Event ghost links + events subtab — dead links slipping past URL-liveness prune; API-Health events subtab missing LLM pipeline details
3. Dashboard subtab cleanup — water/events/sites subtabs unreadable (dense layout, raw data dumps, weak contrast/typography); redesign for readability while keeping the off-the-grid military aesthetic (Claude's design recommendations accepted within existing style)
4. ~100 concurrent-user load test — k6 1–300 VU sweep (carry-forward Phase 999.5)
5. General hardening — rate-limiter public-global operator block (999.1), cron first-tick verification (999.3), CRON-WATCH-01 7-day cron stability watch, Nyquist coverage backfill for Phases 39/40
6. Docs cleanup pass after the above lands

**Key context:** Cleanup items become their own phases, not one bundled finishing-pass (per v1.6 priority-lock precedent). Versioned v2.0 by operator decision at milestone start (2026-06-09).

<details>
<summary>v1.0–v1.6 milestone history (archived)</summary>

- ✅ **v0.9 MVP** (Phases 1-12 + 8.1) — 2026-03-19. 2.5D map foundation, multi-source flights, AIS ships, GDELT v2 conflict events, smart filters, analytics counters.
- ✅ **v1.0 Deployment** (Phases 13-14) — 2026-03-20. Upstash Redis cache, AISStream on-demand, GDELT backfill, Vercel serverless.
- ✅ **v1.1 Intelligence Layer** (Phases 15-19.2) — 2026-03-22. Key infrastructure sites, news feed clustering, notification center, oil markets, tag-based search.
- ✅ **v1.2 Visualization & Hardening** (Phases 20-21.3) — 2026-03-29. Visualization layer architecture, GDELT quality pipeline, production hardening, multi-user load testing.
- ✅ **v1.3 Data Quality & Layers** (Phases 22-26.4) — 2026-04-09. Threat density heatmap with click-through clusters, Bellingcat OSINT, political + ethnic + water-stress layers, pino logger, OpenAPI 3.0.3, README hero, 8 ADRs, SRE runbook.
- ✅ **v1.4 GDELT Redo & Performance** (Phases 27-28.2.7) — 2026-05-08. Structured LLM extraction (Cerebras → Groq → NIM v3 with parallel concurrency limiter), 6-path geocode resolver, daily eval harness, cron-driven pipeline, cleanup sweep (0 TS errors), domain rename to `otg-iran-monitor.vercel.app`, unified API Health dashboard, audit workflow.
- ✅ **v1.5 LLM Reliability & Reveal Prep** (Phases 29-37) — 2026-06-03. NIM-only cascade (OpenRouter declared dormant), v1+v2 extractor deletion, Vercel Pro upgrade (800s maxDuration), LLM-optional proven, ghost-event URL liveness, actor metadata canonicalization, Redis registry drift gate, public docs sweep, OpenAPI extension, ADR-0010 milestone-final, LLM-RELI-07 acceptance gate.
- ✅ **v1.6 Production Hardening** (Phases 38-41) — 2026-06-09. Six honest-signal LLM bug fixes + GDELT source matching, water-facility romanization (`nameLatin`), safe Vercel Pro cleanup (risky migrations deferred), operator token-budget + cost-shadow surface, Redis-backed LLM flight recorder (call + run history surviving Fluid Compute cold starts), dashboard UI polish + API-Health subtab consolidation, public-reveal portfolio surface (IntroOverlay + driver.js GuidedTour + OG card + 7 portfolio docs). Shipped via PR #40 (deploy 32017ef); Phase 41 human-verified on live prod.

For per-phase detail, see `.planning/milestones/v[X.Y]-ROADMAP.md`.

</details>

## Requirements

### Validated

- ✓ 2.5D map with Deck.gl + MapLibre rendering, 3D terrain, pan/zoom/rotate — v0.9
- ✓ Multi-source flight tracking (OpenSky, ADS-B Exchange, adsb.lol) with tab-aware polling — v0.9
- ✓ Ship tracking via AIS data (~30s refresh) — v0.9
- ✓ Conflict event data via GDELT v2 (15-min polling, CAMEO classification) — v0.9
- ✓ Layer toggles for each entity type (flights, ground, unidentified, ships, 5 conflict categories) — v0.9
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
- ✓ LLM provider chain narrowed to NIM-only at runtime (OpenRouter dormant; Cerebras + Groq purged from cascade) — v1.5
- ✓ v1 + v2 extractor modules + `/api/events/llm-pipeline` override + `events:llm-pipeline-override` Redis key + DevApiStatus Pin buttons all deleted (~6,400 LOC) — v1.5
- ✓ Vercel Pro upgrade with `maxDuration: 800` (2.7× Hobby headroom) — v1.5
- ✓ LLM-optional architecture proven (raw GDELT via Pitfall 1 cache bridge when keys absent) — v1.5
- ✓ NIM throttle empirically characterized (`Retry-After` absent in 213 batches; `p95 = 33,263ms`); `LLM_BATCH_SIZE` / `LLM_V3_CONCURRENCY` / `callLLM` retry budget tuned against measurement — v1.5
- ✓ SIMPLIFY-01 incremental flush retired; SIMPLIFY-03 watchdog defaults relaxed against 800s ceiling — v1.5
- ✓ Cron stability validated single-day (Day 1 / 7 PASS; eval 0.98 at all radii; 0 breaker trips) — v1.5 _(caveat: 7-consecutive bar not met; Phase 31 closed early; reopening flagged for v1.6)_
- ✓ Ghost-event URL liveness end-to-end (probe sidecar + O(1) count sidecar + Bearer-gated prune + cron auto-prune with `attemptCount >= 3` gate + dashboard drill-down) — v1.5
- ✓ Polite-citizen URL probing (`createLimit(8)` + per-host 1 req/s throttle + ±200ms jitter + 10s timeout + 3-hop redirect cap + HEAD-then-GET-on-405 + identifying User-Agent) — v1.5
- ✓ Actor metadata canonicalization (27-entry catalog + `actorConfidence` schema + `applyCatalogToEvents` post-mapping + extended `SYSTEM_PROMPT_V3`) — v1.5
- ✓ Eval expansion (`actorMatchRate` + 3 adversarial actor-confusion injections + 50/50 ground-truth backfill) — v1.5
- ✓ API Health dashboard `actorQuality` block (4 counters + drill-down sample list capped at 20; degrade-open) — v1.5
- ✓ Multi-provider router fallback (Cerebras / Groq) — DEFERRED as `cerebras-groq-deferred`; planning artifacts preserved as ready-to-execute audit trail — v1.5
- ✓ 32-key Redis registry deep-dive at `docs/architecture/redis-keys.md` + mechanical drift gate (39 assertions × 4 sub-suites) — v1.5
- ✓ `events:llm:v3:partial` retired across 10 surfaces (SIMPLIFY-02; −358 LOC) — v1.5
- ✓ `freeClaudeRouter.ts` audited + documented alive (SIMPLIFY-05; 3 live production callers) — v1.5
- ✓ 7-module LLM-pipeline JSDoc audit (44 exports; 28 new one-liners + 16 verified) — v1.5
- ✓ CLAUDE.md trimmed to 5,018 tokens (−73.3%; phase-history bloat replaced with current-state invariants) — v1.5
- ✓ README sweep (rate-limit drift fix + ~99-line `## LLM Enrichment` section with 6 sub-blocks) — v1.5
- ✓ 12 architecture markdown files audited (7 edited + 5 verified-clean); 21 Mermaid diagrams audited (3 edited + 18 verified-clean) — v1.5
- ✓ Runbook §6 rewrite (Hobby 10s → Pro 800s) + §13-§16 SRE-template appendage for 4 incident playbooks — v1.5
- ✓ Degradation contract Pitfall 1 sub-section + `redis-death.test.ts` citation + ADR-0010 cross-link — v1.5
- ✓ ADR-0010 milestone-final (body rewritten end-to-end; 6 v1.5 sub-blocks; status line dated; v1.5 Milestone Close Rollup; closing decision table) — v1.5
- ✓ OpenAPI 3.0.3 spec extended 14 → 19 endpoints with split securitySchemes (`cronSecret` + `operatorBearer`) + 4 reusable schemas + Redocly drift gate — v1.5
- ✓ LLM-RELI-07 acceptance gate satisfied (3 consecutive `prod-connectivity-audit.yml` greens 2026-06-01 → 2026-06-03) — v1.5
- ✓ 4 architectural unblocker PRs (PR #32 / #33 / #34 / #35) correcting Phase 28.2.5 D-09 strict-tier-green gate vs ADR-0010 LLM-optional architecture mismatches — v1.5
- ✓ Honest single-source health/audit signals (`cache-fallback-active:` vs `llm-optional-fallback-active:` probe tokens; degraded-not-unknown Open-Meteo precip sentinel; null-vs-0 `actorMatchRate`; degrade-open replay-quota 503) — v1.6 (Phase 38, LLM-FIX-01..06)
- ✓ LLM-PURGE Phase 29 finishing pass (v1/v2 Zod schemas + `pipelineAudit` writer + `PipelineFlipsBlock` + Cerebras/Groq env+config + OpenRouter daily-cap dead writers deleted; zero dangling importers, typecheck-gated) — v1.6 (Phase 38, LLM-PURGE-01..09)
- ✓ GDELT corpus quality: read-only corpus audit + high-confidence pre-enrichment dedup (actor+CAMEO+day+≤5km+Jaccard≥0.85, size-2 cohort targeted, 6–9 tail preserved) + generalized three-gate OSINT corroboration + additive tier×corroboration×specificity composite rescore (non-mutating dashboard re-order) — v1.6 (Phase 38, GDELT-MATCH-01..04)
- ✓ Water-facility name romanization (`transliteration@2.6.1`, searchable-token bar) injected BEFORE the Latin-label admission gate; `nameLatin` surfaced with `nameOriginal` preserved across detail panel / WaterTooltip / search — v1.6 (Phase 38, WATER-LATIN-01..04)
- ✓ Vercel Pro reconciliation: Fluid Compute compat verified on `createApp()` factory; Hobby-era docs-drift ("Hobby cap 3" / "10s" / "60s") purged across 5 surfaces; CLI 52→54.9.0; `vercel.ts` + Build Output API migrations deferred-with-rationale (D-09) — v1.6 (Phase 38, VERCEL-PRO-01..04)
- ✓ Operator visibility: Bearer-gated per-provider token-budget proximity bars (soft 0.8 / hard 0.95) + today's cost-shadow USD (`BudgetBlock`); `tokenBudget` field on `/api/operator-status` (degrade-open, Zod `.strict()`-pinned); Redis-backed LLM flight recorder (`llm:calls:history` 500/30d + `llm:runs:history` 200/30d, cold-start hydration) with Bearer-gated `GET /api/events/llm-history` + per-run `runId` back-correlation; `FlightRecorderBlock` run→call→detail drill-down with honest outcome badge + populated eval pill (SC39-3 gap-closure WR-01/04/05) — v1.6 (Phase 39, BUDGET-01..04, OBS-FLIGHT-01..06)

### Active

Being defined for v2.0 Final Hardening at `/gsd-new-milestone` 2026-06-09. Detailed REQ-IDs grouped by category will live in `.planning/REQUIREMENTS.md`. Roadmap mapping at `.planning/ROADMAP.md`.

### Out of Scope

- Significant persons tracking — complexity without clear data sources
- Push/desktop notifications — user monitors actively
- User authentication — personal tool, single user (Bearer header is operator-only access control, not user auth)
- Historical playback/replay — live + snapshots covers use case
- Mobile app — web-first desktop monitoring tool
- Real-time chat or collaboration — solo tool
- Prediction/forecasting — unreliable without classified data
- v4 multi-provider router — operator-rejected at v1.5 start; would need a new milestone-start decision to revisit
- Cerebras + Groq as active LLM providers — purged from runtime cascade in v1.5; restoration would be its own phase

## Context

Shipped through v1.5 (2026-06-03). ~2,386 vitest tests passing. 0 TypeScript errors. 0 lint errors. `api/vercel-entry.js` bundle ~1.73 MB (+10,739 bytes vs v1.4; JSDoc additions outweigh SIMPLIFY-02 deletes; negligible on 1.7MB baseline). 92,501 LOC across `src/`, `server/`, `scripts/`, `api/`.

**Tech stack:** Vite 6, React 19, TypeScript 5.9, Zustand 5, Deck.gl 9, MapLibre 5, Tailwind CSS 4, Express 5, pino, Zod, Upstash Redis (REST client), tsup (server bundle), Redocly (OpenAPI lint), vitest (drift gates).

**Data sources:** OpenSky Network, ADS-B Exchange (via RapidAPI), adsb.lol (default), AISStream, GDELT v2 events export, GDELT DOC 2.0, RSS (5 feeds), Bellingcat RSS, Yahoo Finance (commodities), Open-Meteo (precipitation), Overpass API (sites + water), WRI Aqueduct 4.0 (basin stress), Natural Earth (political boundaries), GeoEPR 2021 (ethnic groups).

**Coverage area:** Greater Middle East — `IRAN_BBOX (south:0.0, north:50.0, west:20.0, east:80.0)`, `IRAN_CENTER (28.0, 45.0)` with 1200 NM `ADSB_RADIUS_NM`. Domain constants centralized at `src/lib/domain.ts` with byte-identical mirror in `server/config.ts` (drift test in `src/__tests__/domain.test.ts`). `WAR_START = 2026-02-28`.

**Visualization layers:** Geographic (terrain + contours), Weather (wind barbs + temp heatmap), Political (3-faction Natural Earth), Ethnic (GeoEPR 2021 hatched overlays), Water stress (WRI + Open-Meteo), Threat density (RadialGradientExtension + BFS clustering with click-through detail).

**LLM pipeline (v1.5 shipped):** v3 single extractor (`server/lib/llmEventExtractor.v3.ts`). NIM-only active cascade (`qwen-235b` instruct); OpenRouter dormant after probe (90% free-tier rate-limited per Phase 30.1). Cerebras + Groq purged from runtime path. Reliability primitives intact: circuit breaker (`server/lib/llmCircuitBreaker.ts`, sliding 10-call window), DLQ (`server/lib/llmDLQ.ts`, 200-entry SADD bounded set, 7d TTL), token budget (`server/lib/llmTokenBudget.ts`, soft 0.8 / hard 0.95), watchdog (`server/lib/llmExtractorWatchdog.ts`, 90s hard-kill / 60s soft-warn relaxed against 800s Pro ceiling per Phase 30 SIMPLIFY-03). 6-path geocode resolver. 50-event ground-truth eval + ~10 adversarial fixtures. Daily 04:00 UTC `/api/cron/refresh-events` is the sole writer. `/api/events` is cache-only. Pitfall 1 cache bridge guarantees the map never goes blank when LLM is down (raw GDELT terminal fallback per ADR-0010).

**CI/CD:** GitHub Actions (lint + test + codecov + CodeQL + OpenAPI lint), husky + lint-staged + gitleaks pre-commit, Vercel Pro serverless deployment on project `otg-iran-monitor` aliased at `otg-iran-monitor.vercel.app`. Manual-trigger `prod-connectivity-audit.yml` workflow with tier-green sidecar assertion at `audit:connectivity:last-result` (v1.5 PR #34 truth table: critical strict-`healthy`; non-critical accepts `healthy | degraded | unknown`).

**Portfolio surfaces:** 564-line README (rate-limit drift fixed + ~99-line `## LLM Enrichment` section with 6 sub-blocks). 12 architecture markdown files / 21 Mermaid diagrams (all current; all rendering natively on GitHub). 676-line SRE runbook (§6 rewrite + §13-§16 SRE-template appendage for 4 incident playbooks: NIM throttle, cron architecture, force-trigger, prod-audit retry). 9 ADRs (`docs/adr/0001` through `0011`; `0010` is the v1.5 milestone-final canonical decision record). Degradation contract (Pitfall 1 sub-section). 19-endpoint OpenAPI 3.0.3 spec with split securitySchemes (`cronSecret` + `operatorBearer`) + 4 reusable schemas + Redocly drift gate. 32-key Redis registry deep-dive at `docs/architecture/redis-keys.md` + mechanical drift gate (39 assertions × 4 sub-suites).

## Constraints

- **Data sources**: Public APIs only — no classified or paid intelligence feeds.
- **Cost**: Free-tier APIs where possible (MapLibre over Mapbox, adsb.lol as default). Vercel Pro ($20/mo) accepted in v1.5 as acceptance-gate enabler. NIM is a free instruct-model endpoint; OpenRouter free tier was probed dormant in v1.5.
- **Platform**: Browser-based web application (React + Vite + Tailwind v4 CSS-first).
- **Single user**: No auth, no multi-tenancy, no collaboration features. Bearer header is operator-only access control, not user auth.

## Key Decisions

| Decision                                      | Rationale                                                                                                                                                                                               | Outcome                                                                    |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Deck.gl + MapLibre for map                    | GPU-accelerated 2.5D, free, native layer system                                                                                                                                                         | ✓ Good — smooth rendering, zoom-responsive icons                           |
| React 19 + Vite 6 + Zustand 5                 | Modern stack, fast HMR, minimal boilerplate                                                                                                                                                             | ✓ Good — curried store pattern works well                                  |
| Express 5 API proxy                           | CORS handling, API key protection, data normalization                                                                                                                                                   | ✓ Good — clean adapter pattern                                             |
| Mixed refresh rates                           | Flights ~5-30s, ships 30s, events 15min                                                                                                                                                                 | ✓ Good — independent polling loops                                         |
| adsb.lol as default flight source             | Free, no API key, community-driven                                                                                                                                                                      | ✓ Good — best out-of-box experience                                        |
| GDELT v2 over ACLED                           | Free, no auth, 15-min updates, CAMEO codes                                                                                                                                                              | ✓ Good — replaced ACLED which needed approval                              |
| Hide non-stat news by default                 | Core value is mathematical data, not narratives                                                                                                                                                         | ✓ Good — clean default view                                                |
| No people tracking                            | Dropped — unclear data sources, high complexity                                                                                                                                                         | ✓ Good — kept scope manageable                                             |
| Recursive setTimeout over setInterval         | Prevents overlapping async fetches                                                                                                                                                                      | ✓ Good — no race conditions                                                |
| Tailwind CSS v4 CSS-first config              | No tailwind.config.js, @theme in CSS                                                                                                                                                                    | ✓ Good — cleaner setup                                                     |
| TypeScript pinned to ~5.9.3                   | Avoid TS 6.0 breaking changes                                                                                                                                                                           | ✓ Good — stable build                                                      |
| LLM pipeline v3 NIM-only (v1.5)               | v1.4 cutover bake-off locked qwen-235b; v1.5 Phase 30.1 probe declared OpenRouter dormant after 90% free-tier rate-limit failure                                                                        | ✓ Good — docs match shipped reality; honest single-provider posture        |
| Cron-driven extraction (not on-read)          | `/api/events` is cache-only; daily refresh @ 04:00 UTC                                                                                                                                                  | ✓ Good — Pitfall 1 bridge keeps map populated                              |
| Bearer-bypass on global rate limiter          | Operator dashboard surfaces require Bearer; bypass tier                                                                                                                                                 | ✓ Good — per-endpoint tiers still enforced                                 |
| Domain `otg-iran-monitor.vercel.app`          | Old `irt-monitoring` retired; Vercel project `otg-iran-monitor`                                                                                                                                         | ✓ Good — no traffic redirected, hard cutover                               |
| Vercel Pro upgrade (v1.5)                     | $20/mo accepted as v1.5 acceptance-gate enabler; 800s `maxDuration` (vs Hobby 300s) gives daily LLM cron 2.7× wall-clock headroom; tunes _against_ measured NIM throttle, not _around_ it               | ✓ Good — gate satisfied; Phase 30 tuning bedded in                         |
| v1 + v2 extractor deletion (v1.5)             | Deep-rollback lock from Phase 27.4 D-26/D-40 superseded; rollback path is `git revert <Phase 29 commit range>`, not a Bearer-POST flip; ~6,400 LOC removed                                              | ✓ Good — Pipeline override surface gone; v3-or-nothing is mechanical       |
| Phase 31 early close (v1.5)                   | Day-1 PASS captured; Days 2–7 not pursued under operator decision                                                                                                                                       | ⚠️ Revisit — slow-burn regression surfaced during Phase 37; reopen in v1.6 |
| Phase 34 deferral as `cerebras-groq-deferred` | Operator chose to skip provisioning free-tier accounts; empirical "no provider expansion right now" is a load-bearing outcome (mirrors Phase 30.1 `nim-only` precedent)                                 | — Pending — planning artifacts preserved as ready-to-execute audit trail   |
| Phase 28.2.5 D-09 gate relaxation (Phase 37)  | Original strict-tier-green gate flagged correct LLM-optional behavior as failures; PR #34 relaxed non-critical tier to accept `healthy \| degraded \| unknown`; critical tier strict-`healthy` retained | ✓ Good — gate observable; 3-greens captured 2026-06-03                     |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---

_Last updated: 2026-06-10 after Phase 42 (Water Filter Fix) completion. Six target features locked in operator priority order (water filter / ghost links + events subtab / dashboard subtab cleanup / ~100-user load test / general hardening / docs cleanup). v1.6 archives at `.planning/milestones/v1.6-*`._
