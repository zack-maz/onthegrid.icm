---
phase: 45-dashboard-subtab-readability-redesign
reviewed: 2026-06-21T22:30:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - server/lib/trendHistory.ts
  - server/routes/cron-health.ts
  - server/routes/operator-status.ts
  - server/openapi.yaml
  - src/components/ui/DevApiStatus.tsx
  - src/components/ui/MetricRow.tsx
  - src/components/ui/Sparkline.tsx
  - server/__tests__/lib/trendHistory.test.ts
  - server/routes/__tests__/operator-status.test.ts
  - src/__tests__/devApiStatus.test.tsx
  - src/__tests__/devApiStatusEventsSection.test.tsx
  - src/__tests__/sitesFiltersSection.test.tsx
  - src/components/ui/__tests__/MetricRow.test.tsx
  - src/components/ui/__tests__/Sparkline.test.tsx
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 45: Code Review Report

**Reviewed:** 2026-06-21T22:30:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Phase 45 restyles the Water/Sites/Events operator subtabs for readability, adds two
reusable atoms (`MetricRow`, `Sparkline`), and adds a server-backed bounded Redis
trend-history ring (`dashboard:trends:history`) written by the existing
`/api/cron/health` cron and surfaced on `/api/operator-status`. The implementation is
disciplined: the degrade-open posture is honored throughout (every Redis read is
try/caught and never bubbles a 500), the four hard phase constraints all hold —
DASH-READ-04 (no tablist/tabpanel/tab-merge change), DASH-READ-03 (no new inline
hex/rgba — verified by grep over added lines), and the degrade-open server-read
contract — and all 84 phase tests pass.

No BLOCKER-level defects (crashes, security holes, data loss). The most material finding
is a semantic visualization inversion in the cron-freshness sparklines: an absent cron
tick (`cronAgeMs === null`, i.e. the cron is dead/never ran — the _most_ degraded state)
is mapped to `0` in the trend line, which the Sparkline draws as the _freshest_ point and
which the degradation-threshold tint never fires on. The textual metric beside it is
honest ("—"), but the sparkline itself can read as healthy when the cron is dead. Two
smaller robustness/duplication warnings round out the list.

## Warnings

### WR-01: Dead-cron freshness renders as the healthiest sparkline point (semantic inversion)

**File:** `src/components/ui/DevApiStatus.tsx:902-903` (and threshold wiring 914-937)
**Issue:** In `TrendBlock`, the per-cron series collapses a `null` freshness age to `0`:

```ts
const cronSeries = (name): number[] => chrono.map((s) => s.cronAgeMs[name] ?? 0);
```

`cronAgeMs[name] === null` means the cron's `cron:lastTick:{name}` key was _absent_ —
i.e. the cron never ran / is dead, which is the single most degraded state. But `0` is
the _minimum_ age (just-ran), so the Sparkline plots it at the bottom of the well as the
freshest possible sample, and the degradation tint (`latest > CRON_STALE_MS`,
`thresholdDirection="above"`) can never fire on a `null` latest value because `0` is below
the 30h threshold. Net effect: a stalled/dead cron can render as a healthy flat-low
sparkline. The current-value text beside it (`formatCronAge` → "—") is honest, so the
inversion is confined to the line/marker, but the marker is the at-a-glance "is this OK"
signal the well exists to provide. The inline comment at 836-838 acknowledges this
tradeoff ("null reads as the floor") but the choice contradicts the well's purpose.

**Fix:** Map a `null` latest age to a degraded marker rather than the healthy floor.
Either substitute a sentinel at/above the threshold for `null` samples, or pass an
explicit "degraded" flag into the Sparkline for null-latest. Minimal version — tint when
the latest sample is null:

```ts
// In TrendBlock, derive a per-cron "latest is absent" degraded signal and force the tint.
const cronLatestNull = (name) => latest.cronAgeMs[name] == null;
// then for each cron well, when cronLatestNull(name) is true, render the marker with the
// semantic token (e.g. pass threshold = -Infinity or a dedicated `forceDegraded` prop)
```

or sentinel the series so a null maps to `CRON_STALE_MS` (the degraded edge) instead of 0.

### WR-02: `appendTrendSample` issues 3 sequential awaited Redis round-trips on every cron tick

**File:** `server/lib/trendHistory.ts:76-84`
**Issue:** `appendTrendSample` awaits `lpush`, then `ltrim`, then `expire` sequentially.
This faithfully copies the `llmRunHistory` precedent, but each is a separate Upstash REST
round-trip. Under the once-daily cron tick this is harmless for latency, but the three
calls are non-atomic: if the process is killed (Vercel `maxDuration`) after `lpush` but
before `expire`, the ring grows unbounded-by-TTL until the next successful run re-applies
`expire`, and a kill between `lpush` and `ltrim` leaves the ring transiently at 31
entries. Not a correctness bug for the consumer (reader caps at `TREND_MAX-1`), but the
TTL gap means a crash-looping cron could leave a no-TTL key.

**Fix:** Pipeline the three commands so they execute atomically in one round-trip:

```ts
await redis
  .pipeline()
  .lpush(TREND_HISTORY_KEY, JSON.stringify(sample))
  .ltrim(TREND_HISTORY_KEY, 0, TREND_MAX - 1)
  .expire(TREND_HISTORY_KEY, TREND_TTL_SEC)
  .exec();
```

This keeps the degrade-open try/catch and removes the partial-write TTL gap.

### WR-03: Trend sample age can go negative on clock skew, producing an out-of-range sparkline point

**File:** `server/routes/cron-health.ts:153-154`
**Issue:** `tickTs` is read from a Redis-stored `Date.now()` written by a (possibly
different) serverless invocation; `sampleNow - tickTs` is then stored as `cronAgeMs`. If
the writer's wall clock was ahead of the reader's (Fluid Compute cold-start clock skew),
the age is negative. The Sparkline then computes `y = 100 - (v/max)*100 > 100`, drawing
the point below the viewBox (clipped by `preserveAspectRatio="none"` but visually wrong),
and `formatCronAge` would render a negative `h`/`m` string. No crash, but a nonsensical
display.

**Fix:** Floor the age at 0 at the sample site:

```ts
return Math.max(0, sampleNow - tickTs);
```

## Info

### IN-01: `TrendSample` shape is triplicated across modules

**File:** `server/lib/trendHistory.ts:46-55`, `src/components/ui/DevApiStatus.tsx:763-771`, `server/openapi.yaml:707-744`
**Issue:** The same `{ sampledAt, cronAgeMs: {health,warm,'refresh-events'}, deadUrlCount }`
shape is declared three times (server interface, client local `type`, OpenAPI schema).
This matches the codebase's existing client/server type-mirror convention (e.g.
`TokenBudgetBlock`), but there is no contract test pinning client/server drift the way
`tokenBudget` has its Zod `.strict()` pin. A field rename on one side would not fail the
build.
**Fix:** Optional — add a lightweight shape-pin test for `trendHistory` mirroring the
`tokenBudget` Zod `.strict()` precedent, or accept the documented mirror convention.

### IN-02: Water rejection disclosure renders summed buckets and per-type buckets with duplicate labels

**File:** `src/components/ui/DevApiStatus.tsx:252-291`
**Issue:** Inside the water "Rejections by Type" disclosure, the summed `rejectionRows`
(e.g. label "Excluded location") and the per-type `byTypeRejections` rows (also label
"Excluded location", repeated per type) render the same human labels with no testid on the
per-type rows. When `byTypeRejections` is populated this produces many rows sharing the
text "Excluded location", "Duplicate", etc. There is no React key collision (the wrapping
`<div key={type}>` is unique and `MetricRow` rows are keyed by `row.key` only in the summed
list), and no functional bug, but the repeated unlabeled-by-context rows are hard to scan —
mildly at odds with the DASH-READ-01 scannability goal.
**Fix:** Optional — prefix the per-type rows with their type or nest them so the repeated
reason labels are unambiguous; or add per-type testids for parity with the summed rows.

### IN-03: Dead-link "new high" threshold tints even a flat-zero history

**File:** `src/components/ui/DevApiStatus.tsx:906-908`
**Issue:** `deadThreshold = Math.max(...priorDead)`; with `thresholdDirection="above"`,
the latest tints when `latest > priorPeak`. If all prior samples are `0` and the latest is
`1`, the marker tints "degraded" — correct intent (a rising count). But if the entire
history is `0` and latest is `0`, `0 > 0` is false, so no tint — also correct. Edge is
benign; noting only that "new high" semantics mean the _first ever_ nonzero dead-link
count always tints, which may be noisier than intended for a freshly-seeded ring.
**Fix:** None required; document the "first nonzero = tint" behavior if it surprises
operators.

### IN-04: `cacheGetSafe(..., 999_999_999)` reads stale ticks without surfacing staleness

**File:** `server/routes/cron-health.ts:151`
**Issue:** The lastTick read uses a ~11.6-day logical TTL, so `cacheGetSafe` returns the
data with `stale: true` for any tick older than that window but the code ignores `stale`
and uses `entry.data` regardless. Since the consumer wants the raw age anyway this is
correct behavior, but the giant magic TTL is opaque. The `cron:lastTick:*` keys themselves
have a 7d hard TTL, so a tick older than 7d is already gone (read returns null → null age),
making the 11.6-day logical TTL effectively unreachable.
**Fix:** Optional — replace `999_999_999` with a named constant or a comment noting the 7d
key TTL makes the logical TTL a don't-care.

---

_Reviewed: 2026-06-21T22:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
