# Phase 33 — Deferred Items

Out-of-scope discoveries logged during Phase 33 execution. These are NOT
fixed in Phase 33 — they belong to the originating phase's surface area.

---

## D-1 (Plan 33-06): Pre-existing flake in operator-status SCAN budget guard

**Test:** `server/routes/__tests__/operator-status.test.ts` →
`prune.deadUrlSample: short-circuits SCAN at MAX_SCAN_KEYS=200 to bound budget`

**Symptom:** Assertion `scannedKeysTotal ≤ 200` fails (observed `201`).

**Origin:** Pre-existing at parent HEAD `0b3d329` (Phase 32 Plan 04 commit
`5435196`). Confirmed via `git show 0b3d329:server/routes/__tests__/operator-status.test.ts`.

**Scope:** Phase 33-06 changes `server/routes/operator-status.ts` ONLY to
append the actorQuality block AFTER the prune block. The SCAN loop and
`MAX_SCAN_KEYS` short-circuit semantics in `buildDeadUrlSample` are
UNCHANGED. The flake is in Phase 32's surface area.

**Root cause (speculative — not investigated here):** Off-by-one in the
SCAN loop's `MAX_SCAN_KEYS` guard — likely the `if (scanned >= MAX_SCAN_KEYS)`
check fires AFTER `scanned += 1` for the 201st key, so the cap admits one
extra `cacheGetSafe` call before the cursor short-circuit takes effect.

**Recommended fix (Phase 32 follow-up):** In
`server/routes/operator-status.ts:buildDeadUrlSample`, move the budget check
BEFORE `scanned += 1`, or change the test's assertion to `≤ 201` if the
off-by-one is intentional.

**Status:** Logged. Not fixed by Plan 33-06 (out of scope).
