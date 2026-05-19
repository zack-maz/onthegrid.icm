# Phase 32: Ghost Event URL Liveness, Dashboard & Prune - Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Probe `sourceURL` liveness for events in `events:llm:v3` out-of-band of `/api/events`, persist results to Redis with TTL under a per-event key, surface dead-URL counts + drill-down in the API Health dashboard tab, and let the operator prune dead-URL events through both a dashboard button (manual, immediate) and the daily refresh-events cron (automatic, gated on N=3 consecutive dead probes). All probing respects polite-citizen contracts (HEAD-first, jittered, per-host throttled, concurrency-bounded). Both prune paths authenticate against a single Bearer-gated `POST /api/events/prune-dead-urls` endpoint.

**Requirements covered:** GHOST-01, GHOST-02, GHOST-03, GHOST-04, GHOST-05.

**Out of scope (deferred elsewhere):**

- **Re-probing of secondary URLs in `sourceUrls`.** Only the primary URL (`data.source` for raw GDELT, `data.sourceUrls[0]` for LLM v3) is probed. Secondary URLs are not surfaced or considered for the dead-event rule — they're not what the operator clicks in EventDetail.
- **Flap tracking / status-change history.** Latest probe status wins. If a real flapping problem surfaces in operations, that becomes its own decimal phase.
- **News-cluster back-reference cleanup on prune.** Prune touches only the event entry in `events:llm:v3` and the `events:url-liveness:{eventId}` key. `llmLineage`, `callHistory`, `operator:audit-log`, and news-cluster indices stay for forensics.
- **Lazy-on-cache-miss probe path.** GHOST-01 lists it as an option; we explicitly reject it to preserve the cron-only-writer discipline (CLAUDE.md anti-pattern #17).
- **Independent probe cron entry.** Probe piggybacks on the existing 04:00 UTC `/api/cron/refresh-events`. No 4th cron added (operationally minimal even though Vercel Pro lifts the Hobby 3-cron cap).
- **Soft-delete / tombstoning.** Prune is a hard splice from the events[] array — no `pruned: true` flag, no undelete UI.
- **Bandwidth / cost dashboard for the probe sweep.** Operator visibility is via the same dead-count drill-down; no separate metrics surface.
- **Per-URL deduplication of probes (cross-event).** Per-event keying is GHOST-02's seed; we accept that two events citing the same URL each consume their own probe. Optimization deferred.

**Carrying forward (locked, not re-decided here):**

- **Cron-only writers (anti-pattern #17).** Probe and prune writers run inside `/api/cron/refresh-events`. `/api/events` stays read-only. The endpoint at `POST /api/events/prune-dead-urls` is operator-triggered (Bearer-authenticated, audit-logged) — not a fire-and-forget from the read path.
- **Bearer gate = `dashboardAuth` middleware.** Reuses the existing `DASHBOARD_PASSWORD` Bearer flow that already gates `/llm-replay` and `/llm-pipeline`. No new auth.
- **Operator-action pattern from Phase 28.2 W3.** `operator:audit-log` SADD bounded set (500 cap, 30d TTL) + per-Bearer quota counter (`operator:replay-quota:{fingerprint}:{date}`). Phase 32 mirrors this verbatim with `operator:prune-quota:*` and matches the 50-call/24h ceiling.
- **`/api/operator-status` aggregator** surfaces the Operator Actions block on the dashboard. Phase 32 prune entries flow through the existing aggregator without endpoint-shape changes.
- **`createLimit(maxConcurrent)` from `server/lib/concurrencyLimit.ts`.** The same FIFO queue primitive that bounds LLM v3 batches will bound the probe sweep.
- **Pitfall 1 cache bridge is invariant.** `server/routes/events.ts` serves raw GDELT when `events:llm:v3` is empty. Prune of LLM v3 entries does NOT affect raw GDELT availability — the map never goes blank.
- **Vercel Pro 800s `maxDuration`** is live (Phase 29 D-08). Probe runs in the budget left after `runRefreshExtraction()` resolves; partial coverage is acceptable.
- **TypeScript ~5.9.3 pinned.** `logger.child({ module: 'urlLiveness' })` for new code; never `console.*`.
- **Atomic per-decision commits.** Each D-N below is its own commit. `feat(32):` / `docs(32):` / `chore(32):` prefixes.
- **Branch-per-phase.** Planner / executor cuts `feature/32-ghost-event-url-liveness-dashboard-prune` from `main` before any code change. CONTEXT.md, DISCUSSION-LOG.md, and the checkpoint may sit on the current branch as scaffold.

</domain>

<decisions>
## Implementation Decisions

### Probe trigger model (GHOST-01)

- **D-01: Piggyback on `/api/cron/refresh-events`.** No new cron entry. No lazy-on-cache-miss path. Probe sweep runs as a post-step inside the existing 04:00 UTC daily cron handler. Preserves cron-only-writer discipline (anti-pattern #17) without growing operational cron surface.
- **D-02: Probe pass runs AFTER `runRefreshExtraction()` resolves.** Extraction always gets its full Vercel Pro 800s budget; probe sweep gets whatever remains. Extraction is the load-bearing daily run; probing is cleanup and naturally yields.
- **D-03: Best-effort partial sweep, no cursor.** If the probe pass runs out of budget mid-sweep, whatever fits gets probed; the rest waits for the next tick. Per-entry TTL ensures eventual coverage. No `events:url-liveness-cursor` carry-over key — the priority sort (D-04) is deterministic enough to converge without it.
- **D-04: Sweep priority = never-probed first, then oldest `lastProbedAt`.** Two-tier sort: events with no `events:url-liveness:{eventId}` key at all get probed first (dashboard count converges fast for new events); then re-probe by oldest `lastProbedAt` within the TTL window. Matches operator intuition ("why is this new event missing?").

### Multi-URL scoring (GHOST-01, GHOST-03)

- **D-05: Probe ONLY the primary URL per event.** `data.source` for **both** raw GDELT and LLM v3 events — the v1 template-inherited field. `enrichedV3ToEntities()` at `server/lib/llmExtractionPipeline.ts:478-501` spreads `template.data` and never writes a `sourceUrls[]` field, so v3 entries carry the primary URL at `data.source` identically to raw GDELT. Matches `src/components/detail/EventDetail.tsx:143-164` which renders exactly one URL ("View source" anchor — `d.source`) regardless of how many citations the event has. (Corrected 2026-05-19 during /gsd:plan-phase 32 research dispatch; the original D-05 wording referenced a non-existent `data.sourceUrls[0]` field — see 32-RESEARCH.md Assumption A1.)
- **D-06: Dashboard "dead-URL event" rule = primary URL has terminal non-live status.** Single number on the dashboard, single drill-down list, single prune-candidate set. No "primary dead, N backups available" hint. Keeps the operator's mental model identical to the "View source" link they already click.
- **D-07: Status taxonomy → dead-counting.** Terminal dead statuses (count toward the dashboard number, eligible for prune): `404`, `403`, `dead-host` (DNS failure / connection refused / TCP timeout). `unknown` (5xx, network blip, transient error) stays OUT of the count and gets re-probed on the next sweep until it resolves to a terminal status. `live` is live.
- **D-08: Latest probe status wins. No flap debounce.** No `attemptCount`-based gate on the dashboard count itself. (Cron auto-prune does use `attemptCount >= 3` as a safety threshold — see D-12.) The TTL-driven re-probe cadence self-corrects transient flips within one or two ticks.

### Prune mechanism (GHOST-04)

- **D-09: Single authenticated endpoint, two triggers.** `POST /api/events/prune-dead-urls` behind `dashboardAuth` middleware. Both the API Health dashboard button (operator click) and the post-probe-sweep step inside `/api/cron/refresh-events` (system trigger) call this same endpoint. One code path for the delete logic, one contract test for the response shape.
- **D-10: Dashboard button = operator-confirmed manual prune.** Renders "Prune N dead events" inside the existing Operator Actions block on the API Health tab (`src/components/ui/DevApiStatus.tsx:1481`). Clicking calls the endpoint with the operator's Bearer (already in dashboard session). No safety threshold — operator can prune anything flagged dead by D-06.
- **D-11: Cron auto-prune = unattended scheduled prune.** Inside `/api/cron/refresh-events`, after the probe sweep (D-02), the cron calls the same endpoint with system credentials (internal HTTP self-call or direct function invocation — researcher's call). Audit-logged with `bearerFingerprint: 'cron:refresh-events'` so the source is unambiguous.
- **D-12: Cron auto-prune safety threshold = `attemptCount >= 3` with terminal dead status.** Only events whose primary URL has been dead for ≥3 consecutive probe ticks are eligible for unattended deletion. Single-tick dead events stay flagged for the operator to review via the button but the cron leaves them alone. Trades ~3 days of dead-event lag for false-positive safety.
- **D-13: Delete scope = event entry + url-liveness key, nothing else.** Splice the event out of the `events[]` array in `events:llm:v3`; DEL the `events:url-liveness:{eventId}` key. Do NOT touch `llmLineage`, `callHistory`, `operator:audit-log`, news-cluster indices, or any other adjacent state — those are historical record. Smallest blast radius.
- **D-14: Audit log entry shape mirrors `/llm-replay` verbatim.** Reuse `operator:audit-log` SADD pattern. Entry: `{timestamp, bearerFingerprint, operation: 'prune-dead-urls', args: {trigger: 'manual' | 'cron'}, result: {prunedCount, prunedIds: string[]}}`. Surfaces via existing `/api/operator-status` aggregator into the dashboard's Operator Actions block — no new aggregator surface.
- **D-15: Rate limit = 50 calls / 24h per Bearer (matches `/llm-replay`).** New Redis key family `operator:prune-quota:{fingerprint}:{date}` INCR with 48h TTL. At cap, endpoint returns 429 + `Retry-After`. Cron's `cron:refresh-events` fingerprint bypasses the quota (system caller). Consistency-with-existing-pattern wins over a tighter destructive-action cap.

### Probe method + storage shape (GHOST-02, GHOST-05)

- **D-16: HEAD first, fall back to GET on 405.** HEAD is the polite-citizen default (zero body). On 405 Method Not Allowed (CDN-fronted publishers often refuse HEAD), fall back to a `GET` with `Range: bytes=0-1023` to cap the download. Matches the pattern of mainstream link-rot scanners.
- **D-17: Follow redirects up to 3 hops; terminal status wins.** 3xx responses (301/302/307/308) are followed up to 3 hops. Status at the final hop is the recorded status. >3 hops returns `unknown` (caps redirect-loop blast). Covers the typical "old URL → canonical URL → CDN URL" chain without unbounded chasing.
- **D-18: Polite-citizen knobs.** 10s per-request timeout, global concurrency = 8 (via `createLimit(8)` from `server/lib/concurrencyLimit.ts`), per-host throttle = 1 req/s (URL.hostname-keyed map analogous to the Nominatim 1 req/s contract — CLAUDE.md §LLM pipeline), ±200ms jitter on each request to prevent stampede, NO retry on transient (`unknown` simply stays unknown until next sweep tick). No env-var override surface — these are domain constants for this phase, not operator levers.
- **D-19: Per-event Redis key shape (matches GHOST-02 verbatim).** Key: `events:url-liveness:{eventId}`. Value: JSON `{status: 'live' | '404' | '403' | 'dead-host' | 'unknown', lastProbedAt: ISO8601, attemptCount: number, lastUrlProbed: string, lastHttpStatus: number | null}`. Per-event keying accepts that two events citing the same URL each consume their own probe (deferred optimization).
- **D-20: Tiered TTL by status.** `live` → 7d (re-probe weekly), terminal dead (`404`/`403`/`dead-host`) → 24h (re-confirm faster so the prune list stays current), `unknown` → 1h (re-probe soon to push toward a terminal verdict). TTL is the GC mechanism — no separate cleanup pass.
- **D-21: User-Agent header for transparency.** `IranMonitor-LinkCheck/1.0 (+https://otg-iran-monitor.vercel.app)` — identifies the probe to publishers per polite-citizen norms. Hardcoded; no env override.
- **D-22: Contract test pins the schema.** `src/__tests__/lib/urlLiveness.schema.test.ts` asserts the Redis value shape (Zod schema or hand-rolled type guard — researcher's call) AND the TTL upper bound per status enum. Mirrors the existing `snapshot-cron-watch.test.ts` / `freeClaudeRouter.test.ts` schema-pinning pattern. Schema drift fails the test on the next `vitest run` so future changes fail loudly.

### Claude's Discretion

- **Probe implementation library.** Standard library `fetch` with `AbortController` for timeout, or `undici` for finer-grained HTTP control — researcher picks based on what's already in `package.json` and what the rest of the server uses for outbound HTTP.
- **Internal cron→endpoint invocation mechanism.** D-11 needs to call `POST /api/events/prune-dead-urls` from inside the cron handler. Researcher chooses between (a) extracting the prune logic into a reusable function the cron calls directly with a system-credential pseudo-request, or (b) actual self-HTTP using the deployment's own URL + a system Bearer. Option (a) is simpler in tests; option (b) exercises the audit-log path identically to manual prunes. No strong preference.
- **Dashboard button placement and confirmation UX.** "Prune N dead events" button location inside the existing Operator Actions block, whether to show a confirmation modal before delete, what to display while the request is in-flight, and how to surface the result toast. Defer to whatever the existing `/llm-replay` operator-action UI already does for consistency.
- **`attemptCount` increment semantics.** Whether `attemptCount` resets to 0 on a live-→-dead transition or accumulates monotonically. Researcher picks based on what makes the "consecutive ticks" rule (D-12) easiest to reason about; a comment in the schema pins the chosen semantics.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements
- `.planning/ROADMAP.md` §"Phase 32: Ghost Event URL Liveness, Dashboard & Prune" — goal, depends-on, success criteria (lines 186-197)
- `.planning/REQUIREMENTS.md` §"Ghost Event Cleanup" — GHOST-01..05 normative requirement text (lines 25-31)

### Cron-only writer + Pitfall 1 contract (load-bearing for D-01, D-13)
- `CLAUDE.md` §"LLM Event Pipeline" — anti-pattern #17 (cron-only writer; never re-introduce fire-and-forget from `/api/events`)
- `CLAUDE.md` §"Serverless Cache" — active Redis keys registry; Phase 32 adds `events:url-liveness:{eventId}` + `operator:prune-quota:*`
- `server/routes/events.ts:170-215` — Pitfall 1 raw-GDELT fallback bridge (invariant; prune must not break this)
- `server/lib/llmExtractionPipeline.ts` — `runRefreshExtraction()` entry point that D-02 piggybacks on
- `docs/degradation.md` — "map never goes blank" contract

### Operator action pattern (load-bearing for D-09, D-14, D-15)
- `server/routes/events.ts:437` — existing `POST /api/events/llm-replay` Bearer-gated operator action (template for D-09's prune endpoint)
- `server/routes/operator-status.ts` — `/api/operator-status` aggregator; reads `operator:audit-log` SMEMBERS, surfaces to dashboard
- `server/middleware/dashboardAuth.ts` — Bearer-gate middleware Phase 32 reuses verbatim
- `server/middleware/rateLimit.ts` — quota pattern (D-15 mirrors `operator:replay-quota:*` shape)
- `src/components/ui/DevApiStatus.tsx:1475-1540` — Operator Actions block; D-10's button lands here

### Probe + concurrency primitives
- `server/lib/concurrencyLimit.ts` `createLimit(maxConcurrent)` — FIFO queue Phase 32 reuses for D-18's concurrency bound

### Data shape
- `server/lib/llmExtractionPipeline.ts:478-501` — `enrichedV3ToEntities()` writes the v3 entity `data` object; spreads `template.data` (which carries `source`) and never adds a `sourceUrls[]` field. This is what D-05 reads `data.source` from for v3 events.
- `server/adapters/gdelt.ts:244` — raw GDELT `source: getCol(cols, COL.SOURCEURL)` (singular) sets the template's `data.source` that both raw and v3 entities inherit.
- `src/components/detail/EventDetail.tsx:143-164` — UI "View source" anchor; canonical source-of-truth for what "primary URL" means to the operator

### Schema pinning pattern (template for D-22)
- `server/__tests__/lib/freeClaudeRouter.test.ts` — schema-pinning contract test pattern

### Architecture history (context, not load-bearing)
- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — D-08 Vercel Pro 800s `maxDuration` decision (governs D-02's probe budget)
- `.planning/phases/31-cron-stability-validation-7-day-watch/31-CONTEXT.md` — D-01 cron-tick discipline, atomic-per-decision commit convention
- `docs/architecture/llm-pipeline-reliability.md` — Nominatim 1 req/s polite-citizen analogue (template for D-18's per-host throttle)
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — broader v1.5 narrative
- `docs/runbook.md` — operator playbook surface (prune workflow likely earns a paragraph in Phase 35's docs sweep)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`server/lib/concurrencyLimit.ts` `createLimit(n)`** — FIFO queue Phase 32 reuses for D-18's 8-concurrent probe bound. Identical to how `server/lib/llmEventExtractor.v3.ts` bounds LLM v3 batches.
- **`server/middleware/dashboardAuth.ts`** — Bearer middleware D-09's `POST /api/events/prune-dead-urls` mounts behind verbatim.
- **`operator:audit-log` SADD pattern** — established Phase 28.2 W3 for `/llm-replay`; D-14 reuses entry-shape and surfacing path. Zero new aggregator code.
- **`operator:replay-quota:{fingerprint}:{date}` INCR pattern** — D-15 mirrors with `operator:prune-quota:*` family. 50-call/24h ceiling identical.
- **`/api/operator-status` aggregator** (`server/routes/operator-status.ts`) — surfaces audit-log to dashboard Operator Actions block. Phase 32 prune entries flow through without endpoint changes.
- **DevApiStatus Operator Actions block** (`src/components/ui/DevApiStatus.tsx:1475-1540`) — D-10's "Prune N dead events" button slots in alongside the existing `/llm-replay` "Copy prompt+response JSON" button.
- **EventDetail "View source" anchor** (`src/components/detail/EventDetail.tsx:152-163`) — already renders ONE URL per event. D-05's "primary URL" rule mirrors this exactly.

### Established Patterns
- **Cron-only writer discipline (anti-pattern #17).** `/api/events` stays read-only. Probe writes happen inside `/api/cron/refresh-events`; prune writes happen inside the Bearer-gated `POST /api/events/prune-dead-urls` (operator-triggered, not fire-and-forget).
- **Atomic per-decision commits.** Each D-N lands as its own commit (`feat(32):` / `docs(32):` / `chore(32):`). 22 decisions → roughly 22 commits + the close PR.
- **Branch-per-phase from `main`.** `feature/32-ghost-event-url-liveness-dashboard-prune`. CONTEXT.md may sit on current branch; code work must branch first.
- **Per-host throttle ≈ Nominatim 1 req/s** (CLAUDE.md §LLM pipeline 6-path resolver). D-18 reuses the philosophical contract.
- **Tiered Redis TTL by entry health.** Mirrors the geocode cache (30d/90d) and the news cache (15min). D-20's 7d/24h/1h tiering matches the "fresher when more important" instinct already shipped.
- **Zod `parseEnv()` fail-fast on missing env vars** (Phase 26.3+). D-21's User-Agent is hardcoded (not env-tunable) so no parse contribution.

### Integration Points
- **`/api/cron/refresh-events` handler** — wraps `runRefreshExtraction()`; D-02 appends a probe sweep step after that resolves; D-11 appends an auto-prune step after the probe sweep.
- **`events:llm:v3` payload `events[]` array** — D-13 splices entries out by ID during prune.
- **`events:url-liveness:{eventId}` Redis key family (NEW)** — written by probe sweep; DELed by prune; surfaced via dashboard count + drill-down.
- **`operator:prune-quota:{fingerprint}:{date}` Redis key family (NEW)** — INCR per prune call with 48h TTL.
- **`operator:audit-log` Redis SADD set (EXISTING)** — Phase 32 prune entries SADD into the existing set; bounded by the existing 500-entry cap.
- **`/api/operator-status` JSON response** — gains a `prune` sibling block alongside the existing `replay` block (matching shape).
- **API Health dashboard tab (`DevApiStatus.tsx`)** — gains a "Dead URL events" count + drill-down list + "Prune N dead events" button. Re-uses the existing endpoint-row + Operator Actions block render paths.

</code_context>

<specifics>
## Specific Ideas

- **"Whatever is previewed as source is dead."** The operator's instinct for the dead-event rule (D-05, D-06): probe what the user clicks. This drove the rejection of all multi-URL aggregation rules (all-dead, any-dead, majority-dead) and the rejection of the "N backup URLs" hint. Single source of truth = `EventDetail.tsx:152`'s "View source" anchor.
- **"Belt-and-suspenders on prune."** Both the dashboard button AND the scheduled cron prune (D-09 → D-12). Operator stays in control day-to-day via the button; the cron catches up on accumulated dead events if the operator goes quiet for a few days. Both authenticate against the same endpoint so the audit trail is unified.
- **"Lock all defaults" on probe knobs (D-16 → D-22).** Operator accepted the recommended HTTP method, redirect policy, polite-citizen knobs, key shape, TTL tiering, User-Agent, and contract-test placement as a bundle. Means these are not under active dispute — researcher can implement directly without further consultation, but any execution-time discovery that violates a default (e.g. `undici` not in `package.json`) needs an explicit deviation note in the commit.

</specifics>

<deferred>
## Deferred Ideas

- **Per-URL probe deduplication.** Today, two events citing the same URL each consume their own probe under `events:url-liveness:{eventId}` keying (D-19). A cross-event dedup layer keyed by `events:url-liveness-by-url:{sha256(url)}` would cut probe count for popular news URLs. Defer until probe volume becomes a measurable problem — Phase 35 (Redis registry sweep) could surface the cost if it matters.
- **Flap detection + history.** If operations surface URLs that genuinely alternate live/dead across probes (e.g. bot-blocking publishers that 403 on some egress IPs), promote to a `flapStatus + statusHistory` schema extension. Don't add the state speculatively. Possible Phase 36+ work.
- **Soft-delete / tombstoning with undelete UI.** D-13 is a hard splice. If operator ever wants "I pruned that by mistake — restore" they'd need this. Phase budget didn't cover it; operator can re-extract via `/llm-replay` on the source `groupKey` in the interim.
- **Dashboard surface for cascade-degraded probe state.** If the probe sweep itself starts erroring out (network blocked, DNS failure on our egress), operator would want a "probe pass FAILED today" banner. Today, partial-coverage degrades silently. Possibly folds into Phase 35's Redis registry / dashboard work or its own future phase.
- **Bandwidth / cost telemetry for probe sweeps.** "How many KB did we egress probing dead URLs this week?" Useful operationally, not load-bearing. Could ship in Phase 35.
- **Env-tunable probe knobs.** D-18 hardcodes timeout/concurrency/throttle. If a future incident requires emergency tuning (e.g. cut concurrency on a noisy egress IP), promote to `VITE_PROBE_*` family per the Phase 28.1 W5 D-12 operator-tunable env pattern. Not added now to avoid surface bloat for unproven knobs.

</deferred>

---

*Phase: 32-ghost-event-url-liveness-dashboard-prune*
*Context gathered: 2026-05-19*
