# Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup Sweep — Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Verify the Redis-key registry against the actual codebase, produce a deep-dive inventory artifact, retire the Hobby-era observability key `events:llm:v3:partial`, document the role of `server/lib/freeClaudeRouter.ts` for future readers, refresh public-API JSDoc on the 7 LLM-pipeline modules, and capture pre/post measurements of (a) the Upstash command budget and (b) the `api/vercel-entry.js` bundle size. Closes the v1.5 documentation-and-cleanup track that was deferred while the LLM-RELI spine ran.

**Requirements covered (this phase):** DOCS-INT-02, DOCS-INT-03, REDIS-OPT-01, REDIS-OPT-02, REDIS-OPT-03, REDIS-OPT-04, SIMPLIFY-02, SIMPLIFY-05, SIMPLIFY-07.

**Trigger:** Codebase scout surfaced **4 keys missing from the CLAUDE.md "Serverless Cache" registry** (`events:llm:v3:lineage:{eventId}`, `events:llm:v3:lineage-keys`, `events:llm:v3:group-lineage:{hash}`, `events:llm-pipeline-audit`) plus 1 key flagged for retirement (`events:llm:v3:partial`, 7 production refs). These are exactly the drifts DOCS-INT-03 + REDIS-OPT-01 exist to surface. The hand-maintained registry rotted in the natural course of Phases 27-34; Phase 35 fixes the artifacts and installs a mechanical drift gate so the rot does not recur.

**Out of scope (deferred elsewhere):**

- **CLAUDE.md trim (DOCS-INT-01).** Already shipped in Phase 29 (73% reduction to ~5018 tokens). Phase 35 only verifies the §Serverless Cache subsection of CLAUDE.md against code; the broader trim is NOT re-litigated.
- **`llm:tokens:cerebras:*` / `llm:tokens:groq:*` registry entries.** The ROADMAP carve-out ("Phase 35 should run after Phase 34 so its sweep inventories the new keys") is **moot** — Phase 34 closed `cerebras-groq-deferred` (operator decision; no probe ran). No Cerebras/Groq token-budget keys exist. The Phase 35 inventory records this as `absent (Phase 34 deferred)`.
- **OpenRouter / NIM re-litigation.** Phase 30.1 / Phase 34 closed those questions. Phase 35 inventories the existing `llm:tokens:openrouter:*` and `llm:tokens:nvidia_nim:*` keys (already in registry); does not re-tune them.
- **Retroactive Redis key cleanup in production.** Retired keys (currently only `events:llm:v3:partial`) deleted from code in this phase; production cleanup via **natural TTL expiry** since the partial-key already carries `LLM_REDIS_TTL_SEC`. No one-shot deletion script.
- **Generated-doc tooling.** No `scripts/generate-redis-registry.ts` shipped. The drift gate is a vitest (D-04), not a generator. Code is the source of truth; the human-readable artifact is hand-edited and re-checked by the vitest.
- **Top-of-file JSDoc block rewrites on the 7 LLM-pipeline modules.** Phase 35 only refreshes public-API one-liners (D-09). Top-of-file blocks cite retired phase numbers (e.g. "Phase 27.4.3 D-03") and that is acceptable as historical waymarker.
- **v1/v2 archive handling (SIMPLIFY-06).** Folded into Phase 29's full deletion. Phase 35 does not touch v1/v2 because there is no v1/v2 code remaining.
- **Cerebras/Groq adapter purge (SIMPLIFY-04).** Already shipped in Phase 29.
- **Incremental-flush retirement (SIMPLIFY-01) / watchdog relaxation (SIMPLIFY-03).** Already shipped in Phase 30.
- **Public docs sweep, OpenAPI additions, ADR-0010 close-out.** Phases 36 + 37 territory. Phase 35's CLAUDE.md edits stay within the §Serverless Cache subsection.
- **Cardinality measurement automation.** Inventory cardinality column is captured one-shot at phase close (manual SCAN or Upstash dashboard reading); not a continuously-updated value.
- **Hit/miss telemetry instrumentation.** Inventory column included only where telemetry already exists (e.g. via existing `cacheGetSafe` log lines); no new instrumentation lands in Phase 35.

**Carrying forward (locked, not re-decided here):**

- **Cron-only writer discipline (anti-pattern #17).** Phase 35 ships no new writers to `events:llm:v3` or other production caches. Inventory script (if any) is read-only; vitest is read-only.
- **Branch-per-phase from `main`.** Planner / executor cuts `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu` from `main` before any code change. CONTEXT.md, DISCUSSION-LOG.md, and the discuss checkpoint may sit on the current branch as scaffold.
- **Atomic per-decision commits.** Each D-N below that touches code lands as a separate commit so `git revert` is surgical (Phase 30 D-08 / Phase 30.1 D-17 / Phase 33 / Phase 34 D-25 invariant). `feat(35):` / `chore(35):` / `docs(35):` / `test(35):` prefixes.
- **TypeScript ~5.9.3 pinned.** `logger.child({ module: '...' })` for any new code; never `console.*`.
- **Vercel Pro 800s `maxDuration`** is live (Phase 29 D-08). This is the operating-budget context that justifies SIMPLIFY-02 (partial-key was a 300s-budget mitigation; under 800s, terminal writes reliably finish).
- **Schema-pinning contract test pattern.** D-04's drift gate mirrors Phase 32 D-22 (`urlLiveness.schema.test.ts`), Phase 33 D-07 (`actorCatalog.test.ts`), and the `colorBridge.test.ts` byte-identity sentinel.
- **Pitfall 1 cache bridge is invariant** (ADR-0010). When `events:llm:v3` is empty, `server/routes/events.ts` serves raw GDELT. Phase 35 ships no code that could put the cache into an unrecoverable state.
- **`events:llm:v3` is the only terminal cache key.** SIMPLIFY-02's retirement of `events:llm:v3:partial` does not affect the terminal-key contract — terminal-key writes were already the load-bearing path.
- **`parseEnv()` fail-fast on env vars** (Phase 26.3+). No new env vars in Phase 35 (the `events:llm:v3:partial` retirement is "delete entirely," NOT env-gate per D-05).
- **`logger.child` Pino structured logging across server.** Any inventory or audit script uses `logger.child({ module: '...' })` if it lands at runtime; one-shot tools under `scripts/` may use console for terse stdout but should prefer `logger`.
- **Phase 34 close as `cerebras-groq-deferred`** is final for v1.5. ADR-0010 already captures this. Phase 35 inventory reads "absent (Phase 34 deferred — see ADR-0010 Phase 34 sub-block)" for those slots.

</domain>

<decisions>
## Implementation Decisions

### Registry drift detection (DOCS-INT-03, REDIS-OPT-01)

- **D-01: Test-enforced registry parity is the load-bearing primitive.** Ship `src/__tests__/lib/redis-registry.test.ts` that (a) parses CLAUDE.md §Serverless Cache and `docs/architecture/redis-keys.md` to extract the set of documented keys, (b) greps the codebase for each documented key to find writer + reader file:line references, (c) greps the codebase for _any_ string matching the prefix `'events:llm:*'` / `'flights:*'` / `'ships:*'` / `'sites:*'` / `'water:*'` / `'news:*'` / `'markets:*'` / `'geocode:*'` / `'llm:*'` / `'cron:*'` / `'operator:*'` / `'audit:*'` to find undocumented keys. Asserts: every documented key has ≥1 writer + ≥1 reader file path; every grepped key is documented. Drift fails the next `vitest run` — same precedent as Phase 32 D-22, Phase 33 D-07, `colorBridge.test.ts`.

- **D-02: Test allows `__tests__/` paths to count toward writers/readers** (test fixtures and snapshot-prep code that set up cache state are legitimate references — excluding them would cause test-only keys to false-fail). The test also exempts a hand-curated `EXEMPT_KEYS` array in the test file for keys that exist in code as build artifacts but legitimately have no production writer/reader (none expected today; the array is empty at phase close, structurally available for future justified exemptions with a comment per entry).

- **D-03: Test ranges over BOTH surfaces (CLAUDE.md + redis-keys.md).** Each documented key must appear in both. Asserting parity across the two surfaces prevents "I updated one, forgot the other." This is the bridge that keeps the operator-skim (CLAUDE.md) and the deep-dive (redis-keys.md) in sync.

- **D-04: Test runs as part of the existing `npm test` / `vitest run` suite.** No new CI step. Default invocation; cataloged alongside the other `*.schema.test.ts` files in `src/__tests__/lib/`. Discoverable via the existing test naming convention.

### Inventory artifact shape (REDIS-OPT-01, REDIS-OPT-02)

- **D-05: Inventory artifact lives at `docs/architecture/redis-keys.md`.** Per ROADMAP success criterion #2. NEW file. CLAUDE.md §Serverless Cache stays in its current 1-line-per-key skim shape (operator quick-skim during incidents); `docs/architecture/redis-keys.md` carries the deep-dive table.

- **D-06: Inventory table columns** (in this order): `Key`, `Writers (file:line)`, `Readers (file:line)`, `TTL`, `Value shape`, `Business purpose`, `Cardinality (estimate)`, `Classification`. Classification enum = `load-bearing` | `observability` | `retire`. Markdown table format. Sort by key prefix family (e.g. all `events:*` together, all `flights:*` together) then alphabetical within family.

- **D-07: Cardinality column accepts ranges and time-bounded estimates.** Examples: `1`, `<200`, `≤500 (capped)`, `~5000 (production sample 2026-05-26)`, `n/a (set)`, `absent (Phase 34 deferred)`. Single-snapshot measurement at phase close; not continuously updated.

- **D-08: Each key classified per REDIS-OPT-02.** `load-bearing` = removal breaks a live feature. `observability` = serves drill-down / debugging; bounded; OK to keep but cap reviewed against TTL right-sizing (REDIS-OPT-03). `retire` = no callers OR replaced. Rationale column captures the why; single sentence per entry.

### JSDoc audit (DOCS-INT-02)

- **D-09: Tight-scope JSDoc audit — public-API one-liners only.** Each exported function / class / type in the 7 modules (`server/lib/llmExtractionPipeline.ts`, `llmEventExtractor.v3.ts`, `llmResolver.ts`, `llmCircuitBreaker.ts`, `llmDLQ.ts`, `llmTokenBudget.ts`, `llmExtractorWatchdog.ts`) gets a single accurate `/** ... */` line above its declaration. Existing top-of-file blocks are left UNTOUCHED even if they cite retired phase numbers — those are valued historical waymarkers and rewriting them is out of scope (Phase 36 / docs sweep territory if it ever happens). ~30-50 one-liners total.

- **D-10: Public-API JSDoc must be true today, not aspirational.** A JSDoc line that describes what the function _was_ designed to do but no longer matches its current behavior (e.g. one that cites a now-deleted code path) gets rewritten to describe current behavior. Reviewer / executor reads each line aloud against the function body and asks "is this true today?" — if not, fix.

- **D-11: The partial-key reference at `llmEventExtractor.v3.ts:13-14` and `:122-123, :260, :448, :475, :609` is touched IN THE SIMPLIFY-02 commit (D-12), not in the JSDoc audit commit.** When the partial-key writer is deleted, those references go with it as part of the same atomic commit. The JSDoc audit commit does not need to handle them separately.

### `events:llm:v3:partial` retirement (SIMPLIFY-02)

- **D-12: Delete the partial-key entirely.** Path: delete the writer call at `server/lib/llmEventExtractor.v3.ts:475`; delete the constant `EVENTS_LLM_V3_PARTIAL_KEY` at `:122` and its export at `:123`; delete the top-of-file reference at `:13-14`; delete the JSDoc reference at `:260, :448, :609`; delete the supporting comment lines in `server/lib/llmExtractionPipeline.ts:95, :134`. Tests in `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts`, `.incrementalWrite.test.ts`, `.crossBoundary.test.ts` drop the two-key-discipline assertions but retain the terminal-key-discipline assertions. `server/__tests__/cache/redis-prefix.test.ts` fixture line at `:120, :123` updated to remove the partial-key reference. CLAUDE.md §Serverless Cache loses the `events:llm:v3:partial` line entry. Single atomic commit `chore(35): retire events:llm:v3:partial observability key (SIMPLIFY-02, D-12)`.

- **D-13: Production cleanup = natural TTL expiry.** The partial-key already carries `LLM_REDIS_TTL_SEC` TTL (it always has — the writer at `:475` passes that as the third arg to `cacheSetSafe`). Within `LLM_REDIS_TTL_SEC` of the deploy, all production partial-keys disappear without intervention. No one-shot deletion script is shipped; success criterion #3 documented this path in SUMMARY.md.

- **D-14: 4 missing keys ADDED to CLAUDE.md §Serverless Cache as part of D-01 sweep.** `events:llm:v3:lineage:{eventId}` (HSET, 7d TTL — writer `server/lib/llmLineage.ts:57`, reader determined during planner research per D-01 grep), `events:llm:v3:lineage-keys` (ZADD index, 500-cap — writer `llmLineage.ts:21`, reader determined per grep), `events:llm:v3:group-lineage:{hash}` (key prefix exported, writer determined per grep, reader determined per grep), `events:llm-pipeline-audit` (LPUSH bounded list — writer `server/lib/pipelineAudit.ts:33`, reader `:44`). Planner research dispatch confirms writer/reader file:line for each before authoring the entry; researcher's output is the input for the registry artifact authoring commit.

### `freeClaudeRouter.ts` audit (SIMPLIFY-05)

- **D-15: `server/lib/freeClaudeRouter.ts` is NOT orphan — KEEP with top-of-file callers block.** Codebase scout shows 8 importers: `server/lib/llmEventExtractor.v3.ts:40` (sole production extractor), `server/lib/llmResolver.ts:15` (6-path geocode resolver — uses `callLLM` for the 2-pass verification path), `server/adapters/llm-provider.ts:23` (bridge wrapper, re-exports `callLLM` for legacy import compat), and 5 test files (`freeClaudeRouter.retryAfterMs.test.ts`, `llmEventExtractor.v3-adaptive.test.ts`, `llmLineage-prefilter.test.ts`, `llmResolver.test.ts`, plus the canonical `freeClaudeRouter.test.ts`). Per ROADMAP success criterion #7, ship a top-of-file JSDoc block listing the live production callers + their purpose. Single atomic commit `docs(35): document freeClaudeRouter.ts callers (SIMPLIFY-05, D-15)`.

- **D-16: Top-of-file callers block format.** Prepended at the top of `server/lib/freeClaudeRouter.ts`, replacing or augmenting the existing file-header comment. Shape:
  ```ts
  /**
   * Free Claude Router — multi-provider cascade for LLM-backed extraction + geocoding.
   *
   * Live production callers (verified Phase 35 / 2026-MM-DD):
   *   - server/lib/llmEventExtractor.v3.ts — sole runtime extractor; calls callLLM
   *     for each event-group batch.
   *   - server/lib/llmResolver.ts — 6-path geocode resolver; calls callLLM for
   *     the nominatim-verified-2pass reranker only.
   *   - server/adapters/llm-provider.ts — bridge wrapper; re-exports callLLM
   *     for legacy import paths (Phase 27.4.3 D-03 cascade replacement).
   *
   * Active cascade shape (Phase 34 close): NIM primary; OpenRouter dormant
   * (skipOpenRouter: true at extractor sites); Cerebras + Groq deferred
   * (Phase 34 close — see ADR-0010 Phase 34 sub-block).
   */
  ```

### TTL right-sizing (REDIS-OPT-03)

- **D-17: TTL review is read-only AT THIS PHASE.** REDIS-OPT-03 success criterion is "TTLs right-sized." The inventory table (D-06) captures the current TTL per key in its TTL column. Planner research evaluates each TTL against the documented producer cadence + freshness requirement and proposes specific TTL changes IF AND ONLY IF a clear mismatch is found. Each proposed TTL change ships as its own atomic commit `feat(35): right-size TTL on {key} from Xs to Ys (REDIS-OPT-03, D-17.{N})` so a single bad call can be reverted surgically. If no TTL changes are proposed (current TTLs all already right-sized), the SUMMARY.md records that finding as the load-bearing outcome — same precedent as Phase 31 closing early with "no incidents observed" being itself the deliverable.

- **D-18: Replay-history cap reviewed during inventory.** Per REDIS-OPT-03 wording: "observability-only keys capped (DLQ at 200 entries / 7d, audit log at 500 / 30d already; replay history not yet capped)". The replay-history key (whatever it currently is — researcher locates) gets a cap applied if absent. Cap value defaults to 500 entries / 7d TTL mirroring the audit-log pattern; planner can deviate with justification.

### Measurement protocol

- **D-19: Bundle-size delta (SIMPLIFY-07) = `wc -c api/vercel-entry.js`** snapshot at phase start (baseline = 1,779,504 bytes ≈ 1.70 MB as of 2026-05-26 — PROJECT.md cites 1.72 MB at v1.4 close; both numbers in the same ballpark within rebuild jitter). Repeat at phase close after all D-N code-touching commits have landed. Delta + percentage captured in SUMMARY.md. ROADMAP success criterion #8 stretch goal of <1.5 MB is informational; achievement OR non-achievement is documented either way. The delta lands in ADR-0010 sub-block per D-22.

- **D-20: Upstash command-budget delta (REDIS-OPT-04) = manual Upstash dashboard screenshots.** Operator captures the Upstash dashboard "Commands" metric at phase start (committed as `.planning/phases/35-*/redis-budget-baseline-YYYY-MM-DD.png`) and at phase close (committed as `redis-budget-close-YYYY-MM-DD.png`). Delta + percentage + identified primary driver(s) recorded in SUMMARY.md. Upstash REST API does not expose `INFO commandstats` cleanly; manual dashboard reading is the honest measurement surface. No `scripts/measure-redis-budget.ts` shipped — the instrumentation overhead is not justified by Phase 35's timeline.

- **D-21: Primary-driver attribution for the budget delta.** SUMMARY.md identifies which retirements / cap changes / TTL changes contributed how much to the measured reduction. Quantitative estimates only where derivable (e.g. "partial-key retirement = ~5 writes/cron-run × 1 run/day = ~1825 cmds/year saved against the daily measurement window"). Where attribution is ambiguous, "drivers identified but unattributed" is acceptable.

### Documentation amendments

- **D-22: ADR-0010 Phase 35 sub-block appended.** New heading `## Phase 35 Sub-block (appended 2026-MM-DD)` at `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` after the most recent prior sub-block. Records: Upstash command-budget pre/post delta + primary drivers, bundle-size pre/post delta, partial-key retirement rationale, registry drift gate rationale. Mirrors Phase 30 / 30.1 / 34 sub-block convention.

- **D-23: CLAUDE.md edits are bounded to §Serverless Cache subsection.** Add the 4 missing keys per D-14; remove the `events:llm:v3:partial` entry per D-12; update writer/reader file:line references for any keys whose location moved since CLAUDE.md was last touched. No edits outside §Serverless Cache. The DOCS-INT-01 trim discipline (Phase 29) is preserved.

- **D-24: `docs/architecture/redis-keys.md` is NEW, written from scratch.** No prior version. Follows the Mermaid-architecture-doc style already in `docs/architecture/` (markdown, no fancy generators, plain prose + tables). Header carries a one-paragraph "Why this file exists" referencing DOCS-INT-03 / REDIS-OPT-01.

### Plan decomposition + commit discipline

- **D-25: Plan structure (estimate; planner adjusts).**
  1. **35-01-PLAN.md** — Registry inventory + drift-gate vitest. Pre-flight code grep for writers/readers, build the deep-dive table at `docs/architecture/redis-keys.md`, add 4 missing keys to CLAUDE.md §Serverless Cache, ship `src/__tests__/lib/redis-registry.test.ts`. Atomic commits per D-01..D-04, D-05..D-08, D-14. Baseline measurements captured (D-19 bundle-size, D-20 Upstash dashboard screenshot).
  2. **35-02-PLAN.md** — Retire `events:llm:v3:partial`. All edits + test updates per D-12, D-13. Single atomic commit (small surface).
  3. **35-03-PLAN.md** — `freeClaudeRouter.ts` audit + callers block. Single atomic commit per D-15, D-16.
  4. **35-04-PLAN.md** — JSDoc audit of 7 LLM-pipeline modules. Per D-09, D-10. Commits batched by module (7 commits) so individual module rewrites can revert if a particular one introduces noise.
  5. **35-05-PLAN.md** — TTL right-sizing (REDIS-OPT-03). Per D-17, D-18. Zero, one, or many commits depending on what the planner finds. May collapse to a single "no changes proposed" commit if all TTLs are already right-sized.
  6. **35-06-PLAN.md** — Phase close. Re-run inventory grep to confirm registry vitest still green. Close measurements (D-19 bundle-size, D-20 Upstash screenshot). SUMMARY.md, ROADMAP / REQUIREMENTS / STATE flips, ADR-0010 sub-block per D-22. Commit `docs(35): phase close — ADR sub-block + roadmap flips (D-22..D-26)`.

- **D-26: Atomic-per-decision commit discipline within plans.** Each D-N from this CONTEXT.md that touches code lands as a separate commit (Phase 30 D-08 / Phase 30.1 D-17 / Phase 33 / Phase 34 D-25 invariant). `feat(35):` / `test(35):` / `chore(35):` / `docs(35):` prefixes with body that names the decision number.

- **D-27: Branch discipline.** Planner / executor cuts `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu` from `main` after the Phase 34 merge commit. CONTEXT.md, DISCUSSION-LOG.md, and the discuss checkpoint may sit on `main` as scaffold work — nothing else does. Branch cut happens at the start of Plan 35-01 execution.

### Claude's Discretion

- Whether the registry-parity vitest extracts keys from CLAUDE.md / `redis-keys.md` via regex-on-markdown or by parsing fenced code blocks — researcher picks based on what's least brittle. Recommended: regex on backticked-key strings (`` `events:llm:v3` ``) which both surfaces use.
- Whether the codebase-scan side of the vitest searches `.ts` only or also includes `.tsx` / `.js` / `.md`. Recommended: `.ts` + `.tsx` (production code) plus an explicit allow-list of `.md` doc files that are exempt from "undocumented key" failure (the CLAUDE.md + `redis-keys.md` themselves).
- Whether the inventory table groups keys by `prefix family` strictly (events:_ → flights:_ → ...) or by `classification` (load-bearing → observability → retire). Recommended: prefix family for operator-skim ergonomics; classification is its own column and sortable.
- Whether the `freeClaudeRouter.ts` callers block goes ABOVE the existing file-header comment or REPLACES it. Recommended: PREPEND, keeping the historical waymarker below the callers block. Both are valid; preserves the historical-waymarker discipline from D-09.
- Whether the JSDoc audit ships 1 commit per module (7 commits) or 1 commit per public-API touched (~30-50 commits). Recommended: 1 commit per module (7 commits) — atomic enough for surgical revert, terse enough to scan in a PR review. D-26 atomic-per-decision principle bends to module-level when individual decisions are <5-line touches.
- Whether the Upstash dashboard screenshot is committed as a PNG or whether the dashboard data is transcribed into a markdown table inline in SUMMARY.md. Recommended: PNG (auditable forever; no transcription error). Markdown table can supplement.
- Whether the registry-parity vitest also enforces TTL consistency (CLAUDE.md says "7d" vs code says `7 * 24 * 3600` — does the test parse both and assert equality?). Recommended: NOT in Phase 35 (out of scope; TTL strings in CLAUDE.md are operator-readable, not machine-parsed). A future phase could add it.
- Whether the 6 plan structure under D-25 collapses or expands based on what the planner finds during research. The 6-plan shape is an estimate; the planner may consolidate (e.g. 35-01 + 35-02 if both small) or split (e.g. 35-04 module-by-module).

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 35 source material

- `.planning/ROADMAP.md` §"Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup Sweep" (lines 244-258) — Goal, depends-on, requirements, 8 success criteria.
- `.planning/REQUIREMENTS.md` DOCS-INT-02, DOCS-INT-03, REDIS-OPT-01..04, SIMPLIFY-02, SIMPLIFY-05, SIMPLIFY-07 — Normative per-requirement acceptance text.
- `.planning/PROJECT.md` — Milestone goal, three tracks, v1.4 baseline (`api/vercel-entry.js` 1.72 MB), Pro upgrade locked, Phase 34 close as `cerebras-groq-deferred`.
- `.planning/STATE.md` — Current milestone progress (Phase 34 complete 2026-05-24), Phase 35 not-started, remaining phases (36, 37) sequencing.

### Carryover context (Phase 29 — CLAUDE.md trim already shipped)

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — D-06 CLAUDE.md trim discipline (73% reduction to ~5018 tokens; phase-history bloat removed; current-state-invariants only). Phase 35's CLAUDE.md edits MUST preserve this discipline — bounded to §Serverless Cache subsection, no narrative-block additions.
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-SUMMARY.md` — Phase 29 close-out confirming DOCS-INT-01 complete.

### Carryover context (Phase 30 — tuned defaults locked)

- `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-CONTEXT.md` — D-08 atomic-per-decision commit discipline (Phase 35 inherits unchanged); D-02 / D-03 tuned defaults that the inventory's "purpose" column will reference for `events:llm-eval-baseline:v3`.
- `docs/architecture/llm-pipeline-reliability.md` "Tuned Defaults" + "7-Day Watch" sections — Phase 35's inventory references these for the purpose column of the eval-baseline + DLQ keys.

### Carryover context (Phase 31 — DLQ baseline + cron-tick discipline)

- `.planning/phases/31-cron-stability-validation-7-day-watch/31-CONTEXT.md` — Cron-tick discipline + snapshot harness pattern (the inventory's `cron:lastTick:*` row sources its purpose from here).
- `npm run watch:snapshot -- --http` — Snapshot harness from Phase 31; the inventory may reference it as the read-path for several observability keys.

### Carryover context (Phase 32 — schema-pinning precedent)

- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-CONTEXT.md` — D-22 schema-pinning contract test pattern (`urlLiveness.schema.test.ts`); D-13 smallest-blast-radius principle (Phase 35's `events:llm:v3:partial` retirement inherits).
- `server/__tests__/lib/urlLiveness.schema.test.ts` — Direct template for D-01's `redis-registry.test.ts`. Phase 32's pattern: parse documented contract, grep code, assert parity.

### Carryover context (Phase 33 — additive-optional rollout precedent + actorCatalog test)

- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-CONTEXT.md` — D-07 catalog contract test pattern (`actorCatalog.test.ts`); template for D-01 vitest gate.
- `src/__tests__/lib/actorCatalog.test.ts` — Per-entry invariants asserted at test time (no duplicates, no orphans). D-01's `redis-registry.test.ts` mirrors the structural shape.

### Carryover context (Phase 34 — cascade-deferred outcome)

- `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/34-CONTEXT.md` — Phase 34's `cerebras-groq-deferred` close (Cerebras/Groq probe was never run; operator decision). The inventory records "absent (Phase 34 deferred)" for `llm:tokens:cerebras:*` / `llm:tokens:groq:*` slots.
- `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/34-SUMMARY.md` — Phase 34 close-out (1 of 5 plans executed; 34-01..04 skipped).

### CLAUDE.md current §Serverless Cache subsection (the thing being verified)

- `CLAUDE.md` §"Serverless Cache (Phase 13)" — Current 22-entry registry listing every Redis key with one-line purpose + writer/reader hints. Lines 116-140 in the trimmed Phase-29-era CLAUDE.md. **The source-of-truth being audited** by D-01's vitest gate. Phase 35 also EDITS this section per D-14 (add 4 missing keys) + D-12 (remove partial-key entry).

### Missing keys to be added to CLAUDE.md registry (per D-14)

- `server/lib/llmLineage.ts:20-21, 57, 88, 100, 110` — `LINEAGE_KEY_PREFIX` = `events:llm:v3:lineage:`, `LINEAGE_INDEX_KEY` = `events:llm:v3:lineage-keys`, `GROUP_LINEAGE_KEY_PREFIX` = `events:llm:v3:group-lineage:`. JSDoc at top of file documents 7d HSET TTL + 500-cap ZADD index.
- `server/lib/pipelineAudit.ts:18, 33-35, 44, 59` — `PIPELINE_AUDIT_KEY` = `events:llm-pipeline-audit`. LPUSH + LTRIM + EXPIRE pattern. Bounded list shape.

### Code touchpoints for `events:llm:v3:partial` retirement (D-12)

- `server/lib/llmEventExtractor.v3.ts:13-14, 122-123, 260, 448, 475, 609` — All references to the partial-key. Writer at `:475`; constant + export at `:122-123`; doc/comment references at `:13-14, 260, 448, 609`.
- `server/lib/llmExtractionPipeline.ts:95, 134` — Supporting comment lines.
- `server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts` (lines 10, 157, 160, 176, 347, 350) — Two-key discipline test; D-12 drops these assertions, keeps terminal-key.
- `server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts` (lines 188, 191, 209) — Incremental-write test; D-12 drops partial-key references.
- `server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts` (lines 178, 180, 202) — Cross-boundary test; D-12 drops partial-key references.
- `server/__tests__/cache/redis-prefix.test.ts:120, 123` — Fixture line referencing partial-key; D-12 removes.

### Code touchpoints for JSDoc audit (D-09)

- `server/lib/llmExtractionPipeline.ts` (592 lines) — Public exports: `runRefreshExtraction`, `enrichedV3ToEntities`, supporting types. JSDoc one-liners for each.
- `server/lib/llmEventExtractor.v3.ts` (1151 lines) — Public exports: `processEventGroups`, `EVENTS_LLM_V3_KEY` (after D-12 removes `EVENTS_LLM_V3_PARTIAL_KEY`), `LLM_REDIS_TTL_SEC`, supporting types.
- `server/lib/llmResolver.ts` (629 lines) — Public exports: `resolveLocation`, `derivePrecision`, supporting types.
- `server/lib/llmCircuitBreaker.ts` (73 lines) — Public exports: `Provider` type, `isAvailable`, `record`, `shouldPauseNewEvents`.
- `server/lib/llmDLQ.ts` (106 lines) — Public exports: `DLQEntry` type, `enqueueDLQ`, `DLQ_KEY`, `__testing` symbol.
- `server/lib/llmTokenBudget.ts` (183 lines) — Public exports: `incrementTokenCounter`, `budgetState`, `DAILY_LIMITS`, supporting types.
- `server/lib/llmExtractorWatchdog.ts` (117 lines) — Public exports: `withBatchWatchdog`, supporting types.

### Code touchpoints for `freeClaudeRouter.ts` audit (D-15, D-16)

- `server/lib/freeClaudeRouter.ts` (top of file) — Where the callers block is prepended.
- Live callers verified by scout: `server/lib/llmEventExtractor.v3.ts:40`, `server/lib/llmResolver.ts:15`, `server/adapters/llm-provider.ts:23`. Test callers (not in callers block but worth noting in commit body): `server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts:16, 186`, `server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts:107`, `server/__tests__/lib/llmLineage-prefilter.test.ts:142`, `server/__tests__/lib/llmResolver.test.ts:30, 39`.

### Architecture docs (context, not load-bearing)

- `docs/architecture/llm-pipeline-reliability.md` — Tuned-defaults reference; inventory's purpose column for `events:llm-eval-baseline:v3`, `events:llm-dlq`, `llm:tokens:*` keys sources from here.
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — Where the Phase 35 sub-block lands per D-22. Phase 30 / 30.1 / 34 sub-blocks already present establish the format.
- `docs/runbook.md` — Operator playbook; not modified by Phase 35 (Phase 36 territory). May be cross-referenced in inventory purpose column for keys that figure in incident response.
- `docs/degradation.md` — Pitfall 1 cache bridge contract. Phase 35 references but does NOT modify (invariant).

### Test patterns (templates for D-01 vitest)

- `src/__tests__/lib/colorBridge.test.ts` — Byte-identity sentinel pattern: parse two surfaces, assert parity, fail loudly on drift.
- `src/__tests__/lib/actorCatalog.test.ts` (Phase 33) — Catalog-invariant pattern: per-entry assertions, no-duplicate / no-orphan checks.
- `server/__tests__/lib/urlLiveness.schema.test.ts` (Phase 32) — Schema-pinning contract test.

### Eval & live-path hooks (read-only by Phase 35)

- `events:llm-eval-baseline:v3` — Aggregate eval baseline (90d TTL). Inventory references in classification + purpose columns.
- `events:llm-summary:v3` — Last-run summary metadata. Inventory references.
- `events:gdelt` — Raw GDELT cache (Pitfall 1 terminal fallback). Inventory references.

### Bundle-size baseline references

- `api/vercel-entry.js` — 1,779,504 bytes (≈1.70 MB) at 2026-05-26 scout. Baseline for D-19 measurement.
- `package.json` `scripts.build` — `vite build && tsup server/vercel-entry.ts --format esm --out-dir api --no-splitting --tsconfig tsconfig.server.json && ...`. The command that produces `api/vercel-entry.js`.
- `vercel.json` `functions.api/vercel-entry.js.maxDuration: 800` — Pro-ceiling that makes SIMPLIFY-02's deletion possible (terminal writes reliably finish within budget; partial-key carries no signal).

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`src/__tests__/lib/colorBridge.test.ts` byte-identity sentinel pattern** — Direct template for D-01's `redis-registry.test.ts`. Parses two surfaces, asserts parity at module-load time. Fails loudly on drift.
- **`src/__tests__/lib/actorCatalog.test.ts` (Phase 33 D-07) catalog-invariant pattern** — No-duplicate / no-orphan structural assertions; the registry-parity vitest mirrors these checks at the registry level.
- **`server/__tests__/lib/urlLiveness.schema.test.ts` (Phase 32 D-22) schema-pinning pattern** — Schema drift fails at vitest time. D-01 inherits the philosophy.
- **`server/lib/llmLineage.ts`** — Already-documented module with clear `LINEAGE_KEY_PREFIX` / `LINEAGE_INDEX_KEY` / `GROUP_LINEAGE_KEY_PREFIX` exports. The 4 missing-from-registry keys are all defined here + in `pipelineAudit.ts` with clear writer/reader paths.
- **`server/lib/pipelineAudit.ts`** — Self-contained, well-bounded LPUSH + LTRIM + EXPIRE pattern. `events:llm-pipeline-audit` writer at `:33-35`, reader at `:44`. Inventory entry is mechanical.
- **`CLAUDE.md` §Serverless Cache subsection** — Existing 1-line-per-key shape is preserved. Phase 35's edits are surgical: add 4 missing entries, remove 1 retired entry.
- **`docs/architecture/` existing markdown style** — `llm-pipeline-reliability.md`, `mermaid-architecture.md`, etc. give the format template for `redis-keys.md`. Plain markdown + tables + cross-references.

### Established Patterns

- **Atomic per-decision commits** (Phase 30 D-08 → Phase 31 → Phase 32 → Phase 33 → Phase 34 D-25). Each D-N is a commit. `feat(35):` / `chore(35):` / `docs(35):` / `test(35):` prefixes with body that names the decision number.
- **Branch-per-phase from `main`** (`feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu`). CONTEXT.md, DISCUSSION-LOG.md, and the discuss checkpoint may sit on the current branch as scaffold.
- **Schema-pinning contract test** (Phase 32 D-22 / Phase 33 D-07 / `colorBridge.test.ts`). Phase 35 D-01 extends the precedent from per-schema pinning to per-registry pinning.
- **Smallest-blast-radius principle** (Phase 32 D-13, Phase 33 D-13/D-16/D-18). D-12's `events:llm:v3:partial` retirement = surgical writer-only removal; D-15's `freeClaudeRouter.ts` keep-with-callers-block = comment-only edit; D-22's ADR sub-block append = doc-only.
- **Static-data + lookup pattern (Phase 33 D-04..D-07)** — Not directly extended (Phase 35 ships no new typed-data module), but the philosophy informs the inventory artifact: `docs/architecture/redis-keys.md` is the "static data" of Redis-key knowledge.
- **Read-only inventory + targeted writes** — Phase 35 deliberately ships zero new writers to production cache state. The drift-detection vitest is read-only. The inventory artifact is hand-authored. The retired-key cleanup uses natural TTL expiry. The TTL right-sizing is gated on a code change with regression test per D-17.

### Integration Points

- **`CLAUDE.md` §Serverless Cache subsection** — Surgical edits per D-12 (remove `events:llm:v3:partial`) + D-14 (add 4 missing keys).
- **`docs/architecture/redis-keys.md` (NEW)** — Full deep-dive inventory table per D-05 / D-06. Hand-authored from grep results.
- **`src/__tests__/lib/redis-registry.test.ts` (NEW)** — D-01 drift-gate vitest. Parses two markdown surfaces; greps codebase; asserts parity.
- **`server/lib/llmEventExtractor.v3.ts`** — D-12 deletes 6 partial-key references. JSDoc audit (D-09) refreshes public-API one-liners on this file.
- **`server/lib/llmExtractionPipeline.ts`** — D-12 deletes 2 supporting comment lines. JSDoc audit on this file.
- **`server/__tests__/lib/llmExtractionPipeline.{terminalShape,incrementalWrite,crossBoundary}.test.ts`** — D-12 drops two-key-discipline assertions; retains terminal-key assertions.
- **`server/__tests__/cache/redis-prefix.test.ts`** — D-12 fixture line updates.
- **`server/lib/freeClaudeRouter.ts`** — D-15 / D-16 prepends top-of-file callers block.
- **`server/lib/llm{ExtractionPipeline, EventExtractor.v3, Resolver, CircuitBreaker, DLQ, TokenBudget, ExtractorWatchdog}.ts`** — D-09 / D-10 public-API JSDoc one-liners refreshed.
- **`docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`** — D-22 Phase 35 sub-block appended.
- **`.planning/phases/35-*/redis-budget-{baseline,close}-YYYY-MM-DD.png`** — Operator-captured Upstash dashboard screenshots per D-20.
- **`api/vercel-entry.js`** — Read-only by Phase 35 (the build artifact `wc -c`'d for the D-19 SIMPLIFY-07 measurement).

</code_context>

<specifics>

## Specific Ideas

- **"The registry rotted once; it'll rot again unless the gate is mechanical."** D-01's vitest is the load-bearing decision of the phase. Everything else is cleanup. The hand-maintained CLAUDE.md registry produced the 4 missing keys + 1 retired-but-still-listed key that Phase 35 exists to clean up; without a mechanical gate, the next phase that introduces a Redis key will have the same problem.
- **"Code is the source of truth; markdown is the operator skim."** D-03's both-surfaces parity check enforces that CLAUDE.md and `redis-keys.md` mirror each other AND mirror the code. Three surfaces, one gate.
- **"The partial-key was a Hobby-era mitigation, not a production capability."** D-12's full deletion (vs. env-gate) reflects this: it was always observability scaffolding for 300s-budget kills. Pro 800s makes terminal writes reliable; the scaffolding has no live purpose. Env-gating would leave dead-code-on-a-switch — a worse outcome than just deleting.
- **"Historical waymarkers are valuable; rewriting them is not Phase 35's job."** D-09's tight JSDoc scope honors the team's investment in citing "Phase 27.4.3 D-03 introduced v3" — that's a navigation aid, not noise. Public-API one-liners are the cleanup that earns review effort; top-of-file rewrites are change-for-its-own-sake.
- **"Belt-and-suspenders on freeClaudeRouter.ts."** D-15's top-of-file callers block + the existing test coverage + the grep that produced this CONTEXT.md = three independent assurances that the module is load-bearing. Future readers don't have to triage "is this module dead?" — they read the callers block at top of file and move on.
- **"Measurement is captured at phase boundaries, not continuously."** D-19 (bundle-size) + D-20 (Upstash budget) + D-07 (cardinality) are all one-shot measurements at phase start + phase close. Continuous instrumentation is appealing but Phase 35's value is the one-time cleanup; continuous-measurement infrastructure is a separate (deferred) phase.
- **"4 plans for Phase 34 → 6 plans for Phase 35 is the right shape."** Phase 35 has more discrete deliverables (registry + drift gate + 3 cleanups + JSDoc + TTL + measurements) than Phase 34's single track (probe + adapter + eval + validation). D-25's 6-plan structure reflects this. Planner can collapse if any plan turns out trivial.

</specifics>

<deferred>

## Deferred Ideas

### Phase 36 prep (public docs sweep)

- **README.md provider count update.** Post-Phase-34 + Phase-35 the README still says "v3 LLM pipeline (NIM + OpenRouter narrowed cascade)" — Phase 36's sweep handles whether to update for the `cerebras-groq-deferred` state or hold the current language. Not Phase 35.
- **`docs/architecture/llm-pipeline-reliability.md` Mermaid cascade diagram update.** Cerebras + Groq nodes were never added (Phase 34 deferred); the diagram already accurately reflects NIM-only as the live cascade. Phase 36 may add a sub-diagram showing the deferred providers.
- **`docs/runbook.md` redis-keys cross-reference.** The new `docs/architecture/redis-keys.md` should be cross-referenced in runbook incident-response sections (e.g. "to investigate empty cache, see redis-keys.md `events:llm:v3` row"). Phase 36's runbook sweep handles.
- **OpenAPI spec update for any new endpoints.** No new endpoints in Phase 35; this is informational continuity.

### Phase 37 prep (acceptance gate)

- **3× consecutive `prod-connectivity-audit.yml` exit-0.** Phase 35's changes are doc-and-cleanup; they should NOT affect runtime behavior. Acceptance-gate observation continues against the post-Phase-34 cascade.

### Future phases (post-v1.5 or follow-on)

- **TTL-string consistency vitest** (CLAUDE.md says "7d" vs code says `7 * 24 * 3600`). D-01's gate doesn't currently parse and compare these. A future phase could harden the test by extracting both and asserting equality.
- **Generated `redis-keys.md` script.** If hand-maintained `redis-keys.md` rots despite the vitest gate (vitest catches mismatch but doesn't auto-fix), a `scripts/generate-redis-registry.ts` could write `redis-keys.md` from the code grep output. Defer until the gate actually fails to be sufficient.
- **Continuous Upstash command-budget telemetry.** D-20 is one-shot manual measurement. A future operations phase could ship a dashboard tile or daily-cron-fed snapshot at `redis:budget:daily:YYYY-MM-DD` so the budget trend is observable without dashboard manual reads.
- **Continuous bundle-size telemetry.** D-19 is one-shot. A CI step that fails when `api/vercel-entry.js` exceeds N MB could prevent silent bundle bloat between phases. Defer until evidence of silent bloat.
- **JSDoc top-of-file block refresh phase.** D-09 deliberately leaves these untouched. If a future "developer onboarding documentation" phase exists, that's where they get rewritten to current-state.
- **Hit/miss telemetry instrumentation across cache.** Inventory column is empty for keys without existing hit/miss observability. A future caching-observability phase could add per-key telemetry.
- **Per-host throttle inventory.** Nominatim 1 req/s, Open-Meteo (?), Yahoo Finance (?), Overpass (?) — analogous inventory of _outbound_ polite-citizen contracts. Out of scope for Phase 35's Redis focus.
- **Replay-history key cap (if discovered uncapped during D-18).** If REDIS-OPT-03's review of the replay-history key reveals it's larger than the 500-cap default, Phase 35 applies the cap; if the cap is contentious, the planner promotes to a separate decimal phase.

### Reviewed Todos (not folded)

None — `gsd-sdk query todo.match-phase 35` was not invoked during this discussion; no pending todos crossed scope. If the planner discovers them during research, they're folded or deferred per the planner's discretion.

</deferred>

---

_Phase: 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu_
_Context gathered: 2026-05-26_
