---
phase: 45
slug: dashboard-subtab-readability-redesign
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-22
---

# SECURITY.md — Phase 45: Dashboard Subtab Readability Redesign

**Audit type:** Retroactive threat-mitigation verification (register authored at plan time)
**ASVS Level:** 1
**block_on:** high
**Phase baseline:** origin/main
**Audited:** 2026-06-22
**Verdict:** SECURED — 13/13 threats closed (9 mitigate verified in code, 4 accepted-risk rationale holds)

This phase restyles the Water/Sites/Events operator subtabs, adds two presentational
atoms (`MetricRow`, `Sparkline`), and adds a server-backed bounded Redis trend-history
ring (`dashboard:trends:history`) written by the existing `/api/cron/health` cron and
surfaced on the Bearer-gated `/api/operator-status`. Every declared mitigation was
verified against the implementation by grep/diff/test evidence — not documentation.

---

## Threat Verification (MITIGATE — verified present in code)

| Threat ID | Category               | Disposition | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| --------- | ---------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-45-01   | Denial of Service      | mitigate    | `server/lib/trendHistory.ts:87` `ltrim(TREND_HISTORY_KEY, 0, TREND_MAX - 1)` (cap 30 → 0..29) + `:36` `TREND_TTL_SEC = 30 * 24 * 3600` (30d) + `:88` `expire(...)`, all pipelined and try/caught (`:83-92`, never throws). Once-daily append via cron (not per-request). Unit test pins cap + TTL: `server/__tests__/lib/trendHistory.test.ts:110` `ltrimMock.toHaveBeenCalledWith(KEY, 0, 29)`, `:117` `expireMock.toHaveBeenCalledWith(KEY, 30*24*3600)`.                                                                                                                                                         |
| T-45-02   | Information Disclosure | mitigate    | `trendHistory` is read (`server/routes/operator-status.ts:642`) and emitted (`:655`) INSIDE the `dashboardAuth`-gated handler (`:371-373` `operatorStatusRouter.get('/operator-status', dashboardAuth, ...)`). `server/middleware/dashboardAuth.ts:31-67` is a fail-closed Bearer gate (503 unconfigured-prod, 401 missing/bad, constant-time `timingSafeEqual`). Route test `server/routes/__tests__/operator-status.test.ts:63` asserts 401 without Bearer / 200 with; `:1076-1137` pin the trendHistory shape + empty-ring `[]` + degrade-open. Data is non-PII operational counts (cron ages + dead-URL count). |
| T-45-04   | Tampering              | mitigate    | `src/components/ui/Sparkline.tsx` resolves all color through tokens: `:82` `text-white/40`, `:87` `stroke="currentColor"`, `:54` `semanticToken = 'var(--color-status-degraded)'`, `:78` neutral `currentColor`. Inline-hex grep gate over the atom returns 0 (D-13 single-source preserved).                                                                                                                                                                                                                                                                                                                       |
| T-45-06   | Tampering              | mitigate    | `git diff origin/main..HEAD src/components/ui/DevApiStatus.tsx` filtered to `role="tab*"`/`aria-labelledby="tab-`/`aria-selected`/`tabIndex` JSX lines: the ONLY match is a single ADDED JSDoc **comment** — zero actual tablist/tabpanel attributes added or removed. Restyle stayed inside the `role="tabpanel"` containers.                                                                                                                                                                                                                                                                                      |
| T-45-08   | Information Disclosure | mitigate    | Trend series ride the existing Bearer-gated `/api/operator-status` poll: `src/components/ui/DevApiStatus.tsx:707` is the pre-existing events-scoped fetch threading `data?.trendHistory` (no new fetch site; the two `fetch('/api/operator-status')` calls at `:707` and `:1256` are both pre-existing). Trend prop threaded into `EventsFiltersSectionV3` → `TrendBlock` (`:4005`).                                                                                                                                                                                                                                |
| T-45-09   | Tampering              | mitigate    | Phase-44 presence-gates (`stage !== 'idle'`, `callHistory...length > 0`, `tokenCounters && breakerState`) do NOT appear as added/removed lines in the phase diff — byte-stable. `of {scannedTotal} scanned` caveat (`:3768`) + authoritative `Dead URL events: {prune.deadUrlCount}` (`:3740`) preserved verbatim.                                                                                                                                                                                                                                                                                                  |
| T-45-10   | Spoofing               | mitigate    | Degrade-open: `TrendBlock` self-hides on null/empty ring (`src/components/ui/DevApiStatus.tsx:3893` `if (trendHistory == null \|\| trendHistory.length === 0) return null`); each `Sparkline` self-hides `< 2` points (`Sparkline.tsx:60`). WR-01 fix: `cronLatestNull` (`:3910-3911`) feeds `forceDegraded` into all three cron wells (`:3927,:3936,:3945`); `Sparkline.tsx:71-78` tints a dead/null-latest cron DEGRADED instead of the healthy floor. No fabricated zeros.                                                                                                                                       |
| T-45-11   | Tampering              | mitigate    | Four behavioral pin suites (tabMerge, diagnosticBlocks, operatorActions, prune) pass unmodified (`git diff --stat origin/main` over those files is empty per 45-05-SUMMARY; 60/60 green). Tablist/tabpanel subtree byte-stable vs origin/main (see T-45-06 evidence).                                                                                                                                                                                                                                                                                                                                               |
| T-45-12   | Repudiation            | mitigate    | Consolidated-layout snapshot regenerated deliberately (`-u`) producing ZERO file diff (restyle already committed in Plans 03/04); forbidden-attr grep on the `.snap` diff for `role=`/`aria-labelledby="tab-`/`tabIndex` returns 0. Snapshot capture scope (`getByTestId('all-apis-tab')` body subtree) structurally excludes the tablist, so a tablist regression cannot be silently snapshotted green.                                                                                                                                                                                                            |
| T-45-13   | Tampering              | mitigate    | Inline-hex grep gate clean: atoms (`MetricRow.tsx`, `Sparkline.tsx`) return 0 hex/rgba (comment-filtered); `git diff origin/main..HEAD src/components/ui/DevApiStatus.tsx` added lines bearing `#hex`/`rgba(` (comment-filtered) is empty — zero new literals. colorBridge single-source contract holds.                                                                                                                                                                                                                                                                                                            |

## Threat Verification (ACCEPT — accepted-risk rationale confirmed)

| Threat ID | Category               | Disposition | Evidence / Rationale                                                                                                                                                                                                                                                                                                         |
| --------- | ---------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-45-03   | Tampering              | accept      | The trend append is additive and lands AFTER the `cron:lastTick:health` write (`server/routes/cron-health.ts:133`), fully wrapped in try/catch (`:146,:185-187`) that logs and continues without touching the `res.json` health response (`:189`). Cannot alter probe/freshness/eval/prune behavior. Accept rationale holds. |
| T-45-05   | Information Disclosure | accept      | `MetricRow` / `Sparkline` are pure presentational atoms fed props by callers (`MetricRow.tsx`, `Sparkline.tsx` — no fetch/effect/store access). They originate no fetch and add no new data surface. Accept rationale holds.                                                                                                 |
| T-45-07   | Information Disclosure | accept      | Water/Sites restyle reorganizes the same `filterStats` into Reason\|Count tables behind progressive disclosure; no new field surfaced — visibility affordance only, not data scope. Accept rationale holds.                                                                                                                  |
| T-45-SC   | Tampering              | accept      | `git diff origin/main..HEAD -- package.json package-lock.json` is EMPTY — zero dependency additions across the phase. Reuses existing `@upstash/redis`, React, Tailwind, vitest, redocly. Nothing new to vet. Accept rationale holds.                                                                                        |

---

## Unregistered Flags

None. The five SUMMARY files carry narrative `## Threat Surface` blocks (not `## Threat Flags`
machine sections); each maps cleanly to the registered threat IDs above. No new attack
surface appeared during implementation without a threat mapping.

## Accepted Risks Log

- **T-45-03** — Additive cron-health trend append (try/caught, post-lastTick). Risk: a trend-write bug; bounded by the try/catch isolation that leaves the health response unchanged.
- **T-45-05** — Presentational atoms render caller-supplied data; no fetch, no new data surface.
- **T-45-07** — Restyled detail tables reorganize existing `filterStats`; no new field, no scope change.
- **T-45-SC** — No package installs in the phase; existing vetted dependencies reused.

## Verification Notes

- Implementation files were treated READ-ONLY; the working tree shows no auditor modifications.
- Mitigation-enforcing test surface re-run during audit: `trendHistory.test.ts` + `operator-status.test.ts` + `Sparkline.test.tsx` + `MetricRow.test.tsx` → **43/43 passed**.
- Independent code review (`45-REVIEW.md`): 0 critical/security findings, 3 warnings (WR-01/02/03) — all fixed (`45-REVIEW-FIX.md`); the WR-01 fix directly strengthens the T-45-10 spoofing mitigation (dead-cron now reads degraded, not healthy).

---

_Audited by: gsd-security-auditor_
_Phase: 45-dashboard-subtab-readability-redesign_
_ASVS Level 1 · block_on: high · 13/13 closed · no blockers_
