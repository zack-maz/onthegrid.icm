---
phase: 44-events-subtab-pipeline-detail
fixed_at: 2026-06-10T16:11:00Z
review_path: .planning/phases/44-events-subtab-pipeline-detail/44-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 44: Code Review Fix Report

**Fixed at:** 2026-06-10T16:11:00Z
**Source review:** .planning/phases/44-events-subtab-pipeline-detail/44-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 6 (all Warnings; 0 Critical; 4 Info findings out of scope per `critical_warning` fix scope)
- Fixed: 6
- Skipped: 0

**Verification gates (all green):**

- `npx vitest run server/routes/__tests__/operator-status.test.ts src/__tests__/DevApiStatusV3.test.tsx src/__tests__/devApiStatusEventsSection.test.tsx src/__tests__/components/DevApiStatus.prune.test.tsx src/components/ui/__tests__/` — 150 tests passed (includes the 5 frozen pinning suites: snapshot, tabMerge, diagnosticBlocks, operatorActions — untouched and green)
- `npm run typecheck` — pass (type-coverage 97.71%)
- `npm run openapi:lint` — valid; 37 warnings (identical to pre-fix baseline, none introduced)

## Fixed Issues

### WR-01: `countsByStatus` tally truncated by LIMIT_DRILL_DOWN=20 short-circuit

**Files modified:** `server/routes/operator-status.ts`, `server/routes/__tests__/operator-status.test.ts`
**Commit:** 2b03918
**Applied fix:** Removed the `sample.length >= LIMIT_DRILL_DOWN → cursor = 0; break` short-circuit; the cap now only gates the `sample.push` (`continue` past a full sample), so `MAX_SCAN_KEYS=200` is the sole loop short-circuit and the tally covers all scanned keys. Updated the `LIMIT_DRILL_DOWN` and `buildDeadUrlSample` doc comments. Pinned by: extended cap-at-20 test (`countsByStatus['404'] === 30` for the 30-dead fixture) plus a new mixed-fixture test (25 dead first + 40 live: tally `404:25, live:40`, sample still 20).

### WR-02: Events-tab fetch retained stale eventsPrune on failure; no out-of-order guard

**Files modified:** `src/components/ui/DevApiStatus.tsx`
**Commit:** ece6455
**Applied fix:** Non-200 responses and network failures now call `setEventsPrune(null)` (block self-hides, matching the documented degrade-open contract). Added a per-effect monotonically increasing request id checked (with `cancelled`) before every `setEventsPrune` so a slow early response cannot clobber a newer interval tick's data.

### WR-03: OpenAPI omitted `tokenBudget` on the /api/operator-status 200 schema

**Files modified:** `server/openapi.yaml`
**Commit:** ed7e374
**Applied fix:** Added `tokenBudget` as `type: object, nullable: true` documenting the Phase 39 GA-4 provider-keyed map + cost-shadow roll-up and the degrade-open null (T-39-03-D). Redocly stays green.

### WR-04: `url` nullability drift (server `string | null` vs spec/client `string`)

**Files modified:** `server/openapi.yaml`, `src/components/ui/DevApiStatus.tsx`
**Commit:** b311800
**Applied fix:** Option (a) — marked `url` `nullable: true` in the OpenAPI sample schema and widened both client copies (`OperatorStatus.prune.deadUrlSample[].url` and module-level `PruneSummary.deadUrlSample[].url`) to `string | null`. The two `title={entry.url}` attributes coerce null → undefined to satisfy strict JSX typing.

### WR-05: DeadLinkBucketsBlock gated buckets/sample on the sidecar `deadUrlCount > 0`

**Files modified:** `src/components/ui/DevApiStatus.tsx`, `src/__tests__/components/DevApiStatus.prune.test.tsx`
**Commit:** 75f83ea
**Applied fix:** Removed the `deadUrlCount > 0` wrapper; buckets and sample now gate on their own data presence (`buckets.length > 0` / `sample.length > 0`), matching the sibling API-Health list, so a sidecar underflow-to-0 (T-32-11) cannot mask scan evidence. The authoritative-total line stays sidecar-sourced (D-03 preserved). Test evolution (NOT one of the 5 frozen suites): the prior `skips bucket + sample rows when deadUrlCount === 0` test pinned exactly the flagged behavior and was replaced with two tests — count=0 with non-empty tally pins buckets-visible/sample-hidden; truly empty scan data pins both hidden.

### WR-06: DrillDownRow rendered `<a href>` from LLM-extracted URLs without scheme validation

**Files modified:** `src/components/ui/DevApiStatus.tsx`
**Commit:** 0aff43a
**Applied fix:** Added `/^https?:\/\//i` scheme guard; non-http(s) sources (e.g. `javascript:`, `data:`) render as inert `<span>` text instead of anchors. http/https keep the existing `target="_blank" rel="noopener noreferrer"` anchor. Minimal diff to the pre-existing code per finding guidance.

## Skipped Issues

None — all in-scope findings fixed. (IN-01..IN-04 are Info-tier and out of scope for this `critical_warning` fix run.)

## Additional Commits

- **b72b625** `docs(44): mark review findings fixed` — added a one-line `**Status:** fixed` resolution note under each WR finding in 44-REVIEW.md (per workflow constraints; includes a prettier-stability touch-up so the lint-staged markdown formatter does not mangle underscore emphasis in the WR-01 paragraph).

## Locked-Decision Compliance

- Evidence still renders as TEXT (T-43-16 / D-11) — untouched.
- No zero-defaults introduced for purged providers (D-05/D-06) — untouched.
- ARIA tablist DOM unchanged (D-12); the 5 pinning suites green and untouched.
- "of N scanned" sampled framing retained (D-03); `deadUrlCount` sidecar remains the authoritative total.
- No new Redis keys or writers; `MAX_SCAN_KEYS=200` budget unchanged (WR-01 makes the code honor the already-documented bound).

---

_Fixed: 2026-06-10T16:11:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
