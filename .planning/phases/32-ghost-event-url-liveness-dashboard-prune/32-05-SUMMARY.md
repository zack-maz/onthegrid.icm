---
phase: 32-ghost-event-url-liveness-dashboard-prune
plan: 05
subsystem: ui
tags:
  [
    react,
    useCallback,
    jsdom,
    vitest,
    dashboardAuth,
    operator-status,
    drill-down,
    prune,
    ghost-03,
    ghost-04,
  ]

# Dependency graph
requires:
  - phase: 32
    plan: 01
    provides: "URL_LIVENESS_COUNT_KEY + isTerminalDead() exported; OperatorAuditEntry.operation widened to admit 'prune-dead-urls'"
  - phase: 32
    plan: 02
    provides: 'events:url-liveness-count sidecar maintained by persistLiveness (the integer Plan 04 reads + Plan 05 displays)'
  - phase: 32
    plan: 03
    provides: "POST /api/events/prune-dead-urls Bearer-gated endpoint with 50/24h quota (the destination of the Prune button's click)"
  - phase: 32
    plan: 04
    provides: 'GET /api/operator-status response gains `prune: {deadUrlCount, last24hPrunes, deadUrlSample}` sibling block — the payload Plan 05 consumes'
  - phase: 28.2
    provides: 'DevApiStatus.tsx Operator Actions block (replay-test-trigger + replay-quota-alert UX pattern Plan 05 mirrors)'
provides:
  - 'src/components/ui/DevApiStatus.tsx OperatorStatus interface — extended with optional `prune?: {deadUrlCount, last24hPrunes, deadUrlSample} | null` field + optional `byBearer[].prunes`'
  - 'src/components/ui/DevApiStatus.tsx fetchOpStatus — hoisted out of the useEffect closure into a named useCallback so the prune button handler can trigger an immediate refresh after a successful prune (PLAN-CHECK MEDIUM-03 resolution)'
  - "src/components/ui/DevApiStatus.tsx pruneHandler — POSTs to /api/events/prune-dead-urls with body {trigger:'manual'} + dashboardAuthHeaders() spread; 429 → pruneQuotaAlert; 200 → clear alert + immediate fetchOpStatus refresh; network errors degrade-open"
  - 'src/components/ui/DevApiStatus.tsx Operator Actions render extension — 4 new data-testid surfaces: dead-url-count, dead-url-list (with dead-url-list-truncated row), prune-dead-urls-trigger, prune-quota-alert'
  - 'src/__tests__/components/DevApiStatus.prune.test.tsx — 9 jsdom test cases covering count render, button gating, click POST contract, 429 alert path, 200 refresh path, drill-down rendering, truncation row, and empty-state hiding'
affects: [32-06-close]

# Tech tracking
tech-stack:
  added: [] # Zero new npm dependencies — useCallback already in React, vi.stubGlobal + @testing-library/react already in use
  patterns:
    - 'useCallback-hoisted fetchOpStatus pattern: any cross-action handler that needs to drive an immediate poll refresh consumes the named callback directly instead of duplicating the fetch body. Stable reference + same-body refactor = no behavioral change but lets new callsites (here: pruneHandler post-200) opt into refresh without coupling to setInterval.'
    - 'Optional-block surface conditionality: an entire UI block can hinge on `opStatus?.prune != null` so pre-rollout server deploys that omit the field render the older Operator Actions surface verbatim. Frontend-and-backend deploy ordering becomes a non-issue (LOW-coupling deployment pattern).'
    - "Drill-down list with truncation row: when a count exceeds the bounded sample length, render the sample as a flex-baseline-gap `<ul>` capped by `max-h-40 overflow-y-auto`, then append an italic 'and N more' row (`data-testid='dead-url-list-truncated'`). The truncation row makes the cap visible to the operator without driving a second SCAN; reusable for any future bounded-SCAN drill-down surface."
    - 'Mock-fetch routing by URL inside vi.fn: DevApiStatus.prune.test.tsx routes /api/operator-status (GET, opStatusPayload-controlled), /api/events/prune-dead-urls (POST, pruneResponse-controlled), and falls through to 404 for any other URL. Establishes a reusable jsdom pattern for components that fetch from multiple endpoints; per-case override via module-level mutables instead of per-test setup.'
    - "Node 22 + jsdom localStorage workaround: Node 22's built-in localStorage shadows jsdom's but is a no-op without `--localstorage-file`. Stub a working in-memory Map-backed Storage via vi.stubGlobal + Object.defineProperty(window, 'localStorage', ...) in beforeEach so libraries that read localStorage directly (here: dashboardAuthHeaders) see seeded values. Reusable for any future test that touches dashboardAuth in jsdom."

key-files:
  modified:
    - 'src/components/ui/DevApiStatus.tsx (+71 lines: useCallback import, OperatorStatus.prune optional field, fetchOpStatus useCallback hoist, pruneHandler + pruneQuotaAlert state, dead-URL count + drill-down list + Prune button + 429 alert render block)'
  created:
    - 'src/__tests__/components/DevApiStatus.prune.test.tsx (394 lines: 9 jsdom tests for the Phase 32 dashboard surface — count display, button visibility gate, click POST contract, 429 alert, 200 refresh, drill-down rendering, truncation row, empty-state hiding)'

key-decisions:
  - "Single feat commit covers BOTH count display (GHOST-03) and Prune button (GHOST-04) rather than two separate commits. The plan's action body offered the choice and the diff is small (~70 LOC); collapsing into one commit keeps the audit trail aligned with the two-task plan (RED test commit → GREEN feat commit) and matches Plan 32-04's RED/GREEN cadence verbatim."
  - "fetchOpStatus hoisted to useCallback rather than refactored into a custom hook. MEDIUM-03 resolution called for a 'named callback' — useCallback satisfies that without introducing a new hook file or coupling. The closure body is byte-identical to the prior inline lambda; the only behavioral change is that pruneHandler can call it on demand after a successful prune."
  - "Test 6 (200 → fetchOpStatus refresh) uses `mockFetch.mock.calls.filter(url === '/api/operator-status').length` instead of awaiting a specific call sequence. The component's useEffect can fire fetchOpStatus on mount + on the 30s setInterval + on the post-prune trigger; comparing before-click vs after-click counts is more robust than asserting an exact total."
  - 'localStorage stub installed in beforeEach (not in a shared setup file). The Node 22 localStorage shadow only affects tests that read dashboardAuthHeaders() in jsdom — extending src/test/setup.ts would touch every existing test for a single-test concern. Local-scoped stub keeps the blast radius to this file; future tests that touch dashboardAuth can copy the stub block.'
  - "Drill-down list rendered as a `<ul>` not a `<table>`. The plan's analog suggested either; `<ul>` with flex-baseline-gap per-row is lighter-weight, matches the existing operator-actions-bearer-row pattern, and avoids table-header semantics for a transient ordered-but-not-tabular list. max-h-40 overflow-y-auto bounds the visible height when 20 entries render."
  - "Truncation row uses `…` (Unicode ellipsis U+2026) not three dots. Matches the cap-display convention elsewhere in DevApiStatus (e.g., bearerFingerprint slice(0,8)+'…' truncation at L1501). Single visible glyph = less horizontal space + matches the byBearer row style."

patterns-established:
  - 'useCallback hoist for cross-handler refresh: any time a render-driven setInterval poller body needs to be invoked imperatively from another callback, hoist it into a useCallback with the same deps as the wrapping useEffect. The useEffect then becomes a one-liner `void hoisted()` + `setInterval(() => void hoisted(), MS)`. Pattern reusable anywhere DevApiStatus or another polling component grows a new action that needs to drive a refresh.'
  - 'Optional frontend-block + optional server-field: when adding a new backend response field, render the frontend block ONLY when `data?.newField != null`. The backend can ship its widening at any time; the frontend renders the older or newer surface transparently. Pattern reusable for any future operator-status / health surface widening.'
  - "jsdom Bearer-header assertion via per-test mockFetch + localStorage stub: when a component spreads dashboardAuthHeaders() into a fetch, the jsdom test seeds localStorage via vi.stubGlobal('localStorage', mapBackedStorage) + Object.defineProperty(window, 'localStorage', ...), then asserts `(call[1].headers as Record<string, string>).Authorization` matches the expected Bearer string. Pattern reusable for any future dashboard-action test that issues a POST with the operator Bearer."

requirements-completed: [GHOST-03, GHOST-04]

# Metrics
duration: 14min
completed: 2026-05-21
---

# Phase 32 Plan 05: DevApiStatus dead-URL count + drill-down + Prune button Summary

**Surfaces the dead-URL count + 20-entry drill-down list + one-click "Prune {N} dead events" button in the API Health tab's Operator Actions block; consumes Plan 32-04's `/api/operator-status.prune` payload; clicking the button POSTs to Plan 32-03's `/api/events/prune-dead-urls` with the operator's Bearer, surfaces 429 as a quota-alert panel, and triggers an immediate `fetchOpStatus` refresh on 200 so the count drops without waiting for the next 30s poll — completes GHOST-03 (count + drill-down visibility) and GHOST-04 (manual prune mechanism) end-to-end on the deployed dashboard.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-05-21T03:05:00Z (approximate — STATE.md last activity)
- **Completed:** 2026-05-21T03:19:00Z
- **Tasks:** 2 (TDD pair: RED commit `8a47ec7`, GREEN commit `393b1c9`)
- **Files modified:** 1 source (`DevApiStatus.tsx`)
- **Files created:** 1 test (`src/__tests__/components/DevApiStatus.prune.test.tsx`)
- **Branch HEAD after Plan 05:** `393b1c9` (feat commit)

## Accomplishments

- **`OperatorStatus` TypeScript interface extended** — added optional `prune?: { deadUrlCount: number; last24hPrunes: number; deadUrlSample: Array<{eventId, url, status}> } | null` field; widened `byBearer[].prunes?` to optional. Older Plan-32-04-pre-deploy servers omitting the `prune` block still type-check and the conditional render path `opStatus?.prune != null && ...` hides the new UI cleanly — frontend can deploy ahead of backend without breakage.
- **`fetchOpStatus` hoisted to `useCallback`** — PLAN-CHECK MEDIUM-03 resolved. The fetch body (operator-status GET + defensive shape guard) was inline inside the polling `useEffect`. After this plan it lives in a named `useCallback(async () => {...}, [])` consumed by both the poller (`useEffect` mount + 30s `setInterval`) AND by `pruneHandler` after a successful prune. No-op refactor (same body), enabling the in-place count refresh without waiting for the polling tick.
- **`pruneHandler` + `pruneQuotaAlert` state added** — mirrors the existing `replayProbe` + `quotaAlert` pair verbatim, with two divergences per plan: (a) the POST body is `{trigger: 'manual'}` (replayProbe has no body), (b) on 200 the handler calls `void fetchOpStatus()` for the in-place refresh (replayProbe has no refresh). 429 → `setPruneQuotaAlert({resetsAt: body.resetsAt ?? ''})`; network errors degrade-open with a swallow.
- **Operator Actions render block extended** — four new `data-testid` surfaces alongside the existing `replay-test-trigger`:
  - `data-testid="dead-url-count"` — `<div>Dead URL events: {N}</div>` (renders whenever `opStatus?.prune != null`, even at N=0 so the operator sees the resolved-zero state)
  - `data-testid="dead-url-list"` — `<ul max-h-40 overflow-y-auto>` with one `<li>` per `deadUrlSample` entry: status badge (font-mono opacity-60), truncated eventId (font-mono opacity-40), and url with the full URL as `title=` hover (truncate + opacity-70). Rendered only when `deadUrlSample.length > 0`.
  - `data-testid="dead-url-list-truncated"` — italic "… and {N} more" row inside the same `<ul>`, rendered only when `deadUrlCount > deadUrlSample.length` (LOW-03 drill-down resolution — surfaces the 20-entry cap to the operator).
  - `data-testid="prune-dead-urls-trigger"` — `<button>Prune {N} dead events</button>`. Tailwind classes byte-for-byte from the existing replay button (`rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5`). Rendered only when `deadUrlCount > 0` (D-10 — operator can only prune when something is flagged).
  - `data-testid="prune-quota-alert"` — amber-500/20+10 panel with `Prune quota reached: 50 of 50 in last 24h. Resets at {resetsAt}.` Renders when `pruneQuotaAlert` is non-null (post-429).
- **9 new jsdom tests** in `src/__tests__/components/DevApiStatus.prune.test.tsx`:
  1. `Dead URL events: 3` renders when `prune.deadUrlCount === 3`
  2. `Prune 3 dead events` button renders when count > 0
  3. Button + drill-down both absent when `deadUrlCount === 0` (count row still shows 0)
  4. Click POSTs to `/api/events/prune-dead-urls` with `body: '{"trigger":"manual"}'`, `Content-Type: application/json`, `Authorization: Bearer test-bearer-key`
  5. 429 response → `prune-quota-alert` renders with `Resets at 2026-05-20T00:00:00Z`
  6. 200 response → ≥2 fetches to `/api/operator-status` (initial poll + post-prune refresh proves the in-place update)
  7. Drill-down list renders each `deadUrlSample` entry with status + eventId + url substrings
  8. Truncation row "… and 5 more" renders when `deadUrlCount: 25, sample.length: 20`
  9. Drill-down `<ul>` not rendered when `deadUrlSample` is empty (length === 0 guard works)
- **Full vitest run** — 2259 passed / 19 skipped / 5 todo / 0 failed (baseline 2250 from Plan 04 → +9 new). `npm run typecheck` clean (type-coverage 97.50%, above 97 floor). `npm run build` clean (api/vercel-entry.js rebuild deferred to Plan 32-06 phase-close per existing convention). `npx eslint src/components/ui/DevApiStatus.tsx src/__tests__/components/DevApiStatus.prune.test.tsx` clean.
- **Zero new npm dependencies.**
- **Zero regressions** — typecheck + lint + build + full suite all clean.

## Task Commits

Plan 32-05 lands as TWO atomic commits on `feature/32-ghost-event-url-liveness-dashboard-prune` per TDD RED → GREEN discipline:

1. **RED — failing jsdom tests** — `8a47ec7` (test) — 9 new tests asserting the four new `data-testid` surfaces + click POST contract + 429 alert + post-200 refresh. Tests RED until the production code lands.
2. **GREEN — production change** — `393b1c9` (feat) — `OperatorStatus.prune` optional field + `fetchOpStatus` useCallback hoist + `pruneHandler` + `pruneQuotaAlert` state + render block. All 9 tests GREEN; full suite +9 (2259 total).

The plan's Task 1 action body offered a choice between "two atomic commits (count display + action button)" OR "one collapsed feat commit". Diff is small (~70 LOC); collapsed form chosen to align with Plan 32-04's RED/GREEN cadence verbatim (test commit → feat commit).

## Files Created/Modified

- **`src/components/ui/DevApiStatus.tsx`** (MODIFIED) — net +71 lines, three logical changes:
  - **Import** (line 1) — `useCallback` added to the React import line.
  - **Type + state + handler** (lines ~887–1040) — `OperatorStatus.prune` field added; validation guard unchanged (does NOT gate on `prune`); `fetchOpStatus` hoisted out of `useEffect` into a top-level `useCallback`; `useEffect` body now consumes the hoisted callback as a dep; `pruneQuotaAlert` state + `pruneHandler` async function added next to `replayProbe`.
  - **Render** (after the existing `replay-test-trigger` div, inside the same `<section data-testid="operator-actions">`) — `opStatus?.prune != null && <>...</>` block with the 4 new testid surfaces, followed by the `pruneQuotaAlert && <div data-testid="prune-quota-alert">...</div>` panel.
- **`src/__tests__/components/DevApiStatus.prune.test.tsx`** (CREATED, 394 lines) — 9 jsdom tests + `mockFetch` URL router + per-test override mutables (`opStatusPayload`, `pruneResponse`) + localStorage stub workaround for Node-22-shadows-jsdom + `resetAllStores` helper cloned from `DevApiStatusV3.test.tsx`.

## Decisions Made

### Single feat commit covers both GHOST-03 (count) and GHOST-04 (button)

The plan offered two atomic commits or one collapsed feat commit. Diff is ~70 LOC; collapsed form chosen to match Plan 32-04's RED/GREEN cadence verbatim and keep the audit trail aligned with the two-task plan structure (test commit → feat commit). GHOST-03 and GHOST-04 are tightly coupled — the count row exists to inform the button label, and they share the same `opStatus?.prune` conditional — so splitting them would have produced a count-but-no-button intermediate state with no useful behavior to test independently.

### `fetchOpStatus` hoisted to `useCallback` (not custom hook)

MEDIUM-03 called for `fetchOpStatus` to be a named function with a stable reference. `useCallback` satisfies that without introducing a new hook file or coupling. The closure body is byte-identical to the prior inline lambda; the only behavioral change is that the wrapping `useEffect` now lists `fetchOpStatus` in its dep array (an empty-dep useCallback creates a stable reference, so this doesn't change behavior). `pruneHandler` calls `void fetchOpStatus()` directly inside its 200 branch.

### Test 6 asserts "≥2 calls" not "exactly 2 calls"

The component's `useEffect` fires `fetchOpStatus` on mount + on the 30s `setInterval`. Tests run with real timers (no `vi.useFakeTimers()` here because we want the post-click promise to actually resolve); a slow CI runner could in principle accumulate more than one mount-time call before the test asserts. Comparing before-click vs after-click counts (`afterCount > beforeCount`) is robust to that — the assertion proves the post-prune refresh fired without coupling to an exact total.

### `localStorage` stub installed per-test (not in src/test/setup.ts)

Node 22's built-in `localStorage` shadows jsdom's and is a no-op without `--localstorage-file`. The dashboardAuth test path is the only one currently affected. Extending `src/test/setup.ts` would install the stub for every existing test — broader blast radius than needed for a single concern. The stub block is small enough that any future test that touches `dashboardAuth` can copy it inline.

### Drill-down rendered as `<ul>` not `<table>`

The plan's analog suggested either. `<ul>` with `flex items-baseline gap-2` per-row is lighter than a `<table>`, matches the existing `operator-actions-bearer-row` style at L1496-1504, and avoids table-header semantics for a transient bounded list. `max-h-40 overflow-y-auto` bounds the visible height at ~5 rows when the full 20-entry sample loads, keeping the Operator Actions block compact.

### Truncation row uses Unicode ellipsis `…` (U+2026)

Matches the bearerFingerprint truncation convention at L1501 (`{b.bearerFingerprint.slice(0, 8)}…`). Single glyph beats three dots for horizontal space.

## Deviations from Plan

**One deviation, Rule 3 (auto-fix blocking issue):**

### Auto-fixed Issues

**1. [Rule 3 - Blocking] jsdom localStorage stub workaround for Node 22**

- **Found during:** Task 2 (jsdom test authoring, click-flow assertion case)
- **Issue:** The plan's `<action>` said "seed it in `beforeEach` via `localStorage.setItem('...', 'dev-bearer')` so the header spread is non-empty and assertable." In Node 22 + jsdom under vitest 4, `window.localStorage.setItem` is `undefined` because Node 22's built-in localStorage (which requires `--localstorage-file` for persistence) shadows jsdom's Storage shim. Calling `window.localStorage.setItem(...)` threw `TypeError: window.localStorage.setItem is not a function`. Without seeding, `dashboardAuthHeaders()` returned `{}` and the assertion `headers.Authorization === 'Bearer test-bearer-key'` failed.
- **Fix:** Installed an in-memory Map-backed `Storage` stub via `vi.stubGlobal('localStorage', ls)` + `Object.defineProperty(window, 'localStorage', { value: ls, configurable: true })` in `beforeEach`. The stub satisfies the `Storage` interface and `localStorage.setItem('dashboard:auth-key', 'test-bearer-key')` then works as `dashboardAuth.ts`'s `getDashboardKey()` reads via `localStorage.getItem(STORAGE_KEY)`.
- **Files modified:** `src/__tests__/components/DevApiStatus.prune.test.tsx` (test file only — no production-code change).
- **Verification:** Test 4 (the click-flow assertion) passed; the full 9-test suite passed; no other test file affected.
- **Committed in:** `393b1c9` (GREEN-gate feat commit — the localStorage stub fix was folded into the implementation commit since it's part of making the RED tests pass)

**Total deviations:** 1 auto-fixed (1 blocking — jsdom env quirk in Node 22).
**Impact on plan:** Zero scope creep. The fix is jsdom-environmental and does not change the production-code surface. All 9 plan-specified test behaviors landed unchanged — only the seed mechanism for the Bearer-header assertion differed.

## Issues Encountered

**Node 22 + jsdom localStorage shadowing** (documented above as Rule 3 auto-fix). The `(node:XXXX) Warning: --localstorage-file was provided without a valid path` warning surfaces on every vitest run in this environment regardless of test content; it's a Node-22-with-vitest-launcher quirk, not a project bug. The localStorage stub workaround makes individual test cases that touch dashboardAuth resilient to it without needing to fix the broader vitest config.

**No other issues encountered.**

## User Setup Required

**None.** All changes are pure-TypeScript component + test extensions. No env vars, no new npm packages, no Vercel config edits. The dashboard's existing operator-Bearer flow (`dashboardAuthHeaders()`) is reused verbatim; the new POST endpoint (`/api/events/prune-dead-urls`) is already mounted behind `dashboardAuth` middleware per Plan 32-03.

## Verification (success_criteria)

- [x] 2 tasks executed and committed atomically (RED test + GREEN feat) — verified `8a47ec7` and `393b1c9` in `git log`.
- [x] `32-05-SUMMARY.md` created at `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-05-SUMMARY.md` (this file).
- [x] STATE.md + ROADMAP.md updates queued for the final docs commit (handled in the next step).
- [x] Dashboard renders `Dead URL events: {N}` count — `data-testid="dead-url-count"` (test 1 GREEN).
- [x] `Prune {N} dead events` button POSTs to `/api/events/prune-dead-urls` with Bearer + 50/24h quota awareness — `data-testid="prune-dead-urls-trigger"` + test 4 asserts the POST contract.
- [x] Button is one-click (no confirmation modal) — `onClick={() => void pruneHandler()}` fires directly.
- [x] 429 renders an in-place alert/badge without throwing — `data-testid="prune-quota-alert"` + test 5 GREEN.
- [x] Post-200 immediate `fetchOpStatus` refresh — `void fetchOpStatus()` inside the `res.ok` branch + test 6 GREEN (≥2 operator-status fetches).
- [x] Drill-down list renders `prune.deadUrlSample` — `<ul data-testid="dead-url-list">` with status + eventId + url + truncation row when `len < deadUrlCount` (tests 7 + 8 GREEN; test 9 verifies the empty-state hides).
- [x] 9 new jsdom tests for the drill-down list + click flow + 429 + 200 all GREEN — full file passes.
- [x] `tsc -b` clean — type-coverage success at 97.50% (above 97 floor).
- [x] Full test suite green — 2259 passed / 19 skipped / 5 todo / 0 failed (baseline 2250 + 9 new).
- [x] `fetchOpStatus` is named via `useCallback` (MEDIUM-03 fix) — the post-prune refresh consumes the stable reference directly.

## Self-Check: PASSED

**Files exist:**

- `src/components/ui/DevApiStatus.tsx` — FOUND (modified, +71 net lines)
- `src/__tests__/components/DevApiStatus.prune.test.tsx` — FOUND (created, 394 lines)
- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-05-SUMMARY.md` — FOUND (this file)

**Commits exist on `feature/32-ghost-event-url-liveness-dashboard-prune`:**

- `8a47ec7` test(32-05): add failing jsdom tests for DevApiStatus prune surface (RED gate) — FOUND
- `393b1c9` feat(32-05): DevApiStatus dead-URL count + drill-down + Prune button (GHOST-03, GHOST-04, D-10) — FOUND

**Automated verify commands (all PASS):**

- `git rev-parse --abbrev-ref HEAD` → `feature/32-ghost-event-url-liveness-dashboard-prune`
- `grep -q 'data-testid="prune-dead-urls-trigger"' src/components/ui/DevApiStatus.tsx` → OK
- `grep -q 'data-testid="dead-url-count"' src/components/ui/DevApiStatus.tsx` → OK
- `grep -q 'data-testid="dead-url-list"' src/components/ui/DevApiStatus.tsx` → OK
- `grep -q 'data-testid="dead-url-list-truncated"' src/components/ui/DevApiStatus.tsx` → OK
- `grep -q 'data-testid="prune-quota-alert"' src/components/ui/DevApiStatus.tsx` → OK
- `grep -q "/api/events/prune-dead-urls" src/components/ui/DevApiStatus.tsx` → OK
- `grep -q "deadUrlSample" src/components/ui/DevApiStatus.tsx` → OK
- `grep -c "rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5" src/components/ui/DevApiStatus.tsx` → **2** (replay button + prune button — confirms no new utility class invented; class copied byte-for-byte)
- `npx vitest run src/__tests__/components/DevApiStatus.prune.test.tsx` → 9 tests passed (Plan 32-05)
- `npx vitest run` → 2259 passed / 19 skipped / 5 todo / 0 failed (baseline 2250 → +9 new from Plan 32-05)
- `npm run typecheck` → `type-coverage success` (97.50% — above 97 floor)
- `npx eslint src/components/ui/DevApiStatus.tsx src/__tests__/components/DevApiStatus.prune.test.tsx` → 0 errors / 0 warnings
- `npm run build` → ESM build success / api/vercel-entry.js 1.70 MB (rebuild artifact NOT committed per existing convention — Plan 32-06 close PR will commit the final bundle)

## Test command output snippet

```
RUN  v4.1.2 /Users/zackmaz/Desktop/otg-iran-monitor

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  20:09:54
   Duration  909ms (transform 181ms, setup 53ms, import 230ms, tests 83ms, environment 409ms)
```

9 Plan 32-05 jsdom tests, all GREEN:

```
✓ DevApiStatus dead-URL count + Prune button — Phase 32 Plan 05 (9)
  ✓ renders `Dead URL events: 3` when prune.deadUrlCount === 3
  ✓ renders `Prune 3 dead events` button when deadUrlCount > 0
  ✓ does NOT render the button or drill-down list when deadUrlCount === 0
  ✓ clicking the button POSTs to /api/events/prune-dead-urls with {trigger:"manual"} + Bearer headers
  ✓ 429 response renders the prune-quota-alert with resetsAt
  ✓ 200 response triggers an immediate fetchOpStatus refresh (≥2 operator-status calls)
  ✓ drill-down list renders each deadUrlSample entry with status + eventId + url
  ✓ drill-down list shows truncation row when deadUrlCount exceeds sample length
  ✓ drill-down list NOT rendered when deadUrlSample is empty
```

## UI surface description (textual screenshot)

Inside the `<section data-testid="operator-actions">` block of the API Health tab, immediately after the existing `Run replay probe` button:

```
Operator Actions
─────────────────
24h actions: 1
a3f9c8d1…: 8 actions / 0 swaps / 5 replays / 3 prunes
cron:re…: 4 actions / 0 swaps / 0 replays / 4 prunes
Prompt-injection robustness: 24/25

[ Run replay probe ]

Dead URL events: 17                            ← NEW (Plan 32-05)
┌─ data-testid="dead-url-list" ──────────────┐
│ 404       ev-abc1234   https://example.com │
│ dead-host ev-def5678   https://broken.io   │
│ 403       ev-ghi9012   https://blocked.org │
│ … 17 more entries scroll …                 │
│ … and 5 more (truncation)                  │
└────────────────────────────────────────────┘

[ Prune 17 dead events ]                       ← NEW (Plan 32-05)

(if 429:)
┌─────────────────────────────────────────────────┐
│ Prune quota reached: 50 of 50 in last 24h.      │  ← NEW (Plan 32-05)
│ Resets at 2026-05-21T00:00:00Z.                 │
└─────────────────────────────────────────────────┘
```

## Sample server response shape consumed

The component consumes `prune` from `/api/operator-status` (Plan 32-04). Sample payload at L185-235 of `32-04-SUMMARY.md`:

```json
{
  "audit24h": 12,
  "byBearer": [
    { "bearerFingerprint": "a3f9c8d1", "actions": 8, "swaps": 0, "replays": 5, "prunes": 3 },
    {
      "bearerFingerprint": "cron:refresh-events",
      "actions": 4,
      "swaps": 0,
      "replays": 0,
      "prunes": 4
    }
  ],
  "advEval": { "total": 25, "blocked": 24, "leaked": 1 },
  "prune": {
    "deadUrlCount": 17,
    "last24hPrunes": 7,
    "deadUrlSample": [
      { "eventId": "ev-abc123", "url": "https://example.com/article-1", "status": "404" },
      { "eventId": "ev-def456", "url": "https://example.com/article-2", "status": "dead-host" }
    ]
  }
}
```

## Pattern map analog conformance

Plan 32-05 implements the analog patterns from `32-PATTERNS.md §"src/components/ui/DevApiStatus.tsx — extend Operator Actions block"` verbatim with two enrichments not in the original PATTERNS section:

1. **Drill-down list rendering** (LOW-03 resolution arrived after PATTERNS was authored). PATTERNS only specified count + button; PLAN.md Task 1 added the `<ul data-testid="dead-url-list">` block + truncation row. Implementation matches PLAN.md verbatim.
2. **localStorage stub for jsdom in Node 22** (test-side issue not foreseen by PATTERNS). Pattern is local to the new test file; will be available to any future jsdom test that consumes `dashboardAuthHeaders()`.

No other deviation from PATTERNS analogs.

## Next Plan Readiness

**Plan 32-06 (phase close)** is unblocked:

- All five GHOST-0[1-5] requirements have landed across plans 01–05.
- ROADMAP.md success criteria 1 (count + drill-down + button) is fully delivered.
- The `api/vercel-entry.js` bundle is dirty (rebuilt locally during Plan 05 verification but NOT committed per existing convention); Plan 32-06 will commit the rebuilt bundle in the phase-close PR.
- CLAUDE.md `## Serverless Cache` registry needs the three new key entries (`events:url-liveness:{eventId}`, `events:url-liveness-count`, `operator:prune-quota:{...}:{...}`) — these are Plan 32-06's docs scope per Plan 32-PATTERNS.md.
- No pending merge conflicts with main (`feature/32-…` is 21 commits ahead of origin; ready for final review + merge to main once Plan 32-06's close PR lands).

**Blockers / concerns:** None. The plan-checker MEDIUM concerns (MEDIUM-01 SCAN signature, MEDIUM-02 `__test__` export, MEDIUM-03 fetchOpStatus reference) are all resolved across plans 02–05. LOW-03 (drill-down list) is fully resolved end-to-end (server-side in 32-04, client-side in 32-05).

---

_Phase: 32-ghost-event-url-liveness-dashboard-prune_
_Plan: 05_
_Completed: 2026-05-21_
