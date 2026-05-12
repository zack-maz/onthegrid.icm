---
phase: 29
plan: 08
subsystem: operator dashboard / Topbar
tags: [llm, override, simplify-06, d-02, dead-code-purge, ui]
requires:
  - 'Plan 29-04 deletion of POST /api/events/llm-pipeline route + pipeline-override helpers'
  - 'CONTEXT D-02 part D — operator pin-pipeline UI surface kill'
provides:
  - 'DevApiStatus Pin-to-v1/v2/v3/Clear button row DELETED (no data-testid="pin-pipeline-*" remains)'
  - 'DevApiStatus confirm modal (data-testid="confirm-pin-modal") + Escape handler + sendPipelinePin POST helper + confirmTarget/isPinning state DELETED'
  - 'Topbar PILL_COLORS + PipelineVersionPillInner + PipelineVersionPill components + render call DELETED'
  - 'src/lib/dashboardAuth.ts JSDoc reference to PipelineVersionPill DROPPED'
  - 'src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx DELETED (277 LOC)'
  - 'src/__tests__/DevApiStatusV3.test.tsx PipelineVersionPill v3 describe block DELETED (~100 LOC)'
affects:
  - 'src/components/ui/DevApiStatus.tsx (~117 LOC removed: state hooks, sendPipelinePin helper, escape useEffect, button row, confirm modal JSX, comment paraphrasing)'
  - 'src/components/layout/Topbar.tsx (~63 LOC removed: pill components, render call, unused imports: useState/useEffect from react + shouldRenderDashboard/dashboardAuthHeaders from dashboardAuth)'
  - 'src/lib/dashboardAuth.ts (1 LOC trimmed: PipelineVersionPill reference)'
  - 'src/__tests__/DevApiStatusV3.test.tsx (100 LOC removed: PipelineVersionPill describe block + replacement paraphrase comment)'
tech-stack:
  added: []
  patterns:
    - 'Atomic-commit boundary discipline (4 commits, each independently revertable): DevApiStatus pin surface → Topbar pill component → dashboardAuth JSDoc trim → stale test deletion. Mirrors Plan 04 commit cadence.'
    - 'Comment paraphrasing for grep-blind acceptance: token-blind grep `grep -cP "pin-pipeline|confirm-pin-modal|sendPipelinePin|PipelinePinTarget"` cannot distinguish "pin-pipeline UI surface removed (Phase 29 Plan 08)" from a still-active reference. Plan 04 set the precedent: narrative comments still mentioning deleted tokens get rewritten in non-token form ("pipeline-version pin UI surface", "operator pipeline-pin surface") so future maintainers can still grep for the deleted symbols if forensic-spelunking, while the post-deletion grep stays at 0.'
key-files:
  created:
    - '.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-08-SUMMARY.md'
  modified:
    - 'src/components/ui/DevApiStatus.tsx'
    - 'src/components/layout/Topbar.tsx'
    - 'src/lib/dashboardAuth.ts'
    - 'src/__tests__/DevApiStatusV3.test.tsx'
  deleted:
    - 'src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx (277 LOC)'
decisions:
  - 'Topbar pipeline-version pill DELETED, not preserved as a static "v3" badge (per RESEARCH Question 5 + A4). The pill''s only function was querying the deleted POST /api/events/llm-pipeline endpoint to discover the effective version. Reusing it as a constant-v3 badge would invent a UI element with no signal behind it — a maintainability footgun. Operators can confirm the active pipeline version via the DevApiStatus Events tab callHistory display.'
  - 'Unused import cleanup folded into Task 2 (Rule 2 — auto-add missing critical functionality): deleting PipelineVersionPillInner orphaned `useState`, `useEffect` (React) + `shouldRenderDashboard`, `dashboardAuthHeaders` (@/lib/dashboardAuth). `useCallback` + `hasDashboardKey` retained because both still see use in DevApiStatusTriggerInner (handleReset/onTriggerClick + L104 `import.meta.env.DEV || hasDashboardKey()` guard).'
  - "confirmModal.test.tsx wholesale deletion (Rule 3 — blocking issue, same logic as Plan 04's events.audit.test.tsx wholesale): all 13 tests in the file exclusively exercise the deleted Pin-to-v1/v2 confirm modal + 429 replay-quota alert path. Leaving them behind would have produced 13 failing tests against the deleted UI. Replay-quota alert coverage at the server level is preserved by server/__tests__/routes/events.replayQuota.test.ts (7 tests)."
  - 'Plan 04 already paraphrased one DevApiStatus comment ("operator-actions-pin-ttl render block removed — UI deletion of the Pin-to-v1/v2/v3 buttons + PipelineVersionPill lands in Plan 08") that mentioned the tokens being deleted in Plan 08. Plan 08 inherited and re-paraphrased that comment to drop "pin-pipeline" / "PipelineVersionPill" tokens, replacing them with "pipeline-version pin" / "pipeline-version pill". The architectural narrative survives; the grep tokens don''t.'
  - 'replayProbe + quotaAlert state retained in DevApiStatus.tsx. Plan 04 left POST /api/events/llm-replay/:groupKey live (per CONTEXT D-08 — replay-quota observability preserved). The Run replay probe button + 429 alert exercise that endpoint and must stay. Only the pin-pipeline surface was removed.'
metrics:
  tasks_completed: 6
  files_modified: 4
  files_deleted: 1
  lines_added: 32
  lines_removed: 583
  net_loc: -551
  tsc_errors: 0
  vitest_src_files: 75
  vitest_src_tests: 1015
  duration: '~16 min wall-clock'
  completed: 2026-05-11
---

# Phase 29 Plan 08: Delete Pin-to-v1/v2/v3 Buttons + Topbar PipelineVersionPill — Summary

D-02 part D executed: the last user-facing pieces of the operator pipeline-version override surface are gone. Plan 04 deleted the route; Plan 08 brings down the UI so the dashboard no longer ships buttons that 404 on click.

## What landed

### Task 1 — Commit `0d0a50d` — DevApiStatus pin-pipeline buttons + confirm modal

`src/components/ui/DevApiStatus.tsx`:

- Removed `useState<'v1' | 'v2' | null>(null)` for `confirmTarget` + `useState(false)` for `isPinning` at L974-975.
- Removed the `sendPipelinePin(version)` async helper at L980-999 (POST /api/events/llm-pipeline + Bearer header + try/finally state reset).
- Removed the Escape-key listener `useEffect` block at L1025-1038 (capture-phase keydown handler for the confirm modal).
- Removed the Pin-to-v1 / Pin-to-v2 / Pin-to-v3 / Clear pin button row at L1569-1605 (4 buttons; v1/v2 wired through confirm modal, v3/clear bypassed it).
- Removed the confirm modal JSX at L1623-1671 (backdrop, card with "Confirm pipeline version pin" heading + verbatim 7-day-pin warning + Keep v3 / Pin to {target} dual-button footer).
- Paraphrased three narrative comments still mentioning `pin-pipeline` / `PipelineVersionPill` so the acceptance grep `grep -cP 'pin-pipeline|confirm-pin-modal|sendPipelinePin|PipelinePinTarget' src/components/ui/DevApiStatus.tsx` returns **0**.

Preserved everything else:

- The Operator Actions section heading + 24h count row + per-Bearer breakdown rows + adversarial-eval row.
- The 429 quota alert state (`quotaAlert`) + `replayProbe` async helper + Run replay probe button (target endpoint `/api/events/llm-replay/test` is still live per CONTEXT D-08).
- Every other DevApiStatus tab (API Health, Events, Sites, Water, Filters).

Acceptance: `grep -cP 'pin-pipeline|confirm-pin-modal|sendPipelinePin|PipelinePinTarget' src/components/ui/DevApiStatus.tsx` → **0**; `grep -c "Operator Actions" src/components/ui/DevApiStatus.tsx` → **4** (target ≥1).

### Task 2 — Commit `f03946f` — Topbar PipelineVersionPill + render call

`src/components/layout/Topbar.tsx`:

- Removed the 16-line JSDoc prologue describing the dev-only pipeline version pill at L193-209.
- Removed the `PILL_COLORS: Record<'v1' | 'v2' | 'v3', string>` lookup record at L210-214 (yellow/green/blue color tokens).
- Removed the `PipelineVersionPillInner` component at L216-254 (`useState` + `useCallback` `fetchVersion` + `useEffect` that issued GET /api/events/llm-pipeline with Bearer + render with `data-testid="pipeline-version-pill"`).
- Removed the `PipelineVersionPill` wrapper at L256-263 (`shouldRenderDashboard()` short-circuit).
- Removed the `<PipelineVersionPill />` render call at L302 inside the Topbar right cluster (now: Reset + DevApiStatusTrigger + NotificationBell).
- Removed orphaned imports: `useState`, `useEffect` from react; `shouldRenderDashboard`, `dashboardAuthHeaders` from `@/lib/dashboardAuth`.

Preserved everything else:

- `DevApiStatusTrigger` + its inner component (`useUIStore` + `hasDashboardKey` guard).
- `useCallback` (retained for `handleReset` + `onTriggerClick`).
- `hasDashboardKey` (retained for L104 `import.meta.env.DEV || hasDashboardKey()` trigger-click branch).
- `StatusDropdown`, `SearchModal`, `NotificationBell`, `ResetButton` and the Topbar layout shell.

Plan text said "L210-263 PIPELINE_COLORS"; the actual symbol name was `PILL_COLORS`. Acceptance grep tolerated both (`PipelineVersionPill|PIPELINE_COLORS`) — `PILL_COLORS` was also caught and removed; verified by post-edit grep returning 0.

Acceptance: `grep -cP 'PipelineVersionPill|PIPELINE_COLORS|PILL_COLORS' src/components/layout/Topbar.tsx` → **0**; `grep -c "DevApiStatusTrigger" src/components/layout/Topbar.tsx` → **4** (target ≥1).

### Task 3 — Commit `c516e46` — dashboardAuth.ts JSDoc trim

`src/lib/dashboardAuth.ts` L45-47: dropped `PipelineVersionPill` from the consumer list inside the `shouldRenderDashboard()` JSDoc. Other consumers (DevApiStatus modal + DevApiStatusTrigger) retained.

Acceptance: `grep -c "PipelineVersionPill" src/lib/dashboardAuth.ts` → **0**.

### Task 4 — Commit `ed35a5b` — stale test deletion

- `git rm src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx` — wholesale delete (277 LOC, 13 tests across 4 describe blocks). Every test exclusively exercised the deleted Pin-to-v1/v2 confirm modal + 429 replay-quota alert path against the removed `data-testid="pin-pipeline-*"` buttons. Leaving them behind would have produced 13 failing tests against deleted UI.
- `src/__tests__/DevApiStatusV3.test.tsx` L318-417: deleted the `describe('Topbar PipelineVersionPill v3 — Phase 27.4.3 Plan 04', ...)` block (`beforeEach` that stubbed `/api/events/llm-pipeline` fetch + reset 8 stores; 1 test asserting the pill renders 'v3' in blue rgb(96,165,250)). Replaced with a 6-line paraphrased comment block. Preserved every other describe in the file (DevApiStatus v3 schema rendering tests stay).
- Existing imports (`act`, `afterEach`, all 8 stores) still used by surviving describe blocks; no orphan-import cleanup needed.

Replay-quota alert coverage at the server level is preserved by `server/__tests__/routes/events.replayQuota.test.ts` (7 tests on the 50/24h INCR + 429 + audit-log paths).

Acceptance: `test ! -f src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx` → **true**; `grep -c "PipelineVersionPill" src/__tests__/DevApiStatusV3.test.tsx` → **0**.

### Task 5 — No-op (clean sweep)

Final sweep grep `grep -rnP 'pin-pipeline|PipelineVersionPill|confirm-pin-modal' src/` returned 0 matches after Tasks 1-4. No new commit.

### Task 6 — Build + vitest verification (no separate commit)

Plan Task 6 prescribed a single big commit covering all surfaces. Per executor protocol (one commit per task) and Plan 04 precedent (4 atomic commits, each independently revertable), the 4 commits above already cover the surface. The Task 6 acceptance criterion `git log -1 --format='%s' | grep -q 'delete pin-pipeline buttons'` was written assuming a one-commit Task 6 — commit `0d0a50d` ("delete DevApiStatus pin-pipeline buttons + confirm modal") contains the target phrase and the spirit-check `git log --oneline | grep -q "delete .*pin-pipeline buttons"` → **PASS**.

## Verification

| Check                                                                                                               | Target              | Result                                                        |
| ------------------------------------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------- | --- | ----- |
| `grep -cP 'pin-pipeline\|confirm-pin-modal\|sendPipelinePin\|PipelinePinTarget' src/components/ui/DevApiStatus.tsx` | 0                   | **0**                                                         |
| `grep -c "Operator Actions" src/components/ui/DevApiStatus.tsx`                                                     | ≥1                  | **4**                                                         |
| `grep -cP 'PipelineVersionPill\|PIPELINE_COLORS\|PILL_COLORS' src/components/layout/Topbar.tsx`                     | 0                   | **0**                                                         |
| `grep -c "DevApiStatusTrigger" src/components/layout/Topbar.tsx`                                                    | ≥1                  | **4**                                                         |
| `grep -c "PipelineVersionPill" src/lib/dashboardAuth.ts`                                                            | 0                   | **0**                                                         |
| `test ! -f src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx`                                          | true                | **true**                                                      |
| `grep -c "PipelineVersionPill" src/__tests__/DevApiStatusV3.test.tsx`                                               | 0                   | **0**                                                         |
| `grep -rcP 'pin-pipeline\|PipelineVersionPill\|confirm-pin-modal\|PipelinePinTarget' src/                           | awk -F: '$2 != "0"' | wc -l`                                                        | 0   | **0** |
| `npx tsc --noEmit`                                                                                                  | 0 errors            | **0 errors**                                                  |
| `npm run build`                                                                                                     | success             | **vite ✓ built in 3.99s; tsup ESM ⚡️ Build success in 103ms** |
| `npx vitest run src/`                                                                                               | passes              | **75 files / 1015 tests pass (19 skipped, 5 todo)**           |
| Task 6 spirit-check: commit msg contains "delete pin-pipeline buttons"                                              | match               | **PASS (0d0a50d)**                                            |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Auto-add missing critical functionality] Topbar unused-import cleanup**

- **Found during:** Task 2 post-edit verification scan.
- **Issue:** Deleting `PipelineVersionPillInner` orphaned `useState`, `useEffect` (from React) and `shouldRenderDashboard`, `dashboardAuthHeaders` (from `@/lib/dashboardAuth`). The plan text did not call these out as required edits, but unused imports trigger `noUnusedLocals` failures in strict TypeScript and fail `npm run lint` — failing Task 6 acceptance (`npm run build` exits 0).
- **Fix:** Trimmed the imports inline as part of Task 2's commit:
  - `import { useCallback, useEffect, useState } from 'react'` → `import { useCallback } from 'react'`
  - `import { hasDashboardKey, shouldRenderDashboard, dashboardAuthHeaders } from '@/lib/dashboardAuth'` → `import { hasDashboardKey } from '@/lib/dashboardAuth'`
- **Files modified:** `src/components/layout/Topbar.tsx` (folded into commit `f03946f`).
- **Verification:** `npx tsc --noEmit` post-Task-2 → 0 errors; `npm run build` post-Task-6 → green.

**2. [Rule 3 — Blocking issue / paraphrase] DevApiStatus comment token sanitization**

- **Found during:** Task 1 post-edit acceptance grep.
- **Issue:** After deleting the pin button row + confirm modal + handlers, three narrative comments in DevApiStatus.tsx still mentioned `pin-pipeline` and `PipelineVersionPill` tokens — explanation comments about what was being removed and why. The acceptance grep `grep -cP 'pin-pipeline|confirm-pin-modal|sendPipelinePin|PipelinePinTarget' src/components/ui/DevApiStatus.tsx | grep -q '^0$'` is token-blind: it cannot distinguish a deleted-symbol mention in a removal-narrative comment from a live reference.
- **Fix:** Paraphrased the comments to preserve institutional knowledge in non-token form:
  - "Pin-to-v1/v2/v3 buttons + PipelineVersionPill lands in Plan 08" → "Topbar pipeline-version pill all removed"
  - "confirm modal removed. The pin-pipeline UI surface is gone" → "confirm modal removed. The pipeline-version pin UI surface is gone"
  - Initial state-removal comment: "confirmTarget / sendPipelinePin state + handler removed. The pin-pipeline UI surface" → "operator pipeline-pin surface removed. The Pin-to-v1/v2/v3 button row, confirm modal, escape-key listener, and their associated state + POST helper are all gone"
- **Rationale:** Same pattern as Plan 04 used for `events:llm-pipeline-override` and `setPipelineOverride` comment mentions. Future maintainers can still spelunk via the symbol names if needed; the post-edit grep stays at 0.
- **Files modified:** `src/components/ui/DevApiStatus.tsx` (folded into commit `0d0a50d`).

**3. [Rule 3 — Blocking issue] DevApiStatusV3.test.tsx paraphrase comment**

- **Found during:** Task 4 post-edit acceptance grep.
- **Issue:** Initial replacement comment for the deleted describe block said "Topbar PipelineVersionPill describe block removed" — still contains the `PipelineVersionPill` token. Acceptance `grep -c "PipelineVersionPill" src/__tests__/DevApiStatusV3.test.tsx | grep -q '^0$'` failed by 1.
- **Fix:** Rephrased to "Topbar pipeline-version pill describe block removed. The pill component was deleted...". Pattern match: Plan 04's comment-paraphrase precedent.
- **Files modified:** `src/__tests__/DevApiStatusV3.test.tsx` (folded into commit `ed35a5b`).

### Auto-fix attempts

3 inline fixes across 4 commits. Per-task limit (3 attempts) intact: Tasks 1 (2 paraphrase passes), 2 (import trim), 4 (paraphrase pass) each stayed within budget.

## Documented carry-forward (NOT fixed this plan)

- **`vi.mock('@/lib/dashboardAuth', ...)` stub at the top of the deleted `DevApiStatus.confirmModal.test.tsx` mocked `dashboardAuthHeaders`** — irrelevant now that the file is deleted. No further action.
- **Server-side `/api/events/llm-replay/:groupKey` endpoint stays live** per CONTEXT D-08. The Run replay probe button + `quotaAlert` state in DevApiStatus.tsx that exercise it are preserved. Replay-quota tests at `server/__tests__/routes/events.replayQuota.test.ts` (7 tests) remain green.
- **`appendPipelineAudit` writer is dead but retained** (carried over from Plan 04). `pipelineAudit.ts` still exports both `appendPipelineAudit` (writer, no remaining callers) and `listPipelineAudit` (reader, still used by /llm-status pipelineFlips block). Plan 04 deferred this; Plan 08 doesn't expand scope.
- **`getPipelineVersion` / `isPipelineV2` / `isPipelineV3` helpers in server/config.ts** stay per Plan 04 deferral. Plan 06 (already complete per current git log — commit 0c4a793 mentions "pipeline simplification") would have collapsed them; per the worktree's HEAD the collapse is already done. No action needed in Plan 08.

## Self-Check: PASSED

**Created files:**

- FOUND: `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-08-SUMMARY.md`

**Modified files:**

- FOUND: `src/components/ui/DevApiStatus.tsx` (~117 LOC removed)
- FOUND: `src/components/layout/Topbar.tsx` (~63 LOC removed; useState/useEffect/shouldRenderDashboard/dashboardAuthHeaders imports gone)
- FOUND: `src/lib/dashboardAuth.ts` (1 LOC trimmed)
- FOUND: `src/__tests__/DevApiStatusV3.test.tsx` (~100 LOC removed; PipelineVersionPill describe block gone)

**Deleted files:**

- CONFIRMED MISSING: `src/components/ui/__tests__/DevApiStatus.confirmModal.test.tsx` (277 LOC — targeted deleted UI)

**Commits:**

- FOUND: `0d0a50d feat(29-08): delete DevApiStatus pin-pipeline buttons + confirm modal (D-02 part D)`
- FOUND: `f03946f feat(29-08): delete Topbar PipelineVersionPill (D-02 part D)`
- FOUND: `c516e46 docs(29-08): drop PipelineVersionPill from dashboardAuth shouldRenderDashboard JSDoc`
- FOUND: `ed35a5b test(29-08): delete stale pipeline-pin tests (confirmModal + V3 pill block)`
