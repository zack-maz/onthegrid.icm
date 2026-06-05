# Roadmap: Iran Monitor

## Milestones

- **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)
- ✅ **v1.3 Data Quality & Layers** -- Phases 22-26.4 (shipped 2026-04-09) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 GDELT Redo & Performance** -- Phases 27-28.2.7 (shipped 2026-05-08); load-test phase deferred to backlog (999.5) — [archive](milestones/v1.4-ROADMAP.md), [audit](milestones/v1.4-MILESTONE-AUDIT.md)
- ✅ **v1.5 LLM Reliability & Reveal Prep** -- Phases 29-37 (shipped 2026-06-03); 10 phases (incl. 30.1); 60/62 plans executed; 47/47 requirements closed; LLM-RELI-07 acceptance gate satisfied (3 consecutive `prod-connectivity-audit.yml` greens); v1.6 promotion unblocked — [archive](milestones/v1.5-ROADMAP.md), [requirements](milestones/v1.5-REQUIREMENTS.md)
- 🚧 **v1.6 Production Hardening (active)** -- Phases 38-41; 57 requirements (56 required + 1 optional CRON-WATCH-01) across 4 phases; operator-locked priority order LLM-pipeline fixes > budget/cost visibility > UI polish > public reveal; Phase 999.5 (Performance Load Test + 1-300 VU k6 sweep) deferred from first-task position at operator request to prioritize reliability + UI + reveal work first; Phase 999.6 retired (Strand A folded into Phase 41, Strand B folded into Phase 38) — see §"Milestone v1.6: Production Hardening" below

## Phase Summary

| Phase | Name                            | Milestone | Plans | Completed  |
| ----- | ------------------------------- | --------- | ----- | ---------- |
| 1     | Project Scaffolding & Theme     | v0.9      | 1/1   | 2026-03-14 |
| 2     | Base Map                        | v0.9      | 3/3   | 2026-03-14 |
| 3     | API Proxy                       | v0.9      | 3/3   | 2026-03-15 |
| 4     | Flight Data Feed                | v0.9      | 2/2   | 2026-03-15 |
| 5     | Entity Rendering                | v0.9      | 2/2   | 2026-03-16 |
| 6     | ADS-B Exchange Data Source      | v0.9      | 2/3   | 2026-03-16 |
| 7     | adsb.lol Data Source            | v0.9      | 2/2   | 2026-03-16 |
| 8     | Ship & Conflict Data Feeds      | v0.9      | 1/2   | 2026-03-17 |
| 8.1   | GDELT Event Source              | v0.9      | 2/2   | 2026-03-17 |
| 9     | Layer Controls & News Toggle    | v0.9      | 1/2   | 2026-03-17 |
| 10    | Detail Panel                    | v0.9      | 2/2   | 2026-03-18 |
| 11    | Smart Filters                   | v0.9      | 3/3   | 2026-03-18 |
| 12    | Analytics Dashboard             | v0.9      | 1/1   | 2026-03-19 |
| 13    | Serverless Cache Migration      | v1.0      | 4/4   | 2026-03-20 |
| 14    | Vercel Deployment               | v1.0      | 2/2   | 2026-03-20 |
| 15    | Key Sites Overlay               | v1.1      | 2/2   | 2026-03-20 |
| 16    | News Feed                       | v1.1      | 3/3   | 2026-03-20 |
| 17    | Notification Center             | v1.1      | 4/4   | 2026-03-20 |
| 18    | Oil Markets Tracker             | v1.1      | 2/2   | 2026-03-21 |
| 19    | Search, Filter & UI Cleanup     | v1.1      | 4/4   | 2026-03-22 |
| 19.1  | Advanced Search                 | v1.1      | 5/5   | 2026-03-22 |
| 19.2  | Counter Entity Dropdowns        | v1.1      | 2/2   | 2026-03-22 |
| 20    | Layer Purpose Refactor          | v1.2      | 3/3   | 2026-03-23 |
| 20.1  | Geographical & Weather Layers   | v1.2      | 3/3   | 2026-03-23 |
| 20.2  | Threat Heatmap Layer            | v1.2      | 1/1   | 2026-03-23 |
| 20.3  | Political Boundaries Layer      | v1.2      | --    | Deferred   |
| 20.4  | Satellite Imagery Layer         | v1.2      | --    | Deferred   |
| 20.5  | Infrastructure Focus Layer      | v1.2      | --    | Deferred   |
| 21    | Production Review & Deploy Sync | v1.2      | 5/5   | 2026-03-25 |
| 21.1  | GDELT News Relevance Filtering  | v1.2      | 2/2   | 2026-03-26 |
| 21.2  | GDELT Event Quality Pipeline    | v1.2      | 2/2   | 2026-03-28 |
| 21.3  | Multi-User Load Testing         | v1.2      | 3/3   | 2026-03-29 |

**v0.9-v1.2 Totals:** 30 phases (27 shipped, 3 deferred) | 72/72 plans executed

<details>
<summary>✅ v1.3 Data Quality & Layers (Phases 22-26.4) — SHIPPED 2026-04-09</summary>

- [x] Phase 22: GDELT Event Quality & OSINT Integration (3/3 plans)
- [x] Phase 22.1: Fixing Dispersion & Camera Fly-To (2/2 plans)
- [x] Phase 23: Threat Density Improvements (2/2 plans)
- [x] Phase 23.1: Detail Panel Navigation Stack (2/2 plans)
- [x] Phase 23.2: Improving Threat Density Scatter Plots (2/2 plans)
- [x] Phase 24: Political Boundaries Layer (2/2 plans)
- [x] Phase 25: Ethnic Distribution Layer (2/2 plans)
- [x] Phase 26: Water Stress Layer (6/6 plans)
- [x] Phase 26.1: Water Layer Refinements (3/3 plans)
- [x] Phase 26.3: Production Code Cleanup (6/6 plans)
- [x] Phase 26.4: Documentation & External Presentation (6/6 plans)

**11 phases, 36 plans, 82/82 requirements satisfied, 12 scrapped → v1.4**
**Full archive:** [milestones/v1.3-ROADMAP.md](milestones/v1.3-ROADMAP.md)

</details>

## Milestone v1.4: GDELT Redo & Performance — ✅ SHIPPED 2026-05-08

<details>
<summary>v1.4 (Phases 27 → 28.2.7) — 18 phases shipped, 1 deferred to backlog (999.5)</summary>

Full phase-by-phase detail archived to [milestones/v1.4-ROADMAP.md](milestones/v1.4-ROADMAP.md). Milestone audit at [milestones/v1.4-MILESTONE-AUDIT.md](milestones/v1.4-MILESTONE-AUDIT.md). Per-phase artifacts (PLAN.md / SUMMARY.md / VERIFICATION.md / REVIEW.md / HUMAN-UAT.md / CONTEXT.md) preserved at `.planning/milestones/v1.4-phases/`.

**Shipped (18):** 27 (umbrella) → 27.1 → 27.2 → 27.3 → 27.3.1 → 27.3.2 → 27.4 → 27.4.1 → 27.4.2 → 27.4.3 → 27.4.4 → 27.4.6 → 28 (umbrella) → 28.1 → 28.2 → 28.2.5 → 28.2.6 → 28.2.7.

**Deferred:** Phase 28.3 → Phase 999.5 backlog (Performance Optimization + 1–300 VU k6 sweep). Decision lock preserved at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`. Promotion gate: 3 consecutive `prod-connectivity-audit.yml` runs exit 0 with `allTiersGreen=true` — **SATISFIED in v1.5 Phase 37 (2026-06-03)**.

**Headlines:** Structured LLM extraction (Cerebras → Groq → NIM v3 with parallel concurrency limiter) replacing scrapped NLP attempt. Daily cron triad (`/api/cron/{health,warm,refresh-events}`) with `waitUntil` durability + cold-cache self-heal. 6-path geocode resolver. Eval harness (50 ground-truth events / 11 countries). Adversarial prompt-injection robustness fixtures. Cleanup sweep (knip + ts-prune triage, 12 operator-tunable env vars, CSS `@theme` color tokens, 0 TS errors / 0 lint errors baseline). Domain rename to `otg-iran-monitor.vercel.app`. Bearer-bypass rate limiter. Unified `API Health` dashboard tab. Manual-trigger `prod-connectivity-audit.yml` workflow with tier-green sidecar assertion. Phase 28.2.7 closes the audit-tier completeness loop (cron `lastTick` writers + Redis-first `probeLlmStatus` + honest-stub `probeProbeOnly`).

**Quantitative delta (v1.3 close → v1.4 close):**

- Tests: ~1700 → 2193 (+493)
- TypeScript errors: 8 → 0
- Cron jobs: 2 → 3 (within Hobby cap)
- Critical-tier endpoints: 3 → 4 (+ `llmEvents`)
- Eval ground-truth set: 0 → 50 events
- Bundle: 1.2 MB → 1.72 MB

</details>

## Milestone v1.5: LLM Reliability & Reveal Prep — ✅ SHIPPED 2026-06-03

<details>
<summary>v1.5 (Phases 29 → 37 incl. 30.1) — 10 phases shipped, 47/47 requirements closed, LLM-RELI-07 gate satisfied</summary>

Full phase-by-phase detail archived to [milestones/v1.5-ROADMAP.md](milestones/v1.5-ROADMAP.md). Requirements archive at [milestones/v1.5-REQUIREMENTS.md](milestones/v1.5-REQUIREMENTS.md). Per-phase artifacts (PLAN.md / SUMMARY.md / VERIFICATION.md / CONTEXT.md / DISCUSSION-LOG.md / PATTERNS.md / AUDIT-REPORT.md) preserved at `.planning/milestones/v1.5-phases/`.

**Shipped (10):** 29 → 30 → 30.1 (INSERTED) → 31 → 32 → 33 → 34 → 35 → 36 → 37.

**Plan execution:** 60 plans executed of 62 declared. Phase 34 SKIPPED Plans 34-01..04 under operator deferral close-out (`cerebras-groq-deferred`); only Plan 34-05 ran. Phase 30.1 ran 2/4 plans (1 measurement + 1 matched-bucket plan; 3 contingent plans SKIPPED). Phase 31 ran 4/5 (Plan 31-04 early-closed at Day 1 / 7).

**Headlines:** Active runtime LLM cascade narrowed to NIM-only (OpenRouter declared dormant by Phase 30.1 probe; Cerebras + Groq purged from runtime cascade). v1 + v2 extractor modules + `POST /api/events/llm-pipeline` override route + `events:llm-pipeline-override` Redis key + DevApiStatus Pin-to-v1/v2 buttons all deleted (~6,400 LOC; rollback path is `git revert <Phase 29 commit range>`). Vercel project upgraded to Pro with `maxDuration: 800` (2.7× Hobby ceiling). LLM-optional architecture proven (raw GDELT via Pitfall 1 cache bridge when keys absent). NIM throttle empirically characterized (`Retry-After` absent in 213 batches; `p95 = 33,263ms`). SIMPLIFY-01 incremental flush + SIMPLIFY-03 watchdog aggression retired. Ghost-event URL liveness end-to-end (probe sidecar + O(1) count sidecar + Bearer-gated prune + cron auto-prune with `attemptCount >= 3` gate + dashboard drill-down). Actor metadata canonicalization (27-entry catalog + `actorConfidence` schema + extended `SYSTEM_PROMPT_V3` + eval `actorMatchRate` + adversarial actor-confusion injections). 32-key Redis registry deep-dive at `docs/architecture/redis-keys.md` + mechanical drift gate (39 assertions × 4 sub-suites). `events:llm:v3:partial` retired (SIMPLIFY-02; −358 LOC). 7-module LLM-pipeline JSDoc audit. CLAUDE.md trimmed −73.3% to 5,018 tokens. README sweep + 12 architecture docs + runbook §6 rewrite + §13-§16 SRE appendage + degradation Pitfall 1 contract + OpenAPI 3.0.3 spec extended 14 → 19 endpoints with split securitySchemes. ADR-0010 milestone-final. LLM-RELI-07 acceptance gate satisfied (3 consecutive `prod-connectivity-audit.yml` greens; 4 architectural unblocker PRs landed during observation correcting Phase 28.2.5 D-09 strict-tier-green vs ADR-0010 LLM-optional mismatches).

**Quantitative delta (v1.4 close → v1.5 close):**

- Tests: 2,193 → ~2,386 (+~193)
- TypeScript errors: 0 → 0
- Lint errors: 0 → 0
- v1 + v2 extractor LOC: ~6,400 → 0
- `events:llm:v3:partial` LOC: 358 → 0
- CLAUDE.md tokens: ~18,700 → 5,018 (−73.3%)
- Vercel `maxDuration`: 300s → 800s
- Redis keys documented: 0 → 32
- ADR-0010 v1.5 sub-blocks: 0 → 6
- OpenAPI endpoints: 14 → 19
- Active runtime LLM providers: 3 → 1 (NIM only; OpenRouter dormant)
- `prod-connectivity-audit.yml` consecutive greens: 0 → 3 (gate closed)
- Bundle: 1.72 MB → ~1.73 MB (negligible delta)

</details>

## Milestone v1.6: Production Hardening — 🚧 ACTIVE (started 2026-06-03)

**Goal:** Fix the LLM-pipeline reliability gaps surfaced at v1.5 close, tighten GDELT event-source matching, give the operator dashboard a budget/cost surface and a polish pass, then ship the public-reveal portfolio surface.

**Operator-locked at milestone start (2026-06-03):** Phase count = 4. Priority order = LLM-pipeline fixes > budget/cost visibility > UI polish > public reveal. Phase 999.5 deferred from first-task position; Phase 999.6 retired (Strand A → Phase 41, Strand B → Phase 38). Numbering continues from v1.5 phase 37 → Phase 38 next.

**Coverage:** 57 REQ-IDs (56 required + 1 optional CRON-WATCH-01) across 4 phases. Every REQ-ID appears in exactly one phase. Full REQ → phase → success-criterion mapping at [.planning/REQUIREMENTS.md §Traceability](REQUIREMENTS.md#traceability).

**Parallelization mode:** Operator-permitted interleave — Phase 38 + 39 can run interleaved (both touch LLM surfaces). Phase 40 + 41 are independent of each other and of the LLM track once the dashboard data shape (Phase 39) is settled. Build order options: (a) sequential 38 → 39 → 40 → 41; (b) interleaved 38 ‖ 39 → 40 ‖ 41. Phase 40 hard-soft-depends on Phase 39 component shapes being locked before UI-POLISH-02 can finalize BudgetBlock + FlightRecorderBlock placement.

### Phases summary (planned)

- [x] **Phase 38: LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup** — bug-fix punch-list (LLM-FIX) + dead-code purge incl. Cerebras+Groq adapter removal (LLM-PURGE) + GDELT corpus quality (GDELT-MATCH) + water-facility romanization (WATER-LATIN) + Vercel Pro docs+code repair (VERCEL-PRO) + optional 7-day cron-stability reopen (CRON-WATCH). (completed 2026-06-04)
- [x] **Phase 39: Operator Visibility — Budget + Cost + LLM Flight Recorder** — `BudgetBlock` (per-provider tokens vs cap, soft/hard thresholds), cost-shadow accrual surface, Phase-27.4.5 absorbed LLM flight recorder (Redis-backed call+run history, Bearer-gated `/api/events/llm-history`, cold-start hydration). (completed 2026-06-04)
- [ ] **Phase 40: Dashboard UI/UX Polish + Subtab Consolidation** — UI-SPEC.md design contract precedes code (`/gsd:ui-phase`); ~13-sub-block stack consolidated into 3-4 grouped sections; typography/spacing/color polish; RTL contract tests regression-lock the consolidated layout.
- [ ] **Phase 41: Public Reveal Polish** — portfolio docs (`BUILDING-WITH-CLAUDE-CODE.md`, `SHOWCASE.md`, `JOURNEY.md`, `concepts.md`, `COSTS.md`, `operator-guide.md`, `LESSONS.md`, brainstorms cleanup), `npm run capture:layers` reproducible screenshots, REVEAL-SITE landing-page polish + demo flows + social-share + custom-domain decision, final-sweep audit against then-current main.

### Phase 38: LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup

**Goal:** Restore honest single-source semantics across health probes, audit signals, chaos-test coverage, and deployment docs; complete the Phase 29 finishing pass (v1/v2 + Cerebras/Groq dead code + adapter source files); raise GDELT event-corpus quality through dedup + corroboration + tier-aware rescore; romanize non-Latin water-facility names so the Latin-label admission gate stops dropping legitimate infrastructure; reconcile Vercel Pro semantics across code + docs.

**Depends on:** v1.5 close (all prerequisites merged to main).

**Requirements:** LLM-FIX-01, LLM-FIX-02, LLM-FIX-03, LLM-FIX-04, LLM-FIX-05, LLM-FIX-06, LLM-PURGE-01, LLM-PURGE-02, LLM-PURGE-03, LLM-PURGE-04, LLM-PURGE-05, LLM-PURGE-06, LLM-PURGE-07, LLM-PURGE-08, LLM-PURGE-09, GDELT-MATCH-01, GDELT-MATCH-02, GDELT-MATCH-03, GDELT-MATCH-04, WATER-LATIN-01, WATER-LATIN-02, WATER-LATIN-03, WATER-LATIN-04, VERCEL-PRO-01, VERCEL-PRO-02, VERCEL-PRO-03, VERCEL-PRO-04

_28 REQ-IDs total — 27 required (parsed above) by strand: LLM-FIX (6) · LLM-PURGE (9) · GDELT-MATCH (4) · WATER-LATIN (4) · VERCEL-PRO (4); + 1 optional **CRON-WATCH-01** (absorbed-or-deferred decision locked at `/gsd:discuss-phase` 38 → deferred to v1.7 per 38-CONTEXT D-02). CRON-WATCH-01 is intentionally excluded from the parsed `**Requirements:**` line so the requirements-coverage gates do not flag it as an uncovered gap._

**Success Criteria** (what must be TRUE when this phase completes):

1. **SC38-1** Health-probe and audit signals report honest single-source semantics — `lastErrorReason` distinguishes `cache-fallback-active:` from `llm-optional-fallback-active:`; Open-Meteo cache-write policy no longer drives the audit tier to degraded under empty result. _(LLM-FIX-01, LLM-FIX-02)_
2. **SC38-2** Chaos and v3-mock test coverage proves the "no HTTP 500 under Redis death" guarantee end-to-end — chaos mock exposes `incr/sadd/smembers/scard/srem/zadd/hset/hincrby/scan/lpush/expire` as `vi.fn(redisDeath)`; dedicated quota-path chaos test confirms 503 for the right reason; `events.test.ts` v1→v3 mock drift fixed; `33-AUDIT-REPORT.md` no longer reports "0% actor accuracy" silently. _(LLM-FIX-03, LLM-FIX-04, LLM-FIX-05, LLM-FIX-06)_
3. **SC38-3** No code path imports v1/v2 extractors, the deleted pipeline override surface, OpenRouter daily-cap dead writers, or Cerebras/Groq adapter source files. Stale headers across v3 + events route + extraction pipeline rewritten. `enrichedEventV1/V2` Zod schemas + `appendPipelineAudit` writer + `PipelineFlipsBlock` either deleted or explicitly Path-B-preserved per locked 38-CONTEXT.md decision. Rollback path is `git revert <Phase 29 commit range>` only. _(LLM-PURGE-01..09)_
4. **SC38-4** GDELT event corpus surfaces high-confidence, deduped, source-tier-ranked events — Phase-22-style audit categorizes the live `events:llm:v3` corpus; mention-collapse dedup runs BEFORE LLM enrichment; three-gate corroboration extended beyond Bellingcat to general OSINT sources; per-event composite score (tier × corroboration × specificity) re-ranks the dashboard top-of-list. _(GDELT-MATCH-01, GDELT-MATCH-02, GDELT-MATCH-03, GDELT-MATCH-04)_
5. **SC38-5** Water facilities with non-Latin names surface via `nameLatin` while preserving the original `name` field; Overpass adapter applies romanization BEFORE the Latin-label admission gate; consumer surfaces (detail panel, search bar, proximity alerts) display `nameLatin` with original-on-hover. _(WATER-LATIN-01, WATER-LATIN-02, WATER-LATIN-03, WATER-LATIN-04)_
6. **SC38-6** Production code and docs agree on Vercel Pro semantics — `vercel.json → vercel.ts` migration decision shipped or explicitly deferred with rationale; Build Output API decision for `api/vercel-entry.js` shipped or explicitly deferred (closes Phase 999.2 backlog if pursued); Fluid Compute compatibility on `createApp()` factory verified; every "Hobby cap 3", "10s timeout", "60s ceiling" claim across CLAUDE.md / deployment.md / runbook.md / degradation.md / reliability-doc removed; Vercel CLI bumped 52 → latest. _(VERCEL-PRO-01, VERCEL-PRO-02, VERCEL-PRO-03, VERCEL-PRO-04)_
7. **SC38-7** _(conditional — fires only if operator absorbs CRON-WATCH-01 at `/gsd:discuss-phase` 38)_ 7 consecutive days of `/api/cron/refresh-events` PASS — `events:llm:v3` healthy after each 04:00 UTC tick, eval ≥ 0.95 at all radii (5/20/100km), 0 breaker trips, DLQ growth bounded. _(CRON-WATCH-01)_

**Plans:** 6/6 plans complete
**Wave 1**

- [x] 38-01-PLAN.md — LLM-FIX strand (honest signals) + folded CI-green [wave 0]
- [x] 38-02-PLAN.md — LLM-PURGE strand (Phase 29 dead-code finishing pass) [wave 1, after 01]
- [x] 38-03-PLAN.md — GDELT-MATCH-01 corpus audit (hard gate for 06) [wave 1]

**Wave 2** _(blocked on Wave 1 completion)_

- [x] 38-04-PLAN.md — WATER-LATIN strand (romanization, transliteration install) [wave 2, after 03] ✅ WATER-LATIN-01..04 (transliteration@2.6.1 + romanize-before-gate + nameLatin/nameOriginal + consumer surfaces)
- [x] 38-05-PLAN.md — VERCEL-PRO strand (Fluid Compute verify + docs-drift; PRO-01/02 deferred) [wave 2, after 02] ✅ VERCEL-PRO-01..04 (recorded PRO-01/02 defer-with-rationale; verified Fluid Compute compat on createApp() + no-leak smoke; repaired Hobby→Pro docs-drift across 5 surfaces; bumped Vercel CLI 52→54.9.0)
- [x] 38-06-PLAN.md — GDELT-MATCH 02/03/04 (dedup + corroboration + composite) [wave 2, after 02+03] ✅ GDELT-MATCH-02..04 (dedupHighConfidence high-confidence pre-enrichment dedup [actor+CAMEO+day+≤5km+Jaccard≥0.85] wired before groupGdeltRows; corroboration.ts generalized three-gate OSINT corroboration with strict keyword gate + tier-weighted boost; computeCompositeScore tier×corroboration×specificity + .optional() schema field + applyCompositeOrdering additive non-mutating dashboard re-order; full server suite 1340 tests + typecheck green; D-07 grep gates confirmed)

CRON-WATCH-01 DEFERRED to v1.7 (D-02) — SC38-7 stays unfired.

### Phase 39: Operator Visibility — Token Budget + Cost-Shadow + LLM Flight Recorder

**Goal:** Give the operator a Bearer-gated dashboard surface for per-provider token usage vs cap (with soft 0.8 / hard 0.95 threshold proximity bars), today's cost-shadow USD accrual, and a Redis-backed LLM flight recorder (call history + per-run summaries) that survives Vercel Fluid Compute warm-start gaps. Absorbs the previously-rejected Phase 27.4.5 (operator reversed at v1.6 lock-in), adapted to the v3-only pipeline.

**Depends on:** Phase 38 LLM-PURGE-06 (env-var cleanup) before BudgetBlock's per-provider extensibility hook lands cleanly. Interleavable with Phase 38.

**Requirements:** BUDGET-01, BUDGET-02, BUDGET-03, BUDGET-04, OBS-FLIGHT-01, OBS-FLIGHT-02, OBS-FLIGHT-03, OBS-FLIGHT-04, OBS-FLIGHT-05, OBS-FLIGHT-06

_10 REQ-IDs — by strand: BUDGET (4) · OBS-FLIGHT (6)._

**Success Criteria** (what must be TRUE when this phase completes):

1. **SC39-1** Operator reads per-provider token usage vs cap (NIM single-provider today, extensibility-shaped) with soft (0.8) / hard (0.95) threshold proximity bars AND today's running cost-shadow USD accrual at a glance — both surface in `DevApiStatus.tsx` as a `BudgetBlock` component sourced from `llm:tokens:{provider}:YYYY-MM-DD` + `events:llm-cost-shadow:v3:{YYYY-MM-DD}` HSET fields. Trend bar/sparkline across the 90d retention window. _(BUDGET-01, BUDGET-02)_
2. **SC39-2** Bearer-gated `GET /api/operator-status` exposes a new `tokenBudget` field (degrade-open on Redis fail; mirrors existing `actorQuality` block pattern). Contract test pins the shape with Zod `.strict()` so dashboard regression fails the build. _(BUDGET-03, BUDGET-04)_
3. **SC39-3** Operator drills from a run list (newest first, colored outcome badge, batch progress bar, token spend bar, eval score) into per-call timing, provenance distribution, DLQ groups, and watchdog timeouts via the `FlightRecorderBlock`. Redis-backed `llm:calls:history` (LPUSH+LTRIM 500-entry cap, 30d TTL) and `llm:runs:history` (LPUSH+LTRIM 200-run cap, 30d TTL) replace in-memory `callHistory` lost on cold start. Cold-start hydration populates in-memory state from Redis LRANGE on first `/llm-status` or `/llm-history` request, surviving Vercel Fluid Compute warm-start gaps (mirrors Phase 28.2.7 `llm:lastProgress` write-through pattern). _(OBS-FLIGHT-01, OBS-FLIGHT-02, OBS-FLIGHT-04, OBS-FLIGHT-06)_
4. **SC39-4** Bearer-gated `GET /api/events/llm-history` (operator-only; promoted from the original Phase 27.4.5 `NODE_ENV !== 'production'` gate to match `/api/operator-status` precedent) returns `{ runs: [...], calls: [...] }` with optional `?runId=X` and `?limit=N` query params. Every LLM call dispatched during a single `runRefreshExtraction` invocation carries its parent run's `runId` for back-correlation in the UI. _(OBS-FLIGHT-03, OBS-FLIGHT-05)_

**Plans:** 5/5 plans complete

**Wave 1** _(parallel — no file overlap)_

- [x] 39-01-PLAN.md — Flight-recorder data layer: RunHistoryEntry/CallHistoryEntry types + runId field; llm:calls:history + llm:runs:history Redis modules; 3-surface registry registration (HARD gate) [OBS-FLIGHT-01, -02, -06]
- [x] 39-03-PLAN.md — tokenBudget degrade-open block on /api/operator-status + Zod .strict() contract test + exported ratio constants [BUDGET-03, -04]

**Wave 2** _(after 39-01)_

- [x] 39-02-PLAN.md — runId threading + run-record open/close lifecycle (5 exit branches) + call dual-write on success+failure paths + batchIndex threading [OBS-FLIGHT-02, -05]

**Wave 3** _(after 39-01 + 39-02)_

- [x] 39-04-PLAN.md — Bearer-gated GET /api/events/llm-history ({runs,calls} + ?runId/?limit) + cold-start hydration hooks + route test [OBS-FLIGHT-03, -06]

**Wave 4** _(after 39-03 + 39-04)_

- [x] 39-05-PLAN.md — BudgetBlock + FlightRecorderBlock components mounted in DevApiStatus (functional baseline per GA-1; GA-3 90d sparkline deferred to Phase 40) [BUDGET-01, -02, OBS-FLIGHT-04]

**UI hint**: yes

### Phase 40: Dashboard UI/UX Polish + Subtab Consolidation

**Goal:** Drive the API Health tab from the current ~13-sub-block accumulation through Phase 28.2 + 32 + 33 + 35 + (incoming) 39 into a navigable, polished portfolio surface with 3-4 grouped sections per UI-SPEC.md. Visual polish pass (typography, spacing, color tokens), tab navigation refinement, and RTL regression-lock against the consolidated layout. Pairs naturally with Phase 39's incoming BudgetBlock + FlightRecorderBlock — UI-SPEC.md MUST account for their placement before any consolidation code lands.

**Depends on:** Phase 39 component shapes locked (BudgetBlock + FlightRecorderBlock shipped or shape-frozen) before UI-POLISH-02 finalizes consolidated layout. UI-POLISH-01 (UI-SPEC.md design contract via `/gsd:ui-phase`) runs FIRST and gates downstream UI-POLISH-02..05 code work.

**Requirements:** UI-POLISH-01, UI-POLISH-02, UI-POLISH-03, UI-POLISH-04, UI-POLISH-05

_5 REQ-IDs — UI-POLISH (5)._

**Success Criteria** (what must be TRUE when this phase completes):

1. **SC40-1** UI-SPEC.md design contract is published BEFORE any DevApiStatus consolidation code lands — defines post-polish information hierarchy, sub-block grouping (including Phase 39 BudgetBlock + FlightRecorderBlock placement), and visual treatment. Coordinates with Phase 39 to prevent double-touching components. _(UI-POLISH-01)_
2. **SC40-2** Operator navigates the API Health tab through 3-4 grouped sections (down from ~13 stacked sub-blocks) with polished typography hierarchy, spacing system, color tokens (`colorBridge.ts` extended for any new semantic tokens), responsive layout for narrower viewports, and improved focus state / active-tab affordance / keyboard navigability. `agent-native-reviewer` parity verified — every UI action has an agent-callable equivalent (Bearer-gated endpoint or query param). Uses `frontend-design` skill conventions; no generic AI aesthetics. _(UI-POLISH-02, UI-POLISH-03, UI-POLISH-04)_
3. **SC40-3** Each sub-block carries RTL component tests for its render contract (counts surface correctly under fresh / stale / degraded states); the consolidated layout shape is snapshot-locked so regressions surface as snapshot diffs. _(UI-POLISH-05)_

**Plans:** 3/4 plans executed

**Wave 1**

- [x] 40-01-PLAN.md — Foundation: 3 `--color-status-*` tokens (app.css + colorBridge + sentinel) + uiStore session-scoped collapse/drawer state [UI-POLISH-03]

**Wave 2** _(after 40-01)_

- [x] 40-02-PLAN.md — Core restructure: DevApiStatusAllApisTab → hero + 4 collapsible groups + drawer + muted-placeholder degrade + status-token migration [UI-POLISH-01, -02, -03]

**Wave 3** _(after 40-02 — same file, sequenced to avoid merge conflict)_

- [x] 40-03-PLAN.md — Tab-bar interaction affordances: focus-visible ring + 2px active indicator + roving keyboard nav + tabpanel roles + agent-native parity checkpoint [UI-POLISH-04]

**Wave 4** _(after 40-02 + 40-03)_

- [ ] 40-04-PLAN.md — Regression-lock: 8 RTL render-contract assertions + consolidated-layout snapshot [UI-POLISH-05]

**UI hint**: yes

### Phase 41: Public Reveal Polish

**Goal:** Ship the public-reveal portfolio surface — both the agentic-development meta-story (Strand A from former Phase 999.6: BUILDING-WITH-CLAUDE-CODE.md + SHOWCASE.md + JOURNEY.md + concepts.md + COSTS.md + operator-guide.md + LESSONS.md + screenshots + brainstorms cleanup) and the user-facing landing-page polish (REVEAL-SITE: landing-page hero, demo flows, social-share assets, custom-domain decision). A final-sweep audit against then-current main runs BEFORE any REVEAL-DOCS work lands.

**Depends on:** Phases 38 + 39 + 40 close so the `project-v1-6-cleanup-punchlist` and `project-v1-6-docs-drift` memories can be refreshed against post-phase-38/39/40 reality. REVEAL-SITE-01 coordinates with Phase 40 UI-POLISH-04 to avoid double-touching the dev shell.

**Requirements:** REVEAL-DOCS-01, REVEAL-DOCS-02, REVEAL-DOCS-03, REVEAL-DOCS-04, REVEAL-DOCS-05, REVEAL-DOCS-06, REVEAL-DOCS-07, REVEAL-DOCS-08, REVEAL-DOCS-09, REVEAL-DOCS-10, REVEAL-SITE-01, REVEAL-SITE-02, REVEAL-SITE-03, REVEAL-SITE-04

_14 REQ-IDs — by strand: REVEAL-DOCS (10) · REVEAL-SITE (4)._

**Success Criteria** (what must be TRUE when this phase completes):

1. **SC41-1** Final-sweep audit re-runs against then-current `main` BEFORE any REVEAL-DOCS work lands — `project-v1-6-cleanup-punchlist` + `project-v1-6-docs-drift` memories refreshed against post-Phase-38/39/40 reality, net-new findings merged into Phase 41 scope, captured-but-resolved items dropped. _(REVEAL-DOCS-10)_
2. **SC41-2** Portfolio visitor lands on a 1-page guided-tour hub (`SHOWCASE.md`) and can reach the agentic-dev meta-story (`BUILDING-WITH-CLAUDE-CODE.md` ~600-1000 lines covering `/gsd` workflow, where compounding worked, where it didn't, cost observations) AND the product-arc narrative (`JOURNEY.md` with Mermaid gantt) AND the architectural decisions (ADR-0005 NLP scrap + ADR-0010 v1.5 close) in 1 click each. _(REVEAL-DOCS-01, REVEAL-DOCS-02, REVEAL-DOCS-03)_
3. **SC41-3** Glossary (`concepts.md` ~30 terms: Pitfall 1, LLM-optional, tier-green gate, polite-citizen, ghost event, canonical actor catalog, mechanical drift gate, degrade-open, 6-path resolver, honest deferral, probe-before-commit, flight recorder, …) + cost transparency (`COSTS.md`) + visitor operator-guide (`operator-guide.md` clone+run, force-trigger cron, prune dead URLs, read `/api/operator-status`, run eval, capture hero GIF) + distilled lessons (`LESSONS.md` pulled from `.planning/RETROSPECTIVE.md`) + brainstorms/superpowers cleanup ship as portfolio-readable docs. `public/screenshots/` extended with ~10 layer-by-layer captures (each viz layer + API Health + threat-density clusters + actor-quality drill-down + ghost-event prune flow + FlightRecorderBlock drill-down); `npm run capture:layers` reproduces them. _(REVEAL-DOCS-04, REVEAL-DOCS-05, REVEAL-DOCS-06, REVEAL-DOCS-07, REVEAL-DOCS-08, REVEAL-DOCS-09)_
4. **SC41-4** User-facing reveal surface polished: landing-page hero/layout/copy refined (dashboard-is-landing-page vs separate-landing decision precedes the polish; coordinates with Phase 40 UI-POLISH-04); demo flows shipped (guided tour overlays, scripted walkthroughs, or `?demo=true` query param); social-share assets shipped (OG image/card, Twitter card, favicon refresh) verified across LinkedIn / Twitter / direct share previews; custom-domain decision made (stay on `otg-iran-monitor.vercel.app` or migrate). _(REVEAL-SITE-01, REVEAL-SITE-02, REVEAL-SITE-03, REVEAL-SITE-04)_

**Plans:** TBD (created via `/gsd:plan-phase 41`)

**UI hint**: yes

### Progress Table

| Phase | Name                                                                  | Plans Complete | Status      | Completed  |
| ----- | --------------------------------------------------------------------- | -------------- | ----------- | ---------- |
| 38    | LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup | 6/6            | Complete    | 2026-06-04 |
| 39    | Operator Visibility — Budget + Cost + LLM Flight Recorder             | 5/5            | Complete    | 2026-06-04 |
| 40    | Dashboard UI/UX Polish + Subtab Consolidation                         | 3/4            | In Progress |            |
| 41    | Public Reveal Polish                                                  | 0/TBD          | Not started | —          |

## Deferred Work

Carried from v1.2:

- **Satellite Imagery** -- ArcGIS World Imagery as semi-transparent overlay

Deferred from v1.3:

- **GDELT BigQuery adapter** -- SQL-based querying with full column access (requires GCP project)
- **Telegram channel monitoring** -- GramJS/TGSTAT for OSINT early-warning signals

Deferred from v1.5:

- **Cerebras + Groq router fallback** -- Phase 34 closed as `cerebras-groq-deferred` (operator skipped probe). Planning artifacts (CONTEXT + RESEARCH + 5 PLANs) preserved at `.planning/milestones/v1.5-phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/` as the ready-to-execute audit trail for any future provider-restoration phase. v1.6 Phase 38 LLM-PURGE-07 deletes the adapter source files; restoration would need a fresh milestone-start decision and would re-import from git history.
- **Phase 31 reopening** -- 7-day cron stability watch, this time finished. v1.6 Phase 38 CRON-WATCH-01 carries this as an OPTIONAL absorption; lock at `/gsd:discuss-phase 38`. If not absorbed there, carries to v1.7.
- **Open-Meteo cache-write policy** -- `server/routes/water.ts:358-360` empty-result skip caused Phase 37 audit failures; tightened by v1.6 Phase 38 LLM-FIX-02.
- **`news:feed` cron warmer** -- Vercel Pro cron quota likely supports a 4th entry; CLAUDE.md "Hobby cap 3" framing repaired by v1.6 Phase 38 VERCEL-PRO-04. Warmer itself folds into Phase 38 if scope allows during 38-CONTEXT; otherwise carries to v1.7.
- **Probe-side `lastErrorReason` token rename** -- `'llm-optional-fallback-active'` reused for news case in PR #33 (mechanical mirror); v1.6 Phase 38 LLM-FIX-01 splits the token.

## Backlog

### Phase 999.1: Remove or relax `rateLimiters.public` global tier — FOLDED INTO PHASE 28.2

**Goal:** Resolve operator-blocking rate limit. The 6 req/min global tier in `server/middleware/rateLimit.ts` (applied at `server/index.ts:99` to all `/api/*`) blocks the operator's own browser — flights polling alone is 12 req/min. Three options scoped earlier: (a) remove global tier (per-endpoint limits already tuned for browser), (b) bump to 300/min to keep loose anti-scraper net, (c) bypass when `DASHBOARD_PASSWORD` Bearer present.
**Resolution:** Folded into Phase 28.2 on 2026-04-30 per 28-CONTEXT.md D-04 — option (c) Bearer-bypass selected. This entry remains for historical traceability.
**Requirements:** Subsumed by 28-CONTEXT.md D-04
**Plans:** 7/7 plans complete

### Phase 999.2: `api/vercel-entry.js` build-artifact discipline (BACKLOG, likely-absorbed-by Phase 38 VERCEL-PRO-02)

**Goal:** Eliminate manual rebuild-before-commit friction introduced in commit `155989f`. Today the 1.7MB tsup-bundled function is tracked in git so Vercel detects it as a serverless function. Two long-term options: (a) add a CI check that fails if `api/vercel-entry.js` is stale relative to `server/**/*`; (b) migrate to Vercel's Build Output API (`.vercel/output/functions/api/vercel-entry.func/`) so the function is generated into Vercel's expected location during build, eliminating the tracked artifact.
**Status:** Likely absorbed by v1.6 Phase 38 VERCEL-PRO-02 (Build Output API evaluation). Closes naturally if pursued; carries to v1.7 if VERCEL-PRO-02 lands the "defer" decision.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (likely absorbed by Phase 38 VERCEL-PRO-02; otherwise promote with /gsd-review-backlog)

### Phase 999.3: Phase 27.4.6 cron first-tick verification (BACKLOG)

**Goal:** Confirm the `/api/cron/refresh-events` cron actually fires at 4am UTC, populates `events:llm:v3`, and `/api/events/llm-status` reports `lastTriggerSource: "cron"`. Passive verification — happens automatically, but no current alarm if it doesn't. Watch `dlqCount` after the first tick: non-zero means NIM was throttled (D-08 path) and operator must `?force=true` after NIM recovers. If 24h pass with `lastTriggerSource` never flipping to "cron", run the 8-step PLAN.md Task 6 curl checklist for diagnosis.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: Cron route hydrates pipeline override (BACKLOG, RETIRED in v1.5)

**Goal:** Wire `await refreshPipelineOverride()` into `server/routes/refresh-events-cron.ts` at handler start so runtime POST `/api/events/llm-pipeline {version: 'v3'}` overrides actually propagate to cron-triggered runs. Surfaced 2026-05-07 during Phase 28.2.6 deploy.
**Status:** RETIRED in v1.5 Phase 29 — `POST /api/events/llm-pipeline` override route and the `events:llm-pipeline-override` Redis key were deleted entirely (D-02 supersedes Phase 27.4 D-26/D-40 deep-rollback lock). There is no longer a pipeline-override surface to hydrate; v3-or-nothing is mechanical. Backlog entry preserved for historical traceability.
**Plans:** N/A (obsoleted by Phase 29)

### Phase 999.5: Performance Optimization + 1–300 VU Load Test (BACKLOG, deferred from v1.6 first-task position)

**Goal:** Per 28-CONTEXT.md D-01/D-02 (originally v1.4's closing phase as 28.3, deferred 2026-05-08): validate production handles 1–300 concurrent users with measurable PASS/FAIL signal against a clean codebase. Performance optimization layer per D-19: add `s-maxage` CDN headers to `/api/*` (flights 5s, ships 30s, markets 60s, events/news 900s, sites/water 86400s) so Vercel CDN absorbs bulk reads at 300 VU and Redis only fires on cache miss + warm-up cron. k6 sweep per D-15 (GitHub Actions runner, results land as PR artifacts) / D-16 (six discrete tiers 50/100/150/200/250/300 VU, 60s ramp + 5min steady, ~45min wall-time per sweep) / D-20 (full browser-loop per VU). PASS/FAIL bar per D-17 (measured at 300 VU steady-state): p95<500ms hot endpoints, p99<1500ms, error<1%, no 5xx spikes, cache-hit>90% (non-negotiable). Beyond PASS/FAIL per D-18: per-endpoint latency breakdown, 429 count (validates D-04 Bearer-bypass), Vercel cold-start frequency (validates warm-up cron sufficiency), Upstash Redis cache hit ratio.
**Why deferred (v1.4 → v1.5 → v1.6):** v1.4 close audit (2026-05-08) found `prod-connectivity-audit.yml` tier-green gate still red on `critical[llmEvents]: unknown`. Promotion gate satisfied in v1.5 Phase 37 (2026-06-03). v1.6 milestone-start (2026-06-03) operator deferred 999.5 from first-task position to prioritize LLM-pipeline reliability + budget visibility + UI polish + public reveal first. Ready for promotion to v1.7 first-task.
**Promotion gate:** **SATISFIED in v1.5 Phase 37 (2026-06-03)** — 3 consecutive greens captured (Run 1 `26771054370` · Run 2 `26856054351` · Run 3 `26856364229`). Operator-deferred at v1.6 lock-in; promotes to v1.7 as the first phase.
**Depends on:** v1.6 closed (so the CDN-header work composes against post-Phase-38 cleanup).
**Requirements:** Derived from 28-CONTEXT.md (umbrella) — child scope: D-01 / D-02 / D-15 / D-16 / D-17 / D-18 / D-19 / D-20 / D-21 + Claude's-discretion items. Decision lock preserved verbatim at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`.
**Plans:** 0 plans

Plans:

- [ ] TBD (promote at v1.7 start with `/gsd:new-milestone`)

### Phase 999.6: Portfolio Documentation Polish + Vercel Pro Cleanup-and-Repair — RETIRED (folded into v1.6)

**Status:** RETIRED at v1.6 milestone-start (2026-06-03). Two strands split across two v1.6 phases:

- **Strand A — Portfolio documentation polish (10 doc surfaces)** → absorbed into **v1.6 Phase 41 Public Reveal Polish** (REVEAL-DOCS-01..10). Final-sweep audit requirement preserved as REVEAL-DOCS-10.
- **Strand B — Vercel Pro cleanup-and-repair (code + docs)** → absorbed into **v1.6 Phase 38 LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup** (VERCEL-PRO-01..04). Phase 999.2 (api/vercel-entry.js build-artifact discipline) likely folds into VERCEL-PRO-02 (Build Output API evaluation).

Backlog entry preserved for historical traceability — original 999.6-CONTEXT.md at `.planning/phases/999.6-portfolio-documentation-polish/999.6-CONTEXT.md` remains the source-of-truth for the strand-scope rationale that was carried into Phase 38 + Phase 41 CONTEXT files.

**Plans:** N/A (obsoleted by v1.6 phase absorption)
