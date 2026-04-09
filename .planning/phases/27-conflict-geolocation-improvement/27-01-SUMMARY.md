---
phase: 27-conflict-geolocation-improvement
plan: 01
subsystem: api
tags: [gdelt, cameo, conflict-events, event-taxonomy, llm, cerebras, groq, zod]

# Dependency graph
requires: []
provides:
  - 5-type ConflictEventType union (airstrike, on_ground, explosion, targeted, other)
  - Updated CAMEO-to-type mappings (BASE_CODE_MAP, ROOT_FALLBACK)
  - Updated GOLDSTEIN_CEILINGS for 5 types
  - LLM-enriched ConflictEventData fields (summary, casualties, precision, actors, sourceCount, llmProcessed)
  - CEREBRAS_API_KEY and GROQ_API_KEY env vars in config
  - Updated cacheResponse schema for new types + LLM fields
affects: [27-02, 27-03, 27-04, 27-05, 27-06, client-toggle-groups, client-severity-scoring, client-event-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - 5-type attack-vector taxonomy replaces 11-type CAMEO-derived taxonomy
    - LLM fields are all optional on ConflictEventData for backward compatibility

key-files:
  created: []
  modified:
    - server/types.ts
    - server/adapters/gdelt.ts
    - server/adapters/acled.ts
    - server/lib/eventScoring.ts
    - server/lib/geoValidation.ts
    - server/config.ts
    - server/schemas/cacheResponse.ts
    - server/__tests__/gdelt.test.ts
    - server/__tests__/lib/eventScoring.test.ts
    - server/__tests__/gdelt-fixtures.test.ts
    - server/__tests__/routes/events.test.ts
    - server/__tests__/adapters/acled.test.ts

key-decisions:
  - "5-type taxonomy groups by attack vector: airstrike (aerial), on_ground (infantry/assault), explosion (artillery/bombing), targeted (assassination/abduction), other (blockade/ceasefire/mass violence/WMD)"
  - "ROOT_FALLBACK maps root 18->on_ground, root 19->on_ground, root 20->other; unknown codes default to on_ground"
  - "GOLDSTEIN_CEILINGS downgrades: airstrike/explosion -> on_ground, on_ground/targeted -> other, other -> null (no downgrade)"
  - "LLM fields added as all-optional to ConflictEventData for zero-breaking-change backward compatibility"

patterns-established:
  - "5-type ConflictEventType union is the canonical event taxonomy going forward"
  - "classifyByBaseCode is the CAMEO fallback classifier when LLM is unavailable"

requirements-completed: [D-07, D-10, D-16]

# Metrics
duration: 16min
completed: 2026-04-09
---

# Phase 27 Plan 01: Server Type Foundation Summary

**5-type ConflictEventType taxonomy (airstrike/on_ground/explosion/targeted/other) with LLM-enriched data fields and updated CAMEO/Goldstein mappings across all server consumers**

## Performance

- **Duration:** 16 min
- **Started:** 2026-04-09T19:35:51Z
- **Completed:** 2026-04-09T19:51:57Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Replaced 11 CAMEO-derived ConflictEventType values with 5 attack-vector categories across all server code
- Updated BASE_CODE_MAP (17 entries), ROOT_FALLBACK (3 entries), and GOLDSTEIN_CEILINGS (5 entries) for new taxonomy
- Added 6 optional LLM-enriched fields to ConflictEventData (summary, casualties, precision, actors, sourceCount, llmProcessed)
- Added CEREBRAS_API_KEY and GROQ_API_KEY to env schema with empty-string defaults
- Updated cacheResponse Zod schema with new 5-type enum and LLM field validation
- All 517 server tests pass, zero TypeScript errors

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite ConflictEventType union and all server-side type consumers** - `932b189` (feat)
2. **Task 2: Update existing server tests for 5-type taxonomy** - `0ebb479` (test)

## Files Created/Modified
- `server/types.ts` - ConflictEventType union rewritten to 5 types; LLM fields added to ConflictEventData
- `server/adapters/gdelt.ts` - BASE_CODE_MAP, ROOT_FALLBACK, and fallback default updated for new taxonomy
- `server/adapters/acled.ts` - classifyEventType updated for new taxonomy (preserved adapter)
- `server/lib/eventScoring.ts` - GOLDSTEIN_CEILINGS replaced with 5 entries; TODO(26.2) removed
- `server/lib/geoValidation.ts` - Two TODO(26.2) markers removed (tables remain as fallback)
- `server/config.ts` - CEREBRAS_API_KEY, GROQ_API_KEY added to envSchema and AppConfig
- `server/schemas/cacheResponse.ts` - conflictEventEntitySchema updated for 5 types + LLM fields
- `server/__tests__/gdelt.test.ts` - 15 classifyByBaseCode assertions updated + new test for code 186
- `server/__tests__/lib/eventScoring.test.ts` - GOLDSTEIN_CEILINGS test rewritten for 5 types; sanity tests updated
- `server/__tests__/gdelt-fixtures.test.ts` - Yemen/Syria fixture assertions updated (shelling->explosion, bombing->explosion)
- `server/__tests__/routes/events.test.ts` - Mock config updated with cerebras/groq; event fixtures use new types
- `server/__tests__/adapters/acled.test.ts` - Classification assertions updated for new taxonomy

## Decisions Made
- Mapped CAMEO 200-204 (mass violence, mass expulsion, mass killings, ethnic cleansing, WMD) all to `other` -- these are rare and don't map cleanly to a single attack vector
- Mapped CAMEO 181 (abduction) and 185-186 (assassination) to `targeted` -- both involve specific targeting of individuals
- Mapped CAMEO 183 (bombing) and 194 (shelling/artillery) to `explosion` -- both involve explosive ordnance
- Default fallback for completely unknown codes changed from `assault` to `on_ground`
- ACLED adapter updated alongside GDELT adapter to maintain type system consistency (Rule 1 auto-fix)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ACLED adapter type values**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** `server/adapters/acled.ts` contained old type literals ('shelling', 'ground_combat', 'assassination', 'abduction', 'assault') that were no longer valid ConflictEventType values
- **Fix:** Updated classifyEventType function to use new 5-type taxonomy
- **Files modified:** server/adapters/acled.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 932b189 (Task 1 commit)

**2. [Rule 1 - Bug] Fixed GDELT audit record fallback type**
- **Found during:** Task 1 (TypeScript compilation check)
- **Issue:** `server/adapters/gdelt.ts` lines 574/623 used `'assault' as const` for audit Phase A rejection records, which was no longer a valid ConflictEventType
- **Fix:** Changed to `'on_ground' as const`
- **Files modified:** server/adapters/gdelt.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors
- **Committed in:** 932b189 (Task 1 commit)

**3. [Rule 1 - Bug] Fixed ACLED adapter test assertions**
- **Found during:** Task 2 (server test suite run)
- **Issue:** `server/__tests__/adapters/acled.test.ts` expected old type values ('shelling')
- **Fix:** Updated assertions to expect 'explosion'
- **Files modified:** server/__tests__/adapters/acled.test.ts
- **Verification:** All 517 server tests pass
- **Committed in:** 0ebb479 (Task 2 commit)

**4. [Rule 1 - Bug] Fixed GDELT fixture test assertions**
- **Found during:** Task 2 (server test suite run)
- **Issue:** `server/__tests__/gdelt-fixtures.test.ts` expected old type values ('shelling', 'bombing')
- **Fix:** Updated assertions to expect 'explosion'
- **Files modified:** server/__tests__/gdelt-fixtures.test.ts
- **Verification:** All 517 server tests pass
- **Committed in:** 0ebb479 (Task 2 commit)

**5. [Rule 1 - Bug] Fixed events route test mock config and fixtures**
- **Found during:** Task 2 (server test suite run)
- **Issue:** `server/__tests__/routes/events.test.ts` mock config missing `cerebras` and `groq` fields; event fixtures used old type values ('ground_combat', 'shelling', 'bombing')
- **Fix:** Added cerebras/groq to mock config; updated fixture types to new taxonomy
- **Files modified:** server/__tests__/routes/events.test.ts
- **Verification:** All 517 server tests pass
- **Committed in:** 0ebb479 (Task 2 commit)

---

**Total deviations:** 5 auto-fixed (5 Rule 1 bugs -- all type system consistency fixes)
**Impact on plan:** All auto-fixes were necessary consequences of the type union change. TypeScript's strict type checking surfaced every consumer that needed updating. No scope creep.

## Issues Encountered
None -- TypeScript strict mode surfaced all consumers of the old type union, making the migration mechanical.

## User Setup Required

External services require manual configuration for LLM providers (used by later plans in this phase):
- `CEREBRAS_API_KEY` -- obtain from https://cloud.cerebras.ai -> API Keys -> Create new key
- `GROQ_API_KEY` -- obtain from https://console.groq.com -> API Keys -> Create API Key

Both default to empty string (graceful degradation -- LLM features disabled when unconfigured).

## Next Phase Readiness
- 5-type taxonomy is now the canonical type system across all server code
- Client-side code still uses old 11-type taxonomy (CONFLICT_TOGGLE_GROUPS, EVENT_TYPE_LABELS, severity.ts TYPE_WEIGHTS) -- this is handled by Plan 05 (client-side migration)
- LLM data fields are ready for Plan 02 (LLM provider adapter) and Plan 03 (event grouping + extraction)

## Self-Check: PASSED

- All 7 modified source files exist on disk
- Commit 932b189 (Task 1) found in git log
- Commit 0ebb479 (Task 2) found in git log
- SUMMARY.md exists at expected path
- 517/517 server tests pass
- 0 TypeScript errors

---
*Phase: 27-conflict-geolocation-improvement*
*Completed: 2026-04-09*
