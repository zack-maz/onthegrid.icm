# Project Retrospective

_A living document updated after each milestone. Lessons feed forward into future planning._

## Milestone: v0.9 — MVP

**Shipped:** 2026-03-19
**Phases:** 13 | **Plans:** 25/28 | **Timeline:** 6 days

### What Was Built

- 2.5D intelligence map with 3D terrain covering Greater Middle East
- Multi-source flight tracking (OpenSky, ADS-B Exchange, adsb.lol)
- Ship tracking via AIS + GDELT v2 conflict events (11 CAMEO types)
- Zoom-responsive entity rendering with canvas icon atlas
- Layer toggles, hover tooltips, click-to-inspect detail panels
- Smart filters (country, speed, altitude, proximity, date range)
- Analytics counters dashboard with delta animations

### What Worked

- Recursive setTimeout polling pattern avoided race conditions across all data sources
- Adapter pattern for flight sources made adding adsb.lol trivial (shared V2 normalizer)
- Canvas icon atlas with mask mode enabled runtime color tinting without multiple PNGs
- Zustand curried store pattern provided excellent type inference
- Phase-per-feature branching kept changes isolated and reviewable
- Average plan execution of ~4.7 minutes kept momentum high

### What Was Inefficient

- 3 plans were superseded by later work (06-03, 08-02, 09-02) — features delivered through alternate phases but original plans never formally closed
- Roadmap plan checkboxes drifted from disk state (roadmap showed unchecked plans that had summaries on disk)
- ACLED was built in Phase 8 then immediately replaced by GDELT in Phase 8.1 — could have gone straight to GDELT
- Some phases had UAT gap closure plans that could have been caught earlier with stricter criteria

### Patterns Established

- Shared normalizer pattern for similar data sources (adsb-v2-normalize.ts)
- Tab visibility-aware polling (pause on hidden, immediate fetch on visible)
- Cache-first server routes to conserve API credits
- localStorage persistence with atomic key + try/catch guards
- Pure filter predicates: non-applicable filters include (not exclude)
- Lost contact tracking via useRef to survive store updates

### Key Lessons

1. Plan for data source pivots — building adapter abstractions early pays off when sources change (ACLED -> GDELT)
2. Keep roadmap state and disk state in sync — drifted checkboxes caused confusion during milestone completion
3. Free-tier APIs with no auth (adsb.lol, GDELT) provide better out-of-box experience than credentialed sources
4. Meter-based icon sizing with min/max pixel bounds is the right pattern for zoom-responsive maps

### Cost Observations

- 229 commits over 6 days
- ~2 hours total plan execution time
- Stable ~4-5min per plan throughout

---

## Milestone: v1.0 — Deployment

**Shipped:** 2026-03-20
**Phases:** 2 (13-14) | **Plans:** 6/6 | **Timeline:** 2 days

### What Was Built

- Upstash Redis cache replacing all in-memory caches for serverless compatibility
- AISStream on-demand connection model (connect-collect-close per request)
- GDELT backfill with lazy on-demand historical data loading
- Vercel deployment with serverless functions + CDN-served SPA
- Rate limiting and graceful config degradation

### What Worked

- CacheEntry<T> pattern with `{data, fetchedAt}` cleanly separated staleness logic from cache mechanics
- Ship merge/prune and events accumulator patterns preserved data across polling cycles in stateless serverless
- Lazy backfill with cooldown key avoided redundant GDELT historical downloads
- `createApp()` factory pattern made the Express app testable and Vercel-compatible simultaneously
- tsup bundling to CJS solved Vercel's module format requirements cleanly

### What Was Inefficient

- AISStream's on-demand model (connect, collect N ms, close) adds latency per request — a persistent WebSocket would be faster but incompatible with serverless
- Had to add graceful config fallbacks for every API key since Vercel env vars aren't always present during build

### Patterns Established

- Cache-first routes with hard Redis TTL = 10x logical TTL
- `loadConfig()` with safe defaults instead of throwing on missing env vars
- tsup for server bundling alongside Vite for frontend

### Key Lessons

1. Serverless means rethinking any persistent state — WebSocket connections, in-memory caches, and polling loops all need alternatives
2. Ship merge/prune is essential when cache is shared across requests — stale ships need active pruning
3. Separate build pipelines (Vite + tsup) are worth the complexity for correct module formats

---

## Milestone: v1.1 — Intelligence Layer

**Shipped:** 2026-03-22
**Phases:** 8 (15-19.2) | **Plans:** 22/22 | **Timeline:** 3 days

### What Was Built

- Key infrastructure sites (nuclear, naval, oil, airbase, desalination, port) from Overpass/OSM
- News aggregation (GDELT DOC + 5 RSS feeds) with Jaccard dedup/clustering
- Severity-scored notification center with proximity alerts and news matching
- Oil markets tracker (Brent, WTI, XLE, USO, XOM) with sparkline charts
- Tag-based search language (~25 prefixes) with bidirectional filter sync and autocomplete
- Counter entity dropdowns with fly-to and proximity sorting

### What Worked

- Overpass API with fallback mirror provided reliable infrastructure data at zero cost
- Jaccard similarity (0.8 threshold, 5-token min) was a pragmatic dedup strategy that avoided NLP complexity
- Severity scoring formula (typeWeight × log mentions × log sources × recencyDecay) produced intuitively correct rankings
- Bidirectional sync between search tags and sidebar toggles via `useQuerySync` kept two UI paths coherent
- Phase 19 combined search + filter + layout cleanup into one pass — reduced thrash from incremental UI changes

### What Was Inefficient

- RSS feed parsing required per-feed country tagging that could have been structured from the start
- The search query parser went through a full recursive descent AST which was overkill for implicit-OR evaluation — a simpler tag-list approach would have sufficed
- Proximity alert radius (50km) was a guess that hasn't been validated against real operational needs

### Patterns Established

- Discriminated union search AST with tag evaluators per entity type
- Proximity sorting by reference point per category (Tehran for flights, Strait of Hormuz for ships)
- Accordion expansion pattern for counter rows with fly-to wiring
- sourceCountry tagging on news articles for downstream filtering

### Key Lessons

1. Clustering before display is essential — without dedup, GDELT DOC returns dozens of near-identical articles
2. Bidirectional UI sync is fragile — `useQuerySync` needed careful memoization to avoid infinite update loops
3. Combining related UI changes into one phase (19) is better than spreading them across phases that each touch the same components
4. Yahoo Finance's unofficial API is unreliable — needs fallback strategy for production

---

## Milestone: v1.2 — Visualization & Hardening

**Shipped:** 2026-03-29
**Phases:** 7 (20-21.3) | **Plans:** 19/19 | **Timeline:** 7 days

### What Was Built

- Visualization layer architecture (geographic, weather, threat) independent from entity toggles
- Elevation tinting with contour lines, geographic feature labels
- Weather heatmap (bilinear interpolation on terrain) with wind barbs
- Threat density heatmap with compound weight formula
- NLP-based news relevance scoring replacing keyword whitelist
- GDELT event quality pipeline (geo-validation, confidence scoring, CAMEO 180/192 exclusion)
- Production hardening (Helmet CSP, rate limiting, structured logging, Redis fallback)
- Multi-user load testing (k6 501 VUs + Playwright 3 workers, 100% pass)

### What Worked

- Separating entity filters from visualization layers eliminated the confusion of "toggling off flights" vs "showing a weather overlay"
- Compound threat weight formula (type × mentions × sources × fatalities × Goldstein × decay) produced meaningful heatmaps without manual tuning
- Bilinear interpolation for weather heatmap produced smooth temperature gradients from sparse grid data
- GDELT event geo-validation against country polygons caught significant false positives (events geocoded to wrong countries)
- k6 + Playwright load testing gave both API throughput and real browser validation in one pass
- CAMEO base code exclusion list (180, 192) was the simplest effective filter for noisy event categories

### What Was Inefficient

- Phases 20.3-20.5 (political boundaries, satellite imagery, infrastructure focus) were planned but deferred — could have scoped v1.2 tighter from the start
- Weather overlay required a separate `/api/weather` endpoint and polling loop for data that updates slowly — could have been fetched less frequently
- NLP relevance scoring added the `compromise` library (~1MB) for marginal improvement over a well-tuned keyword filter
- Phase 21 (production hardening) was planned as one big phase but executed as 21 + 21.1 + 21.2 + 21.3 — should have been scoped as separate phases from the start

### Patterns Established

- Layer stacking order: weather → threat → entities (threat picks supersede weather)
- `EXCLUDED_BASE_CODES` set for filtering noisy CAMEO categories at the adapter level
- Composite confidence scoring with configurable threshold for event quality gating
- maplibre-contour for dynamic contour line generation from DEM tiles
- MapLibre image source with canvas rendering for custom heatmap overlays

### Key Lessons

1. Visualization layers and data filters are orthogonal concerns — mixing them confuses users and complicates code
2. GDELT data quality requires active filtering at multiple levels (CAMEO exclusion, geo-validation, confidence threshold, NumSources ≥ 2)
3. Production hardening should be continuous, not a final phase — CSP headers and rate limits are easier to add incrementally
4. Load testing early would have caught the rate limit configuration issues found in Phase 21 sooner
5. Deferred phases (20.3-20.5) show that not every planned feature needs to ship — scope pruning is healthy

---

## Milestone: v1.5 — LLM Reliability & Reveal Prep

**Shipped:** 2026-06-03
**Phases:** 10 (29-37 incl. 30.1) | **Plans:** 60 executed / 62 declared | **Timeline:** 24 days

### What Was Built

- Active runtime LLM cascade narrowed to NIM-only (OpenRouter declared dormant by Phase 30.1 probe — 90% free-tier rate-limit failure). Cerebras + Groq purged from `server/adapters/llm-provider.ts` runtime path.
- v1 + v2 extractor modules deleted entirely (~6,400 LOC). `POST /api/events/llm-pipeline` override route, `events:llm-pipeline-override` Redis key, `refreshPipelineOverride()` helper, `setPipelineOverride()`, DevApiStatus Pin-to-v1/v2 buttons — all gone. Rollback is `git revert <Phase 29 commit range>`, not a Bearer-POST flip.
- Vercel project upgraded to Pro ($20/mo); `maxDuration: 300 → 800`. LLM cron gains 2.7× wall-clock headroom; Phase 30 tunes _against_ measured NIM throttle (Path B: `Retry-After` absent in 213 batches; `p95 = 33,263ms`).
- LLM-optional architecture proven: `/api/events` serves raw GDELT through the Pitfall 1 cache bridge when keys absent; map never goes blank.
- Hobby-era workarounds retired: SIMPLIFY-01 incremental flush; SIMPLIFY-02 `events:llm:v3:partial` observability key (-358 LOC); SIMPLIFY-03 watchdog defaults relaxed.
- Ghost-event URL liveness shipped end-to-end (probe sidecar + O(1) count sidecar + Bearer-gated prune endpoint + cron auto-prune at `attemptCount >= 3` + dashboard drill-down). Polite-citizen contracts pinned (concurrency 8, per-host 1 req/s throttle, ±200ms jitter, 10s timeout, 3-hop redirect cap, HEAD-then-GET-on-405).
- Actor metadata canonicalization (27-entry catalog + `actorConfidence` schema + extended `SYSTEM_PROMPT_V3` + eval `actorMatchRate` + adversarial actor-confusion injections + dashboard `actorQuality` block).
- Internal docs: 32-key Redis registry deep-dive at `docs/architecture/redis-keys.md`; mechanical drift gate (39 assertions × 4 sub-suites); 7-module LLM-pipeline JSDoc audit. CLAUDE.md trimmed −73.3% (17,500 → 5,018 tokens).
- Public docs: README sweep + `## LLM Enrichment` section; 12 architecture markdown files / 21 Mermaid diagrams audited; runbook §6 rewrite + §13-§16 SRE-template appendage; degradation Pitfall 1 contract; OpenAPI 3.0.3 14 → 19 endpoints with split `cronSecret` + `operatorBearer` securitySchemes + Redocly drift gate.
- ADR-0010 milestone-final (body rewritten end-to-end; 6 v1.5 sub-blocks; v1.5 Milestone Close Rollup; closing decision table).
- LLM-RELI-07 acceptance gate satisfied: 3 consecutive `prod-connectivity-audit.yml` greens (Run 1 `26771054370` · Run 2 `26856054351` · Run 3 `26856364229`). 4 architectural unblocker PRs (#32 / #33 / #34 / #35) landed during observation correcting Phase 28.2.5 D-09 strict-tier-green gate vs ADR-0010 LLM-optional architecture mismatches.

### What Worked

- **Probe-driven docs reconciliation** (Phase 30.1): Rather than re-enable a `skipOpenRouter: true` hardcode without evidence, the operator probed OpenRouter free-tier behavior (`scripts/probe-openrouter.ts`, 30 fires) and committed to NIM-only honestly when 90% came back rate-limited. The "no code change; docs follow shipped reality" outcome was the right shape.
- **Deletion over deprecation** (Phase 29): The v1 + v2 extractor + override surface had been "deep-rollback safety" for 4 months. Deleting all of it — modules, route, Redis key, UI buttons — produced a clean v3-or-nothing posture. Rollback path is mechanical (`git revert`) instead of operational (Bearer-POST). Less code to read, less to maintain, fewer "is this still load-bearing?" interruptions.
- **Conditional plan execution** (Phase 30.1): One probe plan + 3 contingent plans (right-scope / middle-bucket / minimum) keyed off the probe outcome. Only the matched-bucket plan ran; the other 2 were SKIPPED. Captured the decision-tree shape upfront, then executed only the branch evidence selected.
- **Honest deferral close-out** (Phase 34): The `cerebras-groq-deferred` status mirrors Phase 30.1's `nim-only` precedent. Empirical "no provider expansion right now" is itself a load-bearing outcome. Planning artifacts (CONTEXT + RESEARCH + 5 PLANs) preserved as the ready-to-execute audit trail for any future provider-restoration phase. Documented in ADR-0010 sub-block, not as private notes.
- **Mechanical drift gates** (Phase 35 + 36): Redis registry test (39 assertions × 4 sub-suites) + Redocly OpenAPI lint + markdown-link-check make doc/code drift fail loudly at vitest time, not at audit-discovery time months later. The cost of writing them was paid back in the same milestone (Phase 36 caught 3 broken Mermaid blocks the drift gate immediately surfaced).
- **Phase 37 acceptance-gate observation as architectural audit**: The 23-day audit dormancy that blocked the gate wasn't a v3 reliability problem — it was a strict-tier-green-vs-LLM-optional-architecture mismatch in the gate semantics themselves. Letting the gate run uncovered the real architectural debt (which 4 PRs fixed) instead of just rubber-stamping it.
- **Per-phase rollup in 37-SUMMARY.md**: The single-table 10-row rollup with framing-gap callouts gave the milestone-close artifact a self-contained narrative. Future readers don't need to chase 10 phase SUMMARY.md files to understand v1.5; they read one document.

### What Was Inefficient

- **Phase 31 closed early at Day 1 / 7** despite the requirement saying "≥7 consecutive days". The single-day PASS was captured, but the proper bar was never met. The slow-burn regression that should have been caught by Day 2-7 only surfaced 23 days later during Phase 37 acceptance-gate observation (and required 4 unblocker PRs). Early-close with caveat is honest documentation, but the operator-side decision to skip Days 2-7 cost rework time at the milestone-close gate.
- **Phase 34 plan structure assumed probe would run**: 5 plans were written (probe → adapter → eval → DLQ → close). When the operator chose to skip provisioning Cerebras + Groq free-tier accounts, 4/5 plans SKIPPED and only the close-out ran. The plan investment was useful as the ready-to-execute audit trail but consumed planning time at probe + adapter design that wasn't load-bearing.
- **`skipOpenRouter: true` hardcode lived since Phase 27.4.4 (~6 weeks)** without docs reconciliation. The architecture diagrams and CLAUDE.md were advertising a NIM → OpenRouter cascade that didn't exist at runtime. Phase 30.1 cleaned this up retroactively; ideally Phase 27.4.4 (or the boundary review immediately after) should have either reverted the hardcode or amended the docs in lockstep.
- **OpenAPI lint gate landed late (Phase 36)** — the 14-endpoint OpenAPI 3.0.3 spec had been hand-authored in v1.3 and was carried forward 2 milestones before getting a structural drift gate. The `ConflictEventEntity.type` enum corrected from 11-value pre-Phase-27 → canonical 5-value was a long-standing doc lie; Redocly caught it on first run.
- **Phase 37 observation window had to land 4 unblocker PRs**: PR #32 (`llmEvents` demoted to non-critical) was an ADR-0010 alignment that should have shipped _in_ Phase 29, not surfaced _during_ Phase 37 observation. The gate was designed in Phase 28.2.5 against a "critical[llmEvents]: healthy" assumption that Phase 29's LLM-optional decision invalidated. Catching this at v1.5-close gate cost ~3 days.
- **`events:llm:v3:partial` lived 1 milestone past its Hobby-era usefulness** before Phase 35 retired it. Once the Pro upgrade lands in Phase 29, anything that was a "300s-budget workaround" should immediately enter the "schedule for deletion" queue.

### Patterns Established

- **Probe-before-commit for documentation reconciliation**: When code and docs disagree, write a probe script (`scripts/probe-openrouter.ts`-style) before deciding which side to change. Measurement beats opinion.
- **Honest deferral close-out as a 1st-class outcome**: When a planned phase doesn't ship (probe didn't run, operator skipped, evidence didn't support), close it with a named status (`cerebras-groq-deferred`, `nim-only`) rather than carrying as "in progress". Document the rationale + preserve planning artifacts as the ready-to-execute audit trail.
- **Mechanical drift gates over reviewer vigilance**: Drift gates that fail vitest beat checklists that ask reviewers to remember to check. Redis registry test, OpenAPI Redocly lint, markdown-link-check, byte-identity sentinels for domain constants — all examples that paid back within the same milestone.
- **Per-phase rollup as milestone-close artifact**: The last phase's SUMMARY.md should contain the milestone-close rollup with framing-gap callouts, decision table, and quantitative snapshot. Don't make readers chase 10 phase SUMMARY.md files; consolidate.
- **Deletion over deprecation when rollback is `git revert`-able**: If the rollback path is "revert this commit range", delete the code. Don't keep "deep rollback safety" modules importable; they accumulate is-this-still-used? interruptions.
- **Conditional plan trees**: When a phase outcome branches on a probe/measurement result, write the contingent plans upfront and SKIP the unmatched branches. Captures the decision tree shape; gives reviewers visibility into what was _not_ shipped and why.
- **CLAUDE.md current-state invariants only**: Phase-history bloat moves to archived `milestones/v[X.Y]-ROADMAP.md`. CLAUDE.md keeps Project Context, Conventions, Env Vars, Color Tokens, Map Patterns, Testing, Key Files, Data Model, Vercel Deployment, and the Redis key registry. Trim aggressively at every milestone close.

### Key Lessons

1. **Pre-existing "deep rollback safety" is technical debt, not safety.** If the rollback path is `git revert`, the code being preserved "for safety" is just dead code waiting to confuse the next reader. Delete it; trust git.
2. **A 7-day stability watch needs to actually be 7 days.** Closing early under operator decision sacrifices the very signal the watch was designed to catch. The slow-burn regression that surfaced 23 days later in Phase 37 is the lesson here.
3. **Architecture decisions cascade into audit-tier semantics.** Phase 29 made the LLM pipeline optional; Phase 28.2.5's strict-tier-green gate hadn't been reconciled with that decision. The gate-vs-architecture mismatch should be audited at the same phase that changes the architecture, not 1 milestone later under a different acceptance gate.
4. **Probe-driven decisions produce honest docs.** Phase 30.1 probed OpenRouter (27/30 = 90% rate-limited) and committed to docs-only amendment. Phase 34 _didn't_ probe Cerebras/Groq (operator deferred) and closed honestly as `cerebras-groq-deferred` rather than declaring untested cascade restoration. Both are correct; neither lies.
5. **Mechanical drift gates compound.** Each gate written in v1.5 (Redis registry, OpenAPI lint, markdown-link-check, redis-death chaos) is now load-bearing for v1.6+. The cost is paid once; the protection is forever (or until the gate itself drifts, which is why drift gates need drift gates — `*.test.ts` files).
6. **Honest deferral preserves optionality.** Phase 34's deferral kept 5 plans, 1 RESEARCH, 1 CONTEXT, and the integration design intact at `.planning/milestones/v1.5-phases/34-.../`. If v1.7 wants to restore the cascade, the work is `git checkout` away. Closing as "not in scope" with no artifacts would have forced re-planning from zero.
7. **Acceptance gates that don't observe shipped reality are worse than no gate.** Phase 28.2.5's gate was strict on a critical-tier endpoint (`llmEvents`) that Phase 29 made LLM-optional. A gate that flags correct shipped behavior as failures is documentation theater. PR #34's truth-table relaxation made the gate observable; the gate should have been written against the LLM-optional architecture from day one, not retrofitted at v1.5 close.

### Cost Observations

- 209 commits over 24 days
- 10 phases / 60 plans executed / 62 declared (97% execution rate; 2 conditional SKIPs + 4 deferral SKIPs)
- ~24 days wall-clock; ~8 days had a phase close commit landing (~3 days per phase average for closing phases; longer for Phase 33 + 35 which had Wave structure)
- Cost-control deferrals (Phase 34 `cerebras-groq-deferred`, Phase 31 early-close) kept the milestone moving without false reliability claims; in both cases the "honest" path was the cheaper path

---

## Milestone: v1.6 — Production Hardening

**Shipped:** 2026-06-09
**Phases:** 4 (38–41) | **Plans:** 21 | **Tasks:** ~43

### What Was Built

Six honest-signal LLM bug fixes + GDELT source matching (Phase 38); water-facility name romanization (`nameLatin`) through the Overpass Latin-label gate; safe Vercel Pro cleanup with the two risky migrations (vercel.ts config, Build Output API) explicitly deferred per D-09; operator visibility — token-budget + cost-shadow surface and a Redis-backed LLM flight recorder (`llm:calls:history` / `llm:runs:history` rings surviving Fluid Compute cold starts, Phase 39); dashboard UI polish + API-Health subtab consolidation with WAI-ARIA tablist (Phase 40); and the public-reveal portfolio surface — first-visit IntroOverlay, re-openable driver.js GuidedTour, OG/Twitter share card, and 7 portfolio docs (Phase 41).

### What Worked

- **Ship-then-verify on the portfolio surface.** Merging v1.6 to prod first, then Playwright-verifying Phase 41's 4 human checks on the live public URL (the preview deploy was Vercel-auth-gated and unreachable by crawlers) — verification against the real artifact, with rollback available.
- **Honest deferral over false completeness.** Risky Vercel migrations deferred with written rationale (D-09) rather than rushed; CRON-WATCH-01 left optional; Nyquist gaps surfaced not papered over.
- **Single-source-of-truth types** (`CallHistoryEntry`/`RunHistoryEntry` in `llmProgress.ts`) meant the 39→40 flight-recorder wiring had zero shape drift at integration-check time.

### What Was Inefficient

- The v1.6 branch sat ~145 commits ahead of main, unmerged and un-deployed, across a multi-day pause — the entire milestone shipped in one late merge rather than incrementally, so prod was a full milestone behind during development.
- Nyquist validation lagged: Phase 39 partial, Phase 40 missing VALIDATION.md — functional verification passed but the formal coverage record was skipped under time pressure.

### Patterns Established

- **Live-prod human-verify with Playwright + curl** as the close-out gate for UI/portfolio phases whose criteria can't be checked in jsdom (spotlight geometry, localStorage persistence, crawler assets, secret-leak inspection).
- **driver.js `onHighlightStarted` panel-open hooks** for tours that must spotlight default-hidden chrome.

### Key Lessons

- Don't let a milestone branch drift far from main — ship phases to prod as they verify, not in one terminal merge.
- A CSS slide-in animation will desync a driver.js spotlight cutout unless you `driver.refresh()` after the transition settles (step-4 tour cosmetic, deferred).

### Cost Observations

- Close-out session ran on Opus 4.8; integration check delegated to Sonnet; verification was Playwright-driven against live prod (no model cost for the browser work itself).

---

## Cross-Milestone Trends

| Metric  | v0.9   | v1.0   | v1.1   | v1.2    | v1.3   | v1.4    | v1.5     |
| ------- | ------ | ------ | ------ | ------- | ------ | ------- | -------- |
| Phases  | 13     | 2      | 8      | 7       | 11     | 18      | 10       |
| Plans   | 25/28  | 6/6    | 22/22  | 19/19   | 36/36  | 60/60   | 60/62    |
| Days    | 6      | 2      | 3      | 7       | 11     | 29      | 24       |
| LOC     | 12,262 | 13,637 | 25,842 | ~30,000 | —      | —       | 92,501   |
| Commits | 229    | 35     | 146    | 129     | —      | —       | 209      |
| Tests   | —      | —      | 851    | 958     | ~1,700 | 2,193   | ~2,386   |
| Bundle  | —      | —      | —      | —       | 1.2 MB | 1.72 MB | ~1.73 MB |
