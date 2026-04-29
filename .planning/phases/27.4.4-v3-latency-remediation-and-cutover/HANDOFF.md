---
phase: 27.4.4
plan: 02
artifact: HANDOFF
created: 2026-04-29T15:20Z
operator: zackmaz
supersedes: HANDOFF.md (2026-04-28T17:15Z) — Plan 02 task list pre-dev-pass
session_focus: Dev-pass v3 pipeline debugging + 3 high-impact fixes (5 commits)
---

# 27.4.4 — HANDOFF (post-dev-pass, pre-cutover)

The 2026-04-29 session pivoted from the original Plan 02 cutover script
into a deep dev-pass on the v3 pipeline. Five commits landed that fix
real production-side data integrity issues, plus a forensic recording
artifact captured a full v3 run end-to-end. **Plan 02 Tasks 1+2 are
shipped**; Tasks 3–7 (Gate B 2-pass, cutover POST, UAT close, SUMMARY)
are still operator-gated and pending.

The user's stated end-state goal:

> "I want both [dev and prod] working in sync for now, then I'll abandon
> dev and move all keys to prod for live launch."

## Current branch state

- Branch: `feature/27.4.4-v3-latency-remediation-and-cutover`
- HEAD: `43edfe8` (resolver Branch 4 gate + v3 adapter + geocode cache
  hygiene — three bug fixes in one commit)
- Ahead of `main`: 22 commits — the original Plan 01 work plus 8 new
  commits this session.
- Working tree: 3 untracked dev-pass scratch scripts (see "Dev-pass
  scratch files" section below). Decide whether to commit, ignore, or
  delete before final push.
- Test suite: **1037 / 0 todo / 0 regressions** (was 1026 at session
  start). Typecheck clean.

## Plan 02 task status

| Task | Description                      | Status                   | Evidence                                                                  |
| ---- | -------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| 1    | extract-gate-b-snapshot.sh       | ✓ shipped                | commit `1325fd1`                                                          |
| 2    | Gate A re-baseline (D-16 #3)     | ✓ shipped + re-baselined | commits `36cde0e` + `f347244`; PROD `events:llm-eval-baseline:v3` = 0.980 |
| 3    | Gate B Pass 1                    | ⏸ pending                | operator-gated; needs Vercel prod env flips first                         |
| 4    | Gate B Pass 2                    | ⏸ pending                | reproducibility check                                                     |
| 5    | Cutover POST {version: v3}       | ⏸ pending                | needs Tasks 3+4 PASS                                                      |
| 6    | Close 27.4.2 HUMAN-UAT tests 1+2 | ⏸ pending                | links to CUTOVER.md                                                       |
| 7    | Plan 02 SUMMARY closeout         | ⏸ pending                | final closeout                                                            |

## Session commits (top → bottom = chronological)

| SHA       | Subject                                                            | Why                                                          |
| --------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `1325fd1` | extract-gate-b-snapshot.sh                                         | Plan 02 Task 1: bash + jq helper for Gate B threshold tables |
| `36cde0e` | Gate A re-baseline 0.940 (PASS) — checkpoint 3                     | Plan 02 Task 2: original baseline                            |
| `df938d0` | eval-detail diagnostic                                             | Per-event eval review tool (out-of-band)                     |
| `c0791e6` | filter Nominatim admin polygons in resolver Branch 3 + 4           | gt-009 (Jurf al-Sakhar) admin-polygon fix; resolver bug      |
| `57d0b7c` | correct gt-030 truth coord + document gt-040 sparse-OSM limit      | Ground-truth quality                                         |
| `f347244` | re-baseline Gate A 0.980 (corrected corpus)                        | PROD baseline updated after corpus fixes                     |
| `4c11b8f` | qwen max_tokens 425→2048 + classify v3 truncations                 | Live dev showed 89% truncation rate; cap underestimated      |
| `91537f4` | Nominatim fetch timeout + per-event try/catch in v3 geocoder       | Live dev 5/392 hang; missing AbortController                 |
| `43edfe8` | resolver Branch 4 gate + v3 entity adapter + geocode cache hygiene | **Three real bugs in one commit** — see below                |

## Three real bugs fixed at `43edfe8`

The forensic recording at `.dev-cache/run-2026-04-28T20-46-14/RUN_REPORT.md`
surfaced these by capturing a complete v3 run end-to-end (197/197 batches,
392 events, 93 minutes, 1.0% DLQ, 0 watchdog timeouts). All three are
production-side data integrity issues.

### Bug 1: Resolver Branch 4 only ran when Branch 3 had a hit

The Islamabad event in the recorded run resolved to `(25.38, 68.38)` —
**1028km off** the Nominatim direct hit at `(33.69, 73.07)`. Trace:

1. Earlier hung dev run cached `{miss: true}` for Branch 3's direct query
   `'Islamabad, Islamabad Capital Territory, Pakistan'` under
   `dev:geocode:fwd:constrained:v2:direct:*` (30-day TTL).
2. The post-fix run (with the new timeout fix in 91537f4) hit the
   miss-cache; Branch 3 returned null without retrying.
3. Branch 4's gate `(directHit && shouldTriggerTwoPassVerify(...))`
   skipped Branch 4 entirely because directHit was null.
4. Bellingcat (Branch 5) had no coord; fell through to GDELT centroid
   (Branch 6) → `(25.38, 68.38)` (the GDELT raw coord for that event).

**Fix:** inline the precision-based gate so Branch 4 runs whenever city
/ neighborhood / region precision warrants it, regardless of whether
Branch 3 had a hit. Exact-precision events keep the existing
`directHit > 250km from centroid` check. `shouldTriggerTwoPassVerify`
removed (dead code after inlining).

### Bug 2: `enrichedV3ToEntities` dropped 9 v3 fields

Pipeline produces `severity, suspect, geocodeProvenance, weaponType,
targetType, timeOfDay, durationMinutes, reasoning, displayName` — all
of which the entity adapter silently dropped. Live dev evidence from
the recorded run:

- All 392 entities had `data.severity = undefined`
- All 392 had `data.suspect = undefined` (vs 204 computed by pipeline)
- All 392 had `data.geocodeProvenance = null`

Map can't render severity-based styling, can't filter by provenance,
can't visually flag suspect events.

**Fix:** thread all 9 fields through `enrichedV3ToEntities` to
`ConflictEventEntity.data`. Type extended with optional v3 fields.
`conflictEventEntitySchema.data` is `.passthrough()` so no schema
change needed.

### Bug 3: `clear-llm-cache-dev.ts` didn't flush geocoder cache

Bug 1's miss-cache poison persists across runs because the clear script
only flushed `events:llm:*` keys. SCAN-based flush of
`geocode:fwd:constrained:*` (both v2 prefix and legacy unprefixed) added
so "restart dev → re-run" always starts from a clean resolver state.

## Eval state

- **PROD `events:llm-eval-baseline:v3` = 0.980** (49/50 within 20km)
- Drift from canonical 0.940: +4pp — within D-17 5pp tolerance
- Original 0.940 measurement preserved in CUTOVER.md `## Gate A` for
  historical record
- Re-baseline section appended at `## Gate A — Re-baseline against
corrected corpus` documenting corpus fixes (gt-009 / gt-030 / gt-040)

## Forensic recording artifact

`.dev-cache/run-2026-04-28T20-46-14/` contains a complete forensic
capture of the v3 run that surfaced bugs 1+2:

- `RECORDING.log` — tick-by-tick run log (186 ticks)
- `run-meta.txt` — git SHA, branch, env (secrets redacted)
- `status-tick-NNN.json` × 186 — verbatim `/api/events/llm-status` every 30s
- `stage-transition-{stage}.json` — snapshots at each transition
- `peek-progressive.txt` — partial-cache peeks at batch milestones
- `status-final.json` — final llm-status verbatim
- `terminal-cache.json` — full `/api/events` response (392 events)
- `dlq-final.json` — DLQ entries (2 × `v3:malformed` from
  `finishReason=abort`)
- `RUN_REPORT.md` — synthesized summary

The recorder was extended with `set -e` resilience and per-batch
milestone peeks; reusable for any future run.

## Dev-pass scratch files (uncommitted)

These four scripts are in `scripts/` but not yet committed:

| File                                  | Purpose                                                  | Decision needed       |
| ------------------------------------- | -------------------------------------------------------- | --------------------- |
| `scripts/eval-detail.ts`              | Per-event eval review (committed at `df938d0`)           | already committed     |
| `scripts/clear-llm-cache-dev.ts`      | Flush dev LLM + geocoder caches (committed at `43edfe8`) | already committed     |
| `scripts/peek-v3-partial.ts`          | Inspect `events:llm:v3:partial` mid-run                  | uncommitted — keep?   |
| `scripts/probe-resolver-islamabad.ts` | One-shot Islamabad regression probe                      | uncommitted — delete? |
| `scripts/record-v3-run.sh`            | Forensic recording harness for full runs                 | uncommitted — keep?   |

Recommendation: commit `peek-v3-partial.ts` and `record-v3-run.sh` (both
useful ops tools); delete `probe-resolver-islamabad.ts` (one-shot).

## Anti-patterns surfaced this session

Carrying forward + new from this session.

1. **Don't run Task 4's 50-event LLM-in-loop bake-off** — locked per
   combo-path D-16 #2 (carried from prior HANDOFF).
2. **Don't change `NVIDIA_NIM_DEFAULT_MODEL` from qwen** — winner locked
   in `b44c4c7` (carried).
3. **Don't enable `V3_LINEAGE_PREFILTER` in Vercel prod for Plan 02** —
   write-side cache is OUT OF SCOPE (carried).
4. **DO enable `V3_ADAPTIVE_BATCH=true` in Vercel prod BEFORE any prod
   run** — combo-path requirement; live dev showed adaptive saving 1
   batch from a watchdog timeout (carried + reinforced this session).
5. **Don't commit terminal-cache writes through `events:llm:v3`** —
   two-key discipline (terminal vs `:partial`) is load-bearing
   (carried).
6. **Don't propagate `OPENROUTER_API_KEY` to Vercel prod env** —
   dev-only cascade fixture (carried).
7. **Re-test cascade smoke with EMPTY `NVIDIA_NIM_API_KEY`** before
   Gate B Pass 1 (carried).
8. **Operator must swap `.env.local` Upstash URL/token from dev BACK
   to prod for snapshot calls** — read-only so safe (carried).
9. **NEW: Don't remove the `geocode:fwd:constrained:` 30-day miss-cache
   without consideration.** It IS the right behavior in steady-state to
   avoid hammering Nominatim. The bug was that bad fetches (hung
   connections without timeout) wrote `{miss: true}` to it. With the
   timeout fix in `91537f4`, the miss-cache is now safe again. Just
   flush it once after the timeout fix lands (`clear-llm-cache-dev.ts`
   now does this).
10. **NEW: When the partial cache is observability-only, the route
    layer must NOT read from it as primary.** `loadRecentEnrichedEvents`
    correctly reads from terminal `events:llm:v3`. Don't change to
    read from `:partial` — partial is pre-resolver.
11. **NEW: Bump cache key prefix when behavior changes shift output.**
    `geocode:fwd:constrained:` → `:v2:` on the admin-polygon filter
    (commit `c0791e6`). Was correct call. If we ever change resolver
    output again, bump to `:v3:`.

## Resumption recipe

```bash
# 1. Switch back to feature branch (if on a different branch)
cd /Users/zackmaz/Desktop/my_world
git checkout feature/27.4.4-v3-latency-remediation-and-cutover

# 2. Restart dev to pick up the resolver/adapter/cache fixes
# (Ctrl-C in npm run dev tab, then re-launch)
npm run dev

# 3. Clear stale caches (now flushes geocoder too)
node --env-file-if-exists=.env --env-file-if-exists=.env.local --import tsx/esm scripts/clear-llm-cache-dev.ts

# 4. (Optional) Start the recorder for another forensic capture
bash scripts/record-v3-run.sh &

# 5. Trigger fresh extraction
curl -fsS "http://localhost:3001/api/events?backfill=true" | jq '. | length'

# 6. Wait ~90 minutes; watch /api/events/llm-status
# Expected with all 3 fixes:
#   - DLQ should stay near 0 (cap=2048 prevents truncation)
#   - watchdogTimeoutCount should stay 0 (adaptive saves any 1 timeout)
#   - Geocoding completes in <10 min (timeout fix)
#   - Far fewer gdelt-actiongeo-fallback events (Branch 4 catches more)
#   - Islamabad lands at (33.69, 73.07) instead of (25.38, 68.38)
#   - Entity data has all v3 fields populated (severity, suspect,
#     geocodeProvenance, weaponType, targetType, etc.)
```

## Path-to-done — three options

After dev validation completes successfully, the user can choose:

### Option A: Original Plan 02 cutover (Tasks 3–7)

Run the planned Gate B 2-pass production smoke runs from the operator's
laptop. Cutover POST. Close 27.4.2 UAT. Write Plan 02 SUMMARY. Mark
phase complete. ~2-3 hours operator time.

### Option B: Skip Gate B, push directly

The dev signal is strong (full clean run, 0.980 eval, all 3 bugs fixed).
Push branch, flip Vercel prod env vars (`LLM_PIPELINE_V3=true`,
`V3_ADAPTIVE_BATCH=true`), let the first prod /api/events trigger
extraction, monitor `/api/events/llm-status` from prod URL. ~30 min.

### Option C: Cron-architecture redesign first, THEN cutover

User's stated preference earlier in session:

> "Anyway we can locally save our llm-enriched events, so it doesn't
> need to reload? Instead, pipeline reload should be a daily cron job
> on the server side in the background"

Implementation:

1. Move pipeline trigger out of `/api/events` (delete the
   fire-and-forget block at events.ts:1019-1130). Route becomes pure
   cache reader.
2. Add `/api/cron/refresh-events` that runs the same pipeline. Schedule
   in `vercel.json` crons (every 4-6 hours matches GDELT's 15-min
   updates without thrashing).
3. Push, flip Vercel env, let first cron tick populate prod cache.
4. Users always see cached data instantly; pipeline runs are server-side
   only.

~1-2 hours to implement + push.

## Live-launch cleanup (after cutover, separate work-unit)

When the user is ready to abandon dev and go prod-only:

1. Remove `CACHE_KEY_PREFIX=dev:` from `.env.local`.
2. Swap `.env.local` Upstash URL+token to PROD permanently.
3. Delete dev-only Redis keys (`dev:events:*`, `dev:geocode:*`).
4. Optional: delete or move to `scripts/debug/` the dev-pass scratch
   scripts (`clear-llm-cache-dev.ts`, `peek-v3-partial.ts`,
   `record-v3-run.sh`, `eval-detail.ts`).
5. Set `NODE_ENV=production` enforcement everywhere.

## Test suite baseline at handoff

```
Test Files  74 passed (74)
     Tests  1037 passed (1037)
```

Zero todos. +11 new tests this session covering admin-polygon filter
(3), Branch 4 gate fix (3), DLQ truncation classification (3),
Nominatim fetch timeout (2). All net-positive — no behavioral
regressions.

## Where to find things

- **Plan 02 PLAN.md**: `27.4.4-02-PLAN.md` (this dir)
- **CUTOVER.md** (Gate A captured): `27.4.4-02-CUTOVER.md` (this dir)
  - Contains both the original 0.940 baseline AND the corpus-corrected
    0.980 re-baseline section
- **Plan 01 closeout**: `27.4.4-01-SUMMARY.md` (this dir)
- **Forensic run report**:
  `.dev-cache/run-2026-04-28T20-46-14/RUN_REPORT.md`
- **Eval ground-truth**: `.planning/eval/ground-truth-events.json`
  (gt-009 corrected, gt-030 truth fixed, gt-040 sparse-OSM noted)
- **Per-task scripts**:
  - `scripts/extract-gate-b-snapshot.sh` (Plan 02 Task 1) — ready
  - `scripts/eval-replay.ts` (existing) — resolver-only eval
  - `scripts/eval-detail.ts` (`df938d0`) — per-event eval review
  - `scripts/snapshot-v3-redis.ts` (Plan 01 Task 11) — 6-key forensic
    capture
  - `scripts/clear-llm-cache-dev.ts` (`43edfe8`) — clear LLM + geocoder
  - `scripts/peek-v3-partial.ts` (uncommitted) — inspect partial cache
  - `scripts/record-v3-run.sh` (uncommitted) — forensic recording
- **27.4.2 UAT manifest** (Plan 02 Task 6 closes tests 1+2):
  `.planning/phases/27.4.2-ci-health-and-llm-v2-tuning/27.4.2-HUMAN-UAT.md`

## Session next-step decision matrix

If next session starts cold with no preference:

1. **Default**: Restart dev, clear cache, trigger fresh /api/events,
   wait ~90 min for validation run, then choose Option A / B / C.

2. **If user wants speed-to-done**: Option B (skip Gate B, push, flip
   Vercel env, watch first prod run).

3. **If user wants production-grade**: Option C (cron architecture
   first, then push).

4. **If user wants caution**: Option A (full Gate B 2-pass ritual as
   originally planned).
