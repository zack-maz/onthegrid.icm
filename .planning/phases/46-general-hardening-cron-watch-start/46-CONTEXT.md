# Phase 46: General Hardening + Cron Watch Start - Context

**Gathered:** 2026-06-22
**Status:** Ready for planning
**Mode:** `--auto` (decisions auto-selected to recommended defaults — review before planning)

<domain>
## Phase Boundary

A **hardening + observability** phase that makes two already-shipped primitives — the **rate-limiter** and the **cron tick system** — operator-visible and verifiably safe, starts the **7-day cron-stability watch** as a non-blocking async observation, and **backfills Nyquist test coverage** for the Phase 39/40 degrade-open surfaces. All of it lands BEFORE the Phase 47 load test so that test's 429-count and cold-start metrics _exercise and confirm_ this hardening, making any load-test SLO failure unambiguous.

Four requirements, all additive observability/testing — **no behavior change to the rate-limiter limits, the cron schedules, or the LLM pipeline**:

- **HARD-01** — rate-limiter state operator-visible + operator-safe: verify the Bearer bypass covers all operator dashboard polls (999.1); surface tier config + recent 429 counts in the dashboard.
- **HARD-02** — cron first-tick + missed-run detection: in-app freshness check from `cron:lastTick:{name}` age vs schedule + grace, surfaced via `/api/health` (999.3); no external SaaS.
- **CRON-WATCH-01** — 7-day cron stability watch as a NON-BLOCKING, auto-reported observation; daily auto-captured results; does NOT gate milestone close; structured to avoid the v1.5 Phase 31 early-close repeat.
- **HARD-03** — Nyquist coverage backfill for Phase 39/40 surfaces: flight recorder, budget block, subtab consolidation paths, including degrade-open fault-injection tests.

**Out of scope:** changing any rate-limiter tier _limits_ (120/60/20/… are tuned and frozen), changing any cron _schedule_ (3 entries locked), any LLM pipeline / probe / prune behavior change, new dashboard _capabilities_ (filters, new tabs, new metrics beyond the named ones), the Phase 47 edge-cache `s-maxage` headers (land at Phase 47 start, not here), `npm audit fix` dependency bumps (deferred — see Deferred Ideas; NOT inside HARD-01/02/03), and prose docs (Phase 49).
</domain>

<decisions>
## Implementation Decisions

> All decisions below were **auto-selected to the recommended default** under `--auto`. They favor reusing the existing operator-status aggregator + once-daily-cron-ring idioms established in Phases 32/44/45, and add zero new endpoints, zero new crons, and zero pipeline-behavior change. Override any before/during planning.

### HARD-01 — Rate-limiter visibility & 429 tracking

- **D-01:** **Surface via the existing `/api/operator-status` aggregator → existing DevApiStatus API Health tab.** No new endpoint. This mirrors the Phase 44/45 pattern (operator sidecars read through the one Bearer-gated aggregator thread, rendered in `src/components/ui/DevApiStatus.tsx`). The new block surfaces: the per-tier limit config (read from `rateLimiters` in `server/middleware/rateLimit.ts`) and recent 429 counts (D-02).
- **D-02:** **429 counts tracked via a bounded Redis sidecar counter incremented inside the rate-limit middleware** at the point it returns 429 (`server/middleware/rateLimit.ts` ~line 105). Shape follows the existing operator-sidecar idiom (`operator:replay-quota:{…}:{YYYY-MM-DD}` INCR counters, `events:url-liveness-count` sidecar): **per-tier per-UTC-day `INCR` with a short TTL** (e.g. `ratelimit:429:{tier}:{YYYY-MM-DD}`, 48h TTL). Degrade-open — a Redis failure on the counter must NEVER turn a 429 into a 500 or block the response. The counter is incidental telemetry on an already-error path.
- **D-03:** **999.1 Bearer-bypass coverage is proven by TEST, not by a runtime change.** Add coverage asserting the `DASHBOARD_PASSWORD` Bearer bypass (the `timingSafeEqual` constant-time path in `rateLimit.ts`) is reached for **every** endpoint an operator dashboard poll hits (the `/api/operator-status` aggregator + every `/api/*` poll the dashboard fires). The existing `rateLimitPublic.test.ts` is the analog to extend. No change to the bypass logic itself unless a gap is found.

### HARD-02 — Cron first-tick & missed-run detection

- **D-04:** **Hardcode a 3-entry schedule + grace table in `server/lib/healthSources.ts`**, mirroring the existing `FRESHNESS_THRESHOLDS_MS` table. The 3 crons are known and bounded (`health 0 0 * * *`, `warm 0 12 * * *`, `refresh-events 0 4 * * *`). No `vercel.json` parsing, no external SaaS — a static table is the honest, testable source of truth. Each entry: expected interval (24h) + a grace window (planner's discretion, e.g. 2–6h) past which a missing tick is "missed".
- **D-05:** **Three-state semantics, surfaced via `/api/health` (999.3):** `unknown` (cron has not yet reached its first expected tick — current null behavior), `missed` (tick is null OR stale past `expected + grace` AFTER the first expected fire), `healthy` (tick within grace). This distinguishes "never fired yet" from "fired before but now silently stopped" — the actual missed-run signal the requirement asks for.
- **D-06:** **Extend the existing `probeCronTick` + `deriveStatus` in `server/routes/health.ts`/`healthSources.ts`** rather than adding a new probe. `probeCronTick` already reads `cron:lastTick:{name}` and computes freshness; this phase adds the schedule+grace comparison and the `missed` state on top of the existing four-state `deriveStatus` ladder.

### CRON-WATCH-01 — 7-day non-blocking watch

- **D-07:** **Daily results are auto-captured by piggybacking on the EXISTING `/api/cron/health` run** (`0 0 * * *`), persisted to a bounded dated Redis ring (the Phase 45 D-01 once-daily `LPUSH`+`LTRIM` idiom, e.g. `cron:watch:v2.0` capped at 7–14 entries) AND mirrored to a human-readable WATCH artifact in the phase directory. No new cron, no new endpoint, no manual daily step.
- **D-08:** **Early-close criteria are a LOGGED, explicit decision — never a silent repeat of v1.5 Phase 31.** The watch is **NON-BLOCKING**: milestone close proceeds regardless of watch status (roadmap-locked: "CRON-WATCH-01 is NON-BLOCKING and must not gate milestone close"). Default behavior is to **run the full 7 days, auto-reported**. Early-close is permitted ONLY by an explicit operator decision that **cites the v1.5 Phase 31 early-close precedent** (`.planning/milestones/v1.5-phases/31-cron-stability-validation-7-day-watch/`) and records the day-count + caveat in the watch artifact. The structural mechanism that prevents the silent repeat: the watch result is a captured artifact with a daily timestamp ring, so a partial close is visibly partial.
- **D-09:** **The watch starts in this phase but reports asynchronously through later phases** (per ROADMAP parallelization note). Phase 46 delivers the _structure_ (auto-capture + artifact + non-blocking framing); the 7-day clock runs in the background and does not block Phase 46 close.

### HARD-03 — Nyquist coverage backfill (Phase 39/40 surfaces)

- **D-10:** **Cover three degrade-open surfaces with unit tests, each including a fault-injection case:**
  1. **Flight recorder** — `server/lib/llmCallHistory.ts` (`appendCallHistory`, `hydrateCallHistoryIfCold`) + `server/lib/llmRunHistory.ts` (`openRunRecord`/`closeRunRecord`, the re-LPUSH-not-LSET GA-2 path, the "run that died" `running`-only signal).
  2. **Budget block** — `server/lib/llmTokenBudget.ts` (soft 0.8 / hard 0.95 thresholds, per-provider daily caps) + `src/components/ui/BudgetBlock.tsx` render states.
  3. **Subtab consolidation** — the Phase 40 `tabMerge` / consolidated-layout paths in `src/components/ui/DevApiStatus.tsx` (degrade-open when an operator sidecar field is absent).
- **D-11:** **Fault-injection style = unit tests with a mocked Redis that throws**, asserting the surface **degrades open** (never throws, returns a safe default / renders a "collecting…"/empty affordance rather than crashing). This matches the degrade-open contracts already documented for these keys (`llm:calls:history`, `llm:runs:history`, `llm:tokens:{provider}:…`). Coverage target is the _behavioral_ degrade-open paths, not line-count for its own sake.

### Claude's Discretion

- Exact Redis key names/TTLs for the 429 sidecar (D-02) and the watch ring (D-07) — follow the Phase 32/44/45 sidecar lockstep pattern (server route test + OpenAPI schema + client `opStatus` interface move in the same commit; forward-compat optional fields).
- The precise grace-window durations per cron in the D-04 schedule table.
- Exact dashboard block layout / placement for the rate-limiter and missed-run surfaces within DevApiStatus (must stay inside the existing API Health tab; behavioral tablist contract frozen per Phase 45 D-08).
- The WATCH artifact's exact filename/format (D-07) and how a missed daily capture renders in it.
- Whether the 429-count sidecar is rolling-window vs per-day, and how many days of history the watch ring retains (within the 7–14 bound).

### Reviewed Todos (not folded)

- **phase-27.4.2-ci-health.md** (score 0.6) — flipping `main` CI red→green (filter test failures, lint/audit/format). **NOT folded:** off-topic generic-keyword match; belongs to its own CI-health phase, not the rate-limiter/cron/Nyquist scope of HARD-01/02/03.
- **phase-27.4.3-deckgl-v9-type-drift.md** (score 0.6) — deck.gl v9 `depthTest` type errors. **NOT folded:** unrelated to this phase; placeholder for the real deck.gl migration phase.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase definition & requirements

- `.planning/ROADMAP.md` §"Phase 46: General Hardening + Cron Watch Start" — goal, depends-on, 4 success criteria, parallelization notes (HARD-03 parallelizable; CRON-WATCH-01 async/non-blocking).
- `.planning/REQUIREMENTS.md` — HARD-01, HARD-02, CRON-WATCH-01, HARD-03 definitions + §Traceability mapping.

### HARD-01 — rate limiter

- `server/middleware/rateLimit.ts` — `createRateLimiter`, the `rateLimiters` tier table, the 429 response path (~line 105), and the `DASHBOARD_PASSWORD` Bearer bypass (`timingSafeEqual`). Surface source + 429-counter insertion point.
- `server/index.ts` §108–121 — where `rateLimiters.public` (global pre-filter) and per-endpoint limiters are wired; the full list of `/api/*` poll endpoints an operator hits (for the 999.1 coverage proof).
- `server/routes/operator-status.ts` — the Bearer-gated aggregator that surfaces operator sidecars; where the rate-limiter block is added.
- `src/components/ui/DevApiStatus.tsx` — the API Health tab render target (behavioral tablist contract is frozen — Phase 45 D-08).
- `server/__tests__/rateLimitPublic.test.ts` + `server/middleware/__tests__/rateLimit.test.ts` — analogs to extend for the 999.1 bypass-coverage proof.

### HARD-02 — cron freshness / missed-run

- `server/routes/health.ts` §344–400 — `probeCronTick` (reads `cron:lastTick:{name}`, computes freshness) + `deriveStatus` usage; the extension point for schedule+grace + the `missed` state.
- `server/lib/healthSources.ts` §70–158 — `CRON_LASTTICK_TTL_SEC`, `FRESHNESS_THRESHOLDS_MS`, `deriveStatus` (four-state ladder). Home of the new schedule+grace table.
- `CLAUDE.md` §"Cron schedule (3 entries…)" + §"`cron:lastTick:{name}`" — the 3 cron names/schedules and the lastTick key semantics (D-03 honest-failure write ordering).

### CRON-WATCH-01 — 7-day watch

- `.planning/phases/45-dashboard-subtab-readability-redesign/45-CONTEXT.md` §D-01/D-02/D-03 — the once-daily bounded Redis ring written by the existing health cron + read via operator-status aggregator (the precedent idiom for D-07).
- `.planning/milestones/v1.5-phases/31-cron-stability-validation-7-day-watch/` — the v1.5 Phase 31 early-close precedent that D-08 must cite; structure the watch to avoid its silent early-close.
- `server/routes/cron-health.ts` — the existing `/api/cron/health` handler (`0 0 * * *`) the daily watch capture piggybacks on.

### HARD-03 — Nyquist backfill (Phase 39/40)

- `server/lib/llmCallHistory.ts`, `server/lib/llmRunHistory.ts` — flight recorder (OBS-FLIGHT-01/02); degrade-open + cold-start hydration paths.
- `server/lib/llmTokenBudget.ts` + `src/components/ui/BudgetBlock.tsx` — budget block soft/hard thresholds + render.
- `src/components/ui/FlightRecorderBlock.tsx` + `src/components/ui/DevApiStatus.tsx` — subtab consolidation / `tabMerge` paths.
- `CLAUDE.md` §"`llm:calls:history`" / §"`llm:runs:history`" / §"`llm:tokens:{provider}:…`" — the documented degrade-open contracts these tests pin.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`/api/operator-status` aggregator + DevApiStatus API Health tab** — the established single Bearer-gated read path for operator sidecars; both new surfaces (rate-limiter block, missed-run state) ride it. No new endpoint needed.
- **Operator-sidecar Redis idiom** — `operator:replay-quota:{…}:{YYYY-MM-DD}` (INCR + TTL) and `events:url-liveness-count` (O(1) sidecar) are direct templates for the 429-count counter (D-02).
- **`probeCronTick` + four-state `deriveStatus`** — already reads `cron:lastTick:{name}` and computes freshness; HARD-02 extends rather than replaces it.
- **Once-daily bounded ring written by the health cron** — Phase 45 D-01 (`LPUSH`+`LTRIM`, 30d TTL, read via operator-status) is the exact mechanism for CRON-WATCH-01's daily auto-capture.
- **Degrade-open test precedent** — existing flight-recorder/budget tests already assert never-throws behavior; HARD-03 backfills the missing fault-injection cases against the same mocked-Redis pattern.

### Established Patterns

- **No new endpoints / no new crons** — every operator surface since Phase 32 rides the existing aggregator + the existing 3 crons. This phase holds that line.
- **Sidecar lockstep** — server route test + OpenAPI schema + client interface move in one commit (Phase 44 D-04 / Phase 32 D-10 forward-compat optional fields).
- **Behavioral contract frozen, snapshots evolve** — Phase 45 D-08: tablist/roving-tabindex/operatorActions stay green; intentional visual additions regenerate snapshots deliberately.
- **Degrade-open everywhere** — telemetry counters and observability rings must never convert a normal/error path into a 500.

### Integration Points

- 429 counter `INCR` → inside `rateLimit.ts` 429 branch (~line 105).
- Rate-limiter + missed-run blocks → `server/routes/operator-status.ts` response → `DevApiStatus.tsx` API Health tab.
- Missed-run state → `probeCronTick`/`deriveStatus` → `/api/health` response.
- Daily watch capture → appended inside `server/routes/cron-health.ts` → bounded Redis ring → operator-status + WATCH artifact.

</code_context>

<specifics>
## Specific Ideas

- This hardening exists specifically to make the **Phase 47 load test unambiguous**: the 429 counter and missed-run detection are what the load test will read to confirm the rate-limiter shed load correctly and crons survived. Plan with that downstream consumer in mind.
- The CRON-WATCH-01 framing is a deliberate correction of v1.5 Phase 31's Day-1 early-close-with-caveat. The _non-blocking + auto-captured daily artifact_ structure is the mechanism that makes a partial close visibly partial rather than a silent repeat.

</specifics>

<deferred>
## Deferred Ideas

- **`npm audit fix`** — 19 pre-existing transitive-dep vulns (undici / vite / protobufjs / @redocly) flagged by the non-required `npm audit --audit-level=high` CI check. Flagged in the Phase 45 close-out memory as a "good Phase 46 HARD-\* candidate", BUT it is NOT inside the defined scope of HARD-01/02/03 (rate-limiter / cron / Nyquist). Capturing here to avoid scope creep; promote to its own dependency-hardening phase or fold explicitly with `--all` if the operator wants it in 46.
- **Phase 45 review Info findings (3, still open)** — triplicated `TrendSample` shape lacks a Zod `.strict()` drift-pin test; duplicate-label rows in the water rejection disclosure; opaque `999_999_999` magic TTL constant. Small polish items from `45-REVIEW.md`; not part of HARD-01/02/03. Fold into a cleanup pass if desired.
- **Reviewed Todos (not folded)** — see the `<decisions>` "Reviewed Todos" subsection (CI-health flip 27.4.2, deck.gl v9 drift 27.4.3); both off-topic, deferred to their own phases.

</deferred>

---

_Phase: 46-General Hardening + Cron Watch Start_
_Context gathered: 2026-06-22_
