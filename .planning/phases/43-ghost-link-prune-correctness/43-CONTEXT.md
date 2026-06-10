# Phase 43: Ghost Link Prune Correctness - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning
**Mode:** Auto-recommend (operator requested Claude's recommendation for all gray areas)

<domain>
## Phase Boundary

Dead-link detection gets more precise (catches soft-404s, covers every event) without getting more aggressive (never prunes live-but-flaky links), and the operator can see WHY any link was flagged. Scope is server-only: `server/lib/urlLiveness.ts` (probe, sweep, candidate builder, prune), its four test files, the `events:url-liveness:{eventId}` schema + Redis registry lockstep, and the minimal server-side exposure of the new evidence field via `/api/operator-status` `deadUrlSample`. The precision/recall posture is asymmetric by requirement: a missed dead link is acceptable; a pruned live link is not.

Out of scope: the events-subtab UI mount (Phase 44 surfaces the evidence string and per-bucket counts), dashboard restyle (Phase 45), headless-browser probing (explicitly excluded by GHOST-06), prose docs (Phase 49).

</domain>

<decisions>
## Implementation Decisions

### Soft-404 detection mechanics (GHOST-06)

- **D-01:** Probe shape stays HEAD-first (D-16 politeness preserved). When HEAD (or the 405-fallback GET) returns 200, a follow-up capped GET fetches the body for the heuristic: `Range: bytes=0-16383` (16 KiB) plus a manual reader abort at the cap for servers that ignore Range. No headless browser, no JS evaluation.
- **D-02:** All three GHOST-06 signals are implemented, evaluated in this order: (a) **not-found markers** — curated constant list matched case-insensitively against the `<title>` and the capped body text (core English markers like "page not found", "404", "article not available", "no longer exists", plus common CMS phrases; keep the list small and conservative); (b) **redirect-to-home** — the redirect chain ended at a homepage/section root (final URL path is `/` or single-segment) when the original URL had a deeper article path; (c) **near-empty content** — decoded body under a conservative byte floor (~512 bytes of actual content) on a 200.
- **D-03:** Tie-break rule is precision-first: when no signal fires, or signals are ambiguous, the verdict is `live`. A soft-404 verdict requires at least one unambiguous signal. Never flag live content dead — phase goal wording is binding.
- **D-04:** Soft-404 is a **new distinct enum status `soft-404`** (not folded into `404`): added to `UrlLivenessStatusSchema`, classified terminal-dead in `isTerminalDead`, 24h TTL tier (same as `404`/`403`/`dead-host`), included in the sidecar count INCR/DECR by virtue of `isTerminalDead`. Distinct status gives Phase 44 its per-bucket count for free and keeps the evidence honest.
- **D-05:** `soft-404` is cron-auto-prunable under the retained `attemptCount >= 3` gate (the conservative heuristic + 3-consecutive-tick requirement is the false-positive mitigation). The success-criterion-3 `prunedIds` sample audit re-checks this posture with evidence; demote to manual-only if the audit finds a live event swept.

### Source-less event coverage (GHOST-07)

- **D-06:** `buildProbeCandidates` stops silently skipping events with empty/missing `data.source`. Each gets a per-event liveness entry with **new status `no-url`** — written once per sweep tick without issuing any fetch.
- **D-07:** Schema change to admit `no-url`: `lastUrlProbed` becomes `z.string().url().nullable()` (null for `no-url` entries), `lastHttpStatus` stays null, `attemptCount` 0. Existing stored entries (all have URLs) remain parse-valid; only the writer Zod-parses at runtime.
- **D-08:** `no-url` is **NOT terminal-dead**: excluded from `isTerminalDead`, the sidecar count, and both prune paths. "Prune can evaluate them" is satisfied by explicit classification — the prune loop sees `no-url` entries and explicitly skips them (visible in per-bucket counts), instead of the events being invisible to the whole pipeline. Pruning events merely for lacking a URL would make prune MORE aggressive, which the phase goal forbids.
- **D-09:** `no-url` TTL tier: 24h (the condition is stable; hourly re-classification would be churn). Sweep counters gain a `classifiedNoUrl` count next to `probed`/`skippedBudget` so the cron log line shows full coverage accounting.

### Flaky-host attempt-reset semantics (GHOST-08)

- **D-10:** `attemptCount` reset rule changes from "reset on any live-or-unknown" to: **`live` resets to 0; `unknown` PRESERVES the prior count (no increment, no reset)**. Transient failures still never count toward prune (unknown never increments), but a repeat offender alternating dead→unknown→dead now accumulates and eventually crosses the `>= 3` cron gate. Update the RESEARCH A2 semantics comment + schema-test table in lockstep.
- **D-11:** `unknown` stays excluded from prune eligibility on BOTH trigger paths (already true via `isTerminalDead`; pin it with an explicit cronPrune test case so a future status addition can't silently widen prune).
- **D-12:** The `attemptCount >= 3` cron gate is retained verbatim. Manual prune keeps its no-gate semantics (operator judgment, D-09 of Phase 32).
- **D-13:** `prunedIds` sample audit (success criterion 3): pull recent `prune-dead-urls` entries from the production `operator:audit-log` (via `/api/operator-status` or a one-off script), re-probe a sample (up to ~20 IDs' URLs) with a browser-like User-Agent, and record the live/dead verdicts in the phase verification doc. Zero live URLs in the sample = pass.

### 403 auto-prune decision (GHOST-09)

- **D-14:** Evidence-first, Phase 42 D-03 pivot pattern: pre-register **demotion of `403` to manual-only prune** as the likely outcome, but gate it on evidence. Evidence = the D-13 prunedIds sample plus the current `403`-status keys in prod: re-probe those URLs with a browser-like UA; any URL that serves a live article in a browser context confirms the bot-blocking-CDN false-positive hypothesis.
- **D-15:** If demoted (expected): `403` stays in the taxonomy, stays terminal-dead (dashboard count + deadUrlSample + manual prune all unchanged) — only the **cron** prune filter excludes it (`trigger === 'cron'` skips `403` regardless of attemptCount). If the sample shows 403s genuinely dead: keep cron-prunable and record the evidence in the phase summary. Either way the decision and its evidence are written down.

### Evidence string persistence (GHOST-10)

- **D-16:** New required-but-nullable field on `UrlLiveness`: `evidence: z.string().max(200).nullable()`. A compact human-readable string, not a structured object — Phase 44 renders it verbatim. Examples: `soft-404: matched "page not found" in title`, `redirect-to-home: /news/article-x → /`, `near-empty: 187 bytes`, `http-404`, `http-403`, `dead-host: fetch failed`, `no-url: event has no source URL`, `live` entries get `null`.
- **D-17:** The probe writer always sets `evidence`; old stored entries lacking the field are tolerated (runtime Zod-parse happens only on write; all liveness TTLs are ≤7d so the population fully turns over within a week).
- **D-18:** Lockstep surfaces updated in the same phase: `server/__tests__/lib/urlLiveness.schema.test.ts` + the literal-path shim `src/__tests__/lib/urlLiveness.schema.test.ts`, `docs/architecture/redis-keys.md` entry for `events:url-liveness:{eventId}` (new statuses + evidence field + new attemptCount semantics), CLAUDE.md §Serverless Cache registry line, and `src/__tests__/lib/redis-registry.test.ts` if it pins the value shape.
- **D-19:** Server-side exposure only in this phase: `DeadUrlSampleEntry` in `server/routes/operator-status.ts` gains the `evidence` field (and its status union gains `soft-404`), so Phase 44 has data to mount. No client UI work here.

### Cross-cutting constraints

- **D-20:** No new env-tunable surfaces (Phase 32 D-18 precedent) — heuristic thresholds (16 KiB cap, ~512-byte floor, marker list) are hard-coded module constants.
- **D-21:** Polite-citizen contract unchanged: `createLimit(8)`, per-host 1 req/s + jitter, 10s timeout, 3-hop redirect cap, identifying UA. The extra capped GET on 200s is the only added traffic and respects the same per-host throttle map.
- **D-22:** Degrade-open posture unchanged: probe/sweep/prune failures never break the extraction outcome; one bad URL never poisons the sweep.

### Claude's Discretion

- Exact marker list contents and whether to include a few transliterated/regional phrases — keep small, curated, precision-first; expanding it later is cheap.
- Where the body-heuristic helper lives (inline in `probeUrl` vs extracted pure function) — pure function preferred for testability, but follow what reads cleanest.
- Exact shape of the sweep counter additions and log line wording.
- Whether the D-13/D-14 evidence sampling is a checked-in script (`scripts/`) or a documented one-off — choose based on reuse value; the recorded results are what matter.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition

- `.planning/ROADMAP.md` §Phase 43 — goal, success criteria 1-5
- `.planning/REQUIREMENTS.md` §Ghost Links (GHOST-06..GHOST-10)

### Code under change

- `server/lib/urlLiveness.ts` — the entire surface: `UrlLivenessSchema` + status enum + `ttlSecForStatus` (lines ~87-152), `probeUrl` (~280-376), per-host throttle (~392-430), `persistLiveness` attemptCount semantics (~484-541), `buildProbeCandidates` source-skip (~586-624), `runProbeSweep` (~653-695), `pruneDeadUrlEvents` filter + cron gate (~774-878)
- `server/lib/llmExtractionPipeline.ts` ~lines 626-668 — cron post-step wiring (deadline budget, sweep → auto-prune sequencing); sweep counter additions land in this log line
- `server/routes/operator-status.ts` — `DeadUrlSampleEntry` (~185-189) + `buildDeadUrlSample` SCAN helper; gains `evidence` + `soft-404`

### Tests (lockstep, all four exist today)

- `server/__tests__/lib/urlLiveness.schema.test.ts` — D-22 strict-schema pin + TTL-tier pins (+ literal-path shim at `src/__tests__/lib/urlLiveness.schema.test.ts`)
- `server/__tests__/lib/urlLiveness.probe.test.ts` — probeUrl taxonomy table
- `server/__tests__/lib/urlLiveness.sweep.test.ts` — throttle + attemptCount semantics via `__test__` export
- `server/__tests__/lib/urlLiveness.cronPrune.test.ts` + `server/__tests__/routes/events.prune.test.ts` + `server/__tests__/routes/refresh-events-cron.prune.test.ts` — prune filter + trigger-path behavior

### Contract surfaces (drift gates must stay green)

- `docs/architecture/redis-keys.md` — `events:url-liveness:{eventId}` + `events:url-liveness-count` entries
- `CLAUDE.md` §Serverless Cache — `events:url-liveness:{eventId}` registry line (status taxonomy, TTL tiers, attemptCount semantics)
- `src/__tests__/lib/redis-registry.test.ts` — mechanical drift gate

### Phase 32 decision history (semantics being amended)

- `.planning/milestones/` Phase 32 artifacts (32-RESEARCH.md A2 attemptCount rationale, D-07/D-12/D-19/D-20/D-22) — the decisions this phase deliberately amends; cite them when changing the comments

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- `probeUrl`'s redirect-following loop already tracks `finalUrl` per hop — the redirect-to-home signal needs only a path comparison between original and final URL, no new plumbing
- `fetchOnce` already supports a `Range`-capped GET (1 KiB for the 405 fallback) — the soft-404 body fetch generalizes this with a 16 KiB cap + body read
- `isTerminalDead` is the single predicate shared by the sidecar count, prune filter, and dashboard sample — adding `soft-404` there propagates everywhere terminal-dead matters; the GHOST-09 cron demotion of `403` must therefore be a prune-filter-local check, NOT an `isTerminalDead` change
- `__test__` NODE_ENV-gated export exposes `persistLiveness` + throttle internals — attemptCount semantic tests extend the existing pattern
- `operator:audit-log` already records `prunedIds` per prune — the D-13 evidence sample reads existing data, no new instrumentation

### Established Patterns

- `.strict()` Zod schema + paired schema test pins every shape change (Phase 32 D-22); any field/enum addition fails tests until the pin updates in the same commit
- Tiered TTL by verdict confidence (`TTL_SEC_BY_STATUS`) with the schema test asserting ceilings — new statuses need a tier + a pin
- Degrade-open Redis sidecar maintenance (try/catch + log.warn, floor-at-0 underflow heal)
- Evidence-gated decisions with pre-registered likely outcome (Phase 42 D-03 precedent) — applied here to GHOST-09

### Integration Points

- Cron post-step in `runRefreshExtraction` finally-block calls `buildProbeCandidates` → `runProbeSweep` → (deadline permitting) `pruneDeadUrlEvents({trigger:'cron'})` — no wiring changes needed, only behavior inside the helpers
- `POST /api/events/prune-dead-urls` (manual path) shares `pruneDeadUrlEvents`; the cron-only 403 exclusion lives behind the existing `opts.trigger` discriminator
- Phase 44 (events subtab) consumes what this phase persists: per-status buckets (now including `soft-404` + `no-url`) and the `evidence` string

</code_context>

<specifics>
## Specific Ideas

- The roadmap names the flaky-host bug precisely: the current "reset on any live-or-unknown transition" lets a host alternating dead→unknown→dead evade the `>= 3` gate forever — D-10's "unknown preserves" rule is the minimal targeted fix
- GHOST-09's hypothesis is operator-stated: "bot-blocking CDNs 403 unknown UAs on live articles" — the evidence sample should re-probe with a browser-like UA specifically to test that hypothesis
- The phase's asymmetric error budget (precision over recall, never prune live links) is the tie-breaker for every heuristic threshold decision

</specifics>

<deferred>
## Deferred Ideas

- Per-bucket dead-link counts + evidence string rendered in the events subtab — Phase 44 (EVENTS-TAB-02)
- Headless-browser or JS-rendering probe for SPA publishers — explicitly excluded by GHOST-06; would be its own phase if ever justified
- Promoting probe knobs (concurrency, timeouts, heuristic thresholds) to env-tunable surfaces — only if a production incident demands it (Phase 32 D-18 stance)
- Redis-backed mutex for the prune GET→splice→SET race (Phase 32 T-32-07) — still watch-only; promote only if audit telemetry shows a real overlap

### Reviewed Todos (not folded)

- `phase-27.4.2-ci-health.md` — matched only on generic keywords (score 0.6); CI health is unrelated to ghost-link pruning. Already deferred at Phase 42 with the same rationale — candidate for Phase 46 (General Hardening) review.
- `phase-27.4.3-deckgl-v9-type-drift.md` — matched only on generic keywords (score 0.6); deck.gl type drift is unrelated to this server-only phase. Candidate for Phase 46 review.
- (Deviation note: auto-mode rule says fold score ≥ 0.4, but both matches are keyword-noise with no scope overlap — folding them would violate the phase boundary, so they were reviewed-not-folded, matching the Phase 42 precedent.)

</deferred>

---

_Phase: 43-Ghost Link Prune Correctness_
_Context gathered: 2026-06-10_
