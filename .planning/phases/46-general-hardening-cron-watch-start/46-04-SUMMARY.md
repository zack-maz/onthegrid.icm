---
phase: 46-general-hardening-cron-watch-start
plan: 04
subsystem: dashboard-operator-observability
tags:
  [
    HARD-01,
    HARD-02,
    HARD-03,
    dashboard,
    rate-limiter,
    cron-freshness,
    degrade-open,
    frozen-tablist,
    missedRun,
  ]

# Dependency graph
requires:
  - plan: 46-01
    provides: 'rateLimiter block on /api/operator-status (tiers[]{tier,max,windowSec,recent429})'
  - plan: 46-02
    provides: '/api/health missedRun SIBLING field (cronRunStateEnum unknown/missed/healthy) on cron-tier rows'
  - phase: 45
    provides: 'MetricRow / Sparkline atoms + frozen WAI-ARIA tablist (D-08) + CollapsibleGroup idiom'
provides:
  - 'OperatorStatus.rateLimiter?: RateLimiterBlock | null (client interface field — forward-compat optional, Phase 32 D-10)'
  - 'RateLimiterTelemetryBlock — per-tier limit config + recent 429s inside the API Health tabpanel'
  - 'CronFreshnessBlock — per-cron run-state badge (healthy/MISSED/unknown) read from the missedRun sibling'
  - 'tabMerge sidecar-absent render coverage (HARD-03 surface 3) + MISSED-visual + missed-never-in-status pins'
affects:
  - phase-47-load-test (reads the rendered limiter + cron blocks to confirm load was shed + crons survived)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 'Forward-compat optional client field (Phase 32 D-10): rateLimiter?: T | null appended alongside tokenBudget/trendHistory, NOT gated in fetchOpStatus'
    - 'Sibling-field read at the render layer: cron badge derives from health.endpoints[].missedRun, NEVER the wire status enum (okCron audit-gate safety)'
    - 'In-panel telemetry block inside the FROZEN role=tabpanel — new CollapsibleGroup, zero tablist DOM change'
    - 'Degrade-open render: null/absent source → MutedPlaceholder, never a crash (T-46-04-05)'
    - 'Zero inline hex: status badge colors resolve through var(--color-status-{healthy,degraded,warning}) @theme tokens via style prop'

key-files:
  created: []
  modified:
    - src/components/ui/DevApiStatus.tsx
    - src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx
    - src/components/ui/__tests__/DevApiStatusConsolidatedLayout.snapshot.test.tsx
    - src/components/ui/__tests__/__snapshots__/DevApiStatusConsolidatedLayout.snapshot.test.tsx.snap

key-decisions:
  - 'RateLimiterBlock type mirrors the 46-01 server shape byte-for-byte: tiers[]{tier,max,windowSec,recent429}'
  - 'Both new blocks mount in a single new CollapsibleGroup (slug=load-cron, "Load Shedding & Cron Freshness") appended after Group 4 (Operator Actions), inside the API Health role=tabpanel — placement discretion permitted by UI-SPEC §0'
  - 'Rate-limiter primary metric = total recent 429s; row value = {max}/{windowSec}s · {recent429} with a · 24h micro caption; non-zero recent count tints amber via --color-status-warning'
  - 'Cron primary metric = count of MISSED crons; per-cron row badge: healthy ● green / missed ● degraded + UPPERCASE MISSED / unknown ○ neutral; tick age from freshnessMs'
  - 'Short cron name derived from the endpoint key (cronHealth→health, cronWarm→warm, cronRefreshEvents→refresh-events)'
  - 'Snapshot regenerated DELIBERATELY (-u) with cron rows + rateLimiter fixtures; the captured subtree is all-apis-tab (inside the tabpanel) so the tablist/tabpanel wrapper is out of snapshot scope by construction — verified zero tab-id/role=tab/aria-selected diff'

patterns-established:
  - 'Frozen-tablist byte-stability assertion at the render level: tablistSkeleton() captures every tab id + aria-selected + roving tabIndex + each tabpanel aria-labelledby and asserts equality across present-vs-absent sidecar payloads'

requirements-completed: [HARD-01, HARD-02]

# Metrics
duration: 7min
completed: 2026-06-22
status: complete
---

# Phase 46 Plan 04: HARD-01 + HARD-02 Dashboard Tier — Rate-Limiter + Cron-Freshness Operator Blocks Summary

Rendered the two new read-only operator observability blocks INSIDE the existing API Health `role="tabpanel"` of `DevApiStatus.tsx`: a **Rate Limiter** block (per-tier `max/window` config + recent HTTP-429 counts from the 46-01 `opStatus.rateLimiter` field, total recent 429s as the primary metric) and a **Cron Freshness** block (per-cron run-state badge read from the 46-02 `missedRun` SIBLING field, count of MISSED crons as the primary metric, a distinct `--color-status-degraded` UPPERCASE `MISSED` alarm). Both degrade-open to a muted placeholder; the frozen WAI-ARIA tablist DOM is byte-stable; zero new inline hex.

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-22T20:01:05Z
- **Completed:** 2026-06-22T20:08:09Z
- **Tasks:** 3
- **Files modified:** 4

## What Was Built

### Task 1 — OperatorStatus.rateLimiter interface + RateLimiterBlock type (`3ac0e02`)

- Appended `rateLimiter?: RateLimiterBlock | null` to the `OperatorStatus` interface, alongside `tokenBudget?:` / `trendHistory?:` — forward-compat optional (Phase 32 D-10), NOT gated in `fetchOpStatus`.
- Defined the module-scope `RateLimiterBlock` type mirroring the 46-01 server shape byte-for-byte: `{ tiers: Array<{ tier: string; max: number; windowSec: number; recent429: number }> }` (confirmed against `46-01-SUMMARY.md` and `server/openapi.yaml`).
- Cited the Phase 32 D-10 forward-compat rationale in a comment mirroring the `tokenBudget`/`trendHistory` style.

### Task 2 — Rate-limiter + cron-freshness render blocks inside the API Health tabpanel (`79dfd50`)

- **`RateLimiterTelemetryBlock`** — one `text-[13px] font-semibold tabular-nums` primary metric = total recent 429s across tiers (`0` when nothing shed); a `By Tier` column-group head; one row per tier (label = tier name verbatim, value = `{max}/{windowSec}s · {recent429}`). A non-zero recent count tints the value amber via the `--color-status-warning` @theme token. Sources `opStatus?.rateLimiter`; degrade-open → `MutedPlaceholder reason="operator-status unreachable"`.
- **`CronFreshnessBlock`** — one primary metric = count of crons in the `missed` state; one row per cron-tier endpoint that carries `missedRun`. Badge: `healthy → ● --color-status-healthy`, `missed → ● --color-status-degraded + UPPERCASE MISSED label`, `unknown → ○ neutral text-white/40`. Plus the tick age from `freshnessMs` (`formatCronTickAge`). Reads the `missedRun` SIBLING off the already-consumed `/api/health` rows (NEVER the wire `status` enum). Degrade-open → `MutedPlaceholder reason="no cron data"` when no cron rows carry the sibling.
- Both mounted in a new `CollapsibleGroup` (slug `load-cron`, title "Load Shedding & Cron Freshness") appended after Group 4 (Operator Actions), INSIDE the API Health `role="tabpanel"` — no tablist DOM touched, MetricRow/Sparkline atoms untouched.
- Exactly two font weights `{400, 600}` (no `font-bold`); all server strings rendered as React text children (T-46-04-04 / T-43-16); zero inline hex.

### Task 3 — Sidecar-absent render coverage (HARD-03 surface 3) + deliberate snapshot regen (`89fc2cf`)

- Extended `DevApiStatus.tabMerge.test.tsx` with a `Phase 46 HARD-03` describe block (7 new tests, 15 → 22):
  - Rate-limiter block degrade-open when `rateLimiter` is **absent** AND when explicitly **null** (muted placeholder, no crash, primary metric absent).
  - Rate-limiter happy path (per-tier config + total recent 429s = `7` from `2 + 5`).
  - Cron block degrade-open (muted placeholder) when no cron rows carry `missedRun`.
  - **MISSED visual** — `missedRun: 'missed'` renders the UPPERCASE `MISSED` label + the `--color-status-degraded` token; `unknown` renders neutral (no MISSED badge); `healthy` not flagged. Primary metric = `1`.
  - **Audit-gate safety** — a cron whose wire `status: 'healthy'` but `missedRun: 'missed'` STILL renders `MISSED`, proving the badge never sources from `status`.
  - **Frozen tablist byte-stability** — `tablistSkeleton()` (tab ids + aria-selected + roving tabIndex + panel aria-labelledby) is identical across a full-sidecar render and a both-sidecars-absent render.
- Regenerated `DevApiStatusConsolidatedLayout.snapshot.test.tsx.snap` DELIBERATELY (`-u`) after enriching its fixtures with cron rows (healthy/missed/unknown) + a `rateLimiter` payload, so both new blocks render at full breadth in the lock.

## Critical Constraints Satisfied

- **FROZEN tablist DOM (Phase 45 D-08 / T-46-04-01):** Both blocks render inside the existing `role="tabpanel" aria-labelledby="tab-api-health"`. The snapshot is captured from the `all-apis-tab` subtree (inside the tabpanel) — the tablist/tabpanel wrapper is out of snapshot scope by construction; the diff carries zero `role="tab"` / `tab-{api-health,water,sites,events}` / `aria-selected` change. The only new `aria-labelledby` is the panel-body `group-load-cron` CollapsibleGroup header. `tablistSkeleton()` equality across present-vs-absent payloads pins it at the render level.
- **`missed` never reaches the wire status enum:** The cron badge reads `health.endpoints[].missedRun`; the audit-gate-safety test proves a `status: 'healthy' + missedRun: 'missed'` row renders `MISSED` (badge follows the sibling, not the enum).
- **Zero inline hex:** Task 2 grep gate (`#hex`/`rgba(` near the new blocks) returns clean; an extracted-block scan confirms no `#hex`/`rgba`/`font-bold`/`700` and that all badge colors resolve through `var(--color-status-{healthy,degraded,warning})`.
- **Degrade-open:** Every block self-hides to a `MutedPlaceholder` on null/absent source — no crash, route untouched.
- **Atom reuse:** `MetricRow`/`Sparkline` internals untouched; the cron/limiter rows follow the MetricRow `flex justify-between` tabular-nums idiom.

## Verification

- `npx vitest run src/components/ui/__tests__/DevApiStatus.tabMerge.test.tsx` — 22 passed (15 original + 7 new)
- `npx vitest run src/components/ui/__tests__/DevApiStatus.diagnosticBlocks.test.tsx src/components/ui/__tests__/DevApiStatus.operatorActions.test.tsx` — 26 passed (frozen pins green)
- `npx vitest run src/components/ui/__tests__/DevApiStatusConsolidatedLayout.snapshot.test.tsx` — 1 passed (deliberate regen)
- `npx vitest run src/components/ui/` — 12 files, 101 tests passed (no regression)
- Inline-hex grep gate (Task 2) — "no new inline hex near new blocks"
- Snapshot tablist-subtree diff check — zero `role=tab` / tab-id / `aria-selected` / tabpanel-attribute diff (only the new `group-load-cron` panel-body header)
- `npx tsc --noEmit -p tsconfig.json` — clean

## Threat Model Coverage

- **T-46-04-01 (Tampering — frozen tablist):** mitigated — blocks inside the existing tabpanel; diagnosticBlocks + tabMerge roving-tabindex/tab-id pins green; snapshot diff asserted confined to the panel body; `tablistSkeleton()` byte-stability test.
- **T-46-04-04 (Tampering — server strings as TEXT):** mitigated — tier names + cron names render as React text children, no `dangerouslySetInnerHTML`.
- **T-46-04-05 (DoS — null sidecar crashing the panel):** mitigated — both blocks degrade-open; proven by the Task 3 sidecar-absent (undefined + null) render tests.
- **T-46-04-02 / T-46-04-03 (Info Disclosure):** accept (unchanged) — limiter data already Bearer-gated server-side; cron freshness already public on `/api/health`. The client render adds no new exposure.

## Deviations from Plan

None — plan executed exactly as written. The two blocks were mounted in a single new `CollapsibleGroup` (placement explicitly left to executor discretion within the panel by UI-SPEC §0).

## Known Stubs

None.

## Self-Check: PASSED

- src/components/ui/DevApiStatus.tsx — FOUND (RateLimiterBlock type, RateLimiterTelemetryBlock, CronFreshnessBlock, group-load-cron mount)
- src/components/ui/**tests**/DevApiStatus.tabMerge.test.tsx — FOUND (HARD-03 describe block)
- src/components/ui/**tests**/DevApiStatusConsolidatedLayout.snapshot.test.tsx (+ .snap) — FOUND (regenerated)
- Commit 3ac0e02 (Task 1) — present in git log
- Commit 79dfd50 (Task 2) — present in git log
- Commit 89fc2cf (Task 3) — present in git log

---

_Phase: 46-general-hardening-cron-watch-start_
_Completed: 2026-06-22_
