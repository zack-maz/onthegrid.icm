---
status: complete
phase: 43-ghost-link-prune-correctness
source: 43-01-SUMMARY.md, 43-02-SUMMARY.md, 43-03-SUMMARY.md, 43-04-SUMMARY.md, 43-05-SUMMARY.md
started: 2026-06-09T23:00:00Z
updated: 2026-06-09T23:45:00Z
mode: auto
---

## Current Test

[testing complete]

## Tests

### 1. 7-status liveness contract (Plan 01)

expected: Schema drift gates pass — server schema test + src literal-path shim both green; soft-404/no-url admitted; evidence + nullable lastUrlProbed enforced; TTL map exhaustive; isTerminalDead(soft-404)=true, isTerminalDead(no-url)=false.
result: pass
evidence: "vitest run server/**tests**/lib/urlLiveness.schema.test.ts + src/**tests**/lib/urlLiveness.schema.test.ts — green (part of 116/116 targeted run)"

### 2. Soft-404 body heuristic (Plan 02)

expected: HTTP 200 probes trigger 16 KiB capped GET; classifySoft404 detects title markers / deep→shallow redirect-home / near-empty body in D-02 order with precision-first tie-break; degrade-open on body-read failure; probe test suite green.
result: pass
evidence: "vitest run server/**tests**/lib/urlLiveness.probe.test.ts — green"

### 3. attemptCount split derivation (Plan 03)

expected: live resets attemptCount to 0, unknown PRESERVES prior count (flaky-host fix), no-url=0, dead→dead increments; sidecar DECR on dead→unknown retained; sweep test suite green.
result: pass
evidence: "vitest run server/**tests**/lib/urlLiveness.sweep.test.ts — green, incl. dead-run-with-unknown-blip accumulation case"

### 4. Source-less events classified no-url (Plan 03)

expected: buildProbeCandidates writes no-url liveness entry (no fetch) for events lacking a URL, returns classifiedNoUrl count, cron log reports it; no sidecar INCR for no-url.
result: pass
evidence: "vitest run server/**tests**/routes/refresh-events-cron.prune.test.ts — green"

### 5. Cron-only 403 prune demotion (Plan 05)

expected: Cron trigger skips 403 regardless of attemptCount; manual trigger still prunes 403; unknown + no-url never prunable on either trigger; soft-404 cron-prunable only at attemptCount >= 3; isTerminalDead unchanged; cronPrune test suite green.
result: pass
evidence: "vitest run server/**tests**/lib/urlLiveness.cronPrune.test.ts — green (fixtures C/F/G/H pins)"

### 6. DeadUrlSampleEntry widened for Phase 44 (Plan 05)

expected: operator-status DeadUrlSampleEntry includes soft-404 status + evidence: string|null (pre-Phase-43 entries coerce to null).
result: pass
evidence: "server/routes/operator-status.ts:198 status union includes 'soft-404'; :203 evidence: string|null; :266 value.evidence ?? null coercion"

### 7. GHOST-09 evidence sample + locked DEMOTE decision (Plan 04)

expected: 43-VERIFICATION.md contains the prunedIds + 403-keys verdict tables, SC-3 FLAG verdict, and locked D-14/D-15 DEMOTE decision; scripts/sample-pruned-urls.ts exists.
result: pass
evidence: "43-VERIFICATION.md GHOST-09 section: SC-3 FLAG verdict (line 170), 20/20 live 403 evidence (line 176), locked DEMOTE (line 180); scripts/sample-pruned-urls.ts present"

### 8. Live-app smoke verification (Playwright)

expected: App boots locally without errors, map renders, events layer populated (LLM-down graceful path or v3 cache both acceptable); /api/operator-status responds with widened deadUrlSample shape.
result: pass
evidence: "Cold start: vite + express booted clean (port 5173/3001). Playwright: map rendered with 120 flights, 52 ships, 734 events (airstrikes 56, ground 521, explosions 128, targeted 18, other 11), sites + markets populated; 0 console errors across 193 messages. /api/events serving GDELT data. /api/operator-status 200 (documented dev auth bypass) with prune block {deadUrlCount: 0, deadUrlSample: []} — empty expected in prefixed dev Redis; entry shape pinned by test 6. Screenshot: .planning/phases/43-ghost-link-prune-correctness/43-uat-smoke.png"

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
