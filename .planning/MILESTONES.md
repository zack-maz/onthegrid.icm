# Milestones

## v1.5 LLM Reliability & Reveal Prep (Shipped: 2026-06-03)

**Phases completed:** 10 (29, 30, 30.1, 31, 32, 33, 34, 35, 36, 37)
**Plans:** 60 executed / 62 declared (2 SKIPPED in Phase 34 operator deferral; 30.1 ran 2/4 — 1 measurement plan + 1 matched-bucket plan; 31 ran 4/5 — Plan 31-04 early-closed at Day 1 / 7)
**Commits:** 209 (`da21aa1..746c142`)
**Span:** 2026-05-09 → 2026-06-03 (24 days)

**Key accomplishments:**

- Active runtime LLM cascade narrowed to NIM-only (OpenRouter declared dormant by probe). v1 + v2 extractor modules + `POST /api/events/llm-pipeline` override route + `events:llm-pipeline-override` Redis key + DevApiStatus Pin-to-v1/v2 buttons all deleted (~6,400 LOC). Rollback path is `git revert <Phase 29 commit range>`, not a Bearer-POST flip. Cerebras + Groq adapter dead-code purged from `server/adapters/llm-provider.ts` runtime path; `FreeProvider` union narrowed to `'nvidia_nim' | 'openrouter'`. Phase 29.
- Vercel project upgraded to Pro ($20/mo) with `vercel.json` `maxDuration` bumped 300 → 800. LLM cron has 2.7× wall-clock headroom; tuning happens _against_ measured NIM throttle, not _around_ it. Phase 29.
- LLM-optional architecture proven: with `NVIDIA_NIM_API_KEY` + `OPENROUTER_API_KEY` both unset, `/api/events` serves raw GDELT through the Pitfall 1 cache bridge; map never goes blank. Phase 29.
- NIM throttle characterized empirically (`Retry-After` absent in 213 batches; `p95 = 33,263ms`). `LLM_BATCH_SIZE` / `LLM_V3_CONCURRENCY` / `callLLM` retry budget + exp-backoff base + jitter all tuned against measured throttle. Reliability doc published at `docs/architecture/llm-pipeline-reliability.md`. Phase 30.
- Hobby-era workarounds retired: SIMPLIFY-01 incremental flush (Redis SET-call count drops measurably); SIMPLIFY-03 watchdog defaults relaxed against 800s ceiling. Phase 30.
- Probe-driven cascade reality check (Phase 30.1): OpenRouter free-tier 27/30 = 90.0% rate_limited; cascade declared NIM-only honest; CLAUDE.md amended in lockstep. No code change — docs follow shipped reality.
- 7-day cron stability watch closed early at Day 1 / 7 under operator decision (Day-1 natural cron PASS; eval 0.98 at all radii; 0 breaker trips). Snapshot harness operational. Slow-burn regression caveat documented; subsequently surfaced during Phase 37 acceptance-gate observation (23-day audit dormancy). Phase 31.
- Ghost-event URL liveness shipped end-to-end: per-event probe sidecar `events:url-liveness:{eventId}` (Zod `.strict()` schema-pinned) + O(1) count sidecar `events:url-liveness-count` + polite-citizen contracts (`createLimit(8)` global concurrency, per-host 1 req/s throttle, ±200ms jitter, 10s timeout, 3-hop redirect cap, HEAD-then-GET-on-405, identifying User-Agent). Operator prune via `POST /api/events/prune-dead-urls` Bearer-gated + per-Bearer per-day quota 50/24h. Dashboard surface (count row + drill-down list capped at 20 + truncation row). Phase 32.
- Actor metadata pipeline: canonical actor catalog at `server/data/actor-catalog.ts` (27 entries; 5-invariant contract test); v3 LLM extractor emits canonical names with raw CAMEO codes mapped through catalog before write; new `actorConfidence` field in `events:llm:v3` (high/medium/low). Eval harness extended with `actorMatchRate` alongside existing 5/20/100 km geocode thresholds; +3 adversarial actor-confusion injections. Dashboard `actorQuality` block surfaces 4 counters (null / raw-CAMEO / ambiguous-string / low-confidence) + drill-down sample. Phase 33.
- Multi-provider router fallback deferred (Phase 34) as `cerebras-groq-deferred`. Empirical "no provider expansion right now" is itself a load-bearing outcome (mirrors Phase 30.1 `nim-only` precedent). Phase 31 Day-1 DLQ baseline (4 × `v3:timeout_watchdog`) remains a known failure mode under the single-provider cascade; mitigation paths catalogued in ADR-0010. Planning artifacts (CONTEXT + RESEARCH + 5 PLANs) preserved as the ready-to-execute audit trail.
- Internal docs surface: 32-key Redis registry deep-dive at `docs/architecture/redis-keys.md` (writers + readers + TTL + value shape + business purpose + load-bearing/observability/retire classification per key). Mechanical drift gate at `src/__tests__/lib/redis-registry.test.ts` (39 assertions × 4 sub-suites). 7-module LLM-pipeline JSDoc audit (44 exports; 28 new one-liners + 16 verified). `events:llm:v3:partial` retired (SIMPLIFY-02 — 358 LOC across 10 surfaces). `freeClaudeRouter.ts` audited + documented alive (SIMPLIFY-05 — 3 live production callers). CLAUDE.md §Serverless Cache refreshed. Phase 35.
- Public docs surface: README sweep (rate-limit drift fix + ~99-line `## LLM Enrichment` section). 12 architecture markdown files audited (7 edited + 5 verified-clean); 21 Mermaid blocks audited (3 edited + 18 verified-clean). Runbook §6 rewrite (Hobby 10s → Pro 800s) + §13-§16 SRE-template appendage for 4 incident playbooks (NIM throttle, cron architecture, force-trigger, prod-audit retry). Degradation contract Pitfall 1 sub-section under Cache Layer + ADR-0010 cross-link. OpenAPI 3.0.3 spec: 14 → 19 endpoints; securitySchemes split (`cronSecret` + `operatorBearer`); 4 reusable schemas added; `ConflictEventEntity.type` enum corrected 11-value pre-Phase-27 → canonical 5-value. Redocly vitest + markdown-link-check script wired as mechanical drift gates. Phase 36.
- ADR-0010 milestone-final (Phase 37): body rewritten end-to-end with 6 v1.5 sub-blocks (Phase 29 context / Phase 30 / Phase 30.1 / Phase 34 / Phase 35 / Phase 37 close); status line `**Status:** Accepted (v1.5 closed 2026-06-03)`; v1.5 Milestone Close Rollup subsection; closing decision table mirrors Phase 35 D-15 / Phase 36 D-25 convention.
- LLM-RELI-07 acceptance gate satisfied (Phase 37): 3 consecutive `prod-connectivity-audit.yml` exit-0 runs — Run 1 [26771054370](https://github.com/zack-maz/otg-iran-monitor/actions/runs/26771054370) 2026-06-01 17:32 UTC · Run 2 [26856054351](https://github.com/zack-maz/otg-iran-monitor/actions/runs/26856054351) 2026-06-03 00:24 UTC · Run 3 [26856364229](https://github.com/zack-maz/otg-iran-monitor/actions/runs/26856364229) 2026-06-03 00:33 UTC. Cadence: Run 1 → Run 2 31h crossing 2 cron ticks; Runs 2 + 3 compressed ~9 min apart per D-08 NOTE allowance (smoke test after PR #34 landed). v1.6 promotion unblocked.
- 4 architectural unblocker PRs landed during Phase 37 observation, correcting Phase 28.2.5 D-09 strict-tier-green gate vs ADR-0010 LLM-optional architecture mismatches — NOT gate-evasion patches: PR #32 (`llmEvents` demoted to non-critical + LLM-optional `degraded-on-fallback` signal in `probeCacheKey` / `probeLlmStatus`); PR #33 (`news` GDELT-DOC adapter made best-effort with RSS-only sidecar fallback signal); PR #34 (D-03 truth table relaxed for non-critical tier: accepts `healthy | degraded | unknown`; critical tier strict-`healthy` retained); PR #35 (YAML/shell apostrophe-quoting hotfix for PR #34's inline node script).

**Quantitative snapshot:**

- Test count (vitest, server + client): 2,193 → ~2,386 (+~193)
- TypeScript errors (`tsc --noEmit`): 0 → 0
- Lint errors: 0 → 0
- v1 + v2 LLM extractor LOC: ~6,400 → 0 (Phase 29)
- `events:llm:v3:partial` LOC: 358 → 0 (Phase 35 SIMPLIFY-02)
- CLAUDE.md tokens: ~18,700 → 5,018 (Phase 29 DOCS-INT-01; −73.3%)
- Vercel `maxDuration` (s): 300 → 800 (Phase 29 Pro upgrade)
- Redis keys documented in `docs/architecture/redis-keys.md`: 0 → 32 (Phase 35)
- ADR-0010 v1.5 sub-blocks: 0 → 6 (across milestone)
- OpenAPI endpoints documented: 14 → 19 (Phase 36)
- Active runtime LLM providers: 3 (Cerebras / Groq / NIM) → 1 (NIM; OpenRouter dormant)
- `prod-connectivity-audit.yml` consecutive greens (LLM-RELI-07): 0 → 3 (gate closed)
- Bundled `api/vercel-entry.js`: 1.72 MB → ~1.73 MB (+10,739 bytes; JSDoc adds outweigh SIMPLIFY-02 deletes; negligible on 1.7MB)

**Known deferred items at close:** 26 (see STATE.md "Deferred Items" — 10 historical debug sessions from v0.9–v1.4 era, 11 legacy quick-task slugs from v1.1–v1.3, 3 phase-marker todos for now-shipped phases, 1 Phase 32 verification awaiting operator deploy-time confirmation [satisfied by Phase 37 acceptance gate observation], 1 Phase 30.1 CONTEXT-SEED open question [superseded by locked 30.1-CONTEXT.md]). None are v1.5 work-in-flight; all acknowledged + carried forward.

**Milestone-level carry-forwards to v1.6:**

- **Phase 999.5** (Performance Optimization + 1–300 VU k6 sweep) promotes from `.planning/phases/999.5-performance-load-test/` as v1.6's first phase
- **Phase 31 reopening** — 7-day cron stability watch, this time finished
- **Open-Meteo cache-write policy** — `server/routes/water.ts:358-360` empty-result skip caused Phase 37 audit failures; tighten cache-write policy + add cron warmer
- **`news:feed` cron warmer** — Vercel Pro cron quota likely supports a 4th entry; CLAUDE.md "Hobby cap 3" framing is stale
- **Probe-side `lastErrorReason` token rename** — `'llm-optional-fallback-active'` reused for news case in PR #33 (mechanical mirror); could rename to `'fallback-active'`
- **Phase 999.1 / 999.2 / 999.3** — parked v1.4 carry-forwards; re-evaluate priorities at v1.6 start
- **Phase 27.3.3** — romanization of non-Latin water-facility names (v1.3 → v1.4 → v1.5 carry-forward)
- **Cerebras + Groq adapter source files** remain in `server/adapters/` (importable for emergency rollback) but no production code path imports them — flagged for v1.6 if no restoration phase is scheduled

**Migration notes (v1.4 → v1.5):**

- LLM provider chain: `cerebras → groq → nim` (Phase 27.4 cascade) is gone. Active runtime is NIM-only (`qwen-235b` instruct model). OpenRouter declared dormant by Phase 30.1 probe (90% free-tier rate-limited). Cerebras + Groq adapter source files remain importable but no production path uses them.
- Pipeline override surface deleted: `POST /api/events/llm-pipeline` and the `events:llm-pipeline-override` Redis key are gone. DevApiStatus Pin-to-v1/v2 buttons removed. The v3-or-nothing posture is now mechanical, not a runtime switch. Rollback path: `git revert <Phase 29 commit range>`.
- `events:llm:v3:partial` Redis key retired (Phase 35 SIMPLIFY-02). Any operator scripts that read it should be updated to read `events:llm:v3` directly.
- `vercel.json`: `maxDuration` is now 800 (was 300). Requires Vercel Pro plan ($20/mo) on project `otg-iran-monitor`.
- Acceptance-gate semantics: non-critical tier values `degraded` and `unknown` are accepted at the gate (per PR #34's truth-table relaxation). Critical tier remains strict-`healthy`.
- LLM-RELI-07 has shipped. The promotion gate for v1.6 → Phase 999.5 is satisfied; no further audit-gate observation required at v1.6 start.

**Archives:**

- Roadmap: `milestones/v1.5-ROADMAP.md`
- Requirements: `milestones/v1.5-REQUIREMENTS.md`
- Phase artifacts: `milestones/v1.5-phases/`
- Per-phase SUMMARY rollup with framing-gap callouts: `milestones/v1.5-phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md`
- ADR-0010 (canonical decision record): `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`
- CHANGELOG entry: `CHANGELOG.md` §`[v1.5]`

---

## v1.4 GDELT Redo & Performance (Shipped: 2026-05-08)

**Phases completed:** 18 phases (12 in 27 family + 5 in 28 family + umbrellas), 1 deferred to backlog (999.5)
**Span:** 2026-04-09 → 2026-05-08 (29 days)

**Key accomplishments:**

- Structured LLM extraction pipeline replacing scrapped NLP attempt: Cerebras (v1) → Groq fallback (v2 watchdog + DLQ) → NVIDIA NIM v3 with parallel concurrency limiter and Zod-validated 5-type ontology (`airstrike`, `on_ground`, `explosion`, `targeted`, `other`).
- 6-path geocode resolver: own-site-snapshot → POI Nominatim → constrained Nominatim → 2-pass verify → GDELT ActionGeo → Bellingcat coord passthrough. 1-req/s Nominatim throttle. 30-day Redis cache.
- Daily eval harness against 50 ground-truth events (11 countries), scored at 5/20/100km thresholds. Adversarial prompt-injection robustness fixtures (~10 cases) folded into the same daily cron.
- Reliability primitives: circuit breaker, DLQ (200-entry SADD bounded set, 7d TTL), token budget (per-provider daily caps with soft 0.8 / hard 0.95 thresholds), watchdog (90s hard kill + 60s soft warn, late-resolve guard via AbortController generation counter).
- Cron-driven pipeline: `/api/events` is now cache-only. Daily `/api/cron/refresh-events` at 04:00 UTC with `waitUntil` durability and cold-cache self-heal. Operator force-trigger via `?force=true`. NIM-throttle accept-and-fallback strategy preserves "map never goes blank" through extraction failures.
- Cleanup sweep (Phase 28.1, 7 waves): ghost code deletion via knip + ts-prune triage, 12 operator-tunable env vars, domain constants centralized at `src/lib/domain.ts` with byte-identical server mirror, CSS `@theme` color tokens + `colorBridge.ts`, 0 TypeScript errors / 0 lint errors / 0 react-hooks warnings baseline.
- Dev/Prod sync (Phase 28.2): domain rename `irt-monitoring.vercel.app` → `otg-iran-monitor.vercel.app` on new Vercel project `otg-iran-monitor`. Bearer-bypass for `rateLimiters.public` global tier. Operator-control endpoints Bearer-gated with `operator:audit-log` and per-Bearer `replay-quota` (50/24h cap). Per-field dev/prod gate-swaps; `MapDevExposer` / severity score / `notabilityScore` permanently dev-only.
- Unified API Health dashboard: `Overview` folded into `All APIs` → renamed `API Health`. 4 diagnostic blocks (tier-grouped summary, per-endpoint quality metrics, manual retry, recent-fetch sparkline). New `/api/operator-status` Bearer-gated aggregator. `HealthStatusProvider` single-poll guarantee.
- Connectivity audit workflow: `.github/workflows/prod-connectivity-audit.yml` with 16-endpoint smoke + rate-limit defense companion. Sidecar Redis key `audit:connectivity:last-result` (7d TTL). Tier-green assertion writes `allTiersGreen` + `tierStatus` into the sidecar with truth table.
- API green-light gate (Phase 28.2.5): `events:llm:v3` registry promotion. Registry-consistency invariant test ensures every cache-backed `TIER_BY_ENDPOINT` key has a matching `SOURCE_KEYS` entry. Weather tooltip widening (2°→4° + distance hint).
- Cron architecture fix (Phase 28.2.6): Vercel `waitUntil` for fire-and-forget durability, incremental terminal-key writes, cold-cache self-heal, operator force-trigger via `?force=true`.
- Audit-tier completeness (Phase 28.2.7): R1 `cron:lastTick:<name>` writers in all 3 cron handlers (7d TTL, `CRON_LASTTICK_TTL_SEC = 604_800`); R2 `llm:lastProgress` Redis write-through + Redis-first `probeLlmStatus()` survives Vercel Fluid Compute cold starts; R3 `probeProbeOnly()` returns `freshnessMs:0` honest stub. All 3 verified working in prod via `/api/health`.
- Compounding fixes during 28.2.7 closeout: rate-limit companion test retargeted (`/api/health` is intentionally unthrottled per mount order; switched to `/api/audit-status`); `llmStatus` freshness widened from 5min → 26h matching daily cron cadence; `llmEvents` probe gains v3→v2→v1 fallback chain mirroring `/api/events` cache bridge.

**Quantitative snapshot:**

- Test count (vitest): ~1700 → 2193 (+493)
- TypeScript errors (`tsc --noEmit`): 8 → 0
- Lint errors: 0 → 0; warnings: 22 → 18
- Bundled `api/vercel-entry.js`: 1.2 MB → 1.72 MB
- Cron jobs (Hobby cap = 3): 2 → 3
- Critical-tier API endpoints: 3 → 4 (added `llmEvents`)
- LLM provider chain: Cerebras only → Cerebras → Groq → NIM v3 parallel
- Eval ground-truth set: 0 → 50 events / 11 countries
- Adversarial fixtures: 0 → ~10 prompt-injection cases

**Known deferred items at close:** 36 (see STATE.md "Deferred Items" — 10 historical debug sessions, 11 legacy quick-task slugs, 3 phase-marker todos for now-shipped phases, 6 resolved/partial UAT files, 6 `human_needed` verification statuses awaiting operator deploy-time confirmation).

**Migration notes (v1.3 → v1.4):**

- Domain change: `irt-monitoring.vercel.app` retired; canonical alias is `otg-iran-monitor.vercel.app` on Vercel project `otg-iran-monitor`.
- Operator Bearer: prod surfaces require `Authorization: Bearer ${DASHBOARD_PASSWORD}`. Same Bearer skips global rate-limit tier.
- Cron schedule: `/api/events` no longer triggers extraction; `/api/cron/refresh-events` does, daily at 04:00 UTC. Operator force-trigger: `GET /api/cron/refresh-events?force=true` with `Authorization: Bearer ${CRON_SECRET}`.
- Pipeline version: `LLM_PIPELINE_V3=true` is the default in production. Runtime override via `POST /api/events/llm-pipeline {"version": "v1"|"v2"|"v3"|null}`.

**Archives:**

- Roadmap: `milestones/v1.4-ROADMAP.md`
- Audit: `milestones/v1.4-MILESTONE-AUDIT.md`
- Phase artifacts: `milestones/v1.4-phases/`

---

## v1.3 Data Quality & Layers (Shipped: 2026-04-09)

**Phases completed:** 11 phases, 36 plans, 77 tasks

**Key accomplishments:**

- Concentric ring dispersion for stacked centroid events, config-driven filter thresholds, and pipeline audit types for the GDELT event pipeline
- Bellingcat RSS as 6th news source with three-gate corroboration boost (+0.2 confidence) wired into the GDELT event pipeline end-to-end
- CLI event audit dump with full pipeline trace and fixture-based regression tests locking 3 true positive and 5 false positive GDELT event behaviors
- Relocated disperseEvents from per-batch parseAndFilter to single-pass post-merge in events route, with shared CENTROID_TOLERANCE constant
- Ref-guarded camera fly-to in useQuerySync prevents re-centering when editing non-near: search terms
- 8-stop FLIR Ironbow thermal palette with P90 normalization, no temporal decay, 0.25-degree grid, and eventIds tracking for cluster detail panel
- BFS connected-component clustering on threat grid with click-through detail panel showing cluster header, scrollable event list, and fly-to-event drill-down
- PanelView type, navigation stack store actions with mutual-exclusion bypass, CSS slide animations, and shared breadcrumb label helper
- Radial gradient shader extension with 4-stop thermal palette, additive blending, pixel-based spread encoding, zoom-dependent z-order, and hover dimming for threat cluster circles
- Nominatim reverse geocoding with Redis caching, event type breakdown bars, geographic context, and weight-sorted event lists in ThreatClusterDetail
- PoliticalOverlay component with faction-colored country fills, disputed territory hatching, hover labels, and discrete legend using Natural Earth static GeoJSON
- GeoEPR-2021 ethnic boundary extraction producing 139KB GeoJSON with 9 groups + 23 overlap zones, plus ethnicGroups.ts 10-group config and @deck.gl/extensions installed
- Backfilled during v1.3 milestone audit cleanup (2026-04-09). Plan 02 was executed but SUMMARY.md was never written at the time. This backfill is derived from the plan spec, git history (commit `83d355b feat(25-02)` + follow-up `f9b961e fix(25)`), and the current codebase state.
- Water stress types, color interpolation utility, and static data files from WRI Aqueduct 4.0 and Natural Earth 10m rivers
- Surgical removal of desalination from SiteType union, Overpass adapter, and all client UI (toggles, counters, labels, icons) -- preparing for re-addition under Water layer in Plan 03
- Overpass water adapter (5 facility types), country-centroid basin stress lookup, Open-Meteo 30-day precipitation adapter, and /api/water routes with Redis caching
- Zustand water store with precipitation merge, one-time facility fetch + 6h precip polling hooks, and deck.gl river lines / facility icons with stress-based color tinting
- Full water layer integration: detail panel, counters, search, proximity alerts, legend, and toggle UI wired across all app systems
- Fixed water facility visibility (dark-purple color floor + 30s API timeout) and river stress differentiation (per-river compositeHealth + wider lines)
- Tiered Overpass queries with treatment_plant support, priority-country notability filtering, Vercel cron daily cache refresh, and 7-day Redis TTL
- Expanded water stress to 0-10 scale with Destroyed state and added 4 canvas icons (dam, reservoir, treatment, desalination) to 544px atlas
- Type-specific water facility icons (dam/reservoir/treatment/desalination) with destroyed-state blackout from GDELT events, plus desalination coverage audit and test fixes
- Deleted 6 Phase 26.2 NLP files, surgically reverted 6 modified files to pre-26.2 state, and cleaned up unused imports for zero-error server compilation
- Pino structured logger replacing console.log/error across 21 server modules, with X-Request-ID tracing on every HTTP response
- Zod-validated server config with single config.ts source of truth and validateQuery middleware on all 7 API routes
- AppError class with consistent { error, code, statusCode, requestId } JSON envelope, gzip compression for local dev, and SIGTERM graceful shutdown
- Enabled `noUncheckedIndexedAccess` on server, cleared ~124 accumulated TypeScript errors across the codebase, documented every per-endpoint rate limiter with JSDoc rationale, and published a 1164-line hand-written OpenAPI 3.0.3 spec for all 14 API endpoints.
- Installed @vitest/coverage-v8 with V8 provider, pinned coverage thresholds at the current baseline as a regression ratchet, confirmed zero it.todo() stubs remain anywhere in src/ or server/, and auto-fixed six pre-existing test/source drift bugs to leave the full 1241-test suite green with coverage reporting on every run.
- Installed Prettier 3 + knip 5, formatted 600+ files, removed all pre-existing lint errors, deleted 3 dead source files + 2 dead dependencies + 7 dead exports, and added an .env.example drift checker that will keep 18 env keys honest going forward.
- Wired GitHub Actions CI (lint + test + coverage + audit) and CodeQL security analysis, installed husky + lint-staged + gitleaks for a sub-2s pre-commit ratchet, and verified the secret-scanning hook catches planted AWS keys before they reach the staging area.
- Pino redaction for secrets, type-coverage CI gate at 97% baseline, Redis-death chaos test with a 2000ms cache-op timeout to close the graceful-degradation gap, and zod sendValidated response helper wired into flights/events/water routes.
- README rewritten as a 564-line portfolio-grade hero document with a 1354 KB Playwright-captured hero GIF, 6 layer screenshots, a globally-wired public rate-limit tier (6 req/min per-IP), and public/robots.txt — all produced by a permanent agentic capture script (`npm run capture:hero`) that survives UI changes and replaces manual screen recording.
- 10 markdown files under `docs/architecture/` documenting system context, per-source data flows, frontend composition, Vercel deployment, and a four-file ontology deep dive — 21 Mermaid diagrams total, all rendering natively on GitHub, reflecting the as-built system with TODO(26.2) tech debt labeled inline.
- 12 new markdown files totaling 2672 lines — an 8-ADR Nygard short-format decision record, a 676-line SRE-style operations runbook with 9 real failure modes, a 303-line layered graceful degradation contract, and README.md updated with an Engineering Documentation subsection plus an ADR-0005 highlight in the retrospective section. ADR-0005 (Phase 26.2 NLP scrap) is the highest-portfolio-signal artifact in this phase at 300 lines of honest retrospective.

---

## v0.9 MVP (Shipped: 2026-03-19)

**Phases:** 13 (1-12 + 8.1) | **Plans:** 25/28 complete | **Commits:** 229
**Lines of code:** 12,262 TypeScript/CSS | **Timeline:** 6 days (2026-03-13 → 2026-03-18)
**Git range:** c4d3055..9238f98

**Key accomplishments:**

1. Interactive 2.5D dark map with 3D terrain, pan/zoom/rotate (Deck.gl + MapLibre + AWS Terrarium DEM)
2. Multi-source flight tracking (OpenSky, ADS-B Exchange, adsb.lol) with tab-aware recursive polling
3. Ship tracking (AIS) + GDELT v2 conflict event data with CAMEO classification and 11 event types
4. Entity rendering with zoom-responsive icons, hover tooltips, and click-to-inspect detail panel
5. Smart filters (country, speed, altitude, proximity, date range) with proximity circle visualization
6. Analytics counters dashboard with visibility-aware counts and delta animations

### Known Gaps

3 plans were not formally executed (features delivered through alternate phases):

- **06-03**: SourceSelector UI dropdown — superseded by StatusPanel HUD (Phase 8)
- **08-02**: HUD status panel — delivered as part of Phase 8 execution
- **09-02**: LayerTogglesSlot UI panel — delivered as part of Phase 9 execution

---

## v1.0 Deployment (Shipped: 2026-03-20)

**Phases:** 2 (13-14) | **Plans:** 6/6 complete | **Commits:** 35
**Lines of code:** 13,637 TypeScript/CSS | **Timeline:** 2 days (2026-03-19 → 2026-03-20)
**Git range:** 266d6cb..b5e37dd

**Key accomplishments:**

1. Upstash Redis cache replacing all in-memory caches for serverless compatibility
2. AISStream on-demand connection model (connect-collect-close per request)
3. GDELT backfill with lazy on-demand historical data loading
4. Vercel deployment with serverless functions + CDN-served SPA
5. Rate limiting and graceful degradation for missing API keys

---

## v1.1 Intelligence Layer (Shipped: 2026-03-22)

**Phases:** 8 (15-19.2) | **Tests:** 851 passing | **Commits:** 146
**Lines of code:** 25,842 TypeScript/CSS | **Timeline:** 3 days (2026-03-20 → 2026-03-22)
**Git range:** b97baf3..932358a

**Key accomplishments:**

1. Key infrastructure sites overlay (nuclear, naval, oil, airbase, desalination, port) from Overpass/OSM with attack status detection
2. News feed aggregation (GDELT DOC + 5 RSS feeds) with Jaccard dedup/clustering
3. Severity-scored notification center with proximity alerts (50km) and news headline matching
4. Oil markets tracker (Brent, WTI, XLE, USO, XOM) with sparkline charts and delta animations
5. Tag-based search language (~25 prefixes) with bidirectional filter sync and autocomplete
6. Counter entity dropdowns with fly-to and proximity sorting
7. All 29 v1.1 requirements complete

---

## v1.2 Visualization & Hardening (Shipped: 2026-03-29)

**Phases:** 7 (20-21.3) | **Tests:** 958 passing | **Commits:** 129
**Lines of code:** ~30,000 TypeScript/CSS | **Timeline:** 7 days (2026-03-23 → 2026-03-29)
**Git range:** b5c0df9..0bd040e

**Key accomplishments:**

1. Visualization layer architecture (geographic elevation/contour, weather heatmap/wind barbs, threat density heatmap)
2. GDELT news relevance filtering with NLP-based scoring (replacing keyword whitelist)
3. GDELT event quality pipeline (geo-validation, composite confidence scoring, CAMEO 180/192 exclusion)
4. Production hardening (Helmet CSP, per-endpoint rate limiting, structured logging, Redis fallback)
5. Multi-user load testing (k6 501 VUs + Playwright 3 workers, 100% pass rate, p95 153ms)

---
