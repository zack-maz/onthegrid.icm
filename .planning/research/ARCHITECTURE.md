# Architecture Research

**Domain:** v2.0 Final Hardening — integration mapping for 6 features bolted onto a shipped React 19 SPA + Express 5 (single Vercel function) + Upstash Redis app
**Researched:** 2026-06-09
**Confidence:** HIGH (read against the actual shipped codebase; all integration points cite real files + line ranges)

> This is a **subsequent-milestone** architecture doc. It does NOT redesign the system — the architecture is fixed and shipped through v1.6. The job here is to map each v2.0 feature onto the **existing** module graph: what is touched, what is net-new, where data flow changes, and the dependency-honoring build order.

## Standard Architecture (Existing — Fixed)

```
┌──────────────────────────────────────────────────────────────────────┐
│  BROWSER (React 19 SPA, Vite 6, Zustand 5, Deck.gl 9, MapLibre 5)     │
│  ┌────────────────┐  ┌──────────────────────┐  ┌──────────────────┐   │
│  │ Map + Layers   │  │ DevApiStatus (3538L) │  │ Detail / Tooltip │   │
│  │ WaterOverlay   │  │  WAI-ARIA tablist:   │  │ WaterFacility    │   │
│  │ Precision ring │  │  apiHealth/water/    │  │ Detail, Entity   │   │
│  └───────┬────────┘  │  sites/events        │  │ Tooltip          │   │
│          │           └──────────┬───────────┘  └──────────────────┘   │
│  Zustand stores: waterStore, flightStore, newsStore, siteStore, …     │
└──────────┼──────────────────────┼─────────────────────────────────────┘
           │  fetch /api/*         │  fetch /api/operator-status (Bearer)
┌──────────┴──────────────────────┴─────────────────────────────────────┐
│  EXPRESS 5 (createApp() → tsup bundle → api/vercel-entry.js)           │
│  Vercel Pro · Fluid Compute · maxDuration 800                          │
│  ┌──────────────────────────────────────────────────────────────┐     │
│  │ Global pre-filter: rateLimiters.public (60/min, Bearer bypass)│     │
│  │ Per-endpoint tiers: flights 120 / events 20 / water 10 …      │     │
│  └──────────────────────────────────────────────────────────────┘     │
│  routes/: flights ships events news markets sites water health         │
│           operator-status (Bearer aggregator) · cron-* (3 handlers)    │
│  lib/:  urlLiveness (probe sweep + prune) · overpass-water · llm-*      │
│         healthSources (cron lastTick) · pruneQuota · operatorAudit      │
└──────────┬─────────────────────────────────────────────────────────────┘
           │  REST (@upstash/redis)
┌──────────┴─────────────────────────────────────────────────────────────┐
│  UPSTASH REDIS — water:facilities:v3 · events:llm:v3 ·                  │
│  events:url-liveness:{id} + …-count sidecar · cron:lastTick:{name} ·    │
│  llm:calls:history · llm:runs:history · ratelimit:public / :prod        │
└─────────────────────────────────────────────────────────────────────────┘
           ▲  daily crons (Vercel): /cron/health 0:00 · /cron/warm 12:00 · /cron/refresh-events 4:00
```

### Component Responsibilities (touched by v2.0)

| Component           | File                                                           | What it owns                                                                                                                             |
| ------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Water pipeline      | `server/adapters/overpass-water.ts`                            | Overpass fetch → `applyRomanizedName` → `computeAdmissionDecision` → spatial dedup → stats; emits `WaterFacility[]` + `WaterFilterStats` |
| Water route         | `server/routes/water.ts`                                       | 3-tier serve: Redis → dev file cache → committed snapshot (`src/data/water-facilities.json`); Overpass only on explicit refresh          |
| URL liveness        | `server/lib/urlLiveness.ts`                                    | `probeUrl` → `persistLiveness` (attemptCount monotonic-with-reset) → `runProbeSweep` → `pruneDeadUrlEvents`; sidecar count               |
| Operator aggregator | `server/routes/operator-status.ts`                             | Bearer-gated read-only; `prune` / `actorQuality` / `tokenBudget` / `advEval` blocks; `buildDeadUrlSample`                                |
| Dashboard           | `src/components/ui/DevApiStatus.tsx` (3538 L)                  | All 4 subtabs + ~30 sub-blocks inlined in ONE file; `WaterFiltersSection`, `SitesFiltersSection`, `EventsFiltersSectionV3`               |
| Rate limiter        | `server/middleware/rateLimit.ts`                               | `createRateLimiter` factory; `rateLimiters.public` global + per-endpoint; D-04 Bearer bypass (global + per-endpoint)                     |
| Cron handlers       | `server/routes/{cron-health,cron-warm,refresh-events-cron}.ts` | each writes `cron:lastTick:{name}` AFTER body succeeds (honest-failure)                                                                  |
| Load harness        | `scripts/load-test.js`                                         | v1.2 (Phase 21.3) scenario-split shape, capped 100 VU                                                                                    |

## Per-Feature Integration Map

### Feature 1 — Water filter dropping entries (priority 1)

**What touches existing modules (no new components):**

- `server/adapters/overpass-water.ts` — the suspect surface is the admission + dedup chain, all in this one file:
  - `applyRomanizedName` (L241) → `computeAdmissionDecision` (L842) → spatial dedup (L1202–1212).
  - **Spatial dedup is the prime suspect.** It is O(n²) `deduped.some(... haversine < 0.05km ...)` keyed on `facilityType` only. Two genuinely-distinct facilities within 50m of the same type collapse to one. The romanization change (v1.6 WATER-LATIN-03) increased admits, raising dedup-collision probability — a plausible "intermittently drops entries" mechanism.
  - **Second suspect: `GENERIC_OSM_NAME_RE` interaction with romanization** (L207, L241–265). A romanized non-Latin name that collapses to a bare generic English word is still filtered by `hasLatinLabel`'s `isRealLatin`. "Intermittent" because it depends on the specific Arabic/Persian source string.
- `WaterFilterStats` (already instrumented — `byTypeRejections`, `byCountry`, `rejections.duplicate`) is the diagnostic surface: the `duplicate` bucket count vs raw/kept delta tells you whether dedup is the culprit.

**Data flow change:** none structural — this is a correctness fix inside the existing normalize→dedup path. If the fix is "dedup should not collapse distinct named facilities," the change is the dedup predicate (add a name/osmId distinctness guard), not a new pipeline stage.

**New:** at most a targeted vitest fixture proving the previously-dropped entry now survives. No new module.

**Regenerate path:** `scripts/refresh-water-facilities.ts` re-runs the pipeline and rewrites `src/data/water-facilities.json` snapshot. The fix must be validated by regenerating the snapshot, not just unit tests (the prod cold-start tier reads the snapshot).

### Feature 2 — Event ghost links + events subtab (priority 2)

Two **independent** sub-features under one phase:

**2a. Ghost-link prune gaps** — touches `server/lib/urlLiveness.ts`:

- **Gap A (events with no `data.source`):** `buildProbeCandidates` (L599–604) silently skips events whose `data.source` is empty/missing — they are never probed, never get a liveness key, never become prune candidates. A ghost event with a null source URL is invisible to the whole pipeline. If "dead links slipping past prune" includes source-less events, the fix is here.
- **Gap B (cron attemptCount≥3 gate):** `pruneDeadUrlEvents` cron trigger (L817) requires `attemptCount >= 3`. With a daily sweep, a dead URL needs ≥3 days of consecutive dead probes before unattended prune. The monotonic-**reset** semantics (any `unknown` resets to 0) mean a flaky host that intermittently returns 5xx (`unknown`) never accumulates 3. Plausible "slipping past" mechanism — fix may be widening the probe cadence (more than 1 sweep/day) or relaxing the reset rule for repeated dead-then-unknown patterns.
- **Gap C (SCAN-only prune scope):** `pruneDeadUrlEvents` only prunes events that have a `events:url-liveness:*` key (L790–820). Events in `events:llm:v3` with no liveness key are never evaluated — ties back to Gap A.

**2b. Events subtab missing LLM detail** — touches `src/components/ui/DevApiStatus.tsx`:

- **The rich blocks already exist but are not wired into V3.** `EventsFiltersSectionV3` (L3414–3445) renders only RoutingTrace / Latency / RateLimit / SchemaStrict / ErrorTaxonomy / CostShadow + 3 atomic cells + DrillDown. The v2 `EventsFiltersSection` (L3331) additionally mounts `WaterfallBlock`, `HistogramsBlock`, `CallLogBlock`, `BudgetBarsBlock`, `EvalScoreBlock`, `DlqBlock`, `SuspectBlock` — all of which are **already implemented functions in the same file** (L2529–2992).
- v1.6 shipped the Redis-backed flight recorder (`llm:calls:history`, `llm:runs:history`) + `FlightRecorderBlock.tsx` + `BudgetBlock.tsx`. The data exists; the V3 events subtab just doesn't surface it.

**Data flow change:** 2b is purely presentational — mount existing blocks in `EventsFiltersSectionV3` and feed them `llmStatus.*` fields already present on `LLMStatus` (callHistory, dlqRecent, evalScore, etc.). No server change. 2a is a server-side reachability fix in `urlLiveness.ts`.

**New:** possibly extract the V3 events blocks into their own component during 2b (overlaps with Feature 3). No new server module for 2a.

### Feature 3 — Dashboard subtab readability redesign (priority 3)

**Touches:** `src/components/ui/DevApiStatus.tsx` — a **3538-line monolith** with ~30 inlined sub-components and 4 subtabs (`apiHealth`/`water`/`sites`/`events`). The WAI-ARIA tablist (L801 `role="tablist"`, L887+ `role="tabpanel"`, `TabButton` L258) is the structural skeleton and is **kept** — the redesign is layout/typography/contrast within it, plus component extraction for maintainability.

**Recommended structural change:** extract the three dense panels into dedicated files:

- `src/components/ui/dashboard/WaterSubtab.tsx` (from `WaterFiltersSection` L2209)
- `src/components/ui/dashboard/SitesSubtab.tsx` (from `SitesFiltersSection` L2383)
- `src/components/ui/dashboard/EventsSubtab.tsx` (from `EventsFiltersSectionV3` + the wired-in v1.6 blocks)

This is net-new files but **moved, not new logic** — extraction de-risks the redesign (snapshot tests at `DevApiStatusConsolidatedLayout.snapshot.test.tsx` pin current render; update them as the redesign lands).

**Data flow change:** none. Pure presentation. Reads the same Zustand stores (`useWaterStore`) + `/api/operator-status` + `/api/health` already consumed.

**Style constraint:** keep the off-the-grid military aesthetic. Color tokens are governed by the D-13 single-source-of-truth (`src/styles/app.css` `@theme` + `colorBridge.ts`) — the redesign must pull from existing tokens, not add inline hex (CLAUDE.md §Color Tokens; byte-identity sentinel test enforces it).

**Hard dependency:** redesign should follow Feature 2b — extracting/restyling the events subtab while simultaneously adding the missing LLM blocks is one coherent pass. Doing 3 before 2b means re-touching the same file twice.

### Feature 4 — ~100 concurrent-user load test (priority 4)

**Touches `scripts/load-test.js` + a new CI workflow + (prerequisite) every `/api/*` route handler.**

**Critical finding — D-19 edge cache was never implemented.** The 999.5 plan (`999.5-CONTEXT.md` D-19) calls for `s-maxage` Cache-Control headers on `/api/*` so Vercel CDN absorbs reads at 300 VU. `grep` confirms **zero `Cache-Control`/`s-maxage`/`setHeader` calls in `server/routes/`**. The D-17 PASS bar includes "cache hit ratio > 90% (non-negotiable)" — without the edge layer, every VU read hits Express→Redis and the cache-hit bar is unreachable. **The edge-cache header layer (D-19) is a hard prerequisite of the load test, not an optional optimization.**

- **New `s-maxage` headers** on flights (5s) / ships (30s) / markets (60s) / events,news (900s) / sites,water (86400s) per the D-19 table. Layer sits ABOVE Redis (never replaces it; Pitfall 1 cache-bridge must still function).
- **Restructure `scripts/load-test.js`** from the current scenario-split / 100-VU-capped shape (`RAMP_STAGES` tops out at 100) to the D-20 per-VU full-browser-loop at the 50→300 VU discrete sweep (D-16).
- **New `.github/workflows/load-test.yml`** (D-15) — manual `workflow_dispatch`, NOT a cron (already at 3 Vercel crons; GH runner is not a cron slot). Must NOT trigger production cron paths.

**Data flow change:** adds the CDN edge tier in front of `/api/*`. BASE_URL already points at `otg-iran-monitor.vercel.app`.

**Hard dependency:** load test must run against the **final hardened surface** — i.e. AFTER Features 1, 2, 3, 5 land, so the numbers reflect the shipped app. Edge-cache headers (within this phase) land before the k6 restructure.

### Feature 5 — General hardening (priority 5)

Four sub-items, each touching existing modules; mostly **verification + test backfill, not net-new behavior:**

| Sub-item                               | Touches                                                                                                   | Nature                                                                                                                                                                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 999.1 rate-limiter operator block      | `server/middleware/rateLimit.ts`                                                                          | **Already folded in** via D-04 (L53–93): Bearer bypass now covers global `public` tier AND per-endpoint tiers. v2.0 work = verify + test the bypass, confirm no anonymous burst escape. Phase dir is empty `.gitkeep`.                                  |
| 999.3 cron first-tick verification     | `server/routes/{cron-health,cron-warm,refresh-events-cron}.ts`, `server/routes/health.ts` `probeCronTick` | `cron:lastTick:{name}` writers exist with honest-failure timing (write AFTER body succeeds — refresh-events L74). Verification = prove each cron's FIRST post-deploy tick writes its lastTick and `probeCronTick` reads it. Phase dir empty `.gitkeep`. |
| CRON-WATCH-01 7-day cron watch         | `server/routes/cron-health.ts` + audit artifact                                                           | The deferred v1.6 item (Phase 31 closed early at Day 1/7). Operational watch, not code — capture 7 consecutive green `prod-connectivity-audit.yml` runs / eval-drift checks.                                                                            |
| Nyquist coverage backfill Phases 39/40 | `server/__tests__/`, `src/components/ui/__tests__/`                                                       | Test-only backfill for v1.6 Phase 39 (operator visibility) + Phase 40 (dashboard polish) — sampling-cadence regression coverage. No production change.                                                                                                  |

**Data flow change:** none. This is the "prove it works + cover the gaps" phase.

### Feature 6 — Docs cleanup (priority 6)

**Touches:** `README.md`, `CLAUDE.md`, `docs/architecture/*`, `docs/adr/*`, `docs/runbook.md`, `docs/architecture/redis-keys.md` (32-key registry + mechanical drift gate), OpenAPI 3.0.3 spec. **No code.** Must run LAST so docs describe the shipped v2.0 surface (new edge-cache layer, restructured load harness, wired events subtab, water fix).

## Recommended Build Order (dependency-honoring)

```
Phase A (F1)  Water filter fix ──────────────┐  independent; regenerate snapshot
                                              │
Phase B (F2a) Ghost-link prune gaps ─────────┤  server-only; independent of F2b/F3
                                              │
Phase C (F2b) Events subtab LLM detail ──────┼──┐  wires existing blocks; feeds F3
                                              │  │
Phase D (F3)  Dashboard readability redesign ─┘  ◀┘  MUST follow F2b (same file/subtab)
                                              │
Phase E (F5)  Hardening (999.1/999.3/watch/Nyquist) ◀ verification; before load test
                                              │
Phase F (F4)  Load test  ◀──────────────────────────  edge-cache headers FIRST, then
                          k6 restructure; runs against A–E hardened surface
                                              │
Phase G (F6)  Docs cleanup  ◀───────────────────────  LAST; describes shipped v2.0
```

**Ordering rationale:**

- **F1 (water) first** — operator priority 1, fully independent, no UI/server coupling. Regenerate snapshot before anything reads it.
- **F2a (prune) before F2b (subtab)?** They're independent (server vs client). Either order; grouping under one "ghost links + events subtab" phase per PROJECT.md is fine, but **F2b must precede F3** because F2b adds blocks to `EventsFiltersSectionV3` and F3 restyles/extracts that same subtab — doing F3 first means touching the file twice.
- **F3 (redesign) before F4 (load test)** — the redesign changes `/api/operator-status` poll consumers; load-test against the final surface.
- **F5 (hardening) before F4 (load test)** — the load test's D-18 metrics (429 count validating Bearer bypass; cold-start frequency validating cron warm) directly exercise the 999.1/999.3 hardening; verify those first so a load-test failure isn't ambiguous.
- **F4 (load test) penultimate** — must run against the fully hardened surface (D-17 PASS bar is the milestone gate). Edge-cache headers (D-19) land at the START of F4 since the cache-hit bar depends on them.
- **F6 (docs) last** — per v1.6 precedent; docs describe shipped reality.

## Anti-Patterns (specific to this codebase)

### Anti-Pattern 1: Re-introducing fire-and-forget LLM extraction

**What people do:** make `/api/events` trigger extraction on read.
**Why wrong:** CLAUDE.md anti-pattern #17. `/api/events` is cache-only; the daily cron is the sole writer. Pitfall 1 bridge keeps the map populated.
**Do this instead:** leave the read path cache-only; extraction stays cron-driven.

### Anti-Pattern 2: Edge cache replacing Redis

**What people do:** add `s-maxage` and treat the CDN as the cache of record.
**Why wrong:** D-19 explicitly: edge layer lives ABOVE Redis, never replaces it. The Pitfall 1 cache-bridge fallback must still function.
**Do this instead:** add `Cache-Control` headers as a read-absorption layer; Redis remains canonical.

### Anti-Pattern 3: Inline hex in the dashboard redesign

**What people do:** hand-pick colors while restyling subtabs.
**Why wrong:** breaks the D-13 single-source-of-truth; the byte-identity sentinel test (`colorBridge.test.ts`) fails.
**Do this instead:** pull every color from the `@theme` block via `colorBridge` / Tailwind utilities.

### Anti-Pattern 4: New env-tunable surfaces in hardening

**What people do:** add `VITE_PROBE_*` / new tuning knobs while fixing prune gaps.
**Why wrong:** 999.3/Phase 32 CONTEXT: "no new env-tunable surfaces" — probe constants are domain knobs, not operator levers. D-11 keeps domain-definitional constants out of env.
**Do this instead:** change the constant in-module; promote to env only in a dedicated decimal phase if a real incident demands it.

### Anti-Pattern 5: Re-TTLing v3 cache down on prune

**What people do:** write the spliced `events:llm:v3` back with the short cooldown TTL.
**Why wrong:** `pruneDeadUrlEvents` must use `LLM_TERMINAL_TTL_SEC` (L842), not the cooldown sentinel, or the enriched cache silently expires early.
**Do this instead:** any v3 write from prune uses the terminal TTL.

## Integration Points

### Internal Boundaries

| Boundary                                               | Communication                                                | v2.0 consideration                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `urlLiveness.ts` ↔ `events:llm:v3`                     | reads `data.source` per event                                | F2a: source-less events are invisible — the prune gap lives at this boundary |
| `operator-status.ts` ↔ `urlLiveness` sidecar           | O(1) `events:url-liveness-count` + `buildDeadUrlSample` SCAN | F2/F3: dashboard reads count + sample; degrade-open contract must hold       |
| `DevApiStatus.tsx` ↔ `LLMStatus` shape                 | `llmStatus.*` fields (callHistory, dlqRecent, evalScore)     | F2b: blocks consume fields already on the type — no server change            |
| `overpass-water.ts` ↔ `water:facilities:v3` / snapshot | route serves Redis→devcache→snapshot                         | F1: fix must regenerate the snapshot, not just pass unit tests               |
| `rateLimit.ts` ↔ Bearer                                | `timingSafeEqual` bypass, global + per-endpoint              | F5/F4: D-18 429-count metric validates the bypass under load                 |
| route handlers ↔ Vercel CDN                            | **new** `Cache-Control` headers                              | F4: net-new edge tier; D-19 prerequisite                                     |

### External Services

| Service        | Pattern                                                  | v2.0 gotcha                                                   |
| -------------- | -------------------------------------------------------- | ------------------------------------------------------------- |
| Overpass API   | POST query, primary+fallback mirror, 90s timeout         | F1: only on explicit refresh; snapshot tier serves cold-start |
| Upstash Redis  | REST `@upstash/redis`; SCAN cursor is `string \| number` | F2a/F4: prune SCAN + operator-status SCAN share the cast pin  |
| Vercel CDN     | `s-maxage` edge cache                                    | F4: NEW; absorbs reads at 300 VU above Redis                  |
| GitHub Actions | k6 runner, manual dispatch                               | F4: not a cron slot; must not trigger prod cron paths         |

## Scaling Considerations

The load test (F4) IS the scaling validation. Realistic targets per 999.5 D-17:

| Scale                     | Behavior                                                                         |
| ------------------------- | -------------------------------------------------------------------------------- |
| ~100 VU (operator target) | edge cache absorbs reads; Redis only on miss + cron warm; p95<500ms expected     |
| 300 VU (PASS bar)         | cache-hit >90% non-negotiable; ~81 RPS; validates Upstash + s-maxage absorb load |
| >300 VU                   | explicitly deferred (exploratory 500-VU breakpoint run, not in PASS bar)         |

**First bottleneck without edge cache:** every VU read cascades Express→Redis; cache-hit bar fails. Fix = D-19 headers (the F4 prerequisite).
**Second bottleneck:** Vercel function cold-start frequency at ramp — validated by the warm cron + D-18 cold-start metric.

## Sources

- `server/adapters/overpass-water.ts` (water pipeline, dedup L1202) — HIGH
- `server/lib/urlLiveness.ts` (probe/prune, candidate skip L599, attemptCount gate L817) — HIGH
- `server/routes/operator-status.ts` (aggregator blocks, SCAN sample) — HIGH
- `src/components/ui/DevApiStatus.tsx` (subtab structure, EventsFiltersSectionV3 L3414 vs v2 L3331) — HIGH
- `server/middleware/rateLimit.ts` (D-04 Bearer bypass L53–93) — HIGH
- `server/routes/refresh-events-cron.ts` + `cron-*.ts` (lastTick writers) — HIGH
- `scripts/load-test.js` (v1.2 100-VU scenario-split shape) — HIGH
- `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md` (D-15..D-21 load-test + D-19 edge cache) — HIGH
- `.planning/PROJECT.md` (operator-locked v2.0 priority order) — HIGH
- `grep` confirming zero `s-maxage`/`Cache-Control` in `server/routes/` (D-19 unimplemented) — HIGH

---

_Architecture research for: v2.0 Final Hardening (subsequent-milestone integration mapping)_
_Researched: 2026-06-09_
