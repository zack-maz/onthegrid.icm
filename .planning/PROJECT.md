# Iran Monitor

## What This Is

A personal real-time intelligence dashboard for monitoring the Iran conflict and the Greater Middle East. Displays a 2.5D map with live data from three flight sources (OpenSky, ADS-B Exchange, adsb.lol), AIS ship tracking, GDELT v2 conflict events, structured LLM event extraction with canonical actor catalog + per-event `actorConfidence`, news clustering, oil markets, water stress, ethnic distribution, and threat density. Features smart filters, layer toggles, click-to-inspect detail panels, analytics counters, and a unified API Health dashboard with operator-only Bearer-gated actions (replay, prune, force-trigger). Prioritizes concrete data — movement vectors, strike counts, entity positions, dead-link counts, eval scores — over qualitative reporting. Built with Deck.gl + React + MapLibre + Express on Vercel Pro with Upstash Redis.

## Core Value

Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## Current State

**Shipped through v1.5 LLM Reliability & Reveal Prep (2026-06-03).** 10 phases (29–37 incl. 30.1), 60 plans executed, 209 commits, 24-day span. The LLM enrichment pipeline is production-stable on v3 with a NIM-only active cascade (OpenRouter declared dormant after probe-driven evidence of 90% free-tier rate-limit failure). The map is proven LLM-optional — when `NVIDIA_NIM_API_KEY` is absent, `/api/events` serves raw GDELT through the Pitfall 1 cache bridge and the map never goes blank. Ghost-event URL liveness ships as a Bearer-gated operator surface (probe sidecar + count sidecar + prune endpoint + dashboard drill-down). Actor metadata enrichment ships with a canonical 27-entry catalog and per-event `actorConfidence`. All three documentation surfaces (internal CLAUDE.md / Redis registry / JSDoc; public README / architecture / runbook / degradation; API OpenAPI 3.0.3) are current. ADR-0010 captures the milestone-final shipped state. LLM-RELI-07 acceptance gate satisfied (3 consecutive `prod-connectivity-audit.yml` greens), unblocking v1.6 promotion.

**v1.5 milestone archives:** `.planning/milestones/v1.5-ROADMAP.md` · `.planning/milestones/v1.5-REQUIREMENTS.md` · `.planning/milestones/v1.5-phases/` · `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` · `CHANGELOG.md` §`[v1.5]`.

## Current Milestone: v1.6 Production Hardening

**Goal:** Fix the LLM-pipeline reliability gaps surfaced at v1.5 close, tighten GDELT event-source matching, give the operator dashboard a budget/cost surface and a polish pass, then ship the public-reveal portfolio surface.

**Target features (operator-locked priority order, 2026-06-03):**

1. **Phase 38 — LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup** _(merged track; operator decision: assess LLM + GDELT quality together)_
   - LLM bugs surfaced at v1.5 close: `lastErrorReason` token split (`server/routes/health.ts:170`), Open-Meteo cache-write policy (`server/routes/water.ts:359`), `events.test.ts` v1→v3 mock drift, chaos-mock coverage gap for raw `redis.incr/sadd/scan/zadd/hset/hincrby/lpush`, `33-AUDIT-REPORT.md` stub causing silent `actorMatchRate: 0`.
   - Phase 29 finishing pass — dead-code purge (`llmEventExtractor.ts` stub, v1/v2 Zod schemas, `pipelineAudit.ts` writer, `llm-provider.ts` shim, stale headers across v3 + events route, `freeClaudeRouter.ts` OpenRouter daily-cap counter, `CEREBRAS_API_KEY` + `GROQ_API_KEY` env vars, `replayQuota.ts` Cerebras-anchored threat model).
   - **Cerebras + Groq source-file removal** from `server/adapters/` — folds in here (no separate dead-code phase).
   - GDELT event-source matching improvements — Phase-22-style audit of current quality, better dedup of GDELT mentions, tighter coupling between GDELT-DOC clusters and events, source-tier-aware confidence rescore.
   - **Water-facility name romanization** (Phase 27.3.3 carry-forward from v1.3 — now in scope) — ICU/transliteration pass on non-Latin facility names; preserve original `name` field, add `nameLatin`; Overpass adapter applies before the Latin-label admission gate.
   - **Vercel Pro cleanup-and-repair (Strand B from former 999.6)** — `vercel.json → vercel.ts` migration evaluation, Vercel Build Output API for `api/vercel-entry.js` artifact (closes Phase 999.2 if pursued), Fluid Compute compatibility verification on the Express factory, CLI bump 52→latest, Hobby→Pro docs-drift repair (CLAUDE.md:101, deployment.md:56/133, runbook.md:539-547, degradation.md:329, reliability-doc header).
   - **MAY include** Phase 31 reopening (7-day cron stability watch, finished properly this time) — operator-discretion at `/gsd-discuss-phase`.
   - **MAY include** the `docs sync` first-task bundle (drift bugs #1-7 + OpenAPI gap #16 + reliability-doc header inconsistency #20).

2. **Phase 39 — Operator Visibility (Budget + Cost + LLM Flight Recorder)** _(new feature; absorbs Phase 27.4.5 LLM observability)_
   - `BudgetBlock` in `DevApiStatus.tsx` surfacing `llm:tokens:{provider}:YYYY-MM-DD` per-provider used vs cap, soft (0.8) / hard (0.95) threshold proximity, historical trend.
   - Cost-shadow accrual surface from `events:llm-cost-shadow:v3:{YYYY-MM-DD}` (HSET `tokensIn` / `tokensOut` / `usdMicrocents`).
   - **LLM Flight Recorder (Phase 27.4.5 absorbed)** — Redis-backed call history ring buffer (`llm:calls:history`, 500-entry LTRIM, 30d TTL) replacing in-memory last-20 + per-run summary records (`llm:runs:history`, 200-run LTRIM) + `GET /api/events/llm-history` Bearer-gated endpoint + DevApiStatus FlightRecorderBlock with run drill-down + run ID threading through `runRefreshExtraction`. Cold-start hydration survives Vercel Fluid Compute warm-start gaps. Adapted to v3-only pipeline (original todo references v1/v2 — now obsolete).
   - All three blocks surface via Bearer-gated `/api/operator-status` reads, mirroring the existing `actorQuality` block pattern.

3. **Phase 40 — Dashboard UI/UX Polish + Subtab Consolidation** _(UI polish)_
   - Tab navigation, spacing, typography, color refinements on `DevApiStatus.tsx` (10+ accumulated sub-blocks through Phase 32/33/35).
   - Sub-block consolidation (tier summary, per-endpoint quality, retry, fetch sparkline, eval scoreblock, operator actions, advEval, actorQuality, dead-URL count + drill-down, pin TTL, byBearer).
   - Produces UI-SPEC.md via `gsd-ui-phase` before `gsd-plan-phase`.
   - `frontend-design` skill drives the polish pass.

4. **Phase 41 — Public Reveal Polish** _(final phase; absorbs former 999.6 Strand A)_
   - Portfolio-docs deliverables: `docs/BUILDING-WITH-CLAUDE-CODE.md` (the agentic-dev meta-story), `docs/SHOWCASE.md` (guided tour hub), `docs/JOURNEY.md` (product arc narrative + Mermaid gantt), `docs/concepts.md` (~30-term glossary), `docs/COSTS.md` (transparency: Vercel Pro $20/mo + Claude Code dev cost honest accounting), `docs/operator-guide.md` (visitor how-to), `docs/LESSONS.md` (distilled retrospective), `docs/timeline.md` (or fold into JOURNEY).
   - `public/screenshots/` extension — ~10 layer-by-layer screenshots; `npm run capture:layers` for reproducibility.
   - Brainstorms cleanup — `docs/brainstorms/` + `docs/superpowers/` consolidation/cross-link/archive decision.
   - REVEAL-01 + REVEAL-02 user-facing reveal work — landing-page polish, demo flows, social-share assets, custom-domain decision.
   - **Final-sweep requirement (from former 999.6 CONTEXT):** re-run the v1.5-close 2nd-pass code + docs audit against then-current main before any docs land — by Phase 41 promotion, Phase 38/39/40 will have moved things and the `project-v1-6-cleanup-punchlist` + `project-v1-6-docs-drift` memories will be partially stale. Merge net-new findings into Phase 41 scope; drop captured-but-resolved items.

**Phase numbering:** continues from v1.5 (last phase 37) → v1.6 starts at Phase 38.

**Parallelization hint:** Phase 38 + 39 can interleave (both touch LLM surfaces); 40 + 41 are independent of each other and of the LLM track once the dashboard data shape is settled.

**Deferred to backlog or later milestones:**

- **Phase 999.5** — Performance Optimization + 1–300 VU k6 sweep stays in backlog at `.planning/phases/999.5-performance-load-test/`. Promotion gate (3 consecutive `prod-connectivity-audit.yml` greens) was mechanically satisfied in Phase 37; operator deferred promotion at v1.6 lock-in to prioritize reliability + UI work first.
- **Phase 999.6** — RETIRED from backlog. Strand A (portfolio docs) folded into Phase 41. Strand B (Vercel Pro cleanup) folded into Phase 38.
- **Phase 999.1 / 999.2 / 999.3** — parked v1.4 carry-forwards; re-evaluate at v1.7 or fold in if scope alignment surfaces during Phase 38 drafting.
- **`news:feed` cron warmer** — folds into Phase 38 if scope allows; otherwise carries.

**Out of scope for v1.6 (carry to v1.7 or later):**

- v4 multi-provider router — operator-rejected at v1.5 start; would need a new milestone-start decision.
- "Phase 29 finishing pass" as a single bundled PR — broken across priority-aligned phases (Phase 38 absorbs the LLM-side dead code; Phase 41 absorbs the docs cleanup).
- Standalone Cerebras + Groq removal phase — folded into Phase 38 dead-code pass.

<details>
<summary>v1.0–v1.5 milestone history (archived)</summary>

- ✅ **v0.9 MVP** (Phases 1-12 + 8.1) — 2026-03-19. 2.5D map foundation, multi-source flights, AIS ships, GDELT v2 conflict events, smart filters, analytics counters.
- ✅ **v1.0 Deployment** (Phases 13-14) — 2026-03-20. Upstash Redis cache, AISStream on-demand, GDELT backfill, Vercel serverless.
- ✅ **v1.1 Intelligence Layer** (Phases 15-19.2) — 2026-03-22. Key infrastructure sites, news feed clustering, notification center, oil markets, tag-based search.
- ✅ **v1.2 Visualization & Hardening** (Phases 20-21.3) — 2026-03-29. Visualization layer architecture, GDELT quality pipeline, production hardening, multi-user load testing.
- ✅ **v1.3 Data Quality & Layers** (Phases 22-26.4) — 2026-04-09. Threat density heatmap with click-through clusters, Bellingcat OSINT, political + ethnic + water-stress layers, pino logger, OpenAPI 3.0.3, README hero, 8 ADRs, SRE runbook.
- ✅ **v1.4 GDELT Redo & Performance** (Phases 27-28.2.7) — 2026-05-08. Structured LLM extraction (Cerebras → Groq → NIM v3 with parallel concurrency limiter), 6-path geocode resolver, daily eval harness, cron-driven pipeline, cleanup sweep (0 TS errors), domain rename to `otg-iran-monitor.vercel.app`, unified API Health dashboard, audit workflow.
- ✅ **v1.5 LLM Reliability & Reveal Prep** (Phases 29-37) — 2026-06-03. NIM-only cascade (OpenRouter declared dormant), v1+v2 extractor deletion, Vercel Pro upgrade (800s maxDuration), LLM-optional proven, ghost-event URL liveness, actor metadata canonicalization, Redis registry drift gate, public docs sweep, OpenAPI extension, ADR-0010 milestone-final, LLM-RELI-07 acceptance gate.

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

Defined for v1.6 Production Hardening at `/gsd:new-milestone` 2026-06-03. Detailed REQ-IDs grouped by category live in `.planning/REQUIREMENTS.md` (LLM-PIPE, BUDGET, UI, REVEAL). Roadmap mapping at `.planning/ROADMAP.md`.

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

_Last updated: 2026-06-04 — Phase 40 (Dashboard UI/UX Polish + Subtab Consolidation) complete: 4/4 plans, 5 requirements validated (UI-POLISH-01..05), 3/3 success criteria verified. The API Health tab (`DevApiStatusAllApisTab`) went from ~13 stacked sub-blocks to a read-only hero header + 4 collapsible groups (`group-${slug}` endpoint-health/llm-pipeline/budget-cost/operator-actions) + an operator-controls drawer (Replay/Prune relocated, default-closed); 3 `--color-status-*` tokens added through the D-13 colorBridge single-source pipeline; tab-bar affordances (focus-visible ring, 2px accent active indicator, roving-tabindex keyboard nav, tabpanel ARIA); BudgetBlock/FlightRecorderBlock converted to muted-placeholder degrade. Agent-native parity verified PASS (executor static pass + `agent-native-reviewer`, operator-approved in-session). 8 RTL render-contract assertions + consolidated-layout snapshot regression-lock it. Code review (0 critical, 6 warning, 5 info; the 2 load-bearing warnings out of scope — WR-01 spec-mandated byte-identical color rename with zero visual change, WR-05 sparkline name-mismatch predates Phase 28.2; 4 introduced warnings WR-02/03/04/06 deferred to an optional `--fix` pass). Full suite 2511 passing, tsc -b clean. Next: Phase 41 Public Reveal Polish (REVEAL-DOCS-01..10, REVEAL-SITE-01..04). v1.6 progress: 38 ✓; 39 ✓; 40 ✓; 41 pending. Operator-locked priority order per `project-v1-6-priorities` memory: LLM fixes > budget visibility > UI polish > public reveal. Phase 999.5 stays in backlog (operator deferred promotion). Numbering continues from v1.5 phase 37._
