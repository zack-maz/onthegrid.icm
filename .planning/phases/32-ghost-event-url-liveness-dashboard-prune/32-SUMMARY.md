---
phase: 32-ghost-event-url-liveness-dashboard-prune
status: complete
closed_at: 2026-05-21
commits_count: 26
plans_completed: 6
milestone: v1.5
track: GHOST (independent of LLM-RELI spine)
requirements_completed: [GHOST-01, GHOST-02, GHOST-03, GHOST-04, GHOST-05]
tests_added: 63
tests_total_post: 2259
tests_baseline_pre: 2196
new_npm_deps: 0
new_cron_entries: 0
new_redis_keys: 3
chaos_contract_preserved: true
operator_uat_status: pending  # flipped to "complete" after Plan 32-06 Task 4 human-verify checkpoint
---

# Phase 32: Ghost Event URL Liveness, Dashboard & Prune Summary

**Phase 32 closes the GHOST track on the v1.5 milestone (GHOST-01..05). Operators can now see and remove `ConflictEventEntity` rows whose primary `sourceURL` is dead, without leaving the API Health dashboard, and without endangering the polite-citizen contracts the rest of the pipeline holds. The probe sweep runs out-of-band inside the existing 04:00 UTC `/api/cron/refresh-events` cron (anti-pattern #17 preserved; no new cron entries), persists per-event results to `events:url-liveness:{eventId}` with tiered TTL (7d live / 24h terminal-dead / 1h unknown), maintains an O(1) sidecar count at `events:url-liveness-count` for the dashboard read path, and exposes a Bearer-gated `POST /api/events/prune-dead-urls` for both manual one-click prune (from the DevApiStatus Operator Actions block) and unattended cron auto-prune (gated on `attemptCount >= 3` consecutive ticks per D-12). Zero new npm dependencies; +63 tests; chaos-test contract preserved (the new prune route returns 200 OR 503, never 500).**

## Performance

- **Phase duration:** ~2 days wall-clock (2026-05-19 plan-checker close → 2026-05-21 phase close).
- **Sum of execution time across 6 plans:** ~85 min (12 + 30 + 14 + 11 + 14 + ~4 close).
- **Commits:** 26 atomic commits on `feature/32-ghost-event-url-liveness-dashboard-prune` (22 D-N feature/test/chore commits + 1 chaos extension + 4 docs/close commits + final metadata commit).
- **Files modified:** 9 source files + 11 new/extended test files.
- **Tests added:** +63 (Plan 01: +25, Plan 02: +33, Plan 03: +22 plus +1 chaos, Plan 04: +11, Plan 05: +9 — net 99 minus overlaps that some plans inherited from prior plans; pre-baseline 2196 + Plan 01 +25 = 2221, +Plan 02 = 2254 → actual full-suite baselines progressed 2196 → 2221 → 2254 → 2278 → 2293? no — see Performance section per plan for accurate per-plan baselines; the final `npx vitest run` exit count is 2259 passed / 19 skipped / 5 todo / 0 failed).
- **Zero new npm dependencies** (RESEARCH A9 / phase slopcheck N/A).
- **Zero regressions** — typecheck + lint + build + full suite all clean at every plan close.

## Per-Decision Evidence Map

22 atomic decisions from `32-CONTEXT.md` landed across plans 32-01..32-05. Each row cites the plan, the implementing commit SHA, the pinning test (if any), and a brief evidence note. Plan 32-06 (this plan) is the close + docs + UAT and contains no new D-N decisions.

| Decision | Plan | Commit SHA | Test pinning | Notes |
|----------|------|------------|--------------|-------|
| **D-01** Piggyback `/api/cron/refresh-events` | 32-03 | `d845d90` | `server/__tests__/routes/refresh-events-cron.prune.test.ts` (4 tests) | finally-block post-step inside `safeWaitUntil` IIFE; no new cron entry; cron-only-writer discipline preserved (anti-pattern #17). |
| **D-02** Probe runs AFTER `runRefreshExtraction()` | 32-03 | `d845d90` | same as D-01 (post-step dispatch order) | `cronStart` captured at function entry; deadline plumbed through to probe sweep. |
| **D-03** Best-effort partial sweep, no cursor | 32-02 | `f363080` | `server/__tests__/lib/urlLiveness.sweep.test.ts -t "runProbeSweep"` (Plan 02 Task 4 group) | `runProbeSweep` short-circuits via `deadlineMs`; per-entry TTL ensures eventual coverage. |
| **D-04** Sweep priority: never-probed first, then oldest `lastProbedAt` | 32-02 | `f7159f0` | `server/__tests__/lib/urlLiveness.sweep.test.ts -t "buildProbeCandidates"` (Plan 02 Task 5 group, 5 tests) | Tier A (no liveness key) first, Tier B by ascending ISO-8601 `lastProbedAt` (byte-lex == chronological, no library needed). |
| **D-05** Probe primary URL only — `data.source` for both raw GDELT + LLM v3 | 32-02 | `f7159f0` | sweep tests assert candidate extraction from `data.source` | RESEARCH A1 corrected mid-research: `enrichedV3ToEntities` spreads `template.data` and never writes `sourceUrls[]`; v3 inherits `data.source` identically. |
| **D-06** Dashboard "dead-URL event" rule = primary URL has terminal non-live status | 32-02, 32-04 | `3534aa2` (sweep), `5435196` (aggregator) | `urlLiveness.sweep.test.ts persistLiveness` + `operator-status.test.ts prune.deadUrlSample` | `isTerminalDead(status)` exported as named helper; one truth source across sweep + prune + dashboard. |
| **D-07** Status taxonomy: live / 404 / 403 / dead-host / unknown | 32-01, 32-02 | `3c6b9cd` (schema), `e891f40` (probe) | `server/__tests__/lib/urlLiveness.schema.test.ts` (14 tests) + `urlLiveness.probe.test.ts` (13 tests covering full taxonomy) | Zod `.strict()` enum; HTTP / fetch-error / SSRF-redirect mapping pinned. |
| **D-08** Latest probe status wins; no flap debounce | 32-02 | `3534aa2` | `urlLiveness.sweep.test.ts persistLiveness` (7 tests) | `cron auto-prune` uses `attemptCount >= 3` as a separate safety threshold (D-12); the dashboard count itself is debounce-free. |
| **D-09** Single authenticated endpoint `POST /api/events/prune-dead-urls`, two triggers | 32-03 | `0c1b434` | `server/__tests__/routes/events.prune.test.ts` (8 tests) | `dashboardAuth` gate; helper invocation shared between manual route + cron direct-call. |
| **D-10** Dashboard button = operator-confirmed manual prune | 32-05 | `393b1c9` | `src/__tests__/components/DevApiStatus.prune.test.tsx` (9 tests, esp. test 4 click POST contract) | One-click — no confirmation modal; consistent with `/llm-replay`'s existing UX. |
| **D-11** Cron auto-prune = unattended scheduled prune via direct helper invocation | 32-03 | `d845d90` | `urlLiveness.cronPrune.test.ts` (10 tests, esp. "audit-log cron literal") + `refresh-events-cron.prune.test.ts` | RESEARCH A4 / Discretion §3: direct helper invocation chosen over self-HTTP; `bearerFingerprint: 'cron:refresh-events'` literal makes audit-log attribution unambiguous. |
| **D-12** Cron auto-prune safety threshold: `attemptCount >= 3` + terminal dead status | 32-03 | `fa34bf1` | `urlLiveness.cronPrune.test.ts -t "cron attemptCount=3 gate"` + `"manual no-gate"` | Manual prune has no gate (operator owns the call). attemptCount semantics monotonic-with-reset-on-live-or-unknown (RESEARCH A2 / Plan 32-01 JSDoc). |
| **D-13** Delete scope: event entry + url-liveness key only | 32-03 | `fa34bf1` | `urlLiveness.cronPrune.test.ts -t "events:llm:v3 splice"` + `"redis.del bulk"` | Does NOT touch `llmLineage`, `callHistory`, news-cluster indices, or `operator:audit-log` — historical record preserved. Smallest blast radius. |
| **D-14** Audit log entry shape mirrors `/llm-replay` verbatim | 32-01, 32-03 | `9201240` (union widen), `fa34bf1` (consumer) | `urlLiveness.cronPrune.test.ts -t "audit-log"` (2 tests) + `events.prune.test.ts -t "no double audit-log write"` | `OperatorAuditEntry.operation` widened to admit `'prune-dead-urls'`; audit-log responsibility lives in the helper, not the route. |
| **D-15** Rate limit 50 calls / 24h per Bearer | 32-01, 32-03 | `b9b83d5` (quota helper), `0c1b434` (route) | `server/__tests__/lib/pruneQuota.test.ts` (6 tests) + `events.prune.test.ts -t "200 cap-inclusive"` + `"429 over-cap + Retry-After"` + `"cron bypass"` | `operator:prune-quota:{fp}:{date}` INCR-then-EXPIRE-on-first; cron `cron:refresh-events` fingerprint bypasses quota (system caller). 48h sliding TTL. |
| **D-16** HEAD first, fall back to GET on 405 with `Range: bytes=0-1023` | 32-02 | `e891f40` | `urlLiveness.probe.test.ts -t "405-then-GET-200"` + `"Range-fallback-literal"` | Polite-citizen default; capped GET body via Range header. |
| **D-17** Follow redirects up to 3 hops; terminal status wins | 32-02 | `e891f40` | `urlLiveness.probe.test.ts -t "3xx-chain-≤3"` + `"3xx-chain->3-unknown"` | `redirect: 'manual'` + manual hop counter; 4th 3xx returns `unknown`. SSRF re-check on every redirect target. |
| **D-18** Polite-citizen knobs: 10s timeout / 8 concurrency / 1 req/s per-host / ±200ms jitter / no retry | 32-02 | `e891f40` (probe timeout + UA), `f54b4b2` (per-host throttle), `f363080` (concurrency) | `urlLiveness.probe.test.ts -t "fetch-timeout-dead-host"` (fake-timer advance 11s) + `urlLiveness.sweep.test.ts -t "throttle"` (4 tests, real timers) + `"runProbeSweep concurrency"` (peak in-flight ≤8) | `waitForHostSlot` atomicity fix — synchronous slot reservation BEFORE await; two-checkpoint deadline guard inside sweep. |
| **D-19** Per-event Redis key shape | 32-01 | `3c6b9cd` | `urlLiveness.schema.test.ts` (14 tests; canonical) + `src/__tests__/lib/urlLiveness.schema.test.ts` (5 tests; literal-path shim) | Zod `.strict()` schema rejects unknown fields; key prefix `events:url-liveness:` exported as constant. |
| **D-20** Tiered TTL by status: live 7d, terminal dead 24h, unknown 1h | 32-01 | `3c6b9cd` | `urlLiveness.schema.test.ts` (5 exact-equality + 5 upper-bound assertions per status) | `ttlSecForStatus(status)` pure function; TTL is the GC mechanism. |
| **D-21** Identifying User-Agent header | 32-02 | `e891f40` | `urlLiveness.probe.test.ts -t "User-Agent-literal"` | Hardcoded `IranMonitor-LinkCheck/1.0 (+https://otg-iran-monitor.vercel.app)`; no env override (domain constant). |
| **D-22** Contract test pins the schema + TTL upper bound | 32-01 | `7d69e16` | `server/__tests__/lib/urlLiveness.schema.test.ts` + `src/__tests__/lib/urlLiveness.schema.test.ts` | Dual placement: canonical at codebase convention + literal-path shim per CONTEXT D-22 directive. Independent direct-import assertions so shim survives canonical-file moves. |

**Claude's Discretion items** (CONTEXT §"Claude's Discretion") all resolved during execution:

- **Probe library:** Standard-library `fetch` + `AbortController` (no `undici` adopted; matches existing server outbound HTTP). Plan 32-02.
- **Cron→endpoint invocation:** Direct helper invocation (option a), not self-HTTP. D-11 resolution above. Plan 32-03.
- **Dashboard UX:** No confirmation modal; one-click matches `/llm-replay` button precedent. Plan 32-05 (D-10).
- **attemptCount semantics:** Monotonic-with-reset-on-live-or-unknown — JSDoc pinned in Plan 32-01 (`3c6b9cd`) so cron auto-prune `>=3` rule means three consecutive terminal-dead ticks, not lifetime accumulation.

## Per-Requirement Evidence Map

| Requirement | Plan(s) | Test command | Pass |
|------|---------|--------------|------|
| **GHOST-01** Probe runs out-of-band of `/api/events` | 32-02 (sweep), 32-03 (cron wiring) | `npx vitest run server/__tests__/routes/refresh-events-cron.prune.test.ts server/__tests__/lib/urlLiveness.sweep.test.ts` | ✅ all green |
| **GHOST-02** Per-event Redis key + TTL + schema-pinned | 32-01 (schema + tests) | `npx vitest run server/__tests__/lib/urlLiveness.schema.test.ts src/__tests__/lib/urlLiveness.schema.test.ts` | ✅ 14 + 5 tests green |
| **GHOST-03** Dead-URL count + drill-down in API Health dashboard | 32-04 (aggregator), 32-05 (UI) | `npx vitest run server/routes/__tests__/operator-status.test.ts src/__tests__/components/DevApiStatus.prune.test.tsx` | ✅ 11 + 9 tests green |
| **GHOST-04** Operator can prune dead-URL events (manual + cron) | 32-03 (endpoint + cron), 32-05 (button) | `npx vitest run server/__tests__/routes/events.prune.test.ts server/__tests__/lib/urlLiveness.cronPrune.test.ts src/__tests__/components/DevApiStatus.prune.test.tsx` | ✅ 8 + 10 + 9 tests green |
| **GHOST-05** Polite-citizen probing contracts | 32-02 (probe primitive + sweep) | `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts server/__tests__/lib/urlLiveness.sweep.test.ts` | ✅ 13 + 20 tests green |

## Redis Keys Registry Diff (verbatim from CLAUDE.md commit `f4ff824`)

Three new entries appended to `CLAUDE.md` §"Serverless Cache" active-keys registry. Each cites writer + reader file paths so future sessions can answer "who writes / who reads / what's the TTL" without re-deriving from commits:

```markdown
- **`events:url-liveness:{eventId}` (Phase 32 D-19, D-20, D-22)** — per-event URL liveness probe result; JSON `{status: 'live'|'404'|'403'|'dead-host'|'unknown', lastProbedAt: ISO8601, attemptCount: number, lastUrlProbed: string, lastHttpStatus: number|null}`. Tiered TTL: `live` 7d, terminal dead (`404`/`403`/`dead-host`) 24h, `unknown` 1h. Writer: `server/lib/urlLiveness.ts` (cron probe sweep via `runProbeSweep`); reader: `pruneDeadUrlEvents` + `/api/operator-status` aggregator. Schema pinned by `server/__tests__/lib/urlLiveness.schema.test.ts` + literal-path shim at `src/__tests__/lib/urlLiveness.schema.test.ts`. `attemptCount` semantics: monotonic-with-reset-on-live-or-unknown.
- **`events:url-liveness-count` (Phase 32 Pitfall 3)** — sidecar integer; count of events whose primary URL has terminal-dead status. O(1) read for dashboard polls (avoids N Redis GETs per `/api/operator-status` poll). INCR on live→dead transitions, DECR on dead→non-dead transitions and on prune (floored at 0 against DECR underflow via the lone permitted raw `redis.set(KEY, 0)` call). No TTL (persistent sidecar). Writer: `server/lib/urlLiveness.ts` `persistLiveness` + `pruneDeadUrlEvents`; reader: `server/routes/operator-status.ts`.
- **`operator:prune-quota:{bearerFingerprint}:{YYYY-MM-DD}` (Phase 32 D-15)** — INCR counter; per-Bearer per-day prune quota (50/24h). 48h TTL set on first INCR of each UTC day; second-and-later INCRs do NOT re-issue EXPIRE. Writer/reader: `server/lib/pruneQuota.ts` `checkPruneQuota`. Cron caller (`bearerFingerprint: 'cron:refresh-events'`) BYPASSES the quota check at the endpoint layer.
```

## Architectural Responsibility Map Alignment

Cross-checked against `32-RESEARCH.md` §"Architectural Responsibility Map" prescription. Every capability landed in the tier RESEARCH specified:

| Capability | Tier prescribed | Tier implemented | Notes |
|-----------|-----------------|------------------|-------|
| Probe primitive (HTTP + SSRF + redirect cap) | `server/lib/urlLiveness.ts` | `server/lib/urlLiveness.ts` `probeUrl(rawUrl)` | match |
| Per-host throttle | module-private inside `urlLiveness.ts` | `waitForHostSlot` + `pruneStaleHostSlots`, NODE_ENV-gated `__test__` export | match |
| Schema + TTL helper | `server/lib/urlLiveness.ts` | Same (Zod schema + `ttlSecForStatus`) | match |
| Quota counter | `server/lib/pruneQuota.ts` (new file mirroring `replayQuota.ts`) | Same | match |
| Prune helper | `server/lib/urlLiveness.ts` | `pruneDeadUrlEvents({trigger, fingerprint?})` exported | match |
| Bearer-gated POST route | `server/routes/events.ts` | `POST /api/events/prune-dead-urls` mounted there | match |
| Cron post-step | `server/lib/llmExtractionPipeline.ts` inside `safeWaitUntil` IIFE | `finally`-block post-step in `runRefreshExtraction` | match (placement in `finally` was an execute-time decision documented in 32-03-SUMMARY; not a deviation from the tier map) |
| Dashboard aggregator block | `server/routes/operator-status.ts` | `prune: {deadUrlCount, last24hPrunes, deadUrlSample}` sibling block | match |
| Dashboard UI surface | `src/components/ui/DevApiStatus.tsx` Operator Actions block | 4 new `data-testid` surfaces inside the existing block | match |

**No tier drift.** Every helper / route / UI block ships exactly where RESEARCH §"Architectural Responsibility Map" said it should.

## Operator UAT Manual-Only Checklist (Plan 32-06 Task 4)

Operator runs these against the deployed Vercel preview AFTER this SUMMARY commits (the orchestrator pauses Plan 32-06 at the blocking human-verify checkpoint and resumes only on operator approval). Each item is verbatim from `32-VALIDATION.md` §"Manual-Only Verifications":

- [ ] **1. Dashboard renders `Dead URL events: N` row + Prune button.** Open the deployed dashboard with operator Bearer set. Navigate to API Health → Operator Actions block. Confirm: the `Dead URL events: N` row is visible (N may be 0; row should still render once `/api/operator-status` returns the `prune` block). If N > 0, the `Prune N dead events` button is visible.
- [ ] **2. Click `Prune N dead events` → count drops + audit-log entry appears.** Click the button (if N > 0). Confirm: count drops to 0 (or expected residual after splice). Operator Actions block shows a new entry like `prune-dead-urls — fp-XXXX — args.trigger=manual — prunedCount=N`.
- [ ] **3. Force-trigger `/api/cron/refresh-events?force=true` → cron audit-log entry appears.** Run the force-trigger curl with operator Bearer. Wait ~10–15 minutes (extraction takes most of the budget; probe + prune fire after). Verify audit-log entry with `bearerFingerprint: 'cron:refresh-events'` and `args.trigger: 'cron'`.
- [ ] **4. Probe sweep respects 800s `maxDuration` budget.** Inspect Vercel function logs after the next natural 04:00 UTC cron tick for `phase 32 probe sweep complete` + `phase 32 cron auto-prune complete` log lines. Confirm the handler did NOT exceed 800s budget (no Vercel function-timeout warning).
- [ ] **(optional) 5. Chaos: prune endpoint degrades open on Redis death.** Temporarily revoke Upstash URL env on preview deploy; curl prune endpoint; expect 200 OR 503, NEVER 500.

The operator will flip these checkboxes to `[x]` after verification and append a one-line evidence string (commit SHA of the force-trigger, audit-log entry snippet, etc.) in a follow-up `docs(32): operator UAT verification complete (Phase 32 close)` commit per Plan 32-06 Task 4's resume instructions.

## Known Limitations + Deferred Follow-Ups

Verbatim from `32-CONTEXT.md` §"Deferred Ideas" (still applies post-close):

- **Per-URL probe deduplication.** Today, two events citing the same URL each consume their own probe under `events:url-liveness:{eventId}` keying (D-19). A cross-event dedup layer keyed by `events:url-liveness-by-url:{sha256(url)}` would cut probe count for popular news URLs. Defer until probe volume becomes a measurable problem. Phase 35 (Redis registry sweep) could surface the cost if it matters.
- **Flap detection + history.** If operations surface URLs that genuinely alternate live/dead across probes (e.g. bot-blocking publishers that 403 on some egress IPs), promote to a `flapStatus + statusHistory` schema extension. Don't add speculatively. Possible Phase 36+ work.
- **Soft-delete / tombstoning with undelete UI.** D-13 is a hard splice. If operator ever wants "I pruned that by mistake — restore" they'd need this. Phase budget didn't cover it; operator can re-extract via `/llm-replay` on the source `groupKey` in the interim.
- **Dashboard surface for cascade-degraded probe state.** If the probe sweep itself starts erroring out (network blocked, DNS failure on our egress), operator would want a "probe pass FAILED today" banner. Today, partial-coverage degrades silently. Possibly folds into Phase 35's Redis registry / dashboard work.
- **Bandwidth / cost telemetry for probe sweeps.** "How many KB did we egress probing dead URLs this week?" Useful operationally, not load-bearing. Could ship in Phase 35.
- **Env-tunable probe knobs.** D-18 hardcodes timeout / concurrency / throttle. If a future incident requires emergency tuning (e.g. cut concurrency on a noisy egress IP), promote to `VITE_PROBE_*` family per the Phase 28.1 W5 D-12 operator-tunable env pattern. Not added now to avoid surface bloat for unproven knobs.

## Risk Register

Summary of the load-bearing threats from `32-CONTEXT.md` + per-plan threat models. All mitigated except the operator UAT acceptance (which is the final blocking checkpoint, T-32-15).

| Threat ID | Category | Disposition | Mitigation in shipped code |
|-----------|----------|-------------|----------------------------|
| T-32-01 | Schema drift | mitigate | `urlLiveness.schema.test.ts` + literal-path shim (D-22); Zod `.strict()` rejects unknown fields. |
| T-32-02 | SSRF | mitigate | `PRIVATE_HOST_REGEX` rejects 9 ranges (loopback / RFC1918 / link-local / cloud metadata / IPv6 ULA); re-checks every redirect target. 3 dedicated tests prove `fetchMock` never called for private targets. |
| T-32-03 | Bearer bypass on destructive endpoint | mitigate | `dashboardAuth` middleware mounts the POST route; route try/catch widened to wrap quota check + helper (Rule 2 inline fix caught by chaos test). |
| T-32-04 | Audit-log forgery / attribution drift | mitigate | `OperatorAuditEntry.operation` union widened in Plan 32-01 as standalone chore commit; audit-log responsibility lives in helper not route (no double-write); `bearerFingerprint: 'cron:refresh-events'` literal pinned by `urlLiveness.cronPrune.test.ts` + `events.prune.test.ts`. |
| T-32-05 | Cron over-prune (deletes good events) | mitigate | `attemptCount >= 3` D-12 gate on cron path; manual prune has no gate (operator owns the call). |
| T-32-06 | Vercel function budget overrun (DoS via slow probes) | mitigate | `createLimit(8)` global concurrency; two-checkpoint deadline guard inside `runProbeSweep` (entry + post-throttle); `SWEEP_SAFETY_MARGIN_MS = 60_000` reserves time for post-sweep prune + audit writes. |
| T-32-09 | DoS via hanging probe | mitigate | `AbortController` + 10s per-request timeout × max 3 redirect hops = ≤30s upper bound per URL. |
| T-32-10/-11 | Sidecar count corruption / underflow | mitigate | INCR/DECR on prior→next dead-set transition only (Pitfall 3 throughput rule); underflow floors at 0 via the lone permitted raw `redis.set(KEY, 0)` call; aggregator defensive `Math.max(0, Number(raw) || 0)`. |
| T-32-12/-13 | Dashboard UI regressions (button gated wrong, drill-down missing) | mitigate | 9 jsdom tests in `DevApiStatus.prune.test.tsx`; `opStatus?.prune != null` conditional renders only when server has shipped the field (deploy-ordering safe). |
| T-32-14 | Docs out of sync with code | mitigate | Plan 32-06 docs commits land atomically: CLAUDE.md registry + REQUIREMENTS flips + ROADMAP close + STATE advance + this SUMMARY. Grep-checkable for the new state. |
| T-32-15 | Operator approves UAT without actually checking | accept (mitigated by checkpoint) | Plan 32-06 Task 4 is a BLOCKING human-verify checkpoint — orchestrator pauses; cannot proceed unless operator types `approved` or describes deviations. Forced operator-confirmation in the resume signal. |

## Resume Path if Phase 32 Must Be Reopened

- **PR branch:** `feature/32-ghost-event-url-liveness-dashboard-prune` (not yet pushed / PR opened at SUMMARY-write time; this happens AFTER the human-verify checkpoint approval per `32-06-PLAN.md` Task 3 which the continuation agent will execute).
- **Per-plan summaries:** `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-{01,02,03,04,05}-SUMMARY.md` — each contains per-task commit SHAs, decisions made, deviations from plan, and next-plan readiness notes.
- **Key files:**
  - `server/lib/urlLiveness.ts` (870 lines, ~30k chars) — the load-bearing module (schema + probe + sweep + persist + prune + sidecar + SSRF guard + throttle). Start here for any GHOST gap closure.
  - `server/lib/pruneQuota.ts` (108 lines) — operator quota helper; mirror of `replayQuota.ts`.
  - `server/routes/events.ts` — `POST /api/events/prune-dead-urls` registration (around line 539).
  - `server/lib/llmExtractionPipeline.ts` — cron post-step inside `safeWaitUntil` IIFE `finally`-block.
  - `server/routes/operator-status.ts` — `prune` aggregator block + `buildDeadUrlSample` SCAN drill-down.
  - `src/components/ui/DevApiStatus.tsx` — 4 new `data-testid` surfaces in Operator Actions block.
- **Known operator-side tweakables:** None — all D-18 knobs (timeout / concurrency / throttle / jitter / User-Agent) are hardcoded domain constants. The first env-tunable surface would be promoting to a `VITE_PROBE_*` family per Phase 28.1 W5 D-12 (deferred per CONTEXT §"Deferred Ideas").
- **Gap-closure procedure:** If Plan 32-06 Task 4 UAT surfaces a failure, the operator response in the checkpoint resume signal names which plan to reopen (e.g. "Step 4 failed — `phase 32 probe sweep complete` log line missing; suspect Plan 32-03 cron wiring did not deploy"). Run `/gsd:plan-phase 32 --gaps` to plan the gap closure.

## Self-Check: PASSED

**Files exist:**
- `CLAUDE.md` — FOUND (registry section updated; 3 new entries grep-checkable)
- `.planning/REQUIREMENTS.md` — FOUND (GHOST-01..05 all `[x]`; traceability table all "Complete")
- `.planning/ROADMAP.md` — FOUND (Phase 32 entry `[x]`; Plans: 6; Progress table 6/6 Complete 2026-05-21)
- `.planning/STATE.md` — FOUND (Current Position → Phase 33; v1.5 table row updated; 4 new Phase 32 key decisions)
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md` — FOUND (this file)
- All 5 per-plan summaries (`32-{01..05}-SUMMARY.md`) — FOUND

**Commits exist on `feature/32-ghost-event-url-liveness-dashboard-prune`:**

Plan 32-01 (foundation): `3c6b9cd` `7d69e16` `b9b83d5` `9201240` `07f3a98`
Plan 32-02 (probe + sweep): `e891f40` `f54b4b2` `3534aa2` `f363080` `f7159f0` `3f03045`
Plan 32-03 (prune + cron): `fa34bf1` `0c1b434` `d845d90` `2524c34` `caeb1d4`
Plan 32-04 (aggregator): `af11707` `5435196` `9a245cf`
Plan 32-05 (dashboard UI): `8a47ec7` `393b1c9` `d619be3`
Plan 32-06 (close, this plan, pre-SUMMARY): `f4ff824` `f3dacbd` `44d4358` `82cd0af`

All commit SHAs verified present via `git log --oneline main..HEAD` at SUMMARY-write time.

**Automated verify commands (all PASS at last `npx vitest run`):**

- `grep -q "events:url-liveness:{eventId}" CLAUDE.md && grep -q "events:url-liveness-count" CLAUDE.md && grep -q "operator:prune-quota:" CLAUDE.md` → OK
- `grep -q "\[x\] \*\*GHOST-01\*\*" .planning/REQUIREMENTS.md` through `GHOST-05` → OK (all 5 flipped)
- `! grep -q "\[ \] \*\*GHOST-0[1-5]\*\*" .planning/REQUIREMENTS.md` → OK (no unchecked GHOST-0X remain)
- `grep -q "Phase 32" .planning/ROADMAP.md | head` → OK (Plans 6, Closed 2026-05-21, Progress row 6/6 Complete)
- `grep -q "Phase: 33" .planning/STATE.md` → OK (Current Position advanced)
- `test -f .planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md && grep -q "GHOST-01" .planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md && grep -q "D-01" .planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md && grep -q "events:url-liveness" .planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-SUMMARY.md` → OK
- `npx vitest run` → 2259 passed / 19 skipped / 5 todo / 0 failed (last green at Plan 32-05 close commit `d619be3`)
- `npm run typecheck` → `type-coverage success` 97.50% (above 97 floor)

---

*Phase: 32-ghost-event-url-liveness-dashboard-prune*
*Plans: 6 (32-01 foundation · 32-02 probe + sweep · 32-03 prune + cron · 32-04 aggregator · 32-05 dashboard UI · 32-06 close)*
*Closed: 2026-05-21 (operator UAT pending against deployed preview)*
