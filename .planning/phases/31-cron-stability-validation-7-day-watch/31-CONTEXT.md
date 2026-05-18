# Phase 31: Cron Stability Validation (7-day Watch) — Context

**Gathered:** 2026-05-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Prove the daily 04:00 UTC `/api/cron/refresh-events` consistently lands `events:llm:v3` healthy on the Vercel Pro 800s ceiling under normal NIM availability, across ≥7 consecutive days. Capture the watch in a single auditable artifact. Land four small "Phase 31 prep" fixes flagged by Phase 30.1 as pre-work so the watch produces meaningful signal (eval drift detection, reduced rate-limit pressure). Escalate to a Phase 31.1 limiter rework if the watch fails ≥3 reset cycles.

**Requirements covered:** LLM-RELI-06.

**Out of scope (deferred elsewhere):**

- Adaptive `Retry-After`-aware NIM limiter (per Phase 30.1 deferred). Promoted to its own decimal phase (likely 31.1) only if this watch fails ≥3 reset cycles per D-05.
- Dashboard surface for cascade-degraded state — overlaps Phase 32 (ghost events) and Phase 34 (Redis registry / dashboard). Not 31.
- Re-enabling OpenRouter / paid-OR conversion / NIM model switch — Phase 30.1 decided NIM-only honest; revisited only if D-05 escalation forces it.
- Provider expansion / v4 router — explicitly out of scope for v1.5 per `PROJECT.md`.
- LLM-RELI-07 (3× consecutive `prod-connectivity-audit.yml` exit-0 gate) — Phase 36's milestone close.
- Full ADR-0010 close-out — Phase 36 owns the `<expand_at_36>` block.

**Carrying forward (locked, not re-decided here):**

- **Cascade is NIM-only.** Phase 30.1 D-01 declared honestly: `skipOpenRouter: true` stays hardcoded at `server/lib/llmEventExtractor.v3.ts:622, 929`. The 04:00 UTC cron runs with one provider only; the watch observes this reality.
- **Phase 30 tuned defaults are in production.** `LLM_V3_CONCURRENCY`, `LLM_BATCH_SIZE`, `LLM_BATCH_TIMEOUT_MS`, `BACKOFF_MS`, jitter — all already shipped. Phase 31 does not retune; it observes.
- **Vercel Pro 800s `maxDuration`** is live (Phase 29 D-08); the watch targets this ceiling.
- **Pitfall 1 cache bridge is invariant.** `server/routes/events.ts` serves raw GDELT when `events:llm:v3` is empty; `docs/degradation.md` "map never goes blank" contract holds.
- **Eval ±3pp absolute tolerance** at 5km/20km/100km vs `events:llm-eval-baseline:v3` (Phase 30 D-03). The eval-bundle prep fix (D-01) is what makes this gate observable in prod.
- **Atomic-per-decision commits** (Phase 29/30/30.1 D-08 convention). `feat(31): …` / `docs(31): …` / `chore(31): …`.
- **Branch-per-phase.** `feature/31-cron-stability-validation` cut from `main` after PR #22 (state routing fix) lands. CONTEXT.md may sit on current branch as scaffold; planner branches before code work.
- **TypeScript pinned to ~5.9.3.** `logger.child({ module: '...' })` for new code; never `console.*`.

</domain>

<decisions>
## Implementation Decisions

### Phase 30.1 "Prep Items" Scope

- **D-01: All four Phase-30.1-flagged prep items land IN Phase 31, before Day 1 begins.** The watch otherwise produces broken or weak signal. Each is a separate commit per Phase 30 D-08 atomic discipline:
  - **Eval-fixture bundling fix** — `.planning/eval/ground-truth-events.json` is not in the Vercel function bundle, so `runEval()` reports `evalScore.total: 0` in every prod cron run. The 7-day watch cannot detect accuracy drift without it. Researcher determines the bundling vector (vercel.json `includeFiles`, build-time copy script, or fixture relocation under `server/eval/fixtures/`). Load-bearing.
  - **Diff-filter ID-mismatch fix** — `server/lib/llmExtractionPipeline.ts` runs `groups.filter((g) => !cachedLlmKeys.has(g.key))` where `g.key = '20513-19-18'` and cached `e.id = 'llm-v3-grp-20513-19-18'`. The filter never matches; cron re-processes ~2× the batch set daily. This doubles NIM rate-limit pressure and makes breaker trips more likely during the watch. Load-bearing for stability.
  - **`CACHE_KEY_PREFIX` whitespace `--help` fix** — `node --env-file-if-exists=` strips trailing whitespace from `CACHE_KEY_PREFIX="dev: "`, so analyzer breaks unless operator manually exports. ≤5 LOC docstring + `--help` text addition in `scripts/analyze-llm-run.ts`. Pure dev ergonomic; bundled here only because it's already named in 30.1's deferred list.
  - **Document `npm run probe:openrouter` as quarterly check** — One paragraph appended to `docs/runbook.md` flagging the probe as a recurring operational check. Carry-over from Phase 30.1 HANDOFF Test Plan unchecked item.

### Day-1 Anchor & Failure-Response Policy

- **D-02: Day 1 begins after a validation force-trigger passes.** After D-01 prep fixes deploy to prod, the executing agent (or operator) runs **one** force-trigger via `GET /api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer. The run must demonstrate **all three**: (a) `evalScore.total > 0` (eval-bundle fix verified live); (b) processed-batch count is materially lower than Phase 30.1's `30.1-or-pulse-snapshot.json` baseline (diff-filter fix verified live — exact pp delta captured in commit message); (c) no breaker trip during the run. Pass → Day 1 = the next natural 04:00 UTC cron. Fail → fix-forward, re-validate; the failed force-trigger is logged in the watch artifact but does NOT count as a watch day.

- **D-03: A passing daily tick is `health=healthy` AND DLQ reason taxonomy is whitelisted.** Hybrid pass-rule honoring criterion 1 (`/api/health endpoints.llmEvents.status === 'healthy'`) AND criterion 3 ("dlqCount ... matches a documented baseline; any non-zero count has a recorded throttle-event explanation"). Whitelisted DLQ reasons that DO NOT fail the day: `transient_rate_limit`, `watchdog_timeout`. Non-whitelisted reasons that DO fail the day: any code-error class, any config-error class, any unexpected new taxonomy value. The whitelist IS the "documented baseline" per criterion 3. Researcher confirms the exact reason-string vocabulary by reading `server/lib/llmDLQ.ts` + the existing `callHistory.bucket` enum.

- **D-04: Failed day = counter resets to 0; root cause documented in artifact.** Strict 7-CONSECUTIVE per the success criterion wording. Reset event logs to the watch artifact (D-06) with the failure-reason taxonomy + DLQ excerpt. Watch restarts after the cause is addressed (which may mean a fix-forward commit or just an operator note that the day's failure was outside the system, e.g. a known NIM outage with public status-page evidence).

- **D-05: 3 reset cycles → escalate to Phase 31.1 for limiter/breaker rework.** Phase 30.1's deferred ideas list named "Adaptive Retry-After-aware NIM limiter" as a Phase 31.1 candidate "if the 7-day watch shows breaker trips >1×/week despite restored cascade." Phase 31 makes that escalation gate concrete: 3 reset cycles is treated as clear evidence the watch cannot pass without limiter rework. The escalation is itself a Phase 31 commit (`chore(31): escalate to Phase 31.1 limiter rework after N reset cycles`) — closes 31 with "Conditional on 31.1" status; opens 31.1 with the watch artifact as its seed material.

### Observation Artifact

- **D-06: Both JSON and markdown.** Machine-readable JSON at `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json` (one row per daily tick, byte-stable schema, sorted by `tickDate` ascending). Human-readable markdown table appended to a new `## Phase 31 7-Day Watch (LLM-RELI-06, started YYYY-MM-DD)` section in `docs/architecture/llm-pipeline-reliability.md` — placed inside the "7-Day Watch" placeholder section Phase 30 D-06 reserved. Both committed atomically per snapshot (`docs(31): watch-log day N — <status>` commit per day). The dual surface satisfies criterion 4 ("auditable, not anecdotal") and gives Phase 36 a clean ADR-0010 expand-block source.

- **D-07: `scripts/snapshot-cron-watch.ts` + `npm run watch:snapshot`** is the canonical capture path. Operator runs it once each morning (~04:30 UTC local, after the daily cron tick). Script:
  - Reads `events:llm-summary:v3` (routingTrace, errorTaxonomy, evalScore, latency) and `events:llm-dlq` (SADD members) via the same Upstash client the analyzer uses.
  - Reads `/api/health` via HTTP (no Bearer needed — public route) for `endpoints.llmEvents.status`.
  - Computes pass/fail per D-03 (classify DLQ reasons against whitelist).
  - Appends to JSON + markdown atomically (tempfile + rename for JSON; idempotent append-or-update-by-date for markdown).
  - Tracks `lastSnapshottedTickDate` inside the JSON top-level so a missed-day catch-up snapshot still detects the gap.
  - Exits 0 on PASS, non-zero on FAIL — easy to wire into a shell alias or future CI step.
  - Mirrors `scripts/analyze-llm-run.ts` shape (Phase 30 D-01) and the `node --env-file-if-exists=.env --import tsx/esm` runner pattern (Phase 27.4.2 D-26). Zero new prod surface.

- **D-08: Rich daily row schema.** Per-row JSON (denormalized for human readability, ≈200 bytes):
  ```json
  {
    "tickDate": "2026-05-19",
    "snapshotAt": "2026-05-19T04:32:11Z",
    "natural": true,
    "healthStatus": "healthy",
    "freshnessMs": 1234567,
    "dlq": { "count": 0, "reasons": {} },
    "eval": { "at5km": 0.42, "at20km": 0.82, "at100km": 0.96 },
    "batchCount": 213,
    "breakerTrips": 0,
    "result": "PASS",
    "notes": ""
  }
  ```
  Markdown row mirrors the same fields in a fixed column order. Schema pinned by a contract test in `server/__tests__/snapshot-cron-watch.test.ts` (or whatever the snapshot-script test home becomes — researcher decides). Schema changes during the watch are themselves a phase artifact event.

### Force-Trigger + Monitoring Cadence

- **D-09: Force-trigger only for prep validation (D-02) and recovery.** Never to inflate counts. Each force-trigger gets a row in the artifact with `natural: false` and `notes: "recovery: <reason>"`. Force-triggered rows do NOT contribute to the 7-consecutive count — only `natural: true` rows do. Preserves "real production behavior" as the underlying signal while allowing pragmatic recovery from a regressed deploy.

- **D-10: Daily snapshot run IS the failure-detection mechanism.** No new alerting infra (no email, no Slack, no dashboard alert key, no GitHub Actions cron). The single-operator workflow + the snapshot script's PASS/FAIL stdout banner is the detection surface. Aligns with the single-user contract in `PROJECT.md` (no auth, no multi-user notification). If a future operator opens a Phase 31.1 limiter rework, they may add a dashboard alert key then; not now.

- **D-11: Missed-day snapshot reads Redis state for the prior tick.** Redis `events:llm-summary:v3` holds the most recent tick's data with the daily cron overwrite cadence. The snapshot script tracks `lastSnapshottedTickDate` in the JSON top-level. On a 2-day gap, the script logs a "data gap detected — Redis only retains last tick" warning, captures the available tick, and the missing day enters the artifact as a `result: "GAP"` row with a `notes: "operator-missed snapshot"` annotation. `GAP` rows DO NOT advance the counter (they don't fail it either — counter pauses on gaps). This preserves operator latitude while keeping the artifact honest.

- **D-12: Phase 31 closes with a single PR.** Final commit pattern (mirrors Phase 30.1 close):
  1. `docs(31): watch-log day 7 — PASS (7/7 consecutive)` — last snapshot row.
  2. `docs(31): close phase — append SUMMARY + 7-day narrative to architecture doc; check LLM-RELI-06 in REQUIREMENTS.md` — writes SUMMARY.md, appends final-narrative paragraph to the 7-Day Watch section.
  3. PR opened against `main`; squash-merged on CI green (same convention as PRs #20/#21/#22).
     Phase 36 picks up the artifact for the ADR-0010 `<expand_at_36>` write at milestone close.

### Claude's Discretion

- The exact eval-bundle-fix vector — `vercel.json` `functions[].includeFiles`, a build-time copy script, or fixture relocation under `server/eval/fixtures/`. Researcher checks Vercel docs + existing build pipeline + decides. The decision is captured in the prep-fix commit message; the bundling mechanism itself is not load-bearing for the watch as long as `evalScore.total > 0` in prod.
- The diff-filter fix shape — fix the cached-key comparison to match the `'llm-v3-grp-'` prefix, or fix the upstream key construction so both sides use the bare `'20513-19-18'` form. Researcher reads `llmExtractionPipeline.ts` + adjacent test fixtures and picks the lower-risk path.
- Whether all 4 prep items land in one PR vs four small PRs. Default: one PR with 4 commits (matches Phase 30/30.1 multi-decision PR shape). Planner may split if any single fix turns out to need its own review surface.
- The exact ratio of "materially lower" batch count in D-02's validation force-trigger — researcher reads Phase 30.1's `30.1-or-pulse-snapshot.json` for the pre-fix baseline; the planner picks a concrete percentage gate (likely 30-50% lower based on the 2× diff-filter regression).
- Whether the snapshot script's HTTP call to `/api/health` uses the prod URL or routes through the local dev server in test mode — script logic handles both via env-var conditional (`SNAPSHOT_HEALTH_URL` override).
- Reason-string vocabulary for D-03's whitelist — researcher confirms the exact enum values used in `server/lib/llmDLQ.ts` + `server/lib/freeClaudeRouter.ts`'s bucket enum; the values land in a `WATCH_DLQ_WHITELIST` constant at the top of `scripts/snapshot-cron-watch.ts`.

### Folded Todos

None. The four "Phase 31 prep" items folded under D-01 originated in Phase 30.1's deferred-ideas section, not in the GSD todo system.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### v1.5 Milestone + Phase 31 Boundary

- `.planning/PROJECT.md` — v1.5 milestone vision, NIM-only stance, "map never goes blank" invariant, single-operator constraint
- `.planning/REQUIREMENTS.md` LLM-RELI-06 — full acceptance text for the 7-consecutive-day watch
- `.planning/ROADMAP.md` §"Phase 31: Cron Stability Validation (7-day Watch)" — full phase scope, success criteria 1-4, depends-on chain
- `.planning/STATE.md` — current milestone position (Phase 30.1 shipped 2026-05-17 via PR #21; STATE.md routing fix landed via PR #22)
- `CLAUDE.md` — current shape post-Phase-30.1 (`OpenRouter fallback dormant` line); 5018-token budget preserved

### Prior Phase Contexts (locked carryover)

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — D-01 NIM + OR cascade declaration (later narrowed by 30.1), D-02 v1/v2 deletion, D-08 Pro 800s lock
- `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-CONTEXT.md` — D-01 `retryAfterMs` field + analyzer script pattern, D-03 ±3pp eval tolerance, D-06 architecture-doc home with reserved "7-Day Watch" placeholder, D-08 atomic-per-decision commits
- `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-CONTEXT.md` — D-01 NIM-only declared honest, D-07/D-08 breaker-trip behavior contract (raw GDELT terminal fallback), deferred items list (the 3 "Phase 31 prep" sources for D-01 here)
- `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/30.1-or-pulse-snapshot.json` — the baseline batchCount + breakerTrip evidence D-02 force-trigger validation compares against

### LLM Pipeline Code Touchpoints (Phase 31 reads + Phase 31 prep targets)

- `server/lib/llmExtractionPipeline.ts` — `runRefreshExtraction()` entry; the diff-filter bug (`groups.filter((g) => !cachedLlmKeys.has(g.key))`) is the D-01 fix target. Researcher reads the surrounding context (PARTIAL_KEY_ACTIVE, BATCH_SIZE_ACTIVE, the terminal `mergeAndPersistLlmEntities` call) to pick the lower-risk fix shape.
- `server/lib/llmEventExtractor.v3.ts` lines 622, 929 — `skipOpenRouter: true` (NIM-only enforcement; NOT touched in Phase 31)
- `server/lib/freeClaudeRouter.ts` — `callHistory` schema (routingTrace, bucket enum), `nvidiaNimWindow` (rate-limit observation), retry/backoff envelope (Phase 30 D-02 tuned)
- `server/lib/llmDLQ.ts` — DLQ reason enum; D-03 whitelist sourcing
- `server/lib/llmCircuitBreaker.ts` — breaker state, NOT touched in 31, but the snapshot script reads its derived state via summary
- `server/lib/llmProgress.ts` — `LLMRunSummary` shape consumed by both the analyzer (Phase 30) and the snapshot script (this phase)
- `server/routes/cron/refresh-events.ts` — cron entry point + `?force=true` Bearer gate
- `server/routes/health.ts` — `/api/health` endpoint; `endpoints.llmEvents.status` field surface for D-03
- `server/routes/events.ts` — Pitfall 1 cache bridge; read-only reference, NOT touched

### Eval Surface (Phase 31 prep fix #1 target)

- `.planning/eval/ground-truth-events.json` — 50 curated events, 11 countries; the fixture that needs Vercel bundling
- `.planning/eval/adversarial-injections.json` — observed, not gated
- `server/lib/llmEvalHarness.ts` — `runEval()` resolver-only; reads ground-truth file in prod
- `scripts/eval-replay.ts` — local resolver-only replay; runner-pattern template for the snapshot script

### Scripts (patterns to mirror, prep-fix targets)

- `scripts/analyze-llm-run.ts` (Phase 30 D-01) — D-07 snapshot script mirrors this shape; also the CACHE_KEY_PREFIX whitespace `--help` fix target
- `scripts/probe-openrouter.ts` (Phase 30.1) — D-01 prep #4 documents this in runbook as quarterly check
- `scripts/refresh-water-facilities.ts` — atomic tempfile-rename JSON-write pattern (D-07 reuses)
- `package.json` — `watch:snapshot` script added here (D-07)

### Documentation Surface

- `docs/architecture/llm-pipeline-reliability.md` — Phase 30 D-06 reserved a "7-Day Watch" placeholder section; D-06 above appends the table here
- `docs/runbook.md` — D-01 prep #4 lands the probe-openrouter quarterly-check paragraph here
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — `<expand_at_36>` block; Phase 31 does NOT write here (Phase 36 owns the expansion at milestone close)
- `docs/degradation.md` — "map never goes blank" Pitfall 1 contract; read-only reference

### Vercel + CI Surface

- `vercel.json` — `functions["api/vercel-entry.js"]` block; potential D-01 prep #1 fix target (depending on bundling vector chosen)
- `.github/workflows/prod-connectivity-audit.yml` — runs separately; the watch's row data does NOT depend on this workflow but it sets the Phase 36 LLM-RELI-07 gate (3 consecutive exit-0)

### Observability Keys (Redis)

- `events:llm-summary:v3` — last-run summary; D-07 snapshot reads this
- `events:llm-dlq` — DLQ entries; D-07 snapshot reads this
- `events:llm-eval-baseline:v3` — eval anchor; ±3pp tolerance baseline (Phase 30 D-03)
- `events:llm:v3` — terminal extractor cache; freshness read via `/api/health` derivation
- `cron:lastTick:refresh-events` — tick freshness sentinel (Phase 28.2.7); D-07 may read for `freshnessMs`

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`scripts/analyze-llm-run.ts`** (Phase 30 D-01) — the canonical pattern for reading `events:llm-summary:v3` + producing structured output. D-07's `scripts/snapshot-cron-watch.ts` is a near-twin (different output shape, different invocation cadence).
- **`scripts/probe-openrouter.ts`** (Phase 30.1) — the byte-stable JSON snapshot pattern (sorted, ISO-Z timestamp, rounded numerics). D-07's per-row JSON shape inherits this discipline.
- **`scripts/eval-replay.ts`** (Phase 27.4.2 D-26) — `node --env-file-if-exists=.env --import tsx/esm` runner shape. Direct template for D-07.
- **`scripts/refresh-water-facilities.ts`** — atomic tempfile-rename JSON write. D-07 reuses for the `watch-log.json` append-with-update-by-date pattern.
- **`server/lib/llmDLQ.ts` reason enum** — D-03 whitelist sources directly from this; no new taxonomy.
- **`server/lib/llmProgress.ts` `LLMRunSummary` shape** — already includes `routingTrace`, `errorTaxonomy`, `evalScore`, batch counts. D-07 reads it unchanged.
- **`/api/health endpoints.llmEvents.status`** — Phase 28.2.7 + 29 already established this field; D-03 reads it as the primary pass signal.
- **`/api/cron/refresh-events?force=true` with `DASHBOARD_PASSWORD` Bearer** — D-02 validation force-trigger uses this exact entry point; no new endpoint.
- **`docs/architecture/llm-pipeline-reliability.md` "7-Day Watch" placeholder** — Phase 30 D-06 already reserved the section; D-06 above appends to it (no new file creation in the docs surface).

### Established Patterns

- **Atomic-per-decision commits** (Phase 29 D-08, Phase 30 D-08, Phase 30.1 D-08) — D-12 inherits.
- **`logger.child({ module: '...' })` for new scripts** (Phase 28.1 W7) — D-07's snapshot script logs through this. No `console.*`.
- **JSON snapshot artifact under `.planning/phases/<phase>/`** with byte-stable schema — Phase 30 D-08's `run-1-throttle-snapshot.json` + Phase 30.1's `30.1-or-pulse-snapshot.json` set the convention; D-06 `watch-log.json` inherits.
- **Bearer-gated force-trigger of cron** (Phase 28.2.6 lineage) — D-02 + D-09 reuse.
- **`.planning/eval/<file>.json` fixtures** — D-01 prep #1 fixes the Vercel bundling of these; the path stays canonical.
- **Operator-facing `npm run <script>` ergonomics** — `probe:openrouter`, `eval:replay`, `refresh:water` precedents; D-07's `watch:snapshot` matches.

### Integration Points

- `scripts/snapshot-cron-watch.ts` — D-07 new file.
- `package.json` — D-07 adds `watch:snapshot` script entry.
- `server/lib/llmExtractionPipeline.ts` — D-01 prep #2 diff-filter fix target.
- `vercel.json` (likely) or build script (alternative) — D-01 prep #1 eval-bundle fix target. Researcher picks vector.
- `scripts/analyze-llm-run.ts` — D-01 prep #3 `--help` text + CACHE_KEY_PREFIX docstring addition.
- `docs/runbook.md` — D-01 prep #4 probe-openrouter quarterly-check paragraph.
- `docs/architecture/llm-pipeline-reliability.md` — D-06 appends to the reserved "7-Day Watch" section. New `## Phase 31 7-Day Watch (LLM-RELI-06, started YYYY-MM-DD)` heading.
- `.planning/phases/31-cron-stability-validation-7-day-watch/watch-log.json` — D-06 new file; grows daily.
- `server/__tests__/snapshot-cron-watch.test.ts` (or extension of existing test file) — D-08 contract-test pins row schema.
- `.planning/phases/31-cron-stability-validation-7-day-watch/31-01-SUMMARY.md` ... — per-plan summaries (planner decides count; likely 1-2 plans for prep + 1 for the watch artifact + ongoing snapshots).

</code_context>

<specifics>
## Specific Ideas

- **The watch is mostly waiting.** Phase 31's wall-clock duration is ≥7 days regardless of plan effort. Plan/execute work to set up prep fixes + snapshot script is on the order of 1-2 hours of focused engineering; the rest is daily 30-second snapshot runs. Plan the phase with that asymmetry in mind: rich prep + dead-simple ongoing rhythm.
- **D-02's validation force-trigger is the most expensive single tick of the phase** (full prod cron run, ~10 min wall-clock at the 800s ceiling, real NIM token spend). Plan it during operator-watchful hours; don't pre-schedule it.
- **D-08's row schema is the most permanent artifact of this phase.** It outlives the watch — Phase 36 ADR-0010 expansion reads it, future quarterly OR re-probes (Phase 30.1 deferred) compare against it, any v1.6 acceptance-gate audit cites it. Get the field set right at D-07 implementation; changing schema mid-watch is itself a watch event per D-08.
- **Phase 30.1's `30.1-or-pulse-snapshot.json` is the pre-prep-fix baseline** for D-02's "materially lower batch count" check. The 2026-05-17 04:00 UTC cron processed 213 batches with ~50 dropped to `skipped:breaker`. Post-diff-filter, the unique-group count should drop materially (estimate 30-50% based on cron re-processing the same set twice pre-fix; researcher confirms the actual delta).
- **The snapshot script exits 0 on PASS / non-zero on FAIL** so a future operator can wire it into a shell alias or a one-line cron without the script needing to know about alerting. Defers all alerting policy to the operator's shell.
- **GAP rows are not failures** (D-11). The phase-close artifact narrative explicitly documents this — the watch is testing the CRON's stability, not the operator's attendance.
- **The watch is a one-shot.** Phase 31 ships when the row table shows 7 consecutive PASS rows. The script + artifact framework survive the phase close and become reusable for any future stability re-validation (e.g. after Phase 31.1 limiter rework, after a paid-OR upgrade decision, after a NIM model swap).

</specifics>

<deferred>
## Deferred Ideas

These came up during discussion but belong in other phases. Don't lose them.

### Phase 31.1 (Conditional, per D-05)

- **Adaptive `Retry-After`-aware NIM limiter** — Phase 30.1 named this candidate explicitly. Promoted to Phase 31.1 only if the 7-day watch triggers D-05's 3-reset-cycles escalation gate. Phase 30 D-01's `retryAfterMs` field is already populated on `callHistory`; the work is wiring it into `nvidiaNimWindow` so post-429 calls wait the server-requested duration.

### Phase 32 / Phase 34 Overlap

- **Dashboard surface for cascade-degraded state** — operator sees nothing when batches drop to `skipped:breaker`. Phase 30.1 deferred this as "its own phase; overlaps Phase 32 (ghost events) + Phase 34 (Redis registry / dashboard)." Phase 31's snapshot-script ergonomic + the `watch-log.json` artifact can inform that dashboard's content shape when it lands.
- **DLQ-threshold alert** (e.g. `events:llm-dlq` count > baseline for 24h) — same dashboard-phase candidate. Phase 31 does NOT add an alert key; D-10 explicitly rejects new alerting infra in this phase.
- **GitHub Actions automated snapshot + auto-issue on failure** — Phase 31 chose D-10 manual operator snapshot. The automated path is reasonable for a Phase 31.1 or a Phase 32 dashboard companion; out of scope here.

### Phase 36 Hand-off

- **ADR-0010 `<expand_at_36>` write** — Phase 31's `watch-log.json` is the canonical input for the ADR section that documents v1.5's LLM reliability outcomes. Phase 31 closes without touching the ADR; Phase 36 reads the artifact and writes the expansion. Pattern established by Phase 30 (which also deferred its ADR expansion to Phase 36).
- **LLM-RELI-07 (`prod-connectivity-audit.yml` 3× consecutive exit-0)** — Phase 36 owns this gate. Phase 31's 7-day watch is observational data the audit workflow consumes independently; the workflow itself is not modified by Phase 31.

### Cross-Phase Surfaces (Not 31)

- **Provider expansion / v4 router / paid OR / NIM model switch** — all explicitly out of v1.5 per `PROJECT.md`. Phase 30.1 only revisits these if a future probe lands in the 50-90% middle bucket; Phase 31 only revisits these if D-05 escalation triggers.
- **Re-enabling OpenRouter as active fallback** — Phase 30.1 D-01 declared NIM-only honest after a 90% rate-limit probe. Phase 31 does NOT re-probe; the snapshot script's `routingTrace` reading will confirm zero OR rows as expected per Phase 30.1's negative-evidence invariant.

</deferred>

---

_Phase: 31-cron-stability-validation-7-day-watch_
_Context gathered: 2026-05-17_
