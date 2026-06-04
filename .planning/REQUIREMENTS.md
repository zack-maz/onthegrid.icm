# Requirements: Iran Monitor — v1.6

**Defined:** 2026-06-03
**Milestone:** v1.6 Production Hardening
**Core Value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## v1.6 Requirements

Requirements for this milestone, grouped by track. Each maps to exactly one roadmap phase. REQ-IDs use new prefixes per v1.6 track (v1.5 prefixes — LLM-RELI / GHOST / ACTOR / DOCS-INT / DOCS-PUB / DOCS-API / REDIS-OPT / SIMPLIFY — are closed and archived at `.planning/milestones/v1.5-REQUIREMENTS.md`).

Phase numbering continues from v1.5 phase 37 → v1.6 starts at Phase 38.

---

### Phase 38 — LLM Pipeline Reliability + GDELT Source Matching + Vercel Pro Cleanup

Operator-locked priority #1. Merged track per operator decision 2026-06-03: LLM-pipeline reliability fixes + GDELT event-source matching improvements should be assessed together. Cerebras+Groq source-file removal folds in as part of the dead-code purge. Vercel Pro cleanup-and-repair (Strand B from former 999.6) folds in as the operability companion. Water-facility name romanization (Phase 27.3.3 carry-forward from v1.3) folds in as a GDELT-MATCH sibling data-quality track.

#### LLM-FIX — bug fixes from v1.5-close punch-list

- [ ] **LLM-FIX-01**: Split `lastErrorReason` token in `server/routes/health.ts:170`. `cache-fallback-active:` generic for cache/news fallback cases; `llm-optional-fallback-active:` reserved for the `health.ts:284` LLM path. Update `health.test.ts` assertions to match exact tokens (currently regex `/fallback-active/` matches both — passes accidentally).
- [ ] **LLM-FIX-02**: Fix Open-Meteo cache-write policy at `server/routes/water.ts:359`. Empty-result skip causes cold cache → audit tier degraded → unknown. Resolve via empty-result sentinel write OR unconditional write with staleness as the failure signal. Caused Phase 37 audit failures.
- [ ] **LLM-FIX-03**: Populate `33-AUDIT-REPORT.md` stub (currently committed as TBD) by running `run-audit.ts` against staging Redis, OR document the gap explicitly so the eval block isn't read as "0% actor accuracy". `actorMatchRate` scorer in `llmEvalHarness.ts:351-388` silently returns 0 without ground-truth `expectedActor1`/`expectedActor2` backfill.
- [ ] **LLM-FIX-04**: Extend `redis-death.test.ts` chaos mock to expose `incr/sadd/smembers/scard/srem/zadd/hset/hincrby/scan/lpush/expire` as `vi.fn(redisDeath)`. Proves the "no HTTP 500 under Redis death" guarantee for the ~11 raw-redis call sites currently unproven (pruneQuota, replayQuota, DLQ, operator audit log, lineage, cost-shadow, dead-URL sample, pipelineAudit). Add `/api/operator-status` to the chaos test's route coverage list.
- [ ] **LLM-FIX-05**: Add dedicated quota-path chaos test. `pruneQuota.ts:93` + `replayQuota.ts:67` both call `await redis.incr(key)` without try/catch. Current `redis-death.test.ts` keeps `redis.incr` real → `cacheGetSafe` returns empty set and short-circuits BEFORE incr fires. The 503 outcome is correct for the WRONG reason. Test must prove 503 for the right reason (incr in chaos).
- [ ] **LLM-FIX-06**: Update `server/__tests__/routes/events.test.ts:354, 356, 833`. Three mocks default `schemaVersion: 'v1'` (deleted Phase 29). Fix v1 → v3.

#### LLM-PURGE — Phase 29 finishing pass (dead-code purge + Cerebras+Groq source removal)

- [ ] **LLM-PURGE-01**: Delete `server/lib/llmEventExtractor.ts` 95-line stub. Rewrite sole importer `llmExtractionPipeline.ts:38-42` to import `processEventGroupsV3` directly.
- [ ] **LLM-PURGE-02**: Delete `server/adapters/llm-provider.ts` `freeClaudeRouter.callLLM` shim (last importer is `llmResolver.ts`). Inline or replace at call site. Drop stale "v1+v2 extractors (deleted in Plan 05+06)" docstring references.
- [ ] **LLM-PURGE-03**: Rewrite stale headers — `server/lib/llmEventExtractor.v3.ts:4-15, 73-79` (false "Mirrors v2" + "v1/v2 extractors remain shipped untouched"), `server/routes/events.ts:99-107` (`RecentEnrichedEvent` v2 projection), `server/lib/llmExtractionPipeline.ts:11-12` (~95min worst case → ~13min Pro 800s ceiling).
- [ ] **LLM-PURGE-04**: Collapse `server/lib/llmSchema.ts`. Delete `enrichedEventV1` / `enrichedEventV2` / `batchResponseV2` Zod schemas + tests (no production importer). Collapse `enrichedEventAny` at line 212 to v3 passthrough. Remove historical commentary at line 209 ("v1 retained for D-40 rollback" / "v2 retained as default LLM_PIPELINE_V2=true" — both false post-Phase 29).
- [ ] **LLM-PURGE-05**: Decide + execute on `server/lib/pipelineAudit.ts`. Path A — narrow `from/to` union to v3-only + delete `appendPipelineAudit` writer + delete `DevApiStatus.tsx:2841` `PipelineFlipsBlock` + delete `openapi.yaml:1841` entry. Path B — keep as read-only audit shim with natural 90d-TTL drain. Decision locked in 38-CONTEXT.md.
- [ ] **LLM-PURGE-06**: Purge Cerebras+Groq references from `server/__tests__/lib/llmTokenBudget.test.ts` + `server/__tests__/lib/llmCircuitBreaker.test.ts` (`llmProgress.test.ts` is verified clean per punch-list finding #26 correction). Delete `CEREBRAS_API_KEY` + `GROQ_API_KEY` env vars from `server/config.ts:31-32, 217-218, 241-245`. Re-anchor `replayQuota.ts:21` threat model from "Cerebras 1M/day" to "nvidia_nim: 1_000_000".
- [ ] **LLM-PURGE-07**: Remove Cerebras + Groq adapter source files from `server/adapters/`. Operator confirmed at v1.6 lock-in: no router-restoration phase scheduled; rollback path is `git revert <Phase 29 commit range>`, not file restoration. Update CLAUDE.md to delete the "Cerebras + Groq adapter source files remain importable for emergency rollback today" note.
- [ ] **LLM-PURGE-08**: Resolve `freeClaudeRouter.ts:300-330, 432, 464, 637, 644-646` OpenRouter daily-cap dead writer paths. Path A — gate behind `env.OPENROUTER_API_KEY` AND drop `incrOpenRouterDaily`. Path B — delete OpenRouter from `allProviders` entirely. Fix `skipOpenRouter: true` line drift (`v3.ts:629, 951` vs CLAUDE.md/ADR-0010 cited 622/929 — 7-line drift).
- [ ] **LLM-PURGE-09**: Delete stale comments in `server/lib/llmExtractionPipeline.ts:376-377` (claims `writePartialCache` lives in v3 extractor — Phase 35 D-12 retired it; internally contradicts module header).

#### GDELT-MATCH — event-source matching improvements

- [ ] **GDELT-MATCH-01**: Phase-22-style audit of current GDELT event quality at v1.5 close. Categorize live `events:llm:v3` corpus: high-confidence vs neutral vs low-confidence by source-tier; orphan events (no GDELT-DOC cluster); duplicate-source events (multiple mentions of same canonical event). Output drives GDELT-MATCH-02..04 implementation.
- [ ] **GDELT-MATCH-02**: Better dedup of GDELT mentions to canonical sources. Extend or replace current dedup pass (Jaccard 0.8 in news clustering) with mention-collapse logic that maps multiple-actor variants of the same event to one canonical row BEFORE LLM enrichment runs. Reduces redundant LLM calls + tightens the corpus.
- [ ] **GDELT-MATCH-03**: Tighter coupling between GDELT-DOC news clusters and GDELT events. Extend the Bellingcat three-gate corroboration pattern (temporal AND geographic AND keyword) from Phase 22 to general OSINT sources. Apply confidence boost where corroboration is genuine; withhold where it's coincidental.
- [ ] **GDELT-MATCH-04**: Source-tier-aware confidence rescore. Current `relevanceScorer.ts` applies tier 1/2/3 multipliers post-NLP. Extend to a per-event composite score that re-ranks the corpus by tier × corroboration × specificity, surfacing higher-quality events to dashboard top-of-list.

#### WATER-LATIN — water-facility name romanization (Phase 27.3.3 carry-forward, v1.3 → v1.6)

- [ ] **WATER-LATIN-01**: Audit current state of non-Latin water-facility names in `water:facilities:v3` cache. Quantify: total facilities, count with non-Latin names, count blocked by current Latin-label admission gate, samples per script (Arabic, Persian, Hebrew, etc.).
- [ ] **WATER-LATIN-02**: Romanization rules per script. Implement ICU transliteration (or equivalent library — evaluate `transliteration`, `unidecode`, `arabic-transliterate`) for the major scripts present. Output preserves the original name plus a Latin alternate.
- [ ] **WATER-LATIN-03**: Update Overpass water adapter (`server/adapters/overpass-water.ts`) to apply romanization at fetch time, BEFORE the Latin-label admission gate. Gate accepts the romanized version. Preserve original `name` field; add `nameLatin` field.
- [ ] **WATER-LATIN-04**: Update consumer surfaces (water layer detail panel, search bar, proximity alerts) to display `nameLatin` when set, with the original name available on hover or as a sub-label.

#### VERCEL-PRO — Vercel Pro cleanup-and-repair (Strand B from former 999.6)

- [ ] **VERCEL-PRO-01**: Evaluate `vercel.json → vercel.ts` migration per the recommended Vercel project-configuration format. Install `@vercel/config`; port current config (rewrites, headers, crons, `functions.maxDuration`) to typed TypeScript. Ship if it lets us delete config drift handlers; defer if no net simplification.
- [ ] **VERCEL-PRO-02**: Evaluate Vercel Build Output API for `api/vercel-entry.js`. Currently the 1.7 MB tsup-bundled artifact is tracked in git (Phase 999.2 backlog discipline issue). Build Output API would let us drop the tracked artifact. **Closes Phase 999.2 backlog if pursued.**
- [ ] **VERCEL-PRO-03**: Verify Fluid Compute compatibility on the Express `createApp()` factory in `server/app.ts`. Confirm request reuse, graceful shutdown, and request cancellation behaviors per Fluid Compute defaults. Document any required code changes; no-op if already compatible.
- [ ] **VERCEL-PRO-04**: Hobby→Pro docs-drift repair. Fix all surfaces still claiming Hobby-era semantics: `CLAUDE.md:101` ("Hobby cap 3 entries"), `docs/architecture/deployment.md:56` ("Hobby tier's 60s ceiling"), `deployment.md:133` ("Hobby/Pro tier caps at 3 cron entries"), `docs/runbook.md:539-547` ("10-second limit"), `docs/degradation.md:329` ("Vercel function 10s timeout"), `docs/architecture/llm-pipeline-reliability.md:6` (header inconsistent with §134 declaring NIM-only). Bump Vercel CLI in dev environment from 52 → latest.

#### CRON-WATCH — Phase 31 reopening (optional; locked at Phase 38 `/gsd-discuss-phase`)

- [ ] **CRON-WATCH-01**: 7-day cron stability watch, finished properly this time. Each of 7 consecutive days lands `events:llm:v3` healthy after the 04:00 UTC tick; eval ≥ 0.95 at all radii; 0 breaker trips; DLQ growth bounded. **MAY be absorbed by Phase 38** depending on operator decision at `/gsd-discuss-phase` — Phase 31 closed early in v1.5 at Day 1/7; reopening was flagged as a v1.6 carry-forward but operator decides locking at discuss-phase.

---

### Phase 39 — Operator Visibility (Token Budget + Cost-Shadow + LLM Flight Recorder)

Operator-locked priority #2 + absorbed Phase 27.4.5 (LLM observability flight recorder, previously operator-rejected as out-of-scope; operator reversed at v1.6 lock-in). All three blocks surface as Bearer-gated reads of accumulated Redis state, mirroring the existing `actorQuality` block pattern.

#### BUDGET — token budget surface

- [ ] **BUDGET-01**: `BudgetBlock` component added to `DevApiStatus.tsx` surfacing `llm:tokens:{provider}:YYYY-MM-DD` per-provider used-vs-cap with soft (0.8) and hard (0.95) threshold proximity bars. NIM is the only active provider post-v1.5; block renders single-provider but extensibility-shaped for any future restoration.
- [ ] **BUDGET-02**: Cost-shadow accrual surface from `events:llm-cost-shadow:v3:{YYYY-MM-DD}` HSET fields (`tokensIn`, `tokensOut`, `usdMicrocents`). Today's running cost displayed with microcents → USD conversion. Trend bar/sparkline across the 90d retention window.
- [ ] **BUDGET-03**: New `/api/operator-status` field `tokenBudget` (Bearer-gated read; degrade-open on Redis fail) mirroring the existing `actorQuality` block pattern. Returns per-provider current count + cap + soft/hard threshold + cost-shadow row.
- [ ] **BUDGET-04**: Contract test pins `tokenBudget` field shape (Zod `.strict()`). Regression-locks the dashboard's read shape.

#### OBS-FLIGHT — LLM flight recorder (Phase 27.4.5 absorbed; adapted to v3-only pipeline)

- [ ] **OBS-FLIGHT-01**: Redis-backed call history ring buffer. Replace in-memory `callHistory` (last 20, lost on cold start) with Redis list `llm:calls:history`: LPUSH + LTRIM 500-entry cap, 30d TTL. Entry shape extends current `callHistory` fields with `runId` + `batchIndex`. Hydrate on first `/llm-status` or `/llm-history` request after cold start.
- [ ] **OBS-FLIGHT-02**: Per-run summary records. New `llm:runs:history` Redis list, LPUSH + LTRIM 200-run cap, 30d TTL. Entry per run: `runId` (UUID generated at run start), `startedAt`/`completedAt` ISO timestamps, `outcome` (`'completed' | 'watchdog_aborted' | 'breaker_paused' | 'budget_hit' | 'error'`), `batchCount`, `batchesCompleted`, `batchesFailed`, `tokenSpend: { nvidia_nim: N }` (single-provider post-v1.5), `evalScore`, `dlqDelta`, `watchdogTimeouts`, `durationMs`, `pipelineVersion: 'v3'`.
- [ ] **OBS-FLIGHT-03**: `GET /api/events/llm-history` Bearer-gated endpoint (operator-only — note: original 27.4.5 todo gated on `NODE_ENV !== 'production'`; v1.6 promotes to Bearer-gated to match `/api/operator-status` precedent). Returns `{ runs: [...], calls: [...] }` with optional `?runId=X` and `?limit=N` query params.
- [ ] **OBS-FLIGHT-04**: DevApiStatus FlightRecorderBlock — nested history panel. Run list (newest first, colored outcome badge, batch progress bar, token spend bar, eval score) + expand-run drill-down (per-call timing, provenance distribution, DLQ groups, watchdog timeouts) + filter controls (outcome + date-range) + prompt copy-button drill-down. Likely lives as a sub-block inside the broader Phase 40 UI polish reorganization.
- [ ] **OBS-FLIGHT-05**: Run ID threading. Every LLM call during a single `runRefreshExtraction` invocation tags its `callHistory` entry with the run's `runId`. UI correlates calls back to runs. Threading lives in `llmExtractorWatchdog.ts` `withBatchWatchdog` (where the generation counter already provides a per-batch handle).
- [ ] **OBS-FLIGHT-06**: Cold-start hydration. On first `/llm-status` or `/llm-history` request after cold start, populate in-memory state from `llm:calls:history` LRANGE (last N entries) + `llm:runs:history` LRANGE (last M entries). Survives Vercel Fluid Compute warm-start gaps (mirrors Phase 28.2.7 `llm:lastProgress` Redis write-through pattern).

---

### Phase 40 — Dashboard UI/UX Polish + Subtab Consolidation

Operator-locked priority #3. Drives the API Health tab from "many accumulated sub-blocks" to "navigable polished portfolio surface". Pairs naturally with Phase 39's new FlightRecorderBlock — UI-SPEC must account for the new block.

#### UI-POLISH — dashboard polish + consolidation

- [ ] **UI-POLISH-01**: Run `/gsd:ui-phase` → produces UI-SPEC.md design contract for the API Health tab polish before any code lands. Defines post-polish information hierarchy, sub-block grouping (including Phase 39 new BudgetBlock + FlightRecorderBlock placement), and visual treatment. Coordinates with Phase 39 to avoid double-touching the same components.
- [ ] **UI-POLISH-02**: Sub-block consolidation pass on `DevApiStatus.tsx`. Current accumulated sub-blocks through Phase 28.2 + 32 + 33 + 35 + (incoming) 39: tier summary, per-endpoint quality, retry, fetch sparkline, eval scoreblock, operator actions, advEval, actorQuality, dead-URL count + drill-down, pin TTL, byBearer, **BudgetBlock**, **FlightRecorderBlock**. Group into 3-4 navigable sections per UI-SPEC; collapse redundant rows; redirect rarely-used controls into a sub-tab or drawer.
- [ ] **UI-POLISH-03**: Visual polish pass. Typography hierarchy, spacing system, color tokens (extend `colorBridge.ts` for any new semantic tokens), responsive layout for narrower viewports. Use `frontend-design` skill conventions; no generic AI aesthetics.
- [ ] **UI-POLISH-04**: Tab navigation refinement. Current `API Health` lives among other tabs in the dev shell; improve focus state, active-tab affordance, keyboard navigability. Verify `agent-native-reviewer` parity — every UI action must have an agent-callable equivalent (Bearer-gated endpoint or query param).
- [ ] **UI-POLISH-05**: Regression-lock the post-polish dashboard. RTL component tests for each sub-block's render contract (counts surface correctly under fresh / stale / degraded states). Snapshot tests for the consolidated layout shape.

---

### Phase 41 — Public Reveal Polish (final phase; absorbs former 999.6 Strand A)

Operator-locked priority "final phase" per 2026-06-03 milestone-start decision. Two strands: portfolio docs (REVEAL-DOCS — absorbed from former 999.6) + user-facing reveal surface (REVEAL-SITE — net-new REVEAL-01 + REVEAL-02 territory).

#### REVEAL-DOCS — portfolio-docs surface (Strand A from former 999.6)

- [ ] **REVEAL-DOCS-01**: `docs/BUILDING-WITH-CLAUDE-CODE.md` — the agentic-dev meta-story. ~600-1000 lines portfolio-readable prose covering the `/gsd` workflow shape, what a phase looks like (CONTEXT → DISCUSSION → PLAN → EXECUTE → VERIFY), where compounding worked (mechanical drift gates, parallel agents, probe-before-commit), where it didn't (Phase 26.2 NLP scrap = 2 weeks committed then deleted; Phase 31 early close at Day 1/7; Phase 34 honest deferral; Phase 37 architectural-mismatch unblocker PRs), cost observations (phases-per-week, session shape, what the agents are good at vs what still needs human judgment). Synthesize from `.planning/RETROSPECTIVE.md` + MILESTONES.md + phase 37-SUMMARY framing-gap callouts.
- [ ] **REVEAL-DOCS-02**: `docs/SHOWCASE.md` (or `docs/portfolio/INDEX.md`) — the guided tour. 1-page hub for portfolio visitors: start with hero GIF → decisions (ADR-0005 NLP scrap + ADR-0010 v1.5 close) → architecture (`system-context.md`) → operations (runbook) → meta-story (BUILDING-WITH-CLAUDE-CODE.md) → codebase entry (`src/components/map/BaseMap.tsx`).
- [ ] **REVEAL-DOCS-03**: `docs/JOURNEY.md` — product arc narrative. Portfolio-readable from "2026-03-13 brainstorm" → "2026-06-03 v1.5 close" with the WHY for each milestone (v0.9 = "can I render a map?" → v1.5 = "is the LLM pipeline reliable?"). Synthesizes `.planning/RETROSPECTIVE.md` to non-engineer-readable shape. Includes Mermaid gantt of the milestone progression.
- [ ] **REVEAL-DOCS-04**: `docs/concepts.md` — glossary, ~30 proprietary terms: Pitfall 1 cache bridge, LLM-optional architecture, tier-green gate, polite-citizen contracts, ghost event, canonical actor catalog, mechanical drift gate, degrade-open, 6-path resolver, honest deferral, probe-before-commit, flight recorder, etc.
- [ ] **REVEAL-DOCS-05**: `docs/COSTS.md` — transparency. Honest accounting: Vercel Pro $20/mo, NIM free, Upstash free tier, GDELT/OpenSky/adsb.lol/Open-Meteo/Yahoo Finance/AISStream/Overpass/WRI/Natural Earth/GeoEPR all free, Claude Code costs for development (session count, model mix, approximate per-phase cost). The "you can do this too" angle.
- [ ] **REVEAL-DOCS-06**: `docs/operator-guide.md` — visitor how-to (different from runbook incident response). Clone + run locally (`npm install`, `.env.example` setup), force-trigger cron (`?force=true` + Bearer), prune dead URLs from dashboard, read `/api/operator-status` payload, run eval harness (`npm run eval:replay`), capture fresh hero GIF (`npm run capture:hero`).
- [ ] **REVEAL-DOCS-07**: `public/screenshots/` extension. Hero GIF already exists. Add ~10 layer-by-layer screenshots: each visualization layer (geographic, weather, political, ethnic, water stress, threat density), API Health dashboard, threat-density clusters with click-through, actor-quality drill-down, ghost-event prune flow, **FlightRecorderBlock drill-down (Phase 39)**. Extend `scripts/capture-hero.ts` to `npm run capture:layers` so screenshots are reproducible.
- [ ] **REVEAL-DOCS-08**: `docs/LESSONS.md` — distilled retrospective. Pull "Key Lessons" sections from `.planning/RETROSPECTIVE.md` (currently buried in `.planning/`) to a single 1-page portfolio-readable doc. Surface: "Probe-before-commit for documentation reconciliation", "Honest deferral as a 1st-class outcome", "Mechanical drift gates compound", "Deletion over deprecation when rollback is `git revert`-able", "Architecture decisions cascade into audit-tier semantics" (Phase 37 lesson).
- [ ] **REVEAL-DOCS-09**: Brainstorms cleanup. `docs/brainstorms/2026-03-13-iran-conflict-monitor-brainstorm.md` (project origin) + `docs/superpowers/plans/` + `docs/superpowers/specs/` are orphaned agentic-dev artifacts. Decide one of: (a) index page so they're discoverable, (b) cross-link from BUILDING-WITH-CLAUDE-CODE.md as historical receipts, (c) consolidate the most interesting bits into BUILDING-WITH-CLAUDE-CODE.md + archive the rest.
- [ ] **REVEAL-DOCS-10**: Final-sweep audit at promotion. Re-run the v1.5-close 2nd-pass code + docs audit against then-current main BEFORE any REVEAL-DOCS work lands. By Phase 41 promotion, Phases 38 + 39 + 40 will have moved things and the `project-v1-6-cleanup-punchlist` + `project-v1-6-docs-drift` memories will be partially stale. Merge net-new findings into Phase 41 scope; drop captured-but-resolved items.

#### REVEAL-SITE — public-reveal user-facing

- [ ] **REVEAL-SITE-01**: Landing-page polish — refine the top-of-page hero, layout, copy. Decision on whether the dashboard IS the landing page or a separate landing page precedes the polish. Coordinates with Phase 40 (UI-POLISH-04 tab navigation) to avoid double-touching the dev shell.
- [ ] **REVEAL-SITE-02**: Demo flows — guided tour overlays or scripted walkthroughs surfacing the multi-layer + LLM-enrichment story for first-time visitors. Could be a Storybook-style walkthrough, an interactive onboarding overlay, or a `?demo=true` query param triggering a scripted state.
- [ ] **REVEAL-SITE-03**: Social-share assets — Open Graph image/card, Twitter card, favicon refresh if needed. Hero GIF can be the OG image source. Verify rendering across LinkedIn / Twitter / direct share previews.
- [ ] **REVEAL-SITE-04**: Custom-domain decision — stay on `otg-iran-monitor.vercel.app` or migrate to a custom domain. Vercel domain configuration if migrating; DNS handoff coordination.

---

## Future Requirements (deferred)

Captured-but-not-locked items that may surface in v1.7 or later milestones:

- **Phase 999.5 Performance Optimization + 1-300 VU k6 sweep** — backlog at `.planning/phases/999.5-performance-load-test/`. Promotion gate (3 consecutive `prod-connectivity-audit.yml` greens) was satisfied at Phase 37; operator deferred at v1.6 lock-in to prioritize reliability + UI + reveal first. Ready for promotion to v1.7 first-task.
- **Phase 999.1 / 999.2 / 999.3** — parked v1.4 carry-forwards. Phase 999.2 (api/vercel-entry rebuild discipline) may be absorbed into VERCEL-PRO-02 (Build Output API evaluation) during v1.6 execution; closes naturally if so.
- **`news:feed` cron warmer** — 4th cron entry under Pro 40-cap. Folds into Phase 38 if scope allows during 38-CONTEXT; otherwise carries to v1.7.
- **REVEAL-01 / REVEAL-02 v1.7 polish** — Phase 41 may not cover every possible reveal surface; whatever doesn't ship in 41 carries forward.

---

## Out of Scope (explicit exclusions with reasoning)

- **v4 multi-provider router** — operator-rejected at v1.5 start; would need a new milestone-start decision to revisit. Phase 34 deferred Cerebras+Groq as `cerebras-groq-deferred` 2026-05-23; v1.6 takes that decision further by deleting the adapter source files (LLM-PURGE-07).
- **Cerebras + Groq as active LLM providers** — purged from runtime cascade in v1.5; restoration would be its own phase if pursued. Source files removed in Phase 38 LLM-PURGE-07.
- **"Phase 29 finishing pass" as a single bundled PR** — operator-rejected at v1.5 close; broken across priority-aligned phases instead (Phase 38 LLM-PURGE absorbs the LLM-side dead code; Phase 41 REVEAL-DOCS-10 absorbs the docs cleanup).
- **Significant persons tracking** — complexity without clear data sources (pre-v1.0 decision).
- **Push/desktop notifications** — operator monitors actively (pre-v1.0 decision).
- **User authentication** — personal tool, single user; Bearer header is operator-only access control, not user auth (pre-v1.0 decision).
- **Historical playback/replay** — live + snapshots covers use case (pre-v1.0 decision).
- **Mobile app** — web-first desktop monitoring tool (pre-v1.0 decision).
- **Real-time chat or collaboration** — solo tool (pre-v1.0 decision).
- **Prediction/forecasting** — unreliable without classified data (pre-v1.0 decision).

---

## Traceability

This section will be populated by `gsd-roadmapper` when ROADMAP.md is generated. Format: REQ-ID → Phase mapping with success-criteria pointers.

Pending roadmap generation.

---

**Summary:** 46 requirements (10 categories) across 4 phases (38, 39, 40, 41). Optional CRON-WATCH-01 may be absorbed into Phase 38 at `/gsd-discuss-phase`. Numbering continues from v1.5 phase 37; v1.5 REQ-ID prefixes (LLM-RELI / GHOST / ACTOR / DOCS-INT / DOCS-PUB / DOCS-API / REDIS-OPT / SIMPLIFY) closed and archived at `.planning/milestones/v1.5-REQUIREMENTS.md`.
