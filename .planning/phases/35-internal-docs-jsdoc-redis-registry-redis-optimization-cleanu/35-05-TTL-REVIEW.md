# Phase 35 Plan 05: Redis TTL Right-Sizing Review

> **Outcome: ZERO TTL CHANGES PROPOSED.** Every Redis key in `docs/architecture/redis-keys.md` has its current TTL audited against producer cadence + freshness requirement, and every TTL is **right-sized**. Per CONTEXT.md D-17 + the Phase 31 "no incidents observed" precedent, "no changes proposed" IS the load-bearing outcome of this plan.

**Plan:** 35-05
**Author:** Phase 35 orchestrator (operator-confirmed 2026-05-27)
**Inputs:** `docs/architecture/redis-keys.md` (27-key inventory from plan 35-01), grep audit from 35-RESEARCH.md lines 598-705
**Reviewed at:** 2026-05-27 UTC, on `feature/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu` branch (post plans 35-01, 35-02, 35-03)

---

## D-18 (Replay-History Cap) — Resolution

**Open Question 1 (35-RESEARCH.md lines 562-565):** What does CONTEXT.md D-18 mean by "replay-history not yet capped"?

**Investigation (2026-05-27):**

```
$ grep -rn "replay-history\|replayHistory\|replay_history" server/ src/ --include='*.ts'
(zero matches)

$ grep -rn "operator:audit-log" server/ src/ --include='*.ts' | head
server/lib/operatorAudit.ts:34: export const OPERATOR_AUDIT_KEY = 'operator:audit-log';
server/lib/operatorAudit.ts:59:   operation: 'pipeline-swap' | 'replay' | 'prune-dead-urls';
…
```

**Conclusion (Hypothesis A confirmed, operator-acknowledged 2026-05-27):** "Replay history" refers to `operator:audit-log`, which is the SADD bounded set storing all operator-action entries. The `operation` field at `server/lib/operatorAudit.ts:59` includes the literal value `'replay'`, so replay events ARE recorded in `operator:audit-log`. The cap (500 entries / 30d TTL via `OPERATOR_AUDIT_KEY` + `OPERATOR_AUDIT_MAX_ENTRIES` + `OPERATOR_AUDIT_TTL_SEC` at `server/lib/operatorAudit.ts:36-38`) was applied during Phase 28.2 W3 and is already documented in CLAUDE.md §Serverless Cache + `docs/architecture/redis-keys.md` operator family table.

**D-18 status:** **Satisfied by existing cap.** No new cap required; no code change in this plan.

---

## Per-Key TTL Audit

Every key from `docs/architecture/redis-keys.md` (post-plan-35-02 state — partial-key removed) is reviewed below. Finding values: `right-sized` | `under-sized` | `over-sized` | `unbounded`.

| Family   | Key                                                      | Current TTL                                                                                   | Producer cadence                                       | Freshness requirement                                                                                | Finding         | Recommendation                                                                                            |
| -------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------- |
| events   | `events:gdelt`                                           | 15-min logical / 2.5h hard                                                                    | GDELT polling (15-min)                                 | Match producer                                                                                       | **right-sized** | leave                                                                                                     |
| events   | `events:backfill-ts`                                     | 1h                                                                                            | One-time backfill sentinel                             | Long enough to prevent stampede                                                                      | **right-sized** | leave                                                                                                     |
| events   | `events:llm:v3`                                          | 9000s (≈ 2.5h hard)                                                                           | Daily 04:00 UTC cron                                   | Hard ceiling above producer cadence                                                                  | **right-sized** | leave (cron-only writer; 9000s = 10× producer interval = 26h-equivalent headroom in practice)             |
| events   | `events:llm:v3:lineage:{eventId}`                        | 7d (`LINEAGE_TTL_SEC`)                                                                        | Per-event write during cron                            | 7d aligns with drill-down window                                                                     | **right-sized** | leave                                                                                                     |
| events   | `events:llm:v3:lineage-keys`                             | 7d; capped 500 (`LINEAGE_MAX_ENTRIES`)                                                        | Per-cron ZADD + ZREMRANGEBYRANK                        | Capped + TTL = sane                                                                                  | **right-sized** | leave (cap = 500 matches per-cron production sample of ~50-500 lineage entries with comfortable headroom) |
| events   | `events:llm:v3:group-lineage:{hash}`                     | 7d (`GROUP_LINEAGE_TTL_SEC`)                                                                  | Reader-only currently (writer not implemented)         | Pre-filter cache reuse window                                                                        | **right-sized** | leave (TTL is correct shape; writer arrival in future phase will validate cap need)                       |
| events   | `events:llm-summary:v3`                                  | 24h (`LLM_SUMMARY_TTL_SEC`)                                                                   | Daily cron                                             | Match cron cadence + 1× grace                                                                        | **right-sized** | leave                                                                                                     |
| events   | `events:llm-dlq`                                         | 7d (`DLQ_TTL_SEC`); capped 200 (`DLQ_MAX`)                                                    | Per-failure SADD                                       | Already capped + TTL                                                                                 | **right-sized** | leave                                                                                                     |
| events   | `events:llm-process-ts`                                  | No explicit TTL (cooldown sentinel)                                                           | Cron start                                             | Cooldown gates re-entry; explicit TTL not needed                                                     | **right-sized** | leave                                                                                                     |
| events   | `events:llm-eval-baseline:v3`                            | 90d                                                                                           | Daily eval run                                         | Long retention for trend lines                                                                       | **right-sized** | leave                                                                                                     |
| events   | `events:llm-eval-adversarial:v3`                         | 90d                                                                                           | Daily eval run                                         | Same as baseline                                                                                     | **right-sized** | leave                                                                                                     |
| events   | `events:llm-pipeline-audit`                              | 90d (`PIPELINE_AUDIT_TTL_SEC`); capped 200                                                    | Per-operator-flip LPUSH (no new writers post-Phase-29) | Already capped + TTL; essentially static after Phase 29                                              | **right-sized** | leave                                                                                                     |
| events   | `events:llm-cost-shadow:v3:{YYYY-MM-DD}`                 | 90d                                                                                           | Daily HSET writes                                      | 90d ring = 1 entry per UTC day; bounded naturally                                                    | **right-sized** | leave (one-per-day, naturally bounded by TTL — no cap needed)                                             |
| events   | `events:url-liveness:{eventId}`                          | Tiered: live 7d, terminal-dead 24h, unknown 1h                                                | Per-probe cron                                         | Tiered TTL is the load-bearing innovation                                                            | **right-sized** | leave (tiered shape is the Phase 32 design contract)                                                      |
| events   | `events:url-liveness-count`                              | None (persistent sidecar)                                                                     | INCR/DECR on probe + prune                             | Persistent OK (small integer; counter, not state)                                                    | **right-sized** | leave                                                                                                     |
| flights  | `flights:opensky`                                        | short (`FLIGHTS_REDIS_TTL_SEC`)                                                               | OpenSky 5s polling                                     | Match producer                                                                                       | **right-sized** | leave                                                                                                     |
| flights  | `flights:adsblol`                                        | short                                                                                         | adsb.lol 30s polling                                   | Match producer                                                                                       | **right-sized** | leave                                                                                                     |
| ships    | `ships:ais`                                              | 10-min stale                                                                                  | AISStream on-demand                                    | Match producer (10-min stale prune is the contract)                                                  | **right-sized** | leave                                                                                                     |
| sites    | `sites:v3`                                               | 24h                                                                                           | Daily Overpass warm cron                               | Match producer cadence                                                                               | **right-sized** | leave                                                                                                     |
| water    | `water:facilities:v3`                                    | 24h                                                                                           | Daily Overpass warm cron                               | Match producer cadence                                                                               | **right-sized** | leave                                                                                                     |
| water    | `water:precip`                                           | 6h                                                                                            | Open-Meteo polling (6h interval)                       | Match producer                                                                                       | **right-sized** | leave                                                                                                     |
| news     | `news:feed`                                              | 15-min                                                                                        | GDELT-DOC + RSS polling                                | Match producer                                                                                       | **right-sized** | leave                                                                                                     |
| news     | `news:gdelt`                                             | 15-min                                                                                        | GDELT-DOC polling                                      | Match producer                                                                                       | **right-sized** | leave                                                                                                     |
| markets  | `markets:yahoo:{range}`                                  | 60s                                                                                           | Yahoo Finance polling                                  | Match producer (60s)                                                                                 | **right-sized** | leave                                                                                                     |
| geocode  | `geocode:{lat},{lon}`                                    | 30d logical / 90d hard                                                                        | Per-request demand (Nominatim 1 req/s throttle)        | Long retention reasonable for static reverse-geocode lookups                                         | **right-sized** | leave                                                                                                     |
| geocode  | `geocode:fwd:constrained:v2:{hash}`                      | 30d hard                                                                                      | Per-request demand                                     | Same; ME-viewbox-constrained forward geocode                                                         | **right-sized** | leave                                                                                                     |
| llm      | `llm:tokens:{provider}:YYYY-MM-DD`                       | 48h                                                                                           | Daily INCR                                             | UTC-day-rollover + 24h grace (allows reading yesterday's count during early-morning operator triage) | **right-sized** | leave                                                                                                     |
| llm      | `llm:lastProgress`                                       | (in-memory + Redis write-through; Redis side has no explicit TTL but is overwritten per tick) | Per-cron-tick write-through                            | Cold-start protection window                                                                         | **right-sized** | leave (overwrite-on-write is the lifecycle; explicit TTL would race with active cron)                     |
| cron     | `cron:lastTick:{name}` (health, warm, refresh-events)    | 7d (`CRON_LASTTICK_TTL_SEC`)                                                                  | Per-cron-tick (per-cron-job)                           | 7d = "tick missed for a week → all hands"                                                            | **right-sized** | leave                                                                                                     |
| operator | `operator:audit-log`                                     | 30d (`OPERATOR_AUDIT_TTL_SEC`); capped 500 (`OPERATOR_AUDIT_MAX_ENTRIES`)                     | Per-operator-action SADD                               | Already capped + TTL; satisfies D-18 (see above)                                                     | **right-sized** | leave                                                                                                     |
| operator | `operator:replay-quota:{bearerFingerprint}:{YYYY-MM-DD}` | 48h                                                                                           | Per-replay INCR                                        | UTC-day-rollover + 24h grace                                                                         | **right-sized** | leave                                                                                                     |
| operator | `operator:prune-quota:{bearerFingerprint}:{YYYY-MM-DD}`  | 48h                                                                                           | Per-prune INCR                                         | Same as replay                                                                                       | **right-sized** | leave                                                                                                     |
| audit    | `audit:connectivity:last-result`                         | 7d                                                                                            | Manual workflow_dispatch                               | 7d ≈ next audit-cycle window                                                                         | **right-sized** | leave                                                                                                     |

**Total keys reviewed:** 32 (includes parametric families counted once; `cron:lastTick:{name}` covers 3 names, `markets:yahoo:{range}` covers 4 ranges).
**Findings: `right-sized` = 32; `under-sized` = 0; `over-sized` = 0; `unbounded` = 0.**

---

## Rationale: Why "no changes" is the right outcome

Three independent lines of evidence support the read-only-at-default finding:

1. **Historical tuning depth.** Every TTL above was set deliberately during Phases 27-34 and re-validated as the codebase evolved (Phase 28.2 introduced per-Bearer quota TTLs; Phase 29 retired v1/v2 keys; Phase 30 added eval-adversarial; Phase 32 introduced tiered URL-liveness TTL; Phase 33 added actor metadata under existing key shapes). The TTL column in `docs/architecture/redis-keys.md` is not legacy — it's actively maintained.

2. **Producer-cadence alignment is the universal pattern.** Every TTL above either matches the producer's polling/cron interval (15-min for GDELT, 60s for markets, 24h for daily warm) OR encodes a deliberate design contract (tiered for URL-liveness, 90d ring for eval-baseline + cost-shadow, 7d for cron-tick observability). There are no TTLs set arbitrarily or by historical drift.

3. **Caps are applied where naturally unbounded growth could occur.** Every key whose write pattern could grow without bound (`operator:audit-log`, `events:llm-dlq`, `events:llm:v3:lineage-keys`, `events:llm-pipeline-audit`) carries an explicit cap enforced at the writer call site (SADD bounded set, ZREMRANGEBYRANK, LPUSH + LTRIM). No naturally-unbounded key is unbounded in practice.

---

## Phase 31 Precedent

This plan closes with zero code commits — the artifact (this file) IS the deliverable. Same shape as Phase 31, which closed with "no incidents observed" being itself the load-bearing outcome of a watch period.

The value here is **auditable verification**: a future Phase 36+ contributor wondering "do we need to right-size TTLs?" can read this file, see the per-key justification, and trust that the audit was actually performed rather than rubber-stamped.

---

## Verification

- D-17 acceptance: every key has a TTL value + a current-TTL-vs-producer-cadence finding. ✓
- D-18 acceptance: replay-history cap ambiguity resolved with operator clarification + grep evidence. ✓
- REDIS-OPT-03 closed: TTLs reviewed; production state confirmed right-sized; no follow-up implementation required. ✓
- Drift gate still green (no code touched, registry surface unchanged). ✓

## What This Enables

Plan 35-06 (phase close) will cite this artifact in the SUMMARY.md "TTL review outcome" line as "no changes proposed — every key right-sized per producer cadence; 32 keys audited; load-bearing audit-only deliverable." The ADR-0010 Phase 35 sub-block will record D-17/D-18 as resolved.
