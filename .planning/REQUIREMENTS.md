# Requirements: Iran Conflict Monitor — v1.5

**Defined:** 2026-05-09
**Milestone:** v1.5 LLM Reliability & Reveal Prep
**Core Value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map — numbers over narratives.

## v1.5 Requirements

Requirements for this milestone, grouped by track. Each maps to exactly one roadmap phase.

### LLM Reliability — provider chain narrowing + v3 stabilization + LLM-optional architecture

- [x] **LLM-RELI-01**: Active runtime provider cascade narrowed to NIM (primary) + OpenRouter (fallback). Cerebras + Groq removed from `callLLM` cascade and from `isLLMConfigured` gating in normal operation. v1/v2 extractor code paths preserved as deep-rollback safety only (per Phase 27.4 D-26/D-40).
- [x] **LLM-RELI-02**: NIM throttle behavior characterized — capture observed throttle window length, request-per-minute ceiling, and recovery signal pattern. Findings written to a Pitfall section in CLAUDE.md or a dedicated `docs/architecture/llm-pipeline-reliability.md`.
- [x] **LLM-RELI-03**: `LLM_BATCH_SIZE` (currently `BATCH_SIZE=2` v1, env-tunable in v3) and `LLM_V3_CONCURRENCY` (default 12) tuned against the characterized throttle. Tuned values committed as defaults; old values documented in the new ADR.
- [x] **LLM-RELI-04**: Retry / backoff parameters in `callLLM` cascade (`server/adapters/llm-provider.ts`) tuned against the characterized throttle. Per-event retry budget, exponential-backoff base, jitter window all set from measured data, not guessed.
- [x] **LLM-RELI-05**: LLM-optional architecture proven. With `NVIDIA_NIM_API_KEY` and `OPENROUTER_API_KEY` both unset (or `LLM_PIPELINE_ENABLED=false` if a kill-switch is added), `/api/events` continues to serve raw GDELT through the Pitfall 1 cache bridge. Map renders cleanly with no LLM enrichment. Existing degradation contract honoured.
- [ ] **LLM-RELI-06**: Daily 04:00 UTC `/api/cron/refresh-events` consistently lands `events:llm:v3` healthy. `/api/health` returns `endpoints.llmEvents.status === 'healthy'` after the daily tick. Confirmed across at least 7 consecutive days under normal NIM availability. **Status (2026-05-19): validated single-day, monitoring continues opportunistically.** Phase 31 closed early at Day 1 / 7 under operator decision (Day-1 natural cron PASS, commit `d0c16e4`; eval 0.98 at all radii; 0 breaker trips; DLQ entries all whitelisted `v3:timeout_watchdog`). The 7-consecutive bar is not met. Snapshot harness (`npm run watch:snapshot -- --http`) remains operational for ad-hoc capture; any future FAIL row escalates to Phase 31.1 per Phase 31 CONTEXT D-05. Caveat documented in [`.planning/phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md`](phases/31-cron-stability-validation-7-day-watch/31-SUMMARY.md) and [`docs/architecture/llm-pipeline-reliability.md` §7-Day Watch](../docs/architecture/llm-pipeline-reliability.md#close-summary-early--2026-05-19). Phase 37 acceptance gate (LLM-RELI-07) is the mechanical reliability check at milestone close and is unaffected.
- [ ] **LLM-RELI-07**: `prod-connectivity-audit.yml` exit-0 with `audit:connectivity:last-result.allTiersGreen === true` for **3 consecutive runs** (the v1.5 → v1.6 promotion gate; unblocks 999.5 load test).

### Ghost Event Cleanup — dead source URL probing + dashboard surfacing + pruning

- [ ] **GHOST-01**: Each `ConflictEventEntity.sourceURL` (or its v3 equivalent in the LLM-extracted shape) has its outbound liveness probed. Probe runs out-of-band of `/api/events` (cron-driven or lazy on-cache-miss; never blocks the primary read path).
- [ ] **GHOST-02**: Probe results stored in Redis under a dedicated key (e.g. `events:url-liveness:{eventId}` with TTL) carrying `{status: 'live'|'404'|'403'|'dead-host'|'unknown', lastProbedAt, attemptCount}`. Schema pinned by a contract test.
- [ ] **GHOST-03**: Dead-URL events surfaced in the API Health dashboard tab as a count + drill-down list. Operator can see which events have broken links without leaving the dashboard.
- [ ] **GHOST-04**: Operator can prune dead-URL events. Mechanism (one of): manual button in the dashboard, scheduled prune in the daily cron, or an operator endpoint behind the existing Bearer gate. Pruned events are removed from `events:llm:v3` and the in-flight cluster index.
- [ ] **GHOST-05**: URL liveness probing respects polite-citizen contracts — concurrency-limited, jittered, per-host throttled (analogous to the 1-req/s Nominatim throttle), and skips already-fresh entries (TTL-gated).

### Event Metadata Accuracy — actor labeling, canonicalization, audit, eval expansion

- [ ] **ACTOR-01**: One-time audit of the live `events:llm:v3` snapshot focused on actor metadata. Categorizes failures into buckets: (a) actor field null/empty, (b) actor field carries a raw CAMEO actor code instead of a human-readable label, (c) actor field carries an ambiguous generic string (e.g. "soldiers", "the army", "forces"), (d) actor field disagrees with the linked source content. Report quantifies each bucket and lists representative examples. Output drives ACTOR-02 catalog seeding and ACTOR-04 eval rubric design.
- [ ] **ACTOR-02**: Canonical actor catalog defined and committed (e.g. `server/data/actor-catalog.ts` or similar). Maps CAMEO actor codes + common abbreviations + observed LLM-extracted variants to canonical human-readable names (e.g. `IDF` → `Israeli Defense Forces`, `IRGC` → `Islamic Revolutionary Guard Corps`, `USMIL` → `United States Military`). Catalog scoped to Iran-conflict-relevant actors; out-of-scope actors fall through to whatever the extractor returned. Catalog has a contract test asserting no duplicate canonical names + no orphan codes.
- [ ] **ACTOR-03**: v3 LLM extractor prompt extended to emit canonical actor names where possible. Raw GDELT actor codes are mapped through the catalog before being written to `events:llm:v3`. New `actorConfidence` field added to the v3 schema (per-actor: high / medium / low). Schema migration handled via the existing v2/v3 cache-version discipline (i.e. `events:llm:v3` may bump to `events:llm:v3.1` if needed; or stay at v3 if the field is added forward-compat with a default).
- [ ] **ACTOR-04**: Eval harness ground-truth set (`.planning/eval/ground-truth-events.json`) extended with `expectedActor1` + `expectedActor2` fields per event. Daily eval scores actor-match rate alongside the existing geocode accuracy at 5 / 20 / 100 km thresholds. Adversarial fixtures (`.planning/eval/adversarial-injections.json`) extended with one or more actor-confusion injections (e.g. prompt designed to swap actor sides).
- [ ] **ACTOR-05**: API Health dashboard surfaces actor-quality counts — events with null actors, raw-CAMEO actors, ambiguous-string actors, low-confidence actors. Drill-down list available via the existing per-event detail panel; counts feed into the `aggregateHealth.endpoints.llmEvents` quality metrics block surfaced in Phase 28.2 W5 D-23.

### Documentation — Internal (CLAUDE.md + JSDoc + comments)

- [x] **DOCS-INT-01**: `CLAUDE.md` trimmed. Phase-history bloat (verbose 27.x / 28.x narrative blocks) condensed to current-state invariants only. Targets a meaningful token-count reduction (e.g. ~30k → <20k) without losing live-decision context.
- [ ] **DOCS-INT-02**: Inline JSDoc + comments around the LLM pipeline modules (`server/lib/llmExtractionPipeline.ts`, `server/lib/llmEventExtractor.v3.ts`, `server/lib/llmResolver.ts`, `server/lib/llmCircuitBreaker.ts`, `server/lib/llmDLQ.ts`, `server/lib/llmTokenBudget.ts`, `server/lib/llmExtractorWatchdog.ts`) audited and brought current. Each module's public API has a one-line JSDoc that matches the v1.5 implementation.
- [ ] **DOCS-INT-03**: Redis key registry (CLAUDE.md "Serverless Cache" section) verified against actual writers and readers in the codebase. Every key listed has at least one writer and at least one reader; orphaned entries removed; missing keys added. Forms the input for the REDIS-OPT-\* track.

### Redis Optimization — keep what's load-bearing, retire the rest

- [ ] **REDIS-OPT-01**: Full Redis key inventory produced as a single auditable artifact (e.g. `docs/architecture/redis-keys.md` or a generated table inside CLAUDE.md). Each key carries: writers (file:line), readers (file:line), TTL, value shape, business purpose, current cardinality estimate, hit/miss telemetry if available. Builds on DOCS-INT-03's verification pass.
- [ ] **REDIS-OPT-02**: Each key classified as `load-bearing` (must keep) / `observability-only` (keep but cap) / `retire` (remove writers + delete from prod). Explicit rationale per key. Retired keys are removed from code in the same phase; deleted from prod via a one-time cleanup script or natural TTL expiry, whichever is documented as the safer path.
- [ ] **REDIS-OPT-03**: TTLs right-sized against actual freshness requirements. Daily-cron-fed keys (e.g. `events:llm:v3` on 26h, eval baselines on 90d) reviewed against their producer cadence; observability-only keys capped (DLQ at 200 entries / 7d, audit log at 500 / 30d already; replay history not yet capped). Tightening lands as code changes with regression tests for any contract-pinned shapes.
- [ ] **REDIS-OPT-04**: Pre/post Redis command-budget impact measured against the Upstash dashboard or `INFO commandstats` proxy. Baseline reading captured at REDIS-OPT-01 (memory note: command budget at ~92% as of v1.3 close). Goal: a measurable absolute reduction documented in the new ADR (DOCS-PUB-04 ADR-0010 may merge with this; or a separate sequentially-numbered ADR if scope warrants).

### Pipeline Simplification — retire Hobby-era workarounds + general dead-code purge

These requirements turn the Vercel Pro upgrade and the v3-cascade-narrowing decision into actual code deletion, not just bypassed paths. Goal: smaller bundle, fewer code paths, less Redis churn — and the simplifications themselves act as reliability improvements (less to break).

- [x] **SIMPLIFY-01**: Retire `mergeAndPersistLlmEntities` incremental flush + `LLM_FLUSH_EVERY_N_BATCHES` env var. Single terminal-key write at end of run becomes the canonical shape on Pro's 800s ceiling. The 28.2.6 Plan 01 incremental flush was a 300s-budget mitigation; with 800s headroom it's pure complexity + Redis command churn. Lands in Phase 30 alongside the cascade-tuning work because the new defaults (CONCURRENCY, BATCH_SIZE) are sized against the post-simplification flow.
- [ ] **SIMPLIFY-02**: Retire `events:llm:v3:partial` observability key. Either delete entirely (cleanest) or downgrade to a debug-only flag behind an env var. Pre-Pro it was load-bearing for "did extraction make progress before getting killed?"; post-Pro extraction reliably finishes so partial state stops carrying signal. Phase 35 (Redis-opt) is the right home — REDIS-OPT-01..02 already classifies keys, and `events:llm:v3:partial` is a top retirement candidate.
- [x] **SIMPLIFY-03**: Watchdog defaults relaxed against the 800s ceiling. Current 90s hard-kill / 60s soft-warn per batch was sized to leave room for ~3 batches in 300s; on Pro the per-batch budget is much more generous. Either bump to ~180s/120s or evaluate whether the soft-warn category is still useful at all. New defaults committed against the measured throttle behavior from LLM-RELI-02 — soft-warn entries in `callHistory` should drop to near-zero under normal NIM availability.
- [x] **SIMPLIFY-04**: Cerebras + Groq adapter dead-code purged from `server/adapters/llm-provider.ts` runtime path. LLM-RELI-01 retires them from the runtime cascade; SIMPLIFY-04 follows up by deleting the adapter functions, the `CEREBRAS_API_KEY` / `GROQ_API_KEY` checks, and the synthetic `skipReason: 'no_client'` callHistory entries. v1 + v2 extractor code paths preserved (per Phase 27.4 D-26/D-40 they're deep-rollback safety) but the live cascade has zero references to Cerebras/Groq after this lands. Bundle-size impact tracked toward SIMPLIFY-07.
- [ ] **SIMPLIFY-05**: `server/lib/freeClaudeRouter.ts` (Phase 27.4.3 vendored router) caller audit. If it has live callers, document them in a JSDoc block at the top of the file; if it has zero live callers (orphaned because the cutover deferred per the 27.4.3 audit), delete the file + supporting imports + tests. Phase 35 is the right home (broader cleanup phase).
- [x] **SIMPLIFY-06**: v1 extractor (`server/lib/llmEventExtractor.v1.ts`) archived to a clearly-marked location (e.g. `server/lib/_archive/llmEventExtractor.v1.ts`) or the `attic/` convention. The v2 path stays in the bridge but its role is documented as deep-rollback only. The goal is making the active runtime path obviously the active path — readers shouldn't have to triage "is v1 still live?" on every visit.
- [ ] **SIMPLIFY-07**: `api/vercel-entry.js` bundle-size delta measured pre/post v1.5. Baseline: 1.72 MB at v1.4 close (up from 1.2 MB at v1.3 close). Target: net reduction documented in ADR-0010. Each SIMPLIFY-01..06 contributes; Phase 35 captures the final measurement and writes the delta into the closing artifact. Stretch goal: shrink below 1.5 MB.

### Documentation — Public (README + architecture + runbook + ADRs)

- [ ] **DOCS-PUB-01**: `README.md` updated for the v1.4 surface — domain rename to `otg-iran-monitor.vercel.app`, v3 LLM pipeline, dashboard merge into the API Health tab, Bearer-bypass rate limiter, manual-trigger `prod-connectivity-audit.yml`. Hero GIF / layer screenshots regenerated if visibly stale.
- [ ] **DOCS-PUB-02**: `docs/architecture/` (10 markdown files, 21 Mermaid diagrams) updated for v1.4 LLM pipeline shape. Data-flow diagrams reflect the v3 cron-driven extraction, Pitfall 1 cache bridge, 6-path resolver, and the post-1.5 narrowed NIM + OpenRouter cascade.
- [ ] **DOCS-PUB-03**: `docs/runbook.md` (676 lines) gains v1.4 + v1.5 incidents — NIM throttle handling, cron architecture lessons (28.2.6 fire-and-forget IIFE diagnosis), force-trigger runbook (`?force=true`), prod-connectivity-audit retry path.
- [ ] **DOCS-PUB-04**: New ADR (ADR-0010 — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` was committed 2026-04-24 and already occupies the 0009 slot) documenting the v1.5 LLM-pipeline decisions: stay on v3, narrow active providers to NIM + OpenRouter, retire Cerebras + Groq from runtime cascade, LLM-optional architecture. Captures the rationale, trade-offs, and rollback plan.
- [ ] **DOCS-PUB-05**: Degradation contract (`docs/degradation.md`) reflects the current Pitfall 1 cache bridge behavior. The v3 → v2 → v1 → raw GDELT fallback chain is documented as the explicit "map never goes blank" contract.

### Documentation — API (OpenAPI 3.0.3 spec)

- [ ] **DOCS-API-01**: `/api/audit-status` (Phase 28.2 W6 sidecar reader) added to the OpenAPI spec — request shape, response schema (incl. the `allTiersGreen` + `tierStatus` fields added in Phase 28.2.5 D-04), auth posture (no Bearer required, degrade-open).
- [ ] **DOCS-API-02**: `/api/operator-status` (Phase 28.2 W5 aggregator) added to the OpenAPI spec — Bearer-required, response shape covers `audit24h` + `byBearer` + `pinTtl` + `advEval`.
- [ ] **DOCS-API-03**: `/api/events/llm-pipeline` (Phase 27.4 runtime override) added to the OpenAPI spec — POST with `{version: 'v1'|'v2'|'v3'|null}` body, GET to read current. Bearer-required in prod.
- [ ] **DOCS-API-04**: `/api/events/llm-replay/:groupKey` (Phase 27.4 dev-only replay) added to the OpenAPI spec — explicitly marked dev-only via Pitfall 6 dual-gate. Returns `{old, new}` diff WITHOUT writing to cache.
- [ ] **DOCS-API-05**: `/api/cron/refresh-events` (Phase 27.4.6 cron path) added to the OpenAPI spec — Bearer-required (CRON_SECRET in cron, DASHBOARD_PASSWORD operator force-trigger). `?force=true` query param documented.
- [ ] **DOCS-API-06**: `/api/cron/health` (daily Redis ping + source freshness + eval-drift) added to the OpenAPI spec — CRON_SECRET-gated.
- [ ] **DOCS-API-07**: `/api/cron/warm` (daily Overpass sites + water pre-warm) added to the OpenAPI spec — CRON_SECRET-gated.

## v2 Requirements

Deferred to v1.6 or later. Tracked but not in v1.5 scope.

### Public reveal polish — v1.6

- **REVEAL-01**: Public-reveal landing-page polish, demo flows, social-share assets.
- **REVEAL-02**: Public domain (vs. the current `otg-iran-monitor.vercel.app` Vercel alias) — TBD whether v1.6 stages a custom domain.

### Performance optimization + load test — v1.6 (promotes from 999.5 once the v1.5 acceptance gate clears)

- **LOAD-01**: `s-maxage` CDN headers per `/api/*` endpoint — D-19 from `28-CONTEXT.md`.
- **LOAD-02**: k6 1-300 VU sweep — D-15 / D-16 / D-17 / D-18 / D-20 / D-21 from `28-CONTEXT.md`.
- **LOAD-03**: Reveal-time PASS/FAIL bar — `p95<500ms hot endpoints, p99<1500ms, error<1%, no 5xx spikes, cache-hit>90%`.

### Backlog parked at v1.5 start (not in scope unless they block reliability)

- **BACKLOG-01**: 999.1 rate-limiter-public-global-blocks-operator — folded into Phase 28.2 D-04 as resolved.
- **BACKLOG-02**: 999.2 `api/vercel-entry.js` build-artifact discipline — long-term migration to Vercel Build Output API.
- **BACKLOG-03**: 999.3 Phase 27.4.6 cron first-tick verification — passive verification gap.
- **BACKLOG-04**: 999.4 Cron route hydrates pipeline override — 1-line `await refreshPipelineOverride()` fix.
- **BACKLOG-05**: 27.4.5 LLM pipeline observability flight recorder — Redis-backed call ring buffer.
- **BACKLOG-06**: 27.3.3 Romanization of non-Latin water facility names — re-admit ~125 filtered facilities.

## Out of Scope

Explicitly excluded from v1.5. Documented to prevent scope creep.

| Feature                                        | Reason                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| v4 multi-provider router                       | Operator-rejected at milestone start. v3 stays. NIM + OpenRouter is the chain.                                                                         |
| Cerebras / Groq as active providers            | Operator-rejected at milestone start. Retired from runtime cascade; preserved as deep-rollback only.                                                   |
| Public reveal polish                           | v1.6 milestone. v1.5 is internal hardening + reliability + docs cleanup; reveal is its own thing.                                                      |
| 999.5 load test                                | Defers to v1.6; promotion gate is **LLM-RELI-07** (3 consecutive `prod-connectivity-audit.yml` exit-0 runs).                                           |
| 27.3.3 water-name romanization                 | Not in v1.5 scope. ~125 non-Latin water facilities stay filtered out by the Latin-script admission gate.                                               |
| 999.1 / 999.2 / 999.3 / 999.4 backlog items    | Not pulled in unless they block reliability. 999.4 in particular may surface as load-bearing during LLM-RELI-06; if so, fold it in mid-milestone.      |
| Phase 27.4.5 LLM observability flight recorder | Operator-rejected at milestone start. Diagnostic surface stays at the existing 8-block DevApiStatus events tab; no Redis-backed history added in v1.5. |
| Significant persons tracking                   | Already excluded at project level — complexity without clear data sources.                                                                             |
| Push / desktop notifications                   | Already excluded at project level — operator monitors actively.                                                                                        |
| User authentication                            | Already excluded at project level — single-user personal tool. (Bearer header is operator-only access control, not user auth.)                         |
| Historical playback / replay                   | Already excluded at project level — live + snapshots covers the use case.                                                                              |
| Mobile app                                     | Already excluded at project level — web-first desktop monitoring tool.                                                                                 |

## Traceability

Empty initially; populated by the roadmap agent during Step 10. Each requirement maps to exactly one phase.

| Requirement  | Phase | Status                                                           |
| ------------ | ----- | ---------------------------------------------------------------- |
| LLM-RELI-01  | 29    | Complete                                                         |
| LLM-RELI-02  | 30    | Complete                                                         |
| LLM-RELI-03  | 30    | Complete                                                         |
| LLM-RELI-04  | 30    | Complete                                                         |
| LLM-RELI-05  | 29    | Complete                                                         |
| LLM-RELI-06  | 31    | Validated single-day (caveat — Phase 31 closed early 2026-05-19) |
| LLM-RELI-07  | 36    | Pending                                                          |
| GHOST-01     | 32    | Pending                                                          |
| GHOST-02     | 32    | Pending                                                          |
| GHOST-03     | 32    | Pending                                                          |
| GHOST-04     | 32    | Pending                                                          |
| GHOST-05     | 32    | Pending                                                          |
| ACTOR-01     | 33    | Pending                                                          |
| ACTOR-02     | 33    | Pending                                                          |
| ACTOR-03     | 33    | Pending                                                          |
| ACTOR-04     | 33    | Pending                                                          |
| ACTOR-05     | 33    | Pending                                                          |
| DOCS-INT-01  | 29    | Complete                                                         |
| DOCS-INT-02  | 34    | Pending                                                          |
| DOCS-INT-03  | 34    | Pending                                                          |
| REDIS-OPT-01 | 34    | Pending                                                          |
| REDIS-OPT-02 | 34    | Pending                                                          |
| REDIS-OPT-03 | 34    | Pending                                                          |
| REDIS-OPT-04 | 34    | Pending                                                          |
| SIMPLIFY-01  | 30    | Complete                                                         |
| SIMPLIFY-02  | 34    | Pending                                                          |
| SIMPLIFY-03  | 30    | Complete                                                         |
| SIMPLIFY-04  | 29    | Complete                                                         |
| SIMPLIFY-05  | 34    | Pending                                                          |
| SIMPLIFY-06  | 29    | Complete                                                         |
| SIMPLIFY-07  | 34    | Pending                                                          |
| DOCS-PUB-01  | 35    | Pending                                                          |
| DOCS-PUB-02  | 35    | Pending                                                          |
| DOCS-PUB-03  | 35    | Pending                                                          |
| DOCS-PUB-04  | 36    | Pending                                                          |
| DOCS-PUB-05  | 35    | Pending                                                          |
| DOCS-API-01  | 35    | Pending                                                          |
| DOCS-API-02  | 35    | Pending                                                          |
| DOCS-API-03  | 35    | Pending                                                          |
| DOCS-API-04  | 35    | Pending                                                          |
| DOCS-API-05  | 35    | Pending                                                          |
| DOCS-API-06  | 35    | Pending                                                          |
| DOCS-API-07  | 35    | Pending                                                          |

**Coverage:**

- v1.5 requirements: 43 total (7 LLM-RELI + 5 GHOST + 5 ACTOR + 3 DOCS-INT + 4 REDIS-OPT + 7 SIMPLIFY + 5 DOCS-PUB + 7 DOCS-API)
- Mapped to phases: 43 ✓
- Unmapped: 0
- Phase distribution: Phase 29 (5) · Phase 30 (5) · Phase 31 (1) · Phase 32 (5) · Phase 33 (5) · Phase 35 (9) · Phase 36 (11) · Phase 37 (2)

---

_Requirements defined: 2026-05-09_
_Last updated: 2026-05-09 after roadmap creation — 36/36 requirements mapped to Phases 29–36._
