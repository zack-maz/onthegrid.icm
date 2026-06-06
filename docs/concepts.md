# Concepts — Iran Monitor Glossary

> The project-specific vocabulary. Most of these terms are coined here, not
> borrowed from a framework — they name patterns, contracts, and safety
> mechanisms that recur across the codebase. Every definition is consistent with
> the canonical [`CLAUDE.md`](../CLAUDE.md) current-state reference; where a term
> maps to a deeper artifact, the heading links to it.
>
> Part of the [Showcase](./SHOWCASE.md) "go deeper" set. New here? Start with the
> [Showcase tour](./SHOWCASE.md) first, then keep this open as a side reference.

---

## Architecture & resilience

### Pitfall 1 cache bridge

The terminal graceful-degradation path for conflict events. When the
LLM-enriched cache (`events:llm:v3`) is empty, `/api/events` serves **raw GDELT**
(`events:gdelt`) through the bridge in
[`server/routes/events.ts`](../server/routes/events.ts) so the map never goes
blank. [ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) makes
raw GDELT the terminal fallback. Named for the anti-pattern it guards against:
re-introducing fire-and-forget enrichment on the read path.

### LLM-optional architecture

The design stance — formalized in
[ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) — that the LLM
event pipeline is an enrichment layer, never a hard dependency. If every provider
is down, the system degrades to raw GDELT and keeps serving. The map's
correctness does not depend on the LLM being up.

### Degrade-open

The failure philosophy for every cached route: when a dependency (Redis, an
upstream feed, the LLM) fails, return **degraded-but-usable** data (200 with
stale/empty payload, or a documented 502/503) — **never** a 500 and never a
blank map. The chaos test
[`redis-death.test.ts`](../server/__tests__/resilience/redis-death.test.ts)
asserts all cached routes hold this contract under total Redis death.

### Honest deferral

Closing scope as "deferred" while keeping every artifact (plans, RESEARCH,
CONTEXT, integration design) intact so the work is a `git checkout` away rather
than a re-plan from zero. Phase 34's Cerebras/Groq deferral is the canonical
example; see
[ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) Phase 34
sub-block.

### Probe-before-commit

The agentic-dev discipline of spiking/probing a risky assumption before writing
production code against it — instead of building downstream of an unverified
signal and patching later. Discussed in
[BUILDING-WITH-CLAUDE-CODE.md](./BUILDING-WITH-CLAUDE-CODE.md) as one of the
places the `/gsd` workflow compounded.

### Mechanical drift gate

A test or lint rule whose only job is to fail when documentation, config, or a
registry drifts out of sync with code. Examples: the Redis-registry verification,
the OpenAPI lint, `markdown-link-check`, the `.env.example` drift checker, and the
[colorBridge byte-identity sentinel](#colorbridge-byte-identity-sentinel). The
cost is paid once; the protection holds until the gate itself drifts — which is
why drift gates get their own `*.test.ts` drift gates.

### Polite-citizen contracts

The self-imposed limits that keep the live demo a good neighbor to free upstream
APIs and to crawlers: the 1-req/s Nominatim throttle, the per-endpoint and global
rate limiters in [`rateLimiter.ts`](../server/middleware/rateLimiter.ts), the
`robots.txt` disallow of `/api/`, and the on-demand (not persistent) AISStream
WebSocket. The system stays inside every free tier's good graces.

### Cron-only writer

The rule that `events:llm:v3` has exactly one writer — the daily 4am UTC
`/api/cron/refresh-events` cron — and that `/api/events` is **cache-only** (never
triggers enrichment on read). Prevents the fire-and-forget anti-pattern the
[Pitfall 1 cache bridge](#pitfall-1-cache-bridge) guards against.

### Cold-cache self-heal

The one sanctioned bypass of the cron cooldown: when `events:llm:v3` is empty,
the extraction pipeline runs immediately rather than waiting for the next
scheduled tick — so a cold deploy or a flushed cache recovers on the next cron
without operator intervention.

### CacheEntry staleness

The cache envelope shape `{ data, fetchedAt }` used by the Upstash Redis layer
([`server/cache/redis.ts`](../server/cache/redis.ts)). `fetchedAt` lets readers
compute logical staleness independently of the hard Redis TTL (set to 10× the
logical TTL), so a route can serve known-stale data while signalling its age.

---

## LLM event pipeline

### 6-path resolver

The location resolver in
[`server/lib/llmResolver.ts`](../server/lib/llmResolver.ts)
(`resolveLocation`) that tries six ordered strategies — `own-site-snapshot`,
`poi-amenity-nominatim`, `nominatim-direct`, `nominatim-verified-2pass`,
`gdelt-actiongeo-fallback`, `bellingcat-coord-passthrough` — and **never returns
a coordinate without provenance**. Throttled to 1 Nominatim request/second.

### Flight recorder

The LLM call/run observability surface (Phase 39 OBS-FLIGHT). Two Redis-backed
recorders — `llm:calls:history` (per-call, 500-cap) and `llm:runs:history`
(per-run, 200-cap) — capture what each LLM call and each extraction run did,
surfaced at `/api/events/llm-history`. Both **degrade-open** (never throw) and
survive Vercel cold starts via cold-start hydration. The "run that died" signal:
a run killed by `maxDuration` leaves only its `running` record.

### callLLM cascade

The provider-attempt loop in
[`server/adapters/llm-provider.ts`](../server/adapters/llm-provider.ts):
per-event retry budget of 2 attempts × 1s/4s exponential backoff plus ±250ms
jitter. Providers are gated on the [circuit breaker](#circuit-breaker)'s
`isAvailable` and the [token budget](#token-budget-softhard)'s `budgetState`.
Bypassed providers append a synthetic `skipReason` entry to the call history.

### Circuit breaker

[`server/lib/llmCircuitBreaker.ts`](../server/lib/llmCircuitBreaker.ts) — a
sliding 10-call window that pauses a provider for 5 minutes when its error rate
crosses 30%. Keeps a flapping provider from burning the retry budget.

### Token budget (soft/hard)

[`server/lib/llmTokenBudget.ts`](../server/lib/llmTokenBudget.ts) — per-provider
daily token caps with a **soft** threshold at 0.8 and a **hard** threshold at
0.95 of the cap, tracked in `llm:tokens:{provider}:YYYY-MM-DD` (48h TTL). At
`hard`, the provider is skipped entirely.

### DLQ (dead-letter queue)

[`server/lib/llmDLQ.ts`](../server/lib/llmDLQ.ts) — a Redis-backed bounded set
(`events:llm-dlq`, 200-entry cap, 7d TTL) holding failed extractions with their
`reason` (e.g. `timeout_watchdog`) and a `lastError` capped at 500 chars. The
forensic trail for "why didn't this event enrich".

### Watchdog generation counter

The mechanism inside
[`server/lib/llmExtractorWatchdog.ts`](../server/lib/llmExtractorWatchdog.ts)
(`withBatchWatchdog`) — a 90s hard-kill / 60s soft-warn AbortController paired
with a monotonic generation counter so a late-resolving batch from a killed
generation cannot clobber the current cache write.

### Lineage record

The per-event audit trail (`events:llm:v3:lineage:{eventId}`, 7d TTL) written by
[`server/lib/llmLineage.ts`](../server/lib/llmLineage.ts): prompt, response,
parsed result, resolved coordinate, reasoning trace, and a lineage hash. Indexed
by a capped (500-entry) sorted set with LRU eviction so any enriched event can be
traced back to the exact LLM exchange that produced it.

### Ghost event

A conflict event whose source URL has gone dead (404/403/dead-host). Phase 32
added per-event URL-liveness probing (`events:url-liveness:{eventId}`) plus a
prune flow (`POST /api/events/prune-dead-urls`) so the map doesn't accumulate
events pointing at vanished sources. An `O(1)` sidecar counter
(`events:url-liveness-count`) tracks the dead total for dashboard polls.

### Canonical actor catalog

The single source of truth for conflict-actor identity (Phase 33 ACTOR work),
used to score `actorMatchRate` in the eval harness and to keep actor labels
consistent across enrichment runs. When no ground-truth event carries an expected
actor, the eval scorer returns `null` (not a silent `0`) so a healthy pipeline
never reads as "0% actor accuracy".

### Eval harness

[`server/lib/llmEvalHarness.ts`](../server/lib/llmEvalHarness.ts) (`runEval`) —
scores resolver accuracy against 50 curated ground-truth events across 11
countries at 5/20/100 km tolerances. **Resolver-only** to avoid doubling token
spend. `runAdversarialEval` runs prompt-injection fixtures. Baselines persist in
Redis (`events:llm-eval-baseline:v3`, `events:llm-eval-adversarial:v3`, 90d).

### Parallel batches

The post-loop `Promise.all` fan-out in the v3 extractor, bounded by the FIFO
concurrency limiter in
[`server/lib/concurrencyLimit.ts`](../server/lib/concurrencyLimit.ts)
(`createLimit`). `LLM_V3_CONCURRENCY` (default 12 → ~26 req/min under NIM's 40/min
ceiling); set to `1` for fully sequential rollback.

### Tier-green gate

The production acceptance gate (`prod-connectivity-audit.yml`) that required three
consecutive exit-0 runs with `audit:connectivity:last-result.allTiersGreen ===
true` before promoting a milestone. Its history is also a cautionary tale: the
Phase 28.2.5 strict variant flagged the (correct) LLM-optional `llmEvents` tier as
a failure until PRs #32–#35 reconciled it with the
[LLM-optional architecture](#llm-optional-architecture).

---

## Map, color & domain

### colorBridge byte-identity sentinel

The test
([`src/__tests__/lib/colorBridge.test.ts`](../src/__tests__/lib/colorBridge.test.ts))
that asserts every `--color-*` CSS-var fallback default in
[`colorBridge.ts`](../src/lib/colorBridge.ts) is byte-identical to its runtime
consumer value. Makes theme drift between Tailwind utilities and deck.gl
`getColor` callbacks mechanically impossible (a [drift
gate](#mechanical-drift-gate)).

### domain.ts mirror

The rule that domain-definitional constants (`IRAN_BBOX`, `IRAN_CENTER`,
`WAR_START`, `ADSB_RADIUS_NM`) live canonically in
[`src/lib/domain.ts`](../src/lib/domain.ts) with a **byte-identical** mirror in
`server/config.ts`, enforced by `src/__tests__/domain.test.ts`. Frontend and
server agree on the world by construction, not by convention.

### capture:layers

The Playwright-driven map-state contract used by the hero-GIF capture tooling
(`npm run capture:hero`) — it programmatically flies the map and toggles named
layers via the dev-only `window.__map` exposer so the portfolio GIF regenerates
repeatably (~45s) and survives UI changes.

### Latin-label admission gate

The filter in the water-facility pipeline that admits an Overpass facility only
when it carries a machine-searchable Latin token (native name, an existing
`name:en`, or a romanized synthetic injected by `applyRomanizedName`). Keeps the
search index usable for non-Latin-script source names without mutating the
original tags.

---

## Tunable thresholds

### Severity half-life

`VITE_SEVERITY_HALF_LIFE_HOURS` (default 24) — the time-decay constant for event
severity scoring. An event's contribution to severity halves every N hours, so
older events fade without being hard-cut. One of the operator-tunable env levers
(see [`.env.example`](../.env.example)).

### Attack radius

`VITE_ATTACK_RADIUS_KM` (default 5) — the spatial radius used to cross-reference
a key site against nearby GDELT events
([`attackStatus.ts`](../src/lib/attackStatus.ts)) to flag a site as attacked.

### Proximity alert

`VITE_PROXIMITY_ALERT_KM` (default 5) — the radius that triggers a dismissible
proximity alert when a tracked flight approaches a site or water facility.

### Stale-clear

The flight-data rule that a flight position older than `VITE_STALE_FLIGHT_MS`
(default 60000) is cleared rather than rendered, so the map never shows a stale
aircraft position. Distinct from the cache's logical staleness — this one
**removes** the entity.

---

## Build meta

### `/gsd` workflow

The agentic development loop this project was built through:
CONTEXT → DISCUSSION → PLAN → EXECUTE → VERIFY. Each phase is a branch; each plan
commits atomically; each finding becomes a tracked phase, not a bundled
finishing-pass. The first-person account is in
[BUILDING-WITH-CLAUDE-CODE.md](./BUILDING-WITH-CLAUDE-CODE.md).

### Honest exhibit

A portfolio artifact that documents where the build got it **wrong** rather than
only what worked — e.g.
[ADR-0005](./adr/0005-phase-26-2-nlp-approach-scrapped.md) (the deleted NLP
pipeline) and [ADR-0010](./adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md)
(the ~6,400-line v1+v2 deletion). The highest-signal documents in the repo.

---

_Back to the [Showcase](./SHOWCASE.md) · repo front door is the
[README](../README.md)._
