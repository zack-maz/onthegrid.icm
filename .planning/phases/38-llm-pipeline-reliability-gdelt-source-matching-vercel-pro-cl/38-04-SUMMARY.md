---
phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl
plan: 04
subsystem: api
tags: [transliteration, romanization, overpass, water, search, react]

# Dependency graph
requires:
  - phase: 38-03
    provides: 'audit-script CLI shape (pure-logic + isDirectRun CLI shell) + the package.json `scripts` slot serialized to avoid the audit-entry edit conflict'
provides:
  - 'transliteration@2.6.1 pinned (legitimacy-gated install)'
  - 'server/lib/romanize.ts — transliterate wrapper + artifact-cleanup pass (searchable-token bar)'
  - 'scripts/audit-water-names.ts + `npm run audit:water` — per-script non-Latin gate-rejection audit'
  - 'WaterFacility.nameLatin + nameOriginal optional fields'
  - 'overpass-water.applyRomanizedName() — romanize BEFORE the Latin-label admission gate'
  - 'consumer-surface display of nameLatin with original-on-hover (detail panel, water tooltip, search index)'
affects: [water-layer, search, overpass-water adapter, consumer detail/tooltip surfaces]

# Tech tracking
tech-stack:
  added: [transliteration@2.6.1]
  patterns:
    - 'Romanize-before-gate: synthetic Latin name:en injected before computeAdmissionDecision so non-Latin infra admits without weakening GENERIC_OSM_NAME_RE'
    - 'RESET acceptance bar — romanization targets a machine-searchable Latin token, not pretty human vowelization (abjad vowel-less ceiling)'
    - 'Pure-logic + isDirectRun CLI shell audit-script shape (mirrors 38-03 audit-gdelt-corpus)'

key-files:
  created:
    - server/lib/romanize.ts
    - server/__tests__/lib/romanize.test.ts
    - scripts/audit-water-names.ts
    - server/__tests__/scripts/audit-water-names.test.ts
  modified:
    - package.json
    - package-lock.json
    - server/types.ts
    - server/adapters/overpass-water.ts
    - server/__tests__/adapters/overpass-water.test.ts
    - src/components/detail/WaterFacilityDetail.tsx
    - src/components/detail/__tests__/WaterFacilityDetail.gateSwap.test.tsx
    - src/components/map/layers/WaterOverlay.tsx
    - src/lib/searchUtils.ts
    - src/lib/__tests__/waterLabel.test.ts

key-decisions:
  - 'D-08 library-evaluation outcome: KEEP transliteration, SKIP ICU. The reset bar (searchable Latin token) is met by transliteration + artifact-cleanup; ICU shares the same abjad vowel-less ceiling at native-binary serverless cost for zero quality win.'
  - 'Romanization injected as a synthetic name:en on a COPY of tags before computeAdmissionDecision — el.tags is never mutated, the original non-Latin name is preserved in nameOriginal.'
  - 'Desalination is NOT double-processed (gate-exempt per D-03); applyRomanizedName early-returns for it and for already-Latin names.'
  - 'The real water tooltip surface is WaterTooltip (WaterOverlay.tsx), NOT EntityTooltip.tsx (whose type union excludes water). Updated the actual surface; EntityTooltip needed no change.'
  - 'Audit script reuses the live hasLatinLabel for gate-rejection counting; live cache stores POST-gate facilities, so a --snapshot of raw Overpass elements is the faithful pre-gate input path.'

patterns-established:
  - 'applyRomanizedName(tags, facilityType) → { tags, nameLatin?, nameOriginal? }: idempotent, copy-on-write romanization helper callable before any admission gate'
  - "Unicode-block ranges expressed with \\u escapes (not literal RTL glyphs) to satisfy eslint no-irregular-whitespace"

requirements-completed: [WATER-LATIN-01, WATER-LATIN-02, WATER-LATIN-03, WATER-LATIN-04]

# Metrics
duration: 70min
completed: 2026-06-04
---

# Phase 38 Plan 04: WATER-LATIN Romanization Summary

**Non-Latin water-facility names (Arabic/Persian/Hebrew) now romanize into a searchable Latin token injected BEFORE the Overpass Latin-label admission gate, so legitimate infrastructure stops being dropped — surfaced via `nameLatin` with the original preserved and shown on hover/sub-label across detail panel, tooltip, and search.**

## Performance

- **Duration:** ~70 min
- **Started:** 2026-06-04T16:27Z (approx)
- **Completed:** 2026-06-04T16:38Z
- **Tasks:** 3 (1 pre-approved checkpoint + 2 auto/TDD)
- **Files modified:** 14 (4 created, 10 modified)

## Accomplishments

- Installed `transliteration@2.6.1` pinned exact (zero deps, no postinstall) — the legitimacy checkpoint was pre-approved by the operator after independent npm-registry verification.
- `server/lib/romanize.ts`: `transliterate` wrapper + artifact-cleanup pass — strips the ة→`@` artifact (→`a`), lowercases the uppercase emphatic consonant artifacts (ص/ط/ح/ض/ظ/غ → s/t/h/d/z/g), collapses repeated separators, re-applies title-case, and falls back to a ≥2-char token (qualifier or `Facility`) for pure-diacritic input. Output clears the RESET searchable-token bar: passes `isLatin`, contains no `@`, ≥2 chars.
- `scripts/audit-water-names.ts` + `npm run audit:water`: READ-ONLY per-script (Arabic incl. Persian / Hebrew) bucketing of facilities the Latin-label gate would reject, reusing the live `hasLatinLabel`.
- `applyRomanizedName()` in overpass-water.ts: romanizes a non-Latin `name` into a synthetic `name:en` injected BEFORE `computeAdmissionDecision`, so Arabic/Persian/Hebrew facilities admit; the original is preserved in `nameOriginal`; desalination and already-Latin facilities are untouched; `GENERIC_OSM_NAME_RE` stays intact (romanized bare generics still filtered).
- Consumer surfaces: `WaterFacilityDetail` and `WaterTooltip` show the romanized display name with the original on hover (`title`) and as a sub-label; `searchUtils` indexes both `nameLatin` and `nameOriginal` so either query form matches.

## Task Commits

1. **Task 1: romanize wrapper + non-Latin name audit (WATER-LATIN-01/02)** — `59e16e8` (feat) — TDD: test written first (RED confirmed: module-not-found), then romanize.ts + audit script (GREEN). Includes the `transliteration@2.6.1` install + `audit:water` script entry.
2. **Task 2: romanize before gate + nameLatin field + consumer surfaces (WATER-LATIN-03/04)** — `88a34f4` (feat) — adapter injection, type fields, detail/tooltip/search consumer updates, fixtures extended.

_Checkpoint Task 0 (transliteration legitimacy gate) was pre-approved by the operator; treated as resolved "approved" and not paused on._

**Plan metadata:** (this SUMMARY + STATE/ROADMAP/REQUIREMENTS) — `docs(38-04)` commit.

## Files Created/Modified

- `server/lib/romanize.ts` — transliterate wrapper + artifact-cleanup + ≥2-char fallback.
- `server/__tests__/lib/romanize.test.ts` — asserts the searchable-token bar on the RESEARCH sample table.
- `scripts/audit-water-names.ts` — WATER-LATIN-01 per-script gate-rejection audit (READ-ONLY).
- `server/__tests__/scripts/audit-water-names.test.ts` — pure-logic bucketing assertions.
- `server/types.ts` — added optional `nameLatin` + `nameOriginal` to `WaterFacility`.
- `server/adapters/overpass-water.ts` — `applyRomanizedName()` + wired into `normalizeWaterElement` before the gate; facility carries the new fields; `extractLabel`/scoring/capacity now read the augmented tags.
- `server/__tests__/adapters/overpass-water.test.ts` — 7 new WATER-LATIN-03 cases (admit Arabic/Persian, original preserved, generic still rejected, el.tags not mutated, desal not double-processed).
- `src/components/detail/WaterFacilityDetail.tsx` — name heading with romanized display + original sub-label/hover.
- `src/components/detail/__tests__/WaterFacilityDetail.gateSwap.test.tsx` — extended fixture + 2 render-contract cases.
- `src/components/map/layers/WaterOverlay.tsx` — WaterTooltip original sub-label/hover.
- `src/lib/searchUtils.ts` — index `nameLatin` + `nameOriginal`.
- `src/lib/__tests__/waterLabel.test.ts` — extended `makeFacility`, romanized-display + search-index cases.
- `package.json` / `package-lock.json` — `transliteration@2.6.1` + `audit:water` script.

## Decisions Made

- **D-08 evaluation outcome recorded:** kept `transliteration`, reset the bar to "searchable Latin token", skipped ICU (no quality win over the abjad vowel-less ceiling, native-binary serverless risk). Documented in `romanize.ts` header.
- **Per-script override list (artifact cleanup applied):** Arabic ة (`@`→`a`); uppercase emphatic artifacts ص/ط/ح/ض/ظ/غ + ق etc. lowercased en masse via `.toLowerCase()` then re-title-cased; separator-run collapse. No additional per-letter overrides were needed because the cleanup pass already clears the searchable-token bar for every RESEARCH sample (Arabic/Persian/Hebrew).
- **EntityTooltip.tsx left unchanged:** its `MapEntity | SiteEntity` type union excludes water; the genuine water tooltip surface is `WaterTooltip` in `WaterOverlay.tsx`, which was updated instead.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] eslint `no-irregular-whitespace` on Unicode-range regex literals**

- **Found during:** Task 1 (commit pre-commit hook)
- **Issue:** The audit script's Arabic/Hebrew Unicode block ranges were written with literal RTL glyphs, which carry RTL control marks that the `no-irregular-whitespace` rule rejects, blocking the commit.
- **Fix:** Rewrote `ARABIC_RE` / `HEBREW_RE` using `\u`-escaped ranges (no literal RTL glyphs in source).
- **Files modified:** scripts/audit-water-names.ts
- **Verification:** `npx eslint` exit 0; audit test still green.
- **Committed in:** 59e16e8 (Task 1 commit)

**2. [Rule 3 - Blocking] eslint `no-control-regex` on an ASCII test assertion**

- **Found during:** Task 2 (lint pass before commit)
- **Issue:** A `/^[\x00-\x7F]+$/` ASCII-only assertion in the adapter test tripped `no-control-regex` (control chars in the class).
- **Fix:** Replaced with the same `isLatin` pattern the admission gate uses (`/^[\p{Script=Latin}\d\s\p{P}\p{S}]+$/u`).
- **Files modified:** server/**tests**/adapters/overpass-water.test.ts
- **Verification:** `npx eslint` exit 0; adapter suite green.
- **Committed in:** 88a34f4 (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking lint errors). Neither altered behavior — both are source-hygiene fixes to satisfy the repo's lint gate.
**Impact on plan:** No scope creep. The plan executed as written.

## Issues Encountered

None beyond the two auto-fixed lint blockers above. Both unit suites and the full `server/ src/components/detail/ src/lib/` plan-gate suite (117 files / 1453 tests) plus `tsc -b` and `type-coverage` (97.62%) pass.

## User Setup Required

None — `transliteration` install committed; no external service or env-var configuration needed.

## Next Phase Readiness

- WATER-LATIN strand complete; `nameLatin`/`nameOriginal` are optional so the live 24h-TTL `water:facilities:v3` cache self-heals on the next Overpass fetch (old entries without the fields still validate).
- The `audit:water` script is available to quantify the pre-gate non-Latin rejection surface (use `--snapshot` of raw Overpass elements for a faithful pre-gate count, since the live cache stores post-gate facilities).
- No blockers for the remaining Phase 38 plans.

## Self-Check: PASSED

- Files: FOUND server/lib/romanize.ts, server/**tests**/lib/romanize.test.ts, scripts/audit-water-names.ts, server/**tests**/scripts/audit-water-names.test.ts
- Commits: FOUND 59e16e8, FOUND 88a34f4
- Acceptance greps: `transliteration` in package.json (1), `nameLatin` in server/types.ts (3), `romanize` in overpass-water.ts (13), `nameLatin` in searchUtils.ts (2), `audit:water` in package.json (1)

---

_Phase: 38-llm-pipeline-reliability-gdelt-source-matching-vercel-pro-cl_
_Completed: 2026-06-04_
