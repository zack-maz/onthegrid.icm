---
phase: 43-ghost-link-prune-correctness
plan: 02
subsystem: ghost-event-url-liveness
tags: [url-liveness, soft-404, body-heuristic, ssrf, dos-cap, degrade-open, tdd]
requires:
  - server/lib/urlLiveness.ts (Plan 43-01 7-status schema + ProbeResult.evidence + probeUrl HEAD/GET taxonomy)
provides:
  - classifySoft404 pure exported helper (markers/redirect-home/near-empty, D-02 order, D-03 tie-break)
  - readCappedBody private helper (manual getReader loop, byte-budget abort, reader.cancel, TextDecoder fatal:false)
  - SOFT404_BODY_CAP_BYTES (16384) + NEAR_EMPTY_FLOOR_BYTES (512) + NOT_FOUND_MARKERS module constants
  - probeUrl 200-branch capped GET wiring (classifyTwoHundred) producing status 'soft-404' + evidence
  - fetchOnce generalized with rangeBytes arg (default 1024 preserves 405-fallback)
affects:
  - Plan 43-03 (persistLiveness already writes probeResult.evidence end-to-end; soft-404 now populates non-null evidence)
  - Plan 43-04 (cron-only 403 prune demotion + operator-status soft-404 widening)
  - Phase 44 (renders evidence verbatim as TEXT — see Threat Flags note)
tech-stack:
  added: []
  patterns:
    - 'pure exported helper (classifySoft404) for table-driven test with no fetch mock'
    - 'manual Response.body.getReader() loop with byte budget + finally reader.cancel (DoS cap on Range-ignoring servers)'
    - 'TextDecoder(utf-8, fatal:false) tolerates multibyte split at the cap boundary'
    - 'degrade-open: any body-read / classification failure → live, evidence null (never flag live dead)'
    - 'SSRF: follow-up body GET targets the already-redirect-followed + isPrivateHost-vetted finalUrl only'
key-files:
  created: []
  modified:
    - server/lib/urlLiveness.ts
    - server/__tests__/lib/urlLiveness.probe.test.ts
decisions:
  - 'D-01/D-21: capped GET fires on the 200 branch (HEAD-200, 405-fallback-GET-200, redirect-terminal-200) and honors the per-host 1 req/s throttle via waitForHostSlot'
  - 'D-02: three signals evaluated in order — (a) markers in <title> only, (b) deep→shallow redirect-to-home, (c) near-empty stripped content; early-return per signal'
  - 'D-02a: markers matched against <title> ONLY (not body) so articles ABOUT 404s never false-positive (RESEARCH anti-pattern)'
  - 'D-03: precision-first tie-break — no/ambiguous signal → soft404:false, evidence:null; never flags live content dead'
  - 'D-16: evidence strings verbatim — soft-404: matched "<marker>" in title / redirect-to-home: <orig> → <final> / near-empty: <n> bytes'
  - 'D-20: SOFT404_BODY_CAP_BYTES (16384), NEAR_EMPTY_FLOOR_BYTES (512), NOT_FOUND_MARKERS are hard-coded module const (NOT env)'
  - 'D-22: degrade-open on null body GET, body-read throw, or unparseable finalUrl host → live'
  - 'NOT_FOUND_MARKERS membership is Claude discretion (CONTEXT D-discretion): page not found, article not available, no longer exists, page no longer available, content not found, 404, not found'
metrics:
  duration_min: 6
  completed: 2026-06-10
  tasks: 2
  files: 2
---

# Phase 43 Plan 02: Soft-404 Body Heuristic Summary

Implemented the GHOST-06 soft-404 heuristic: every HTTP 200 in `probeUrl` (HEAD-200, 405-fallback-GET-200, or a redirect chain's terminal 200) now triggers a 16 KiB capped GET on the already-SSRF-vetted `finalUrl`, decodes the head, and feeds it into a pure exported `classifySoft404(bodyText, finalUrl, originalUrl)` that evaluates three signals in D-02 order — not-found markers in `<title>`, deep→shallow redirect-to-home, near-empty stripped content — with a precision-first tie-break (D-03: any ambiguity → `live`). No headless browser, no JS evaluation, no new packages. The capped read aborts at 16 KiB even when the server ignores `Range` (DoS guard), and any body-read failure degrades open to `live`.

## What Was Built

- **Task 1 (`test` `e1484ef` RED → `feat` `ce970f6` GREEN)** — `classifySoft404` pure helper + constants in `server/lib/urlLiveness.ts`:
  - `SOFT404_BODY_CAP_BYTES = 16384`, `NEAR_EMPTY_FLOOR_BYTES = 512`, `NOT_FOUND_MARKERS` (7-entry curated lowercase list) — all module-level `const`, no env (D-20).
  - `classifySoft404(bodyText, finalUrl, originalUrl): { soft404, evidence }` — (a) regex `<title>` capture, lowercased, substring-matched against markers; (b) `origDepth >= 2 && finalDepth <= 1` redirect-to-home (wrapped in try → degrade-open on malformed URL); (c) tag-stripped length `< NEAR_EMPTY_FLOOR_BYTES`. Early-return in D-02 order; no-signal → `{ soft404: false, evidence: null }`.
  - Table-driven test: 14 cases — 5 marker cases + body-only-marker negative, 4 redirect-to-home (2 positive + deep→deep negative + shallow-orig negative), 2 near-empty (positive + normal-article negative), no-signal tie-break, and BOTH-near-empty-AND-marker → marker-evidence (signal-order precedence).
  - GREEN commit needed a one-line `eslint-disable-next-line @typescript-eslint/no-unused-vars` on `SOFT404_BODY_CAP_BYTES` (consumed only by Task 2); removed in Task 2.

- **Task 2 (`test` `25d701e` RED → `feat` `f555209` GREEN)** — `readCappedBody` + `probeUrl` 200-branch wiring:
  - `readCappedBody(res, maxBytes)` — manual `res.body.getReader()` loop, accumulates chunks to a byte budget, breaks at the cap, `finally` `reader.cancel().catch(() => {})` (releases the connection for Range-ignoring servers), decodes via `TextDecoder('utf-8', { fatal: false })`.
  - `fetchOnce` generalized to accept `rangeBytes` (default `1024` — preserves the Phase 32 405-fallback's `bytes=0-1023`); the soft-404 GET passes `16384` → `bytes=0-16383`.
  - `classifyTwoHundred(finalUrl, originalUrl, httpStatus)` — replaces the bare `live` return on the 2xx branch: throttles via `waitForHostSlot` (D-21), issues the capped GET on `finalUrl` ONLY (SSRF T-43-03), reads + classifies; returns `soft-404`+evidence or `live`; degrade-open to `live` on null GET / body-read throw / unparseable host (D-22).
  - Probe test extended: `makeBodyResponse` stream helper (real `ReadableStream` with `pull`/`cancel`), 7 new wiring cases (soft-404 detection, normal-body live, `Range: bytes=0-16383` assertion, >16 KiB cap-abort with `reader.cancel` spy, body-read-throws degrade-open, SSRF vetted-finalUrl target, null-GET degrade-open), and the 5 pre-existing 200-terminal cases updated for the new follow-up GET.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated 5 pre-existing 200-terminal probe tests for the new follow-up capped GET**

- **Found during:** Task 2 RED authoring.
- **Issue:** The Phase 32 tests for `HEAD 200 → live`, `405→GET 200 → live`, `redirect chain → 200 live`, the UA test, and the two `fc-barcelona`/`fdcompany` SSRF-negative cases all asserted exact `fetchMock` call counts and passed a body-less `makeResponse(200)`. With the 200 branch now issuing a follow-up capped GET, those counts shift by one and a null body would classify as `near-empty` soft-404 — both would break the existing assertions.
- **Fix:** Added a follow-up `makeBodyResponse(NORMAL_ARTICLE_HTML)` mock to each and corrected the call counts (HEAD 200 → 2, 405-fallback → 3, redirect chain → 4). This is a direct, required consequence of the Task 2 wiring (the plan calls for extending the fetch-mock taxonomy), not new scope.
- **Files modified:** `server/__tests__/lib/urlLiveness.probe.test.ts`
- **Commit:** `25d701e` (RED) / verified GREEN at `f555209`

**2. [Rule 3 - Blocking] eslint no-unused-vars on `SOFT404_BODY_CAP_BYTES` at the Task 1 GREEN gate**

- **Found during:** Task 1 GREEN commit (pre-commit `eslint --fix` hook).
- **Issue:** The plan declares all three constants in Task 1 but `SOFT404_BODY_CAP_BYTES` is only consumed by Task 2's capped GET. The project's `@typescript-eslint/no-unused-vars` (argsIgnorePattern `^_`) blocked the commit.
- **Fix:** Added a single scoped `// eslint-disable-next-line ... -- wired into the capped GET in Task 2` with a forward-reference JSDoc note, preserving the constant's real name (no `_` prefix pollution). Removed the disable in Task 2's GREEN commit once the constant became live.
- **Files modified:** `server/lib/urlLiveness.ts`
- **Commit:** `ce970f6` (added) / `f555209` (removed)

## Verification

- `npx vitest run server/__tests__/lib/urlLiveness.probe.test.ts` — 41 passed (14 classifySoft404 + 7 new soft-404 wiring + 20 pre-existing probe cases).
- `npx tsc --noEmit` — exit 0.
- `npx vitest run server/__tests__/lib/urlLiveness` — 91 passed (all 4 urlLiveness suites; was 70 at Plan 01 close).
- `npx vitest run server/__tests__/routes` — 181 passed (no route regression from the probe change).
- `grep "export function classifySoft404"` → 1 match; `grep "readCappedBody"` → 4 matches; all three constants present as module-level `const` (no `process.env`).
- Capped GET asserted to send `Range: bytes=0-16383`; cap-abort asserted via `reader.cancel` spy on a >16 KiB stream; degrade-open asserted on body-read throw and null GET; SSRF asserted via vetted-finalUrl target.

## TDD Gate Compliance

`test(...)` RED commits precede their `feat(...)` GREEN commits for both tasks: Task 1 `e1484ef`→`ce970f6`, Task 2 `25d701e`→`f555209`. RED was verified failing before each GREEN (14 then 7 failing). No REFACTOR commit needed — implementation was clean on first GREEN.

## Known Stubs

None. `classifySoft404` and the `probeUrl` 200-branch wiring are end-to-end functional; `ProbeResult.evidence` (already threaded through `persistLiveness` in Plan 01) now carries non-null soft-404 provenance. The `no-url` explicit-classification write path (GHOST-07) and the cron-only 403 prune demotion (GHOST-09) are deliberately out of this plan's scope (Plans 03/04 respectively) — documented forward-references, not blocking stubs.

## Threat Flags

None beyond the plan's pre-registered register. The new capped GET (T-43-03 SSRF, T-43-04 DoS) and untrusted-body scan (T-43-05) are all `mitigate`-disposed in the plan's threat model and implemented as specified (vetted-finalUrl-only GET, 16 KiB `readCappedBody` abort, ASCII substring scan with no eval/parse/render). Carry-forward note for Phase 44 (per T-43-05): the `evidence` string must be rendered as TEXT, not HTML.

## Self-Check: PASSED

Both modified files exist on disk; all 4 task commits (`e1484ef`, `ce970f6`, `25d701e`, `f555209`) present in git history.
