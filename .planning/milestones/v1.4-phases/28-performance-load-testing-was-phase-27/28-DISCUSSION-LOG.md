# Phase 28: Performance & Load Testing — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `28-CONTEXT.md` — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 28-performance-load-testing-was-phase-27
**Areas discussed:** Phase shape & scope split, Dev → prod feature promotion, Hardcode tolerance & generalization, Load test methodology & success bar

---

## Phase Shape & Scope Split

### Q1: How should Phase 28 be structured?

| Option                                 | Description                                                                              | Selected |
| -------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Split 28.1 / 28.2 / 28.3 (Recommended) | Three child phases, each merges to main before next starts. Best blast-radius isolation. | ✓        |
| Split into 2: cleanup vs perf          | Half the ceremony but bundles cleanup risk together.                                     |          |
| One mega-phase 28 with internal waves  | Single CONTEXT/PLAN/SUMMARY with wave gates. Bisect across 30+ commits is rougher.       |          |
| Mega-phase with cleanup deferred       | Keeps ROADMAP scope; defers cleanup to v1.5 hardening.                                   |          |

**User's choice:** Split 28.1 / 28.2 / 28.3.
**Notes:** Cleanup, sync, and load test have heterogeneous risk profiles — splitting makes regression bisects tractable.

### Q2: What order should 28.1 / 28.2 / 28.3 ship in?

| Option                              | Description                                                                                       | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| Cleanup → sync → load (Recommended) | Cleanup first kills regression risk; sync polishes prod surface; load tests against cleaner code. | ✓        |
| Sync → cleanup → load               | Prod target shape first, then cleanup against it.                                                 |          |
| Load first, then cleanup, then sync | Capture baseline, then iterate. Risks load-testing code we'll delete.                             |          |
| Parallel where possible             | 28.1 + 28.2 on parallel branches. Fastest wall-clock, hardest to bisect.                          |          |

**User's choice:** Cleanup → sync → load.

### Q3: Where does the domain rename land?

| Option                  | Description                                                                    | Selected |
| ----------------------- | ------------------------------------------------------------------------------ | -------- |
| 28.2 sync (Recommended) | Bundled with dev/prod sync — one prod-cutover commit train.                    | ✓        |
| Earliest — pre-phase    | Decouples from 28.x risk. Adds an extra commit train to main.                  |          |
| 28.3 load               | New domain debuts with optimized perf. Risks 28.1/28.2 missing string updates. |          |

**User's choice:** 28.2 sync.

---

## Dev → Prod Feature Promotion

### Q1: Default policy for dev-only debug fields?

| Option                              | Description                                                                    | Selected |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------- |
| Bearer-gated graduate (Recommended) | All dev fields graduate behind `shouldRenderDashboard()`. One consistent gate. |          |
| Stay dev-only forever               | Debug fields are noise even to authenticated operators.                        |          |
| Per-field opt-in                    | Each field individually decided. More nuanced.                                 | ✓        |

**User's choice:** Per-field opt-in.

### Q2: Operator-control endpoints (`/llm-replay`, `/llm-pipeline`)?

| Option                                         | Description                                                                          | Selected |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| Bearer-gated graduate (Recommended)            | Both endpoints become Bearer-gated. Replaces "curl with CRON_SECRET" as ops surface. | ✓        |
| /llm-pipeline graduates, /llm-replay stays dev | Mixed — replay is conservative dev-only.                                             |          |
| Both stay dev-only                             | Maximum safety, slowest incident response.                                           |          |
| Both fully public                              | Skip auth ceremony. NOT recommended for `/llm-pipeline` POST.                        |          |

**User's choice:** Bearer-gated graduate (both).

### Q3: Rate limiter Phase 999.1 — fold into 28.2?

| Option                                       | Description                                                                  | Selected |
| -------------------------------------------- | ---------------------------------------------------------------------------- | -------- |
| Fold into 28.2 (Recommended) — Bearer-bypass | When operator has Bearer, skip global tier; per-endpoint limits still apply. | ✓        |
| Bump global tier to 300/min                  | Cheap fix; doesn't address operator-rate-limits-themselves principle.        |          |
| Remove global tier entirely                  | Per-endpoint limits already tuned. Trades anti-scraper for clarity.          |          |
| Keep as Phase 999.1 backlog                  | Risks load test 28.3 hitting rate limiter as phantom regression.             |          |

**User's choice:** Fold into 28.2 (Bearer-bypass option).

### Q4: Per-field graduation list (multi-select)?

| Option                             | Description                                                           | Selected |
| ---------------------------------- | --------------------------------------------------------------------- | -------- |
| Event ID + OSM ID values           | Raw entity IDs. Useful for cross-referencing logs.                    | ✓        |
| LLM confidence + provenance fields | Useful for operator triage of suspect events.                         | ✓        |
| Water facility notabilityScore     | Internal admission filter score; lower value-per-noise.               |          |
| NotificationCard severity score    | Memory note explicitly said keep dev-only — graduating reverses that. |          |

**User's choice:** Event ID + OSM ID, LLM confidence + provenance.

### Q5: EntityTooltip dev info + MapDevExposer?

| Option                                     | Description                                                                           | Selected |
| ------------------------------------------ | ------------------------------------------------------------------------------------- | -------- |
| Stay dev-only (Recommended)                | Testing primitives, not operator surfaces.                                            |          |
| Graduate behind Bearer                     | Consistent with all-graduate policy. Maximum power, maximum footgun.                  |          |
| Tooltip graduates, MapDevExposer stays dev | Split: tooltip raw-data is harmless; window.\_\_map programmatic handle is dangerous. | ✓        |

**User's choice:** Tooltip graduates, MapDevExposer stays dev.

---

## Hardcode Tolerance & Generalization

### Q1: Rule of thumb for promoting hardcoded values?

| Option                                  | Description                                            | Selected |
| --------------------------------------- | ------------------------------------------------------ | -------- |
| Incident-response only (Recommended)    | Promote ONLY for tuning iteration / incident response. |          |
| Aggressive: anything operator-tunable   | Maximum flexibility, biggest config surface.           | ✓        |
| Conservative: status quo plus one round | No new env vars; just normalize existing ones.         |          |
| Calculated, not configured              | Derive from runtime where possible.                    |          |

**User's choice:** Aggressive (anything operator-tunable).

### Q2: Geographic constants (IRAN_BBOX, IRAN_CENTER, ADS-B radius, WAR_START)?

| Option                                        | Description                                                        | Selected |
| --------------------------------------------- | ------------------------------------------------------------------ | -------- |
| Stay hardcoded, centralize file (Recommended) | Move to `src/lib/domain.ts`. Definitional, not operational.        | ✓        |
| Env-tunable for portability                   | Sets up Ukraine/Yemen variants. Significantly more complex.        |          |
| Calculated from data                          | Derive bbox from data union. Risks shrinking on sparse boundaries. |          |

**User's choice:** Stay hardcoded, centralize file.

### Q3: Polling intervals + thresholds?

| Option                                           | Description                                                        | Selected |
| ------------------------------------------------ | ------------------------------------------------------------------ | -------- |
| Centralized constants file, no env (Recommended) | `src/lib/timing.ts` + `src/lib/thresholds.ts`. No env.             |          |
| Env-tunable for tuning iteration                 | A/B in prod via env override. More config surface to keep in sync. | ✓        |
| Derive where possible                            | stale = pollInterval × 12; only leaf inputs are constants.         |          |

**User's choice:** Env-tunable for tuning iteration.

### Q4: Visual constants (colors, icon sizes, z-index)?

| Option                                                | Description                                                          | Selected |
| ----------------------------------------------------- | -------------------------------------------------------------------- | -------- |
| CSS custom properties + Tailwind @theme (Recommended) | Z-index precedent extended to colors. Single visual-identity source. | ✓        |
| Centralize TS constants only                          | Simpler, no CSS-vs-TS split. Loses Tailwind class shortcut.          |          |
| Env-tunable like operational tunables                 | Operator rebrand via env. Probably overkill.                         |          |

**User's choice:** CSS custom properties + Tailwind @theme.

### Q5: Ghost code / duplicate code methodology?

| Option                                             | Description                                     | Selected |
| -------------------------------------------------- | ----------------------------------------------- | -------- |
| knip + ts-prune scan + manual triage (Recommended) | Tools + triage doc + atomic per-module deletes. |          |
| Manual codebase walk only                          | No tooling. Slow and fallible at this size.     |          |
| Both: knip first, then manual sweep                | Most thorough, slowest. Doubles 28.1 runtime.   | ✓        |
| Defer ghost-code work to a later phase             | Keeps 28.1 to dup/normalization/UI/debug.       |          |

**User's choice:** Both — knip first, then manual sweep.

---

## Load Test Methodology & Success Bar

### Q1: Where does k6 run from?

| Option                              | Description                                                              | Selected |
| ----------------------------------- | ------------------------------------------------------------------------ | -------- |
| GitHub Actions runner (Recommended) | Reproducible, free, PR artifacts, easy to gate phase close on green run. | ✓        |
| Local laptop / dev machine          | Fastest iteration, non-reproducible across runs.                         |          |
| VPS (DigitalOcean / Hetzner)        | Real geographic region. ~$10/mo, infra mgmt overhead.                    |          |
| Vercel Sandbox                      | Same-network as target. Beta product.                                    |          |

**User's choice:** GitHub Actions runner.

### Q2: Sweep shape — how should the test ramp through 1 → 300 VU?

| Option                           | Description                                                 | Selected |
| -------------------------------- | ----------------------------------------------------------- | -------- |
| Discrete tier runs (Recommended) | Six runs at 50/100/150/200/250/300 VU × 5min steady.        | ✓        |
| Continuous ramp 0 → 300          | One 15-min run. No steady-state data.                       |          |
| Steady at target (300 VU only)   | One 10-min run at 300. Doesn't characterize 1-299 envelope. |          |
| Discrete plus stress beyond 300  | Plus 500 VU stress run. Most data, longest runtime.         |          |

**User's choice:** Discrete tier runs.

### Q3: Success bar at the target?

| Option                             | Description                                                        | Selected |
| ---------------------------------- | ------------------------------------------------------------------ | -------- |
| Latency + error rate (Recommended) | p95<500 hot, p99<1500, error<1%, no 5xx.                           |          |
| Latency + error + cache hit rate   | Adds cache_hit > 90%. Validates Upstash + s-maxage. Stricter.      | ✓        |
| Match current production baseline  | 300-VU latency within 2x of 1-VU baseline. More work, more honest. |          |
| Pass = doesn't crash               | Loose bar. Suitable for "know we don't fall over".                 |          |

**User's choice:** Latency + error + cache hit rate.

### Q4: What gets measured beyond PASS/FAIL (multi-select)?

| Option                               | Description                                                       | Selected |
| ------------------------------------ | ----------------------------------------------------------------- | -------- |
| Per-endpoint latency breakdown       | p50/p95/p99 per endpoint. Required for finding slow endpoint.     | ✓        |
| Rate-limit hit count                 | 429 responses. Validates D-04 Bearer-bypass landed.               | ✓        |
| Vercel function cold-start frequency | First-request-per-VU latency. Validates warm-up cron sufficiency. | ✓        |
| Upstash Redis cache hit ratio        | From Upstash dashboard during run, attached to artifact.          | ✓        |

**User's choice:** All four.

### Q5: Redis read-load strategy at 300 VU?

| Option                                    | Description                                                             | Selected |
| ----------------------------------------- | ----------------------------------------------------------------------- | -------- |
| Edge cache + Redis fallback (Recommended) | s-maxage CDN headers per endpoint. Vercel CDN absorbs ~95%.             | ✓        |
| Redis primary, validate read scaling      | Honest measurement. If Upstash chokes, fix is the edge cache anyway.    |          |
| Hybrid: edge for hot, Redis for cold      | s-maxage on flights + ships only. Smaller change.                       |          |
| Skip — measure first                      | Defer architecture decision until we have data. Risks 28.3 second pass. |          |

**User's choice:** Edge cache + Redis fallback.

### Q6: Polling parity — full browser loop per VU vs scenario-split?

| Option                                 | Description                                                     | Selected |
| -------------------------------------- | --------------------------------------------------------------- | -------- |
| Full browser loop per VU (Recommended) | Each VU runs all pollers. Mirrors real user. ~81 RPS at 300 VU. | ✓        |
| Keep scenario-split (Phase 21.3 shape) | Each scenario hammers one endpoint with own VU pool.            |          |
| Both — separate test runs              | Most thorough, more ops time.                                   |          |

**User's choice:** Full browser loop per VU.

---

## Claude's Discretion

- Old-domain redirect strategy (hard cutover vs. permanent redirect).
- Specific UI bug enumeration during 28.1 PLAN drafting.
- Specific normalization scope (TS strict tightening, Zustand selector audit, Redis cache key naming).
- Knip + ts-prune triage doc format and atomic-commit cadence.
- Exact env-var naming conventions.
- Exact CSS custom property naming.
- Whether `/api/sources` deserves D-19 edge cache.
- k6 reporter artifact format (HTML vs JSON vs both).

## Deferred Ideas

- Stress test beyond 300 VU.
- Continuous weekly k6 baseline tracking.
- VPS / Vercel Sandbox runner alternatives.
- Per-field opt-in extension to FUTURE debug fields.
- Component-organization phase for `react-refresh/only-export-components` warnings.
- `react-hooks/exhaustive-deps` cleanup.
- Build Output API migration for `api/vercel-entry.js` (Phase 999.2).
- Cron first-tick verification (Phase 999.3).
- Romanization of non-Latin water names (Phase 27.3.3).
