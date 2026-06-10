# Feature Research

**Domain:** Operational hardening for a shipped real-time OSINT dashboard (Express-on-Vercel + Upstash Redis) — status/health UI, dead-link detection, load testing, serverless hardening
**Researched:** 2026-06-09
**Confidence:** MEDIUM (well-established engineering conventions cross-checked across multiple independent sources; provider = websearch, no curated-doc tier hit)

> Scope note: This is a **subsequent milestone (v2.0 Final Hardening)** on an already-shipped app. "Table stakes / differentiator / anti-feature" below are framed relative to _operational maturity for an internal/operator tool_, not relative to a greenfield product. Most "table stakes" rows are partially built already — the gap is finishing/hardening them, and dependencies on existing surfaces are called out explicitly.

---

## Feature Landscape

### Table Stakes (Operators Expect These)

Conventions a credible production-hardening pass is expected to satisfy. Their absence reads as "unfinished," not "minimal."

| Feature                                                        | Why Expected                                                                                                                                                                                                                             | Complexity | Notes                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Soft-404 detection in the URL-liveness probe**               | Status-code-only classification misses 200-with-"not-found"-body pages; soft-404s are estimated >25% of all dead links. This is the literal root cause of "ghost links still slipping past prune."                                       | MEDIUM     | Current `server/lib/urlLiveness.ts` classifies on HTTP code only (`live/404/403/dead-host/unknown`). Needs a body-heuristic pass on 200 responses (title/body markers, redirect-to-home, near-empty content). Already HEAD-then-GET-on-405 — good. Dependency: extends existing probe + `events:url-liveness:{id}` schema (may add a `soft-404` status or a reason field; touches the pinned schema test).       |
| **Distinct error buckets, not a binary dead flag**             | Operators need to tell "404 (gone)" from "403 (blocked)" from "timeout/DNS (transient)" to avoid pruning live-but-flaky links.                                                                                                           | LOW        | Already bucketed (`404/403/dead-host/unknown`). Gap is mostly making the buckets legible in the events subtab + ensuring `unknown` (5xx/timeout) is NOT counted toward terminal-dead prune (verify `isTerminalDead` excludes `unknown`).                                                                                                                                                                         |
| **Expected vs unexpected dead-link distinction**               | A 404 on a known-broken external source is routine; a 404 on a previously-live URL signals content removal and is the actionable signal.                                                                                                 | LOW        | `attemptCount` (monotonic-with-reset) already encodes some of this. Surface "first seen dead at" / transition timestamp in the subtab.                                                                                                                                                                                                                                                                           |
| **Pipeline-health detail in the events subtab**                | An operations tool's events tab should answer "is the LLM pipeline healthy right now AND over the last N runs?" — live stage + last-run outcome + failure surfaces (DLQ depth, eval drift, breaker state).                               | MEDIUM     | `LLMPipelineSection` shows _live_ stage + last-run summary only. Missing: DLQ depth, circuit-breaker state, token-budget proximity, eval baseline/drift, run-history. Most data already exists in Redis (`events:llm-dlq`, `llm:runs:history`, `events:llm-eval-baseline:v3`, `tokenBudget` on `/api/operator-status`) and in `FlightRecorderBlock`/`BudgetBlock` — this is surfacing/wiring, not new pipelines. |
| **Readable dense tables (monospace + right-aligned numerics)** | Numeric columns are only scannable when right-aligned with tabular/monospace figures (keeps decimals aligned; prevents `1,111.11` rendering narrower than `999.99`). This is the concrete fix for "unreadable subtabs / raw data dumps." | LOW        | Pure CSS/layout. Tailwind v4 `@theme` already in place. Apply `font-variant-numeric: tabular-nums`, right-align numeric cells, add column headers + whitespace grouping. No data changes.                                                                                                                                                                                                                        |
| **Visual hierarchy + grouping + progressive disclosure**       | Dense operator UIs need a primary metric per block (large/bold), labels small, related rows grouped with whitespace, and detail behind drill-down rather than dumped inline.                                                             | LOW–MEDIUM | Redesign of water/events/sites subtabs. Keep existing drill-down pattern (`FlightRecorderBlock` run→call→detail is the model to mirror). Aesthetic constraint: preserve off-the-grid/terminal military look.                                                                                                                                                                                                     |
| **Codified SLO thresholds in the load test (CI-failing)**      | A load test without `thresholds` that exit non-zero is a demo, not a gate. p95 < SLO and error-rate < budget must be assertions, not eyeballed graphs.                                                                                   | LOW        | `scripts/load-test.js` already ramps 0→100 VUs. Gap: add/verify `thresholds` block (`http_req_duration: p(95)<...`, `http_req_failed: rate<...`) so the run fails CI on regression. Pick per-endpoint SLOs (cache-only endpoints faster than cold-start/LLM paths).                                                                                                                                              |
| **~100-VU sustained-load scenario with reported percentiles**  | The named ask. A credible run holds ~100 VUs for a sustained window and reports p95/p99/error-rate per endpoint, not just a peak number.                                                                                                 | LOW        | Harness already holds 100 VUs for 120s. Formalize: define the target endpoint mix, record p95/p99/error-rate, and assert. Distinguish cold-start tail (Fluid Compute) from warm p95.                                                                                                                                                                                                                             |
| **Cron first-tick / missed-run verification**                  | A scheduled job that silently never fires is the classic serverless failure. Heartbeat stays "pending" until first check-in; alert on missed-run-by-X-min.                                                                               | LOW–MEDIUM | `cron:lastTick:{name}` already written by all 3 crons (`refresh-events` writes only after extraction resolves — honest semantics). Gap (999.3 + CRON-WATCH-01): verify each cron's _first_ tick lands post-deploy, and add a freshness/missed-run check (lastTick age vs schedule + grace) surfaced in health.                                                                                                   |
| **Rate-limiter operator/observability block**                  | Operators need to see limiter state (which tiers, current 429 rate, Bearer-bypass active) to confirm the limiter isn't silently blocking dashboard polls or letting abuse through.                                                       | LOW        | `server/middleware/rateLimiter.ts` exists (public 60/min + per-endpoint tiers + Bearer bypass). 999.1 = a public-global operator block (surface tier config + recent 429 counts). Monitoring sustained-429 is the documented convention.                                                                                                                                                                         |
| **Test-coverage backfill for recently-added surfaces**         | Phases 39/40 added observability/UI surfaces; production-hardening convention is to backfill coverage on the new code paths before declaring done.                                                                                       | MEDIUM     | "Nyquist coverage backfill" for Phases 39/40. Mechanical but broad; degrade-open paths (flight recorder, budget block) especially need fault-injection tests.                                                                                                                                                                                                                                                    |
| **Docs reconciliation after fixes land**                       | Convention: docs cleanup is the _last_ step, after behavior changes, so it reflects shipped reality (CLAUDE.md Redis registry, redis-keys.md, OpenAPI, runbook).                                                                         | LOW–MEDIUM | Schema/key changes from soft-404 work and subtab redesign will drift the 32-key registry + drift gate. Run after the above.                                                                                                                                                                                                                                                                                      |

### Differentiators (Beyond Baseline Hardening)

Features that elevate this from "patched" to "operationally excellent" and align with the project's _numbers-over-narratives_ core value. Not strictly required to close the milestone.

| Feature                                                            | Value Proposition                                                                                                                                        | Complexity | Notes                                                                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Soft-404 confidence + sample evidence in the subtab**            | Don't just flag a soft-404 — show _why_ (matched marker / redirect target / body length) so the operator trusts the auto-prune. Numbers over narratives. | MEDIUM     | Store a short `reason`/evidence string in `events:url-liveness:{id}`. Mirrors existing lineage/provenance philosophy ("never returns a coord without provenance"). |
| **Per-endpoint SLO table baked into the load report**              | A small table (endpoint → p95/p99/error-rate → pass/fail vs SLO) is far more actionable than a raw k6 summary, and doubles as portfolio evidence.        | LOW        | k6 `handleSummary` can emit JSON/markdown. Cheap, high-signal.                                                                                                     |
| **Sparkline/trend for cron freshness + dead-link count over time** | Trend (lastTick age, dead-URL count) catches slow-burn regression (the Phase 31 slow-burn that reopened in v1.6) better than a point-in-time number.     | MEDIUM     | `events:url-liveness-count` sidecar already O(1). A small history ring + sparkline in the subtab. Sparklines are an established dense-dashboard pattern.           |
| **Soak run to catch leaks/breaker-stuck states**                   | A short soak (0.8× peak, sustained) on the cache-only endpoints catches Redis connection churn / memory creep that a 5-min ramp won't.                   | LOW–MEDIUM | Harness already has a `constant-vus` 5m scenario. Extend window if validating the 7-day-watch story.                                                               |
| **Status-page-style "all systems" rollup**                         | One honest top-line (green/degraded/down) computed from the existing tier truth-table, so the operator gets a glance-level answer.                       | LOW        | Reuse `audit:connectivity:last-result` tier logic; render as a single rollup badge atop the dashboard.                                                             |

### Anti-Features (Tempting, Avoid)

| Feature                                                              | Why Requested                                     | Why Problematic                                                                                                                                                                          | Alternative                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Real-time/continuous URL re-probing**                              | "Catch dead links instantly."                     | N URLs × frequent probes burns the polite-citizen budget (per-host 1 req/s + 8-concurrency), risks getting the prober IP-blocked, and adds soft-404 false-positives under transient 5xx. | Keep the tiered-TTL cron sweep (live 7d / dead 24h / unknown 1h). Only tighten the soft-404 _heuristic_, not the cadence.                                |
| **Aggressive auto-prune on first dead probe**                        | "Ghost links are slipping through, prune harder." | First-probe-prune deletes live-but-flaky links on a transient timeout/5xx/403-cloak. The `attemptCount >= 3` gate exists for exactly this reason.                                        | Keep the ≥3-attempt gate; fix _classification_ (soft-404) instead of lowering the gate. Transient buckets (`unknown`) must never count toward prune.     |
| **External cron-monitor SaaS (Healthchecks.io / Dead Man's Snitch)** | Turnkey heartbeat + alerting.                     | Adds a third-party dependency + secret + egress for a single-operator tool that already has Redis `cron:lastTick` + a health endpoint. Over-engineering for scope.                       | Compute first-tick/missed-run in-app from `cron:lastTick:{name}` age vs schedule; surface in `/api/health`. (Note the pattern, don't import the vendor.) |
| **Push/email/desktop alerting on cron miss**                         | "Tell me when a cron fails."                      | Out of scope per PROJECT.md (operator monitors actively, single user, no notifications). Builds notification infra for one person.                                                       | Surface freshness/missed-run state in the dashboard; operator reads it on visit.                                                                         |
| **Big k6 numbers (501 VUs again) as the headline**                   | "Bigger load proves robustness."                  | The v1.2 501-VU run already exists; re-chasing peak VU count doesn't validate the _~100-user SLO_ the milestone actually asks for, and stresses free-tier upstream APIs.                 | Assert ~100-VU SLOs (p95/error-rate) that fail CI. Capacity ceiling is a separate stress concern, not the goal here.                                     |
| **Full design-system rewrite of the dashboard**                      | "Make it readable" → "redesign everything."       | Scope creep; risks regressing the WAI-ARIA tablist + existing drill-down wiring from v1.6. Aesthetic must stay off-the-grid/military.                                                    | Targeted typography/alignment/grouping pass on the 3 named subtabs (water/events/sites), reusing the `FlightRecorderBlock` drill-down pattern.           |
| **Soft-404 via headless-browser rendering**                          | "Detect JS-rendered not-found pages perfectly."   | Headless browser per URL is heavy, slow, and impossible within serverless probe budgets.                                                                                                 | Heuristic on the fetched HTML body (markers, redirect target, content length) — good-enough at OSINT scale.                                              |

---

## Feature Dependencies

```
Soft-404 detection (probe body heuristic)
    └──requires──> existing URL-liveness probe + events:url-liveness schema (Phase 32)
    └──may-alter──> events:url-liveness:{id} schema  ──requires──> schema-drift test + Redis registry update (docs)

Auto-prune correctness
    └──requires──> Soft-404 detection (classify before prune)
    └──requires──> attemptCount >= 3 gate (existing) + unknown-bucket-excluded-from-prune

Events subtab pipeline detail
    └──reads──> events:llm-dlq, llm:runs:history, eval-baseline:v3, tokenBudget (all existing)
    └──enhances──> Dashboard subtab readability pass (shared typography/grouping work)

Dashboard subtab readability (water/events/sites)
    └──requires──> Water filter fix (water subtab should show correct facility counts first)
    └──reuses──> FlightRecorderBlock drill-down pattern (v1.6)

Load test ~100-VU SLOs
    └──requires──> scripts/load-test.js (existing 0→100 ramp)
    └──independent of──> all data-quality fixes (can run in parallel)

Cron first-tick + 7-day watch (999.3 / CRON-WATCH-01)
    └──reads──> cron:lastTick:{name} (existing writers)
    └──independent of──> dashboard/data fixes

Rate-limiter operator block (999.1)
    └──reads──> rateLimiter middleware state (existing)
    └──enhances──> Dashboard readability pass (another operator block)

Test-coverage backfill (Phases 39/40)  ──independent, can run anytime──
Docs cleanup  ──MUST run last──> after schema/key/UI changes settle
```

### Dependency Notes

- **Soft-404 → auto-prune correctness:** The ghost-link bug is a _classification_ defect, not a _prune-cadence_ defect. Fixing the probe's soft-404 heuristic is the prerequisite for prune to do the right thing. Lowering the attempt gate without fixing classification trades false-negatives for false-positives.
- **Water filter fix → water subtab readability:** Redesigning the water subtab on top of a layer that intermittently drops entries means redesigning around wrong numbers. Fix the admission/Latin-label/desal-synthesis drop first, then make the (now-correct) data readable. (PROJECT.md locks this priority order anyway: water filter is item #1.)
- **Events subtab detail ⟂ readability pass:** They share the typography/grouping work but the _data wiring_ (DLQ/run-history/eval) is independent — wiring can land before or after the visual pass.
- **Docs cleanup runs last:** Soft-404 schema changes + any new Redis fields will drift the 32-key registry and the OpenAPI spec; reconciling docs before the schema settles guarantees rework.
- **Load test + cron watch + rate-limiter block are parallelizable** with the data/UI fixes — no shared surfaces.

---

## MVP Definition

> "MVP" here = the minimum to **close v2.0 Final Hardening credibly**, in the operator-locked priority order from PROJECT.md.

### Launch With (closes the milestone)

- [ ] **Water filter fix** — facilities layer must stop dropping entries (admission gate / Latin-label gate / desal-synthesis path). Item #1; unblocks water-subtab redesign.
- [ ] **Soft-404 detection + prune correctness** — body heuristic on 200 responses; `unknown` bucket excluded from prune; ≥3-attempt gate retained. Closes the ghost-link bug.
- [ ] **Events subtab pipeline detail** — surface DLQ depth, breaker state, eval baseline/drift, run-history from existing Redis keys.
- [ ] **3-subtab readability pass** (water/events/sites) — tabular-nums, right-aligned numerics, grouping, progressive disclosure; off-the-grid aesthetic preserved.
- [ ] **~100-VU load test with CI-failing SLO thresholds** — p95 + error-rate assertions per endpoint; report percentiles.
- [ ] **Cron first-tick verification** (999.3) + **CRON-WATCH-01 7-day watch** — missed-run/freshness check from `cron:lastTick`.
- [ ] **Rate-limiter operator block** (999.1) — surface tier config + 429 state.
- [ ] **Phases 39/40 coverage backfill** — Nyquist coverage on new observability/UI code, incl. degrade-open fault paths.
- [ ] **Docs cleanup** — reconcile CLAUDE.md registry, redis-keys.md, OpenAPI, runbook after the above. (Last.)

### Add After Validation (defer if time-boxed)

- [ ] **Soft-404 evidence/confidence string** — show _why_ a link was flagged, surfaced in the subtab.
- [ ] **Per-endpoint SLO table in the k6 summary** — `handleSummary` markdown/JSON output.
- [ ] **Dead-link-count / cron-freshness sparkline** — trend, not point-in-time (catches slow-burn).

### Future Consideration (out of scope for v2.0)

- [ ] **Stress/capacity-ceiling test (3×+ peak)** — find the subsystem ceiling. Separate concern from the ~100-user SLO ask.
- [ ] **Status-page "all systems" rollup badge** — nice glance-level summary; not required to close.
- [ ] **External cron-monitor SaaS / push alerting** — explicitly anti-feature for this single-operator tool.

---

## Feature Prioritization Matrix

| Feature                                | Operator Value | Implementation Cost | Priority  |
| -------------------------------------- | -------------- | ------------------- | --------- |
| Water filter fix                       | HIGH           | MEDIUM              | P1        |
| Soft-404 detection + prune correctness | HIGH           | MEDIUM              | P1        |
| Events subtab pipeline detail          | HIGH           | MEDIUM              | P1        |
| 3-subtab readability pass              | HIGH           | LOW–MEDIUM          | P1        |
| ~100-VU load test w/ CI-failing SLOs   | MEDIUM         | LOW                 | P1        |
| Cron first-tick + 7-day watch          | MEDIUM         | LOW–MEDIUM          | P1        |
| Rate-limiter operator block            | MEDIUM         | LOW                 | P2        |
| Phases 39/40 coverage backfill         | MEDIUM         | MEDIUM              | P2        |
| Docs cleanup                           | MEDIUM         | LOW–MEDIUM          | P2 (last) |
| Soft-404 evidence string               | MEDIUM         | MEDIUM              | P3        |
| Per-endpoint SLO summary table         | MEDIUM         | LOW                 | P3        |
| Dead-link/cron-freshness sparkline     | MEDIUM         | MEDIUM              | P3        |

**Priority key:** P1 = must-have to close milestone · P2 = should-have, finish within milestone · P3 = nice-to-have, defer if time-boxed.

---

## Competitor / Convention Analysis

(For an internal hardening milestone, "competitors" = established conventions in monitoring/SRE tooling.)

| Feature                  | Convention (industry)                                                                                 | Turnkey example                                  | Our Approach                                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Dead-link classification | Distinct buckets (404/403/timeout/DNS/SSL) + HEAD-then-GET + soft-404 body heuristic                  | Linkinator, broken-link-checker crawlers         | Already bucketed; **add the soft-404 body heuristic** (the missing piece) on the existing tiered-TTL cron sweep |
| Cron monitoring          | Heartbeat / dead-man's-switch; first-tick "pending"; missed-run-by-X + runtime-anomaly                | Healthchecks.io, Dead Man's Snitch, Sentry Crons | **In-app** from `cron:lastTick:{name}` age (no SaaS dep); surface in `/api/health`                              |
| Load-test gating         | SLOs as `thresholds` that exit non-zero; load/stress/soak/spike; CI tiering smoke/full/soak           | k6 thresholds, Grafana k6                        | **~100-VU load run with CI-failing p95/error-rate thresholds**; soak optional; stress deferred                  |
| Status/operator UI       | Visual hierarchy, tabular-nums + right-aligned numerics, grouping, progressive disclosure, sparklines | Datadog/Grafana infra dashboards                 | Targeted typography/alignment/grouping pass on 3 subtabs; **preserve terminal/military aesthetic**              |
| Serverless hardening     | Explicit distributed rate limiting + 429-burst monitoring; CSP/Helmet; observability                  | Vercel production checklist                      | Helmet + per-endpoint limiter already shipped; **add operator-visible limiter block + 429 state**               |

---

## Sources

- [k6 Thresholds for SLOs — OneUptime](https://oneuptime.com/blog/post/2026-01-27-k6-thresholds-slos/view) (MEDIUM)
- [Load testing types: load, stress, soak, spike in k6 — Kodziak](https://www.kodziak.com/blog/load-testing-types-load-stress-soak-spike) (MEDIUM)
- [Load Testing Complete Guide 2026 — ARDURA](https://ardura.consulting/blog/load-testing-complete-guide-2026/) (MEDIUM)
- [What is a 404 error in web scraping (soft-404) — Firecrawl Glossary](https://www.firecrawl.dev/glossary/web-scraping-apis/what-is-404-error-web-scraping) (MEDIUM)
- [Linkinator — broken link checker (HEAD/GET, retry, classification)](https://jbeckwith.com/projects/linkinator) (MEDIUM)
- [Unsupervised detection of soft-404 pages — USPTO (soft-404 >25% of dead links)](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7707229) (MEDIUM)
- [Vercel Production Checklist (CSP, WAF, rate limiting, log drains)](https://vercel.com/docs/production-checklist) (MEDIUM)
- [Vercel Rate Limiting (no built-in; Upstash/KV; alert on 429 bursts)](https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting) (MEDIUM)
- [Monitor cron jobs with Healthchecks.io (heartbeat / first-tick pending)](https://healthchecks.io/docs/monitoring_cron_jobs/) (MEDIUM)
- [Sentry Crons — check-in monitoring (missed / max-runtime)](https://docs.sentry.io/platforms/python/guides/serverless/crons/) (MEDIUM)
- [Dashboard Design Principles 2026 — UXPin (hierarchy, grouping, density)](https://www.uxpin.com/studio/blog/dashboard-design-principles/) (MEDIUM)
- [The Ultimate Guide to Designing Data Tables — UIPrep (tabular-nums, right-align numerics)](https://www.uiprep.com/blog/the-ultimate-guide-to-designing-data-tables) (MEDIUM)
- [Data Table UX Patterns — Pencil & Paper (grid lines / density tradeoffs)](https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables) (MEDIUM)

Internal grounding (read during research): `server/lib/urlLiveness.ts` (status-code-only classification — soft-404 gap confirmed), `scripts/load-test.js` (existing 0→100 VU ramp), `src/components/ui/DevApiStatus.tsx` (`LLMPipelineSection` is live-status-only).

---

_Feature research for: v2.0 Final Hardening — operational hardening of a shipped OSINT dashboard_
_Researched: 2026-06-09_
