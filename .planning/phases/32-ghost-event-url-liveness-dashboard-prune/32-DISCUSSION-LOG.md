# Phase 32: Ghost Event URL Liveness, Dashboard & Prune - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-19
**Phase:** 32-ghost-event-url-liveness-dashboard-prune
**Areas discussed:** Probe trigger model, Multi-URL scoring, Prune mechanism, Probe method + storage shape

---

## Probe trigger model

### Q1: Canonical trigger for URL liveness probing

| Option | Description | Selected |
|--------|-------------|----------|
| Piggyback on refresh-events cron | After runRefreshExtraction() resolves at 04:00 UTC, probe pass over fresh events:llm:v3. Zero new cron entries. Budget bounded by remaining Vercel Pro 800s. | ✓ |
| New dedicated cron entry | Add 4th Vercel cron (e.g. /api/cron/probe-urls). Independent failure mode. +1 cron entry. | |
| Operator Bearer-gated only | No cron. /api/events/probe-urls POST behind dashboardAuth. Operator triggers ad-hoc. Counts can be stale. | |
| Piggyback + Bearer manual override | Cron does routine pass; Bearer endpoint exists for forced re-probe after prune. | |

**User's choice:** Piggyback on refresh-events cron
**Notes:** Preserves cron-only-writer discipline; minimal operational surface.

### Q2: Lazy-on-cache-miss probe path?

| Option | Description | Selected |
|--------|-------------|----------|
| Cron-only | Skip lazy entirely. /api/events stays read-only per anti-pattern #17. | ✓ |
| Lazy fire-and-forget on miss | Background probe if events:url-liveness:{eventId} missing on read. Re-introduces fire-and-forget pattern Phase 27.4 retired. | |
| Lazy on miss, but only inside the cron | Collapses to option 1. | |

**User's choice:** Cron-only

### Q3: Order relative to LLM extraction

| Option | Description | Selected |
|--------|-------------|----------|
| After extraction resolves | Extraction gets full budget; probe gets remainder. | ✓ |
| Before extraction | Probe gets guaranteed budget; extraction risks squeeze. | |
| In parallel (Promise.all) | Probe while extraction in-flight; harder to reason about; memory/socket contention. | |
| Conditional on extraction budget headroom | Soft deadline; adaptive but more state. | |

**User's choice:** After extraction resolves

### Q4: Partial-coverage handling when probe runs out of budget

| Option | Description | Selected |
|--------|-------------|----------|
| Best-effort, TTL handles the rest | Whatever fits gets probed; rest waits next tick. No carry-over state. | ✓ |
| Persist a 'next-probe cursor' in Redis | events:url-liveness-cursor for fairer coverage; one more key. | |
| Hard-fail the cron | Treat partial as DLQ-style failure. Overstates the problem. | |

**User's choice:** Best-effort, TTL handles the rest

### Q5: Sweep priority order

| Option | Description | Selected |
|--------|-------------|----------|
| Never-probed first, then oldest lastProbedAt | Two-tier sort. New events converge fast. | ✓ |
| Oldest lastProbedAt only | Single sort key. New events wait. | |
| Status-weighted (prior dead first) | Re-confirm dead faster; uneven coverage. | |
| Random / shuffled | No priority; even long-run, no short-run guarantee. | |

**User's choice:** Never-probed first, then oldest lastProbedAt

### Continue / next?
**User's choice:** Next area

---

## Multi-URL scoring

### Q1: Dead-event classification rule

| Option | Description | Selected |
|--------|-------------|----------|
| All URLs dead | Conservative; event dead only if every URL fails. | |
| Any URL dead | Aggressive; risks pruning verifiable events. | |
| Majority dead | Middle ground; awkward for single-URL events. | |
| Tiered: fully-dead vs partially-dead (two counts) | More signal; safer; two numbers. | |
| **Other (user free-text)** | **"Whatever is previewed as source is dead"** | ✓ |

**User's choice:** "Whatever is previewed as source is dead" — operator's instinct.
**Notes:** Confirmed after I verified `src/components/detail/EventDetail.tsx:152` renders ONE URL via `d.source`. Maps to: probe primary URL (`data.source` for raw GDELT, `data.sourceUrls[0]` for LLM v3). Secondary URLs not surfaced or considered.

### Q2: Show 'N backup URLs available' hint when primary dead?

| Option | Description | Selected |
|--------|-------------|----------|
| No hint, prune-eligible as-is | Keeps the rule clean. Matches 'whatever is previewed.' | ✓ |
| Show 'N backup URLs available' badge | Operator sees fallback citations; discourages prune. | |
| Show but don't probe — informational only | Mid-ground. | |

**User's choice:** No hint, prune-eligible as-is

### Q3: Status-to-dead mapping

| Option | Description | Selected |
|--------|-------------|----------|
| 404 + 403 + dead-host → dead; unknown stays out | Matches GHOST-02 taxonomy. | ✓ |
| 404 only → dead | Strictest; under-counts 403/DNS failures. | |
| 404 + 403 → dead, dead-host → unknown | Treat host-level as transient. | |
| Require N consecutive dead probes before counting | Most conservative; time-to-detect lag. | |

**User's choice:** 404 + 403 + dead-host → dead; unknown stays out

### Q4: Flap tracking?

| Option | Description | Selected |
|--------|-------------|----------|
| No — latest status wins | Simpler; TTL cadence self-corrects flips. | ✓ |
| Track attemptCount + lastStatusChange and surface | Schema overhead; speculative. | |
| Track but don't surface yet | Pays Redis cost for unproven need. | |

**User's choice:** No — latest status wins

### Continue / next?
**User's choice:** Next area

---

## Prune mechanism

### Q1: Trigger + surface

| Option | Description | Selected |
|--------|-------------|----------|
| Bearer endpoint + dashboard button, no auto-prune | Manual control only. | |
| Auto-prune inside refresh-events cron | Unattended; silent risk. | |
| Bearer endpoint only (no UI button) | Maximum friction; defeats dashboard framing. | |
| Dashboard button + scheduled cron, both authenticated to same endpoint | Belt-and-suspenders. | ✓ |

**User's choice:** Dashboard button + scheduled cron, both authenticated to same endpoint

### Q2: Cron auto-prune safety threshold

| Option | Description | Selected |
|--------|-------------|----------|
| Dead status confirmed N consecutive ticks (≥3) | False-positive safety; 3-tick lag. | ✓ |
| Dead for ≥7 days (timestamp-based) | Time-based; assumes consistent ticks. | |
| Auto-prune anything dashboard shows as dead | Fastest convergence; no second-chance gate. | |
| Opt-in via env flag, defaults OFF | Defer auto-prune decision to operational reality. | |

**User's choice:** Dead status confirmed N consecutive ticks (≥3)

### Q3: Delete scope

| Option | Description | Selected |
|--------|-------------|----------|
| Event entry + url-liveness key, leave everything else | Smallest blast radius. | ✓ |
| Above + clear lineage entries | Loses 'why was this here' forensics. | |
| Above + clear from news cluster index | Needs research on relationship existence. | |
| Soft-delete (tombstone flag) | Undelete trivial; payload bloat. | |

**User's choice:** Event entry + url-liveness key, leave everything else

### Q4: Audit-log entry shape

| Option | Description | Selected |
|--------|-------------|----------|
| Same shape as llm-replay audit, add prunedIds list | Reuse pattern verbatim. | ✓ |
| Above + per-event reason (url, status code) | Bigger entries; more forensic info. | |
| No audit log — cron logs are enough | Breaks dashboard surface convention. | |

**User's choice:** Same shape as llm-replay audit, add prunedIds list

### Q5: Rate-limit quota?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, but lighter cap — 20 calls / 24h | Destructive endpoint deserves tighter cap. | |
| Yes, same 50/24h ceiling as llm-replay | Maximum consistency. | ✓ |
| No quota — audit-log is the deterrent | Skip the counter. | |

**User's choice:** Yes, same 50/24h ceiling as llm-replay

### Continue / next?
**User's choice:** Next area

---

## Probe method + storage shape

### Q1: HTTP method

| Option | Description | Selected |
|--------|-------------|----------|
| HEAD first, fall back to GET on 405 | Polite default; handles HEAD-refusing CDNs. | ✓ |
| GET with Range: bytes=0-1023 only | Simpler; ~1KB/probe baseline cost. | |
| HEAD only | Under-counts dead URLs on HEAD-refusing hosts. | |
| GET only (no Range) | Worst for bandwidth. | |

**User's choice:** HEAD first, fall back to GET on 405

### Q2: Redirect-follow policy

| Option | Description | Selected |
|--------|-------------|----------|
| Follow up to 3 hops, terminal status wins | Covers common 'old → canonical → CDN' chain. | ✓ |
| Follow up to 1 hop | Catches simple http→https; misses multi-hop. | |
| Don't follow — treat 3xx as 'unknown' | Strictest; misses 301-to-/article-not-found. | |
| Follow unlimited (browser-like) | Loop risk. | |

**User's choice:** Follow up to 3 hops, terminal status wins

### Q3: Polite-citizen knobs (timeout / concurrency / per-host throttle / jitter / retry)

| Option | Description | Selected |
|--------|-------------|----------|
| 10s timeout, 8 concurrent, 1 req/s/host, ±200ms jitter, no retry | Mirrors Nominatim 1 req/s; reuses createLimit(8). | ✓ |
| 5s timeout, 16 concurrent, 1 req/s/host, ±500ms jitter, 1 retry on 5xx | More aggressive; CDN-throttle risk. | |
| User-tunable via env vars | Operator-tunable per Phase 28.1 W5 D-12 pattern. | |

**User's choice:** 10s timeout, 8 concurrent, 1 req/s/host, ±200ms jitter, no retry
**Notes:** User then said "Go with recommended for all remaining" — bundled the rest of the area into Q4.

### Q4: Remaining sub-decisions (bundled)

| Option | Description | Selected |
|--------|-------------|----------|
| Lock all defaults (key shape per-event, schema {status,lastProbedAt,attemptCount,lastUrlProbed,lastHttpStatus}, TTL 7d/24h/1h by status tier, User-Agent identifies app, contract test in src/__tests__/lib/urlLiveness.schema.test.ts) | Bundle confirm. | ✓ |
| Change something | Override one of: key shape, schema, TTL, UA, test placement. | |

**User's choice:** Lock all defaults

---

## Claude's Discretion

- Probe implementation library (`fetch` + `AbortController` vs `undici`) — researcher picks based on existing package.json / outbound HTTP convention.
- Internal cron→endpoint invocation mechanism (function-call vs self-HTTP) — both have merit; researcher decides.
- Dashboard button confirmation UX (modal vs one-click, in-flight indicator, result toast) — defer to existing /llm-replay button's UX for consistency.
- `attemptCount` increment semantics (reset on live-→-dead transition vs monotonic accumulation) — researcher picks based on whether it makes D-12's "≥3 consecutive" rule cleaner.

## Deferred Ideas

- Per-URL probe deduplication across events (sha256(url)-keyed cache layer) — defer until probe volume becomes a measurable cost.
- Flap detection + status history — defer until ops surface a real flapping problem.
- Soft-delete / undelete UI for pruned events — defer; operator can re-extract via /llm-replay if needed.
- Dashboard surface for probe sweep failures (egress blocked, DNS failure) — possibly Phase 35.
- Bandwidth / cost telemetry for probe sweeps — possibly Phase 35.
- Env-tunable probe knobs (VITE_PROBE_TIMEOUT_MS etc.) — promote only if a real incident requires tuning.
