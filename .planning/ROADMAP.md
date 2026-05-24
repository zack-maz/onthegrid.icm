# Roadmap: Iran Monitor

## Milestones

- **v0.9 MVP** -- Phases 1-12 (shipped 2026-03-19)
- **v1.0 Deployment** -- Phases 13-14 (shipped 2026-03-20)
- **v1.1 Intelligence Layer** -- Phases 15-19.2 (shipped 2026-03-22)
- **v1.2 Visualization & Hardening** -- Phases 20-21.3 (shipped 2026-03-29)
- ✅ **v1.3 Data Quality & Layers** -- Phases 22-26.4 (shipped 2026-04-09) — [archive](milestones/v1.3-ROADMAP.md)
- ✅ **v1.4 GDELT Redo & Performance** -- Phases 27-28.2.7 (shipped 2026-05-08); load-test phase deferred to backlog (999.5) — [archive](milestones/v1.4-ROADMAP.md), [audit](milestones/v1.4-MILESTONE-AUDIT.md)
- 🚧 **v1.5 LLM Reliability & Reveal Prep** -- Phases 29-37 (started 2026-05-09); 47 requirements across 9 phases (Vercel Pro upgrade locked in Phase 29; SIMPLIFY-\* track retires Hobby-era workarounds; Phase 34 router fallback re-integration added 2026-05-19 with LLM-RELI-08..11); acceptance gate = 3 consecutive prod-connectivity-audit.yml exit-0 runs (unblocks 999.5 load test for v1.6)

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

**Deferred:** Phase 28.3 → Phase 999.5 backlog (Performance Optimization + 1–300 VU k6 sweep). Decision lock preserved at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`. Promotion gate: 3 consecutive `prod-connectivity-audit.yml` runs exit 0 with `allTiersGreen=true`.

**Headlines:** Structured LLM extraction (Cerebras → Groq → NIM v3 with parallel concurrency limiter) replacing scrapped NLP attempt. Daily cron triad (`/api/cron/{health,warm,refresh-events}`) with `waitUntil` durability + cold-cache self-heal. 6-path geocode resolver. Eval harness (50 ground-truth events / 11 countries). Adversarial prompt-injection robustness fixtures. Cleanup sweep (knip + ts-prune triage, 12 operator-tunable env vars, CSS `@theme` color tokens, 0 TS errors / 0 lint errors baseline). Domain rename to `otg-iran-monitor.vercel.app`. Bearer-bypass rate limiter. Unified `API Health` dashboard tab. Manual-trigger `prod-connectivity-audit.yml` workflow with tier-green sidecar assertion. Phase 28.2.7 closes the audit-tier completeness loop (cron `lastTick` writers + Redis-first `probeLlmStatus` + honest-stub `probeProbeOnly`).

**Quantitative delta (v1.3 close → v1.4 close):**

- Tests: ~1700 → 2193 (+493)
- TypeScript errors: 8 → 0
- Cron jobs: 2 → 3 (within Hobby cap)
- Critical-tier endpoints: 3 → 4 (+ `llmEvents`)
- Eval ground-truth set: 0 → 50 events
- Bundle: 1.2 MB → 1.72 MB

</details>

## Milestone v1.5: LLM Reliability & Reveal Prep — 🚧 IN PROGRESS

**Started:** 2026-05-09
**Predecessor:** v1.4 GDELT Redo & Performance (shipped 2026-05-08)
**Acceptance gate:** `prod-connectivity-audit.yml` exit-0 with `audit:connectivity:last-result.allTiersGreen === true` for **3 consecutive runs** (LLM-RELI-07). Hitting this gate unblocks 999.5 (k6 load test) for promotion into v1.6.
**Scope:** 8 phases (29–36) covering **43 requirements** across **8 tracks**: LLM-RELI (provider chain narrowing + NIM tuning + LLM-optional architecture), GHOST (dead-source-URL probing + pruning), ACTOR (actor metadata audit + canonical catalog + eval expansion), DOCS-INT (CLAUDE.md trim + JSDoc audit + Redis registry verification), REDIS-OPT (key inventory + classification + TTL right-sizing + budget delta), **SIMPLIFY (retire Hobby-era workarounds + dead-code purge — 7 reqs, the Pro upgrade and chain narrowing turn into actual code deletion)**, DOCS-PUB (README + architecture + runbook + ADR-0010 + degradation contract), DOCS-API (OpenAPI additions for 7 v1.4-introduced endpoints).

### Phases

- [x] **Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + Cerebras/Groq Adapter Purge + v1/v2 Extractor Deletion + CLAUDE.md Trim** — Retire Cerebras + Groq from the active v3 cascade; **delete v1 + v2 extractor modules entirely** (modules + `POST /api/events/llm-pipeline` override endpoint + `events:llm-pipeline-override` Redis key + DevApiStatus Pin-to-v1/v2 buttons all removed; rationale folded into ADR-0010 at Phase 37 with stub written here — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` already occupies the 0009 slot); prove the map renders cleanly on raw GDELT when both NIM + OpenRouter keys are absent (CI integration test + runbook entry); upgrade Vercel project to Pro plan and bump `vercel.json` `maxDuration` from 300 → 800 as the **first** phase commit; purge the now-unused Cerebras + Groq adapter code paths from `server/adapters/llm-provider.ts` (SIMPLIFY-04); trim CLAUDE.md phase-history bloat down to current-state invariants targeting <10k tokens (DOCS-INT-01, pulled from Phase 35 on 2026-05-09). _(SIMPLIFY-06 v1 archive folded forward into deletion here — Phase 35's old criterion #8 becomes inapplicable.)_ (completed 2026-05-11)
- [x] **Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications** — Empirically characterize NIM throttle window + RPM ceiling + recovery signal; tune `LLM_BATCH_SIZE`, `LLM_V3_CONCURRENCY`, retry/backoff parameters against measured data; retire the 28.2.6 incremental-flush mechanism (SIMPLIFY-01) and relax watchdog defaults (SIMPLIFY-03) — both are Hobby-era 300s-budget workarounds that the Pro 800s ceiling makes deletable. (completed 2026-05-17)
- [x] **Phase 31: Cron Stability Validation (7-day Watch)** — Closed early under operator decision 2026-05-19 at Day 1 / 7 (Day-1 natural cron PASS, commit `d0c16e4`). LLM-RELI-06 declared "validated single-day, monitoring continues opportunistically" — see [`docs/architecture/llm-pipeline-reliability.md` §7-Day Watch](../docs/architecture/llm-pipeline-reliability.md#close-summary-early--2026-05-19) and [`.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md`](phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md) for caveat + resume path. Snapshot harness remains operational.
- [x] **Phase 32: Ghost Event URL Liveness, Dashboard & Prune** — Probe `sourceURL` liveness out-of-band, persist results to Redis with TTL, surface dead-URL counts in API Health dashboard, and let the operator prune dead-URL events behind the existing Bearer gate. (completed 2026-05-21; GHOST-01..05 all closed; 6 plans 32-01..32-06; 22 D-N decisions landed atomically; +63 tests; 2259 total passing.)
- [x] **Phase 33: Actor Metadata Audit, Canonical Catalog & Eval Expansion** — Audit live `events:llm:v3` actor quality; commit canonical actor catalog; extend v3 prompt + schema with `actorConfidence`; extend ground-truth + adversarial fixtures; surface actor-quality counts in dashboard. (completed 2026-05-21; ACTOR-01..05 all closed; 7 plans 33-01..33-07; 28 atomic commits; +63 new tests; 2340 total passing; zero new npm deps; AUDIT-REPORT.md population pending operator UAT against staging Redis.)
- [x] **Phase 34: LLM Router Fallback Re-integration (Cerebras / Groq + Per-Provider Eval)** — ✓ CLOSED 2026-05-23 as `cerebras-groq-deferred` (operator chose to skip provisioning free-tier accounts; no probe ran). Plans 34-01..04 SKIPPED; only Plan 34-05 close-out executed. ADR-0010 Phase 34 sub-block + `docs/architecture/llm-pipeline-reliability.md` "Multi-Provider Cascade (Phase 34)" section record the deferral rationale. Phase 31 Day-1 DLQ baseline (4 × `v3:timeout_watchdog`) remains a known failure mode under the single-provider cascade. Planning artifacts (CONTEXT/RESEARCH/5 PLANs) preserved in `.planning/phases/34-.../` as the ready-to-execute audit trail for any future provider-restoration phase.
- [ ] **Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup Sweep** — Bring LLM-pipeline JSDoc current; verify Redis key registry against actual writers/readers; produce key inventory artifact; classify load-bearing vs observability vs retire; right-size TTLs; measure pre/post command-budget delta. **Plus** retire `events:llm:v3:partial` (SIMPLIFY-02), audit + delete `freeClaudeRouter.ts` if orphaned (SIMPLIFY-05), and measure final `api/vercel-entry.js` bundle-size delta vs v1.4's 1.72 MB baseline (SIMPLIFY-07). _(DOCS-INT-01 CLAUDE.md trim moved to Phase 29 on 2026-05-09. SIMPLIFY-06 v1 archive folded into Phase 29's full deletion.)_
- [ ] **Phase 36: Public Docs Sweep + OpenAPI Additions** — Update README, 10 architecture markdown files, 676-line SRE runbook, degradation contract for v1.4 + v1.5 surface; add 7 v1.4-introduced endpoints to the 1164-line OpenAPI 3.0.3 spec.
- [ ] **Phase 37: ADR-0010 + Acceptance Gate Closeout** — Capture v1.5 LLM-pipeline decisions in a new ADR (ADR-0010 — the 0009 slot is taken by the existing Accepted two-key-split ADR); observe `prod-connectivity-audit.yml` exit-0 with `allTiersGreen=true` for 3 consecutive runs; lock the milestone close.

### Phase Details

### Phase 29: LLM Provider Chain Narrowing + LLM-Optional Architecture + Vercel Pro Upgrade + CLAUDE.md Trim

**Goal**: Active runtime LLM cascade narrowed to NIM + OpenRouter only, the map proven to render cleanly on raw GDELT when both keys are absent, the Vercel project upgraded to Pro so the daily LLM cron has 800s wall-clock (vs Hobby's 300s) — Phase 30's tuning happens against the Pro ceiling, not the Hobby ceiling — **AND** CLAUDE.md trimmed to current-state invariants. The CLAUDE.md trim ships in the same phase as the cascade narrowing because (a) the Cerebras + Groq narrative blocks become obsolete the moment SIMPLIFY-04 lands, so doing the trim later means re-reading stale prose; and (b) Phase 30/31's tuning + 7-day watch read CLAUDE.md as the working spec — a leaner doc improves their signal.
**Depends on**: Nothing (first v1.5 phase; v1.4 base is stable).
**Requirements**: LLM-RELI-01, LLM-RELI-05, SIMPLIFY-04, SIMPLIFY-06 (folded forward from Phase 35 on 2026-05-09 — full deletion not archive), DOCS-INT-01 (pulled from Phase 35 on 2026-05-09)
**Success Criteria** (what must be TRUE):

1. Operator inspecting the running pipeline (via `/api/events/llm-status` or DevApiStatus events tab) sees only `nim` and `openrouter` provider names appearing in `callHistory`; Cerebras + Groq are absent from the active cascade and from `isLLMConfigured` gating.
2. With `NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` both unset locally (or `LLM_PIPELINE_ENABLED=false` if a kill-switch lands), `GET /api/events` still returns events sourced from raw GDELT through the Pitfall 1 cache bridge — the map continues to populate.
3. v1 + v2 extractor modules + the `POST /api/events/llm-pipeline` override route + the DevApiStatus Pin-to-v1/v2 buttons are DELETED (D-02 supersedes Phase 27.4 D-26/D-40 deep-rollback lock). Rollback path is `git revert <Phase 29 commit range>` — wall-clock minutes, not a Bearer-POST flip. Rationale captured in ADR-0010 stub written this phase.
4. The existing degradation contract (`docs/degradation.md`) is honored — no regression in the "map never goes blank" guarantee under any provider-key permutation.
5. **Vercel project `otg-iran-monitor` is on the Pro plan** (operator action: upgrade in Vercel dashboard, $20/mo); `vercel.json` `functions["api/vercel-entry.js"].maxDuration` is bumped from 300 → 800; redeploy lands cleanly. Verifiable by running a longer-than-300s synthetic invocation against `/api/cron/refresh-events?force=true` without the function being killed at the 300s cliff.
6. **Cerebras + Groq adapter dead code purged** (SIMPLIFY-04). `server/adapters/llm-provider.ts` runtime path no longer imports or branches on Cerebras / Groq. The synthetic `skipReason: 'no_client'` callHistory entries for those providers are gone. `CEREBRAS_API_KEY` / `GROQ_API_KEY` env-var checks removed from `isLLMConfigured` (`NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` are the only keys gating). Cerebras + Groq adapter _source files_ themselves stay in `server/adapters/` (importable for emergency rollback) but no production code path imports them. v1 + v2 extractor modules are DELETED per Criterion 3 — the rollback path for the entire Phase 29 surface is `git revert <Phase 29 commit range>`.
7. **CLAUDE.md trimmed** (DOCS-INT-01, pulled from Phase 35). Phase-history bloat condensed to current-state invariants only. Aggressive trim target: current ~17.5k tokens → <10k tokens (verified 2026-05-09 from `wc -c CLAUDE.md = 70461`). Restructure to current-state-invariants only — keep Project Context, Conventions, Env Vars, Color Tokens, Map Patterns, Testing, Key Files, Data Model, Vercel Deployment, Serverless Cache (registry only). Delete ALL phase-narrative blocks (Phase 4+ through Phase 28.2.5) — replace each with a 1-line link to its archived ROADMAP entry. Cerebras + Groq narrative blocks deleted (SIMPLIFY-04 obsoletes them). v1 + v2 extractor narrative blocks deleted (this phase obsoletes them). Verification: token count before/after committed in SUMMARY + 5-item operator spot-check (Redis key contracts, env vars, color tokens, domain constants, cron schedule all findable in <30s of skim).
8. **v1 + v2 extractor modules deleted** (folded from SIMPLIFY-06; supersedes Phase 27.4 D-26/D-40 deep-rollback lock). `server/lib/llmEventExtractor.v1.ts` + `server/lib/llmEventExtractor.v2.ts` removed from the codebase. Override endpoint `POST /api/events/llm-pipeline` route + `events:llm-pipeline-override` Redis key + `refreshPipelineOverride()` helper + `setPipelineOverride()` removed. DevApiStatus Pin-to-v1/v2 buttons + confirm-modal removed (Phase 28.2 W5 D-22 surface). Rationale captured in ADR-0010 stub written this phase (full ADR completed at Phase 37; `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` already occupies the 0009 slot): v1→v2→v3 evolution, v3 cascade has been live since Phase 27.4 (~2026-04-21), Pitfall 1 cache bridge handles "map never goes blank" independently of which extractor is active, rollback path is now `git revert` of the Phase 29 commit range.
   **Plans**: TBD
   **Operator out-of-band action**: upgrade Vercel project to Pro plan BEFORE the first Phase 29 plan runs (the maxDuration 300→800 bump is the first commit on the phase branch and depends on Pro being active).

### Phase 30: NIM Throttle Characterization + Cascade Tuning + Pro-Enabled Simplifications

**Goal**: Concrete, measured numbers (not guesses) drive `LLM_BATCH_SIZE`, `LLM_V3_CONCURRENCY`, and `callLLM` retry/backoff defaults — tuned against the **800s Vercel Pro ceiling landed in Phase 29**, not the prior 300s Hobby ceiling. The throttle behavior is documented in writing. Two Hobby-era workarounds (incremental flush + aggressive watchdog) are retired in the same phase because the new defaults are sized against the post-simplification flow, not the v1.4 flow.
**Depends on**: Phase 29 (must run against the narrowed NIM + OpenRouter cascade AND the upgraded 800s `maxDuration` so the telemetry reflects the v1.5 production shape, not the v1.4 Hobby shape).
**Requirements**: LLM-RELI-02, LLM-RELI-03, LLM-RELI-04, SIMPLIFY-01, SIMPLIFY-03
**Success Criteria** (what must be TRUE):

1. A new section in CLAUDE.md or a dedicated `docs/architecture/llm-pipeline-reliability.md` records the observed NIM throttle window length, requests-per-minute ceiling, and recovery signal pattern — sourced from at least one full extraction run instrumented end-to-end on the Pro 800s ceiling.
2. `LLM_BATCH_SIZE` and `LLM_V3_CONCURRENCY` defaults are committed in code with the prior values noted in commit / ADR; new defaults exploit the 800s headroom (likely lower CONCURRENCY, higher BATCH_SIZE compared to v1.4's 12 / 2 — friendlier to NIM throttle); an extraction run at the new defaults completes without tripping the watchdog more than the documented baseline.
3. `callLLM` per-event retry budget, exponential-backoff base, and jitter window are committed as numbers tied to the measured throttle window (e.g. backoff base = throttle window / N) — retry budget can be more generous now that 800s wall-clock is available.
4. A short replay of `runEval()` against `.planning/eval/ground-truth-events.json` confirms accuracy at 5/20/100 km has not regressed beyond noise floor after the tuning lands.
5. **Incremental flush retired** (SIMPLIFY-01). `mergeAndPersistLlmEntities` is no longer called from `onBatchComplete`; the single terminal-key write at end-of-run is the canonical shape. `LLM_FLUSH_EVERY_N_BATCHES` env var deleted from `.env.example`, code, and docs. Redis SET-call count per cron run drops measurably (capture the delta).
6. **Watchdog defaults relaxed** (SIMPLIFY-03). 90s hard / 60s soft per-batch timeouts replaced with values sized against the measured throttle (or the soft-warn category eliminated entirely if the data says it adds no signal). New defaults committed; `callHistory` skip-entry shape for soft-warn either reflects the new threshold or is removed.
   **Plans**: TBD

### Phase 30.1: Cascade fallback fix — re-enable OpenRouter or document single-provider reality (INSERTED)

**Goal:** Either re-enable the OpenRouter fallback that has been silently disabled since Phase 27.4.4 (`skipOpenRouter: true` hardcoded in `server/lib/llmEventExtractor.v3.ts:622, 929`) OR honestly amend the docs that advertise a NIM → OpenRouter cascade that does not exist at runtime. Drive the choice from one fresh measurement of OpenRouter free-tier rate-limit behavior via `scripts/probe-openrouter.ts`. Makes the Phase 29 D-01 cascade declaration either true (cascade restored) or honestly amended (NIM-only declared).
**Requirements**: none formally — gap-closure work surfaced by operator review at the Phase 30 boundary. All 17 decisions (D-01..D-17) tracked in `.planning/phases/30.1-.../30.1-CONTEXT.md`.
**Depends on:** Phase 30 (PR #20 must be merged + `feature/30.1-cascade-fallback-fix` cut from main per D-02)
**Plans:** 4/4 plans complete

Plans:

- [x] 30.1-01-PLAN.md — Probe OpenRouter free-tier rate-limit behavior + capture snapshot + operator selects Wave 2 plan (D-03..D-06)
- [x] 30.1-02-PLAN.md — Right scope (< 50% probe fail): remove `skipOpenRouter: true` from both v3 call sites + rewrite P3 test + force-trigger validation cron + amend docs (D-01, D-07, D-10..D-16) — runs ONLY if probe lands `restored-cascade`
- [x] 30.1-03-PLAN.md — Middle bucket (50-90% probe fail): docs-only amendment with measured percentages + Phase 31 paid-OR deferral note (D-01, D-08, D-10..D-13) — runs ONLY if probe lands `middle-bucket-defer`
- [x] 30.1-04-PLAN.md — Minimum scope (> 90% probe fail): docs-only amendment declaring NIM-only active, OR dormant (D-01, D-08, D-10..D-13) — runs ONLY if probe lands `nim-only`

### Phase 31: Cron Stability Validation (7-day Watch)

**Goal**: Prove daily 04:00 UTC `/api/cron/refresh-events` consistently lands `events:llm:v3` healthy on the Pro 800s ceiling under normal NIM availability — over a real 7-day observation window.
**Depends on**: Phase 30 (the tuned values must be in production on the Pro plan before the 7-day window starts).
**Requirements**: LLM-RELI-06
**Success Criteria** (what must be TRUE):

1. `GET /api/health` returns `endpoints.llmEvents.status === 'healthy'` after each daily 04:00 UTC tick across ≥7 consecutive days.
2. `events:llm:v3` is populated within the daily 26h freshness window on every tick (no `unknown` or `stale` flips on `llmEvents`).
3. `dlqCount` after each tick stays at zero or matches a documented baseline; any non-zero count has a recorded throttle-event explanation in the operator log.
4. The 7-day observation window is captured in a single artifact (e.g. a phase SUMMARY block, dashboard screenshot series, or operator log) so the watch is auditable, not anecdotal.

**Plans**: 5 plans

Plans:

- [x] 31-01-PLAN.md — Phase 31 prep fixes (eval-bundle, diff-filter, analyzer --help, runbook quarterly probe) + Wave 0 diff-filter unit test
- [x] 31-02-PLAN.md — snapshot-cron-watch.ts + watch-log.json scaffold + contract test + npm run watch:snapshot runner entry
- [x] 31-03-PLAN.md — D-02 prep-validation force-trigger (operator-gated) — Day-0 row committed (PR #26)
- [~] 31-04-PLAN.md — **Closed early at Day 1 / 7** under operator decision 2026-05-19. Day-1 natural cron PASS captured (`d0c16e4`); Days 2–7 not pursued. Snapshot harness stays operational for ad-hoc capture.
- [x] 31-05-PLAN.md — Phase close (early, caveat-marked): [`31-SUMMARY.md`](phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md) + [`31-05-SUMMARY.md`](phases/31-cron-stability-validation-7-day-watch/31-05-SUMMARY.md) + architecture-doc narrative + REQ/ROADMAP/STATE updates. D-05 escalation deferred (no FAIL row).

### Phase 32: Ghost Event URL Liveness, Dashboard & Prune

**Goal**: Operator can see and remove events whose `sourceURL` is dead, without leaving the API Health dashboard, and without endangering the polite-citizen contracts the rest of the pipeline holds.
**Depends on**: Nothing on the LLM-RELI track (independent — runnable in parallel with Phases 29/30/31). Reuses existing Bearer-gated operator endpoint pattern from Phase 28.2 W3.
**Requirements**: GHOST-01, GHOST-02, GHOST-03, GHOST-04, GHOST-05
**Success Criteria** (what must be TRUE):

1. Operator opening API Health dashboard sees a "Dead URL events" count (and a drill-down list) populated from probe results — no terminal commands required.
2. Probe runs out-of-band of `/api/events` (cron-driven or lazy on cache miss) and never blocks the primary read path; `/api/events` p95 is unchanged.
3. Operator can prune dead-URL events via the chosen mechanism (dashboard button, scheduled prune, or Bearer-gated endpoint). Pruned events disappear from `events:llm:v3` and the in-flight cluster index.
4. URL probing respects polite-citizen contracts — concurrency-limited, jittered, per-host throttled (analogous to the 1 req/s Nominatim throttle), and skips already-fresh entries (TTL-gated). A contract test pins the probe-result Redis schema so future changes fail loudly.
   **Plans**: 6 (32-01 foundation · 32-02 probe primitive + sweep · 32-03 prune endpoint + cron · 32-04 operator-status aggregator · 32-05 DevApiStatus dashboard · 32-06 phase close)
   **Closed**: 2026-05-21 — GHOST-01..05 all complete; 22 D-N decisions landed atomically; +63 new tests; 2259 total passing; zero new npm deps; zero regressions; chaos-test contract preserved (POST /api/events/prune-dead-urls returns 200|503, never 500).

### Phase 33: Actor Metadata Audit, Canonical Catalog & Eval Expansion

**Goal**: Actor metadata in `events:llm:v3` becomes operator-trustworthy — bad actors are quantified, then mapped through a canonical catalog at extraction time, then continuously regression-tested by the daily eval.
**Depends on**: Nothing on the LLM-RELI track (independent — runnable in parallel with Phases 29/30/31). The audit (ACTOR-01) seeds catalog + prompt + eval design.
**Requirements**: ACTOR-01, ACTOR-02, ACTOR-03, ACTOR-04, ACTOR-05
**Success Criteria** (what must be TRUE):

1. A committed audit report quantifies actor-failure buckets in the live snapshot — null/empty, raw CAMEO code, ambiguous generic string, source-disagreement — with representative examples per bucket.
2. A canonical actor catalog (e.g. `server/data/actor-catalog.ts`) ships with at least the Iran-conflict-relevant actors mapped (IDF / IRGC / USMIL etc.) and is enforced by a contract test (no duplicate canonical names, no orphan codes).
3. The v3 LLM extractor emits canonical actor names where possible, raw CAMEO actor codes are mapped through the catalog before write, and a new `actorConfidence` field appears in `events:llm:v3` payloads.
4. The daily eval scores actor-match rate alongside geocode accuracy at 5/20/100 km thresholds; adversarial fixtures gain at least one actor-confusion injection and the score is visible in the API Health dashboard's eval block.
5. API Health dashboard surfaces actor-quality counts (null actors, raw-CAMEO actors, ambiguous-string actors, low-confidence actors) and a per-event drill-down list — reusing the existing 28.2 W5 D-23 quality-metrics block.
   **Plans** (7):

- [x] 33-01-PLAN.md — Wave 1: shared actorClassifier module (D-02 deterministic rules) + one-shot audit script + 33-AUDIT-REPORT.md stub (ACTOR-01).
- [x] 33-02-PLAN.md — Wave 1: canonical actor catalog at server/data/actor-catalog.ts + cameo-codes.json snapshot + 5-invariant contract test (ACTOR-02 / D-04..D-07).
- [x] 33-03-PLAN.md — Wave 2: enrichedEventV3 Zod extend with actorConfidence (.optional() for rollout) + EVENT_EXTRACTION_SCHEMA_V3 un-alias with actorConfidence in properties + required (ACTOR-03 / D-10, D-12).
- [x] 33-04-PLAN.md — Wave 2: llmEventExtractor.v3.ts server-side post-mapping (applyCatalogToEvents) + actorConfidence repair (repairActorConfidence) + SYSTEM_PROMPT_V3 extension (ACTOR-03 / D-08, D-09, D-10 server enforcement).
- [x] 33-05-PLAN.md — Wave 3: llmEvalHarness.ts actorMatchRate (D-13 + Open Q §4 landmark+country substring match) + ground-truth backfill ≥30/50 (D-14) + 3 adversarial actor-confusion injections (D-15) + llmProgress.ts mirror (ACTOR-04).
- [x] 33-06-PLAN.md — Wave 3: /api/operator-status actorQuality block computed lazily over events:llm:v3 + inline CAMEO subset (PATTERNS risk #3) + degrade-open + integration tests (ACTOR-05 server-side / D-16).
- [x] 33-07-PLAN.md — Wave 4: DevApiStatus.tsx Actor Quality sub-block per UI-SPEC (pinned mount point + pinned testIDs + pinned color tokens) + RTL tests (ACTOR-05 client-side / D-17).

### Phase 34: LLM Router Fallback Re-integration (Cerebras / Groq + Per-Provider Eval)

**Goal**: Restore a multi-provider cascade in `freeClaudeRouter.ts` so NIM throttle events stop translating into DLQ entries. Phase 31 Day-1 observed 4 × `v3:timeout_watchdog` on a PASS day — ~8 events losing enrichment. Cerebras + Groq adapters were deleted in Phase 29 (SIMPLIFY-04); re-integration is probe-driven so we ship code only for providers whose free-tier throttle is empirically independent of NIM's. Per-provider eval scoring is added so any restored provider silently producing worse extractions surfaces in `/api/events/llm-status` + API Health dashboard.
**Depends on**: Phase 33 (ACTOR-01..05 must close first — cascade integration must test all providers against the post-33 schema, including the new `actorConfidence` field). Phase 30 tuned defaults stay in place; this phase adds throughput, not NIM retuning. Phase 31 snapshot harness remains operational and feeds validation in Plan 04.
**Requirements**: LLM-RELI-08, LLM-RELI-09, LLM-RELI-10, LLM-RELI-11
**Success Criteria** (what must be TRUE):

1. **Probe artifact committed** — `.planning/phases/34-llm-router-fallback-reintegration/probe-snapshot.json` includes per-provider RPM ceiling, latency p50/p95, and error-bucket distribution for Cerebras + Groq free tiers. Mirrors `30.1-or-pulse-snapshot.json` shape. Probe decision threshold `<50% rate-limit fail` is the integration gate (final threshold locked during `gsd-discuss-phase 34`).
2. **At least one new provider in the cascade, OR honest deferral**. For each provider that passes the probe gate, an adapter is implemented in `freeClaudeRouter.ts` (extends `FreeProvider` union; adds provider config; slots into cascade builder line 341-363). Per-provider circuit breaker + token-budget keys (`llm:tokens:cerebras:YYYY-MM-DD`, `llm:tokens:groq:YYYY-MM-DD`). If both probes fail, this phase closes with `cerebras-groq-deferred` status (matching Phase 30.1's `nim-only` precedent) — the empirical "free-tier throttle is correlated with NIM" finding is itself a load-bearing outcome.
3. **`callHistory` shows non-NIM provider names** during throttle events — validated via a forced cron run (temporary NIM-skip flag during validation, or natural throttle observation). Provider attribution is unambiguous on every batch.
4. **Per-provider eval scoring** — `llmEvalHarness.ts runEval()` extended to track `evalScore.byProvider: { nvidia_nim: {within5km, within20km, within100km}, cerebras: {...}, groq: {...} }`. Mirror in `LLMRunSummary`. New API Health dashboard block surfaces the per-provider scores against the ground-truth fixtures.
5. **DLQ count drop** from Phase 31 Day-1 baseline (4 × `v3:timeout_watchdog`) — validation cron snapshot row shows materially lower DLQ count, ideally 0. New DLQ reason bucket `cascade_exhausted` distinguishes "all providers failed" from single-provider timeout.
6. **No regression in Pitfall 1 cache bridge** — `/api/events` continues to serve raw GDELT when `events:llm:v3` is empty, with all provider keys absent. "Map never goes blank" contract unchanged.

**Plans** (5):

- [~] 34-01-PLAN.md — SKIPPED (operator deferral close-out). Probe script never written; no probe-snapshot.json artifact exists.
- [~] 34-02-PLAN.md — SKIPPED (operator deferral close-out). No adapter code lands; `FreeProvider` union remains `'nvidia_nim' | 'openrouter'`.
- [~] 34-03-PLAN.md — SKIPPED (operator deferral close-out). No per-provider eval infrastructure; `EvalScore` shape unchanged.
- [~] 34-04-PLAN.md — SKIPPED (operator deferral close-out). No `v3:cascade_exhausted` DLQ reason added; no validation cron run.
- [x] 34-05-PLAN.md — Close-out executed inline 2026-05-23: ADR-0010 Phase 34 sub-block, reliability doc "Multi-Provider Cascade (Phase 34)" section, CLAUDE.md Active providers line, ROADMAP/REQ/STATE flips, 34-SUMMARY.md.

### Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup Sweep

**Goal**: Every Redis key in the registry has a real writer + reader, retired keys are deleted, the Upstash command budget moves measurably down, LLM-pipeline JSDoc matches the v1.5 implementation, and the v1.4-era complexity that the Pro upgrade obviates is purged from code (`events:llm:v3:partial`, orphan modules, archived-only paths). Closes with a measured `api/vercel-entry.js` bundle-size delta against v1.4's 1.72 MB baseline. _(CLAUDE.md trim landed in Phase 29 — see DOCS-INT-01 there. This phase only verifies the Redis registry section is still accurate after the trim.)_
**Depends on**: Nothing strictly required from earlier v1.5 phases (independent — runnable in parallel with Phases 30/31/32/33; **must run after Phase 29** because the Redis registry verification reads CLAUDE.md as input and the trim happens in Phase 29). Internal sequencing: DOCS-INT-03 verification pass produces the input for REDIS-OPT-01..04 and SIMPLIFY-02. SIMPLIFY-07 (bundle-size delta) is the closing measurement after all other cleanup lands.
**Requirements**: DOCS-INT-02, DOCS-INT-03, REDIS-OPT-01, REDIS-OPT-02, REDIS-OPT-03, REDIS-OPT-04, SIMPLIFY-02, SIMPLIFY-05, SIMPLIFY-07
**Success Criteria** (what must be TRUE):

1. Every Redis key listed in the CLAUDE.md "Serverless Cache" registry (post-Phase-29 trim) has at least one writer and at least one reader pointing at real `file:line` locations; orphan keys are removed; missing keys are added.
2. A single auditable artifact (e.g. `docs/architecture/redis-keys.md`) lists every key with writers, readers, TTL, value shape, business purpose, current cardinality, and load-bearing / observability / retire classification.
3. Retired keys are deleted from code in this phase; production deletion path is documented (one-shot script vs. natural TTL expiry).
4. Pre/post Upstash command-budget impact is captured (baseline at start, measurement at end) and a measurable absolute reduction is documented in the new ADR (or a dedicated ADR-0010 if scope warrants).
5. JSDoc on the LLM-pipeline modules (`server/lib/llmExtractionPipeline.ts`, `server/lib/llmEventExtractor.v3.ts`, `server/lib/llmResolver.ts`, `server/lib/llmCircuitBreaker.ts`, `server/lib/llmDLQ.ts`, `server/lib/llmTokenBudget.ts`, `server/lib/llmExtractorWatchdog.ts`) matches the v1.5 implementation — each module's public API has a one-line JSDoc that's true today.
6. **`events:llm:v3:partial` retired** (SIMPLIFY-02). Either deleted entirely (preferred) or downgraded to a debug-only flag behind an env var with a documented use-case. All writers + readers in code path also removed; CLAUDE.md "Serverless Cache" section reflects the change.
7. **`server/lib/freeClaudeRouter.ts` audited** (SIMPLIFY-05). Either deleted (if zero live callers) along with its imports and tests, or kept with a top-of-file JSDoc block documenting the live callers and why it stays. No "is this still used?" ambiguity for future readers.
8. **Bundle-size delta measured** (SIMPLIFY-07). `api/vercel-entry.js` size at Phase 35 close vs v1.4's 1.72 MB baseline is captured in the SUMMARY.md and folded into ADR-0010. Net reduction expected; stretch goal: drop below 1.5 MB. _(SIMPLIFY-06 v1 extractor archive folded into Phase 29's full deletion — this phase does not handle v1 anymore.)_
   **Plans**: TBD

### Phase 36: Public Docs Sweep + OpenAPI Additions

**Goal**: Public-facing docs (README, 10 architecture markdown files, 676-line SRE runbook, degradation contract) reflect v1.4 + v1.5 reality; the 1164-line OpenAPI 3.0.3 spec covers all 7 v1.4-introduced endpoints.
**Depends on**: Phase 29 + 30 + 31 (the public docs need to describe the _shipped_ narrowed cascade + tuned defaults + cron stability evidence — describing aspirational state defeats the purpose). Can run in parallel with Phase 32/33/34 once those LLM-RELI phases close.
**Requirements**: DOCS-PUB-01, DOCS-PUB-02, DOCS-PUB-03, DOCS-PUB-05, DOCS-API-01, DOCS-API-02, DOCS-API-03, DOCS-API-04, DOCS-API-05, DOCS-API-06, DOCS-API-07
**Success Criteria** (what must be TRUE):

1. README.md describes the current `otg-iran-monitor.vercel.app` domain, the v3 LLM pipeline (NIM + OpenRouter narrowed cascade), the merged API Health dashboard tab, the Bearer-bypass rate limiter, and the manual-trigger `prod-connectivity-audit.yml` workflow — no v1.3-era language survives where it has been superseded.
2. The 10 markdown files in `docs/architecture/` (21 Mermaid diagrams) reflect v1.4 LLM pipeline shape — v3 cron-driven extraction, Pitfall 1 cache bridge, 6-path resolver, narrowed NIM + OpenRouter cascade — and the diagrams render natively on GitHub.
3. `docs/runbook.md` gains v1.4 + v1.5 incident playbooks (NIM throttle handling, cron architecture lessons from 28.2.6 fire-and-forget IIFE diagnosis, force-trigger via `?force=true`, prod-connectivity-audit retry path).
4. `docs/degradation.md` documents the explicit v3 → v2 → v1 → raw GDELT fallback chain as the "map never goes blank" Pitfall 1 cache-bridge contract.
5. The OpenAPI 3.0.3 spec at `docs/api/openapi.yaml` (or equivalent path) gains complete entries for `/api/audit-status`, `/api/operator-status`, `/api/events/llm-pipeline`, `/api/events/llm-replay/:groupKey`, `/api/cron/refresh-events`, `/api/cron/health`, `/api/cron/warm` — request shape, response schema, auth posture, and (where applicable) `?force=true` query params all documented.
   **Plans**: TBD

### Phase 37: ADR-0010 + Acceptance Gate Closeout

**Goal**: The v1.5 LLM-pipeline decisions are captured in a new ADR (rationale, trade-offs, rollback plan) AND `prod-connectivity-audit.yml` exits 0 with `allTiersGreen=true` for 3 consecutive runs — locking the milestone close and unblocking 999.5 promotion into v1.6.
**Depends on**: Phase 29 + 30 + 31 (LLM-RELI track must have shipped — ADRs document already-made decisions, not aspirational ones; and the gate observes the narrowed cascade running stably). Can be informed by Phase 36's public-docs work but ADR-0010 stands alone as the gate-close artifact.
**Requirements**: DOCS-PUB-04, LLM-RELI-07
**Success Criteria** (what must be TRUE):

1. A new ADR (ADR-0010 — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` was committed 2026-04-24 and already occupies the 0009 slot) is committed under `docs/adr/` documenting the v1.5 LLM-pipeline decisions: stay on v3, narrow active providers to NIM + OpenRouter, retire Cerebras + Groq from runtime cascade, prove LLM-optional architecture, **and the Vercel Pro upgrade ($20/mo for 800s `maxDuration`) accepted as the v1.5 acceptance-gate enabler**. The ADR captures rationale, trade-offs (cost, alternative paths considered: Hobby + tighter throttle tuning, NIM-only without OpenRouter fallback, etc.), and the rollback plan (downgrade-to-Hobby + revert `maxDuration: 300`).
2. The operator runs `prod-connectivity-audit.yml` three separate times (workflow_dispatch, manual trigger) and each run exits 0 with `audit:connectivity:last-result.allTiersGreen === true` written to the Redis sidecar — no tier-red blips between runs.
3. The 3-consecutive-green observation is captured in the milestone close artifact (e.g. workflow run URLs + sidecar payloads pasted into SUMMARY.md) so the gate is auditable.
4. v1.6 promotion is unblocked — 999.5 (k6 1–300 VU sweep) can be pulled from backlog into v1.6 because the prerequisite tier-green stability has been mechanically proven.
   **Plans**: TBD

### Progress

| Phase                                                                         | Plans Complete       | Status                | Completed  |
| ----------------------------------------------------------------------------- | -------------------- | --------------------- | ---------- |
| 29. LLM Provider Chain Narrowing & LLM-Optional Architecture & CLAUDE.md Trim | 13/13                | Complete              | 2026-05-11 |
| 30. NIM Throttle Characterization & Cascade Tuning                            | 7/7                  | Complete              | 2026-05-17 |
| 31. Cron Stability Validation (7-day Watch)                                   | 4/5 (1 early-closed) | Closed early (caveat) | 2026-05-19 |
| 32. Ghost Event URL Liveness, Dashboard & Prune                               | 6/6                  | Complete              | 2026-05-21 |
| 33. Actor Metadata Audit, Canonical Catalog & Eval Expansion                  | 7/7                  | Complete              | 2026-05-21 |
| 34. LLM Router Fallback Re-integration (Cerebras / Groq + Per-Provider Eval)  | 1/5 (4 skipped)      | Closed (deferred)     | 2026-05-23 |
| 35. Internal Docs + Redis Registry Verification + Redis Optimization          | 0/0                  | Not started           | -          |
| 36. Public Docs Sweep + OpenAPI Additions                                     | 0/0                  | Not started           | -          |
| 37. ADR-0010 + Acceptance Gate Closeout                                       | 0/0                  | Not started           | -          |

### Parallelization Notes

Per `.planning/config.json` `parallelization: true`:

- **Sequential spine (LLM-RELI track):** 29 → 30 → 31 → 34 → 37. The LLM provider narrowing must land before throttle characterization can be clean; the tuned values must land before the 7-day cron-stability watch is meaningful; the watch must land before router-fallback re-integration (so the DLQ baseline is observed before the cascade is widened); the cascade work must land before the 3-consecutive-green close gate is observed.
- **Parallel-safe with the LLM-RELI spine:** Phase 32 (GHOST track) and Phase 33 (ACTOR track) are independent of the LLM-RELI work and can execute concurrently with 29/30/31 if operator capacity allows. Phase 34 (LLM-RELI-08..11 router fallback) depends on Phase 33 because cascade integration must test all providers against the post-33 schema (`actorConfidence` field). Phase 35 (DOCS-INT-02/03 + REDIS-OPT + SIMPLIFY tail) must run **after** Phase 29 because its Redis registry verification reads CLAUDE.md as input and the trim happens in 29 — runs concurrently with 30/31/32/33 once 29 closes; Phase 35 should also run after Phase 34 so its Redis registry sweep inventories the new `llm:tokens:cerebras:*` / `llm:tokens:groq:*` keys.
- **Late-binding:** Phase 36 (public docs sweep) should land _after_ 29/30/31/34 close so the docs reflect the shipped narrowed cascade, tuned defaults, AND restored multi-provider fallback rather than aspirational state.
- **Closeout:** Phase 37 is the milestone-close gate by construction (LLM-RELI-07 observation + DOCS-PUB-04 ADR). Run last.

## Deferred Work

Carried from v1.2:

- **Satellite Imagery** -- ArcGIS World Imagery as semi-transparent overlay

Deferred from v1.3:

- **GDELT BigQuery adapter** -- SQL-based querying with full column access (requires GCP project)
- **Telegram channel monitoring** -- GramJS/TGSTAT for OSINT early-warning signals

## Backlog

### Phase 999.1: Remove or relax `rateLimiters.public` global tier — FOLDED INTO PHASE 28.2

**Goal:** Resolve operator-blocking rate limit. The 6 req/min global tier in `server/middleware/rateLimit.ts` (applied at `server/index.ts:99` to all `/api/*`) blocks the operator's own browser — flights polling alone is 12 req/min. Three options scoped earlier: (a) remove global tier (per-endpoint limits already tuned for browser), (b) bump to 300/min to keep loose anti-scraper net, (c) bypass when `DASHBOARD_PASSWORD` Bearer present.
**Resolution:** Folded into Phase 28.2 on 2026-04-30 per 28-CONTEXT.md D-04 — option (c) Bearer-bypass selected. This entry remains for historical traceability.
**Requirements:** Subsumed by 28-CONTEXT.md D-04
**Plans:** 7/7 plans complete

### Phase 999.2: `api/vercel-entry.js` build-artifact discipline (BACKLOG)

**Goal:** Eliminate manual rebuild-before-commit friction introduced in commit `155989f`. Today the 1.7MB tsup-bundled function is tracked in git so Vercel detects it as a serverless function. Two long-term options: (a) add a CI check that fails if `api/vercel-entry.js` is stale relative to `server/**/*`; (b) migrate to Vercel's Build Output API (`.vercel/output/functions/api/vercel-entry.func/`) so the function is generated into Vercel's expected location during build, eliminating the tracked artifact.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Phase 27.4.6 cron first-tick verification (BACKLOG)

**Goal:** Confirm the `/api/cron/refresh-events` cron actually fires at 4am UTC, populates `events:llm:v3`, and `/api/events/llm-status` reports `lastTriggerSource: "cron"`. Passive verification — happens automatically, but no current alarm if it doesn't. Watch `dlqCount` after the first tick: non-zero means NIM was throttled (D-08 path) and operator must `?force=true` after NIM recovers. If 24h pass with `lastTriggerSource` never flipping to "cron", run the 8-step PLAN.md Task 6 curl checklist for diagnosis.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: Cron route hydrates pipeline override (BACKLOG)

**Goal:** Wire `await refreshPipelineOverride()` into `server/routes/refresh-events-cron.ts` at handler start so runtime POST `/api/events/llm-pipeline {version: 'v3'}` overrides actually propagate to cron-triggered runs. Surfaced 2026-05-07 during Phase 28.2.6 deploy: prod LLM_PIPELINE_V3 env var failed to take effect on first cron call (returned `schemaVersion: "v2"`); the runtime override worked for `/api/events` but NOT for `/api/cron/refresh-events` because the latter never hydrates `pipelineOverride` from the Redis sidecar key `events:llm-pipeline-override` — each fresh function instance starts with the env-default. Workaround used: re-set `LLM_PIPELINE_V3=true` env var + `vercel redeploy`. Code fix: 1-line `await refreshPipelineOverride()` at top of refresh-events-cron handler. Risk: low (read-only cache hydration with TTL). Test: contract test that POST override → cron run honors override without env var change.
**Requirements:** TBD
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.5: Performance Optimization + 1–300 VU Load Test (BACKLOG, deferred from v1.4)

**Goal:** Per 28-CONTEXT.md D-01/D-02 (originally v1.4's closing phase as 28.3, deferred 2026-05-08): validate production handles 1–300 concurrent users with measurable PASS/FAIL signal against a clean codebase. Performance optimization layer per D-19: add `s-maxage` CDN headers to `/api/*` (flights 5s, ships 30s, markets 60s, events/news 900s, sites/water 86400s) so Vercel CDN absorbs bulk reads at 300 VU and Redis only fires on cache miss + warm-up cron. k6 sweep per D-15 (GitHub Actions runner, results land as PR artifacts) / D-16 (six discrete tiers 50/100/150/200/250/300 VU, 60s ramp + 5min steady, ~45min wall-time per sweep) / D-20 (full browser-loop per VU: t=0 fires site/water/sources/markets/flights/ships/events/news, then polls flights@5s, ships@30s, markets@60s, events@15min, news@15min — ~0.27 req/s/VU → ~81 RPS at 300 VU). PASS/FAIL bar per D-17 (measured at 300 VU steady-state): p95<500ms hot endpoints, p99<1500ms, error<1%, no 5xx spikes, cache-hit>90% (non-negotiable). Beyond PASS/FAIL per D-18: per-endpoint latency breakdown (p50/p95/p99 tagged), 429 count (validates D-04 Bearer-bypass), Vercel cold-start frequency (validates warm-up cron sufficiency), Upstash Redis cache hit ratio. Polling parity per D-21 (D-20 shape + D-19 edge cache eliminates user-A-vs-user-B divergence). Hobby cron cap = 3, load test does NOT consume a slot.
**Why deferred:** v1.4 close audit (2026-05-08) found `prod-connectivity-audit.yml` tier-green gate still red on `critical[llmEvents]: unknown` — root cause is the v3 NIM LLM extraction not consistently populating `events:llm:v3` within Vercel function budget (intermittent throttle + cold-cache races). This is a pipeline ops/scheduling concern, not a load-test design defect; running k6 against a half-populated cache surface would produce noisy numbers that don't reflect steady-state behavior. Promote when the daily 04:00 UTC `refresh-events` cron consistently lands `events:llm:v3` healthy AND the audit workflow is exit-0 green for ≥3 consecutive runs.
**Promotion gate:** Three consecutive `prod-connectivity-audit.yml` runs exit 0 with `audit:connectivity:last-result.allTiersGreen === true`.
**Depends on:** Phase 28.2 (D-03 domain rename + W6 audit workflow); Phase 28.2.5 (tier-green assertion); Phase 28.2.6 (cron architecture); Phase 28.2.7 (R1+R2+R3 — cron `lastTick` writers + Redis-first `probeLlmStatus` + honest-stub `probeProbeOnly`); Phase 999.4 (cron route hydrates pipeline override) — all prerequisites already merged into main.
**Requirements:** Derived from 28-CONTEXT.md (umbrella) — child scope: D-01 / D-02 / D-15 / D-16 / D-17 / D-18 / D-19 / D-20 / D-21 + Claude's-discretion items (k6 reporter artifact format, `/api/sources` edge-cache classification). Decision lock preserved verbatim at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`.
**Plans:** 0 plans

Plans:

- [ ] TBD (promote with /gsd-review-backlog when ready)
