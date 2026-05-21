---
phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion
plan: 01
subsystem: server-lib + phase-local audit tooling
tags: [actor-metadata, audit, classifier, pitfall-1-dedup]
wave: 1
requires:
  - .planning/phases/33-.../33-CONTEXT.md D-01, D-02, D-03
  - .planning/phases/33-.../33-PATTERNS.md Layer 2 + Layer 3
  - .planning/phases/33-.../33-RESEARCH.md Pitfall §1 + threat T-33-01
provides:
  - server/lib/actorClassifier.ts (shared D-02 classifier — single source of truth)
  - server/__tests__/lib/actorClassifier.test.ts (12 unit tests, all green)
  - .planning/phases/33-.../audit/run-audit.ts (one-shot tsx audit script)
  - .planning/phases/33-.../33-AUDIT-REPORT.md (stub committed; operator populates via Manual UAT)
affects:
  - Plan 33-06 (operator-status) MUST import classifyEventActors from this module (Pitfall §1)
  - Plan 33-02 SHOULD commit cameo-codes.json sibling to make bucket-b detection non-degraded
tech-stack:
  added: [no new third-party deps — pure-fn module + tsx-runnable audit script]
  patterns:
    - 'classifyByBaseCode analog (server/adapters/gdelt.ts:153-194) — pure-fn + module-scope const maps + guard-clause early returns'
    - 'snapshot-v3-redis.ts analog — shebang + JSDoc usage + fileURLToPath __dirname + prod-confirm gate + safe Redis read + main().catch(process.exit(1))'
key-files:
  created:
    - server/lib/actorClassifier.ts
    - server/__tests__/lib/actorClassifier.test.ts
    - .planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts
    - .planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-AUDIT-REPORT.md
  modified: []
decisions:
  - D-01 (audit-as-one-shot) → audit/run-audit.ts ships outside npm test / CI
  - D-02 (deterministic 3-bucket rules) → actorClassifier.ts deny-list + regex + classifyEventActors signature
  - D-03 (audit report shape) → renderReport() generates per-bucket count/% + 5-10 examples + 10 bucket-d spot-check seeds
metrics:
  duration_minutes: ~12
  tasks_completed: 3
  commits: 3
  tests_added: 12 (all green)
  lines_added: ~602 (excluding SUMMARY)
  completed_date: 2026-05-21
---

# Phase 33 Plan 01: Actor Classifier + Audit Script + Report Stub Summary

Shipped the shared deterministic D-02 actor classifier (single source of truth
for Plan 33-06 and the audit script per Pitfall §1) plus the one-shot tsx
audit script that classifies the live `events:llm:v3` cache into D-02
buckets a/b/c and seeds 10 random spot-check candidates from a/b/c overlap
for human review of bucket d (source-disagreement). Report stub committed so
downstream waves can reference the file path; operator populates real counts
via Manual UAT.

## What shipped

### Task 1 — `test(33): add failing actorClassifier unit tests (D-02 RED)`

- **Commit:** `17356cb`
- **File:** `server/__tests__/lib/actorClassifier.test.ts` (86 lines)
- **Tests:** 12 unit cases — bucket (a) empty/whitespace, (b) regex ∩ codebook,
  (b) negative (regex but not in codebook), (c) case-insensitive deny-list,
  clean → 'ok', plus `classifyEventActors` for null / undefined / empty /
  all-empty / mixed arrays.
- **RED gate verified:** `vitest run` exited non-zero with
  `Cannot find module '../../lib/actorClassifier.js'`.

### Task 2 — `feat(33): implement actorClassifier shared module (D-02 GREEN)`

- **Commit:** `f1c9616`
- **File:** `server/lib/actorClassifier.ts` (110 lines)
- **Exports:**
  - `type ActorIssue = 'ok' | 'null' | 'raw-cameo' | 'ambiguous'`
  - `classifyActor(actor, cameoCodebook): ActorIssue`
  - `classifyEventActors(actors, cameoCodebook): ActorIssue[]`
- **Pattern:** Mirrors `classifyByBaseCode` in `server/adapters/gdelt.ts:153-194` —
  pure-fn, module-scope const maps, guard-clause early returns, zero
  per-call allocation. No logger, no Redis, no env imports per acceptance
  criteria.
- **D-02 (c) deny-list:** All 11 strings present verbatim
  (`soldiers`, `forces`, `militants`, `troops`, `fighters`, `the army`,
  `gunmen`, `attackers`, `rebels`, `insurgents`, `militia`) — case-insensitive
  via `.toLowerCase()` comparison against a `ReadonlySet<string>`.
- **D-02 (d) source-disagreement:** NOT auto-detected; documented in JSDoc
  per D-02 final clause. Returning `'ok'` for clean-looking input does NOT
  imply source agreement.
- **GREEN gate verified:** all 12 tests pass.

### Task 3 — `feat(33): add one-shot audit script + AUDIT-REPORT stub (D-01, D-03)`

- **Commit:** `32d9d4b`
- **Files:**
  - `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts` (331 lines)
  - `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-AUDIT-REPORT.md` (75-line stub)
- **Pattern:** Mirrors `scripts/snapshot-v3-redis.ts`:
  - `#!/usr/bin/env node` shebang
  - Top-of-file JSDoc with Purpose + Usage block + flag reference
  - `__dirname` via `fileURLToPath(import.meta.url)` (ESM-safe)
  - Prod-confirm gate (`process.exit(2)`) when `CACHE_KEY_PREFIX` empty AND
    `--prod-confirm` absent (T-33-01 mitigation)
  - `main().catch((err) => { console.error(err); process.exit(1); })` at file
    bottom
- **Differences from analog:**
  - Reads exactly ONE Redis key (`events:llm:v3`) — analog reads 6
  - Uses `cacheGetSafe<ConflictEventEntity[]>` (matches the production reader
    in `llmExtractionPipeline.ts:219`) to correctly unwrap the
    `{data, fetchedAt}` envelope
  - Imports the shared `classifyEventActors` from
    `server/lib/actorClassifier.ts` (Pitfall §1 — single source of D-02 truth)
  - Writes Markdown report (template literals) to a fixed path; analog
    writes JSON
- **Bucket-d spot-check seeding:** Picks 10 random events from the a/b/c
  overlap (events that fired in more than one of the 3 deterministic
  buckets — those are the most likely source-disagreement candidates).
  Falls back to a random sample of the union when overlap < 10.
- **Codebook degradation:** When `cameo-codes.json` (Plan 33-02's deliverable)
  is absent, the script loads an empty `Set<string>` and emits a warn to
  stderr — bucket-b counts will be 0 until the codebook lands. Documented in
  the script JSDoc and the AUDIT-REPORT stub.
- **Type-check:** `npx tsc --noEmit --module nodenext ...` exits 0; full
  server tsc (`tsconfig.server.json`) also clean (the script lives outside
  the server tsc include set but type-checks against the same compiler).

## Decision-coverage trace

| Decision                                                                        | Artifact landed in this plan                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| D-01 (audit as one-shot script, not under npm test / CI)                        | `audit/run-audit.ts` ships outside `package.json` scripts; runs via `node --import tsx/esm`              |
| D-02 (deterministic 3-bucket rules)                                             | `actorClassifier.ts` `RAW_CAMEO_REGEX` + `AMBIGUOUS_DENY_LIST` + `classifyActor` + `classifyEventActors` |
| D-02 (bucket d source-disagreement reserved for human spot-check)               | Documented in `actorClassifier.ts` JSDoc; audit script seeds 10 bucket-d candidates from a/b/c overlap   |
| D-03 (audit report shape: per-bucket count + % + 5-10 examples + bucket-d seed) | `audit/run-audit.ts` `renderReport()` + `renderExamples()` + `renderBucketDSpotCheck()`                  |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] RAW_CAMEO_REGEX widened from `/^[A-Z]{3,5}$/` to `/^[A-Z]{3,6}$/`**

- **Found during:** Task 2 GREEN — 2 of 12 unit tests failed
  (`bucket (b) — raw CAMEO code matching codebook returns "raw-cameo"`).
- **Issue:** CONTEXT.md D-02 (b) wrote the regex as `/^[A-Z]{3,5}$/`, and
  33-PATTERNS.md Layer 2 implementation template (lines 287) used the same
  literal. BUT the same PATTERNS.md test fixture (line 349) instantiates the
  codebook as `new Set(['ISRMIL', 'IRNMIL', 'USMIL'])` — `ISRMIL` and
  `IRNMIL` are 6 characters each. The `{3,5}` regex would silently fail
  bucket-b detection for every country-prefix military code with a
  3-letter country prefix (the most common real GDELT actor codes, e.g.
  `ISRMIL`, `IRNMIL`, `EGYMIL`, `JORMIL`).
- **Fix:** Widened `RAW_CAMEO_REGEX` to `/^[A-Z]{3,6}$/`. The codebook
  membership check still filters out 6-letter strings that aren't real
  codes (e.g. `XYZABC` matches the regex but fails the Set lookup → falls
  through to `'ok'`).
- **Files modified:** `server/lib/actorClassifier.ts:45`
- **Acceptance-criterion impact:** Task 2 acceptance criterion
  `grep -c "/\^\[A-Z\]{3,5}\$/" server/lib/actorClassifier.ts == 1` is
  NOT met — the literal in the file is now `{3,6}`. The audit report
  bucket-(b) description was updated to mirror the widened literal so the
  committed artifact stays internally consistent.
- **Commit:** `f1c9616`

**2. [Rule 1 — Bug] JSDoc `*/` close-comment terminated prematurely by `/33-*/` glob placeholders**

- **Found during:** Task 3 — tsc type-check emitted cascade of TS1003 /
  TS1109 errors starting at line 13.
- **Issue:** The JSDoc usage block mentioned `.planning/phases/33-*/` as
  shell glob placeholders. The literal sequence `*/` inside a JSDoc
  comment terminates the comment block. tsc then parsed the rest of the
  JSDoc as TypeScript, producing dozens of false-positive errors.
- **Fix:** Rephrased the two occurrences of `33-*/` inside the JSDoc to
  `33-actor-.../`. Functionally identical for the operator reading the
  doc; the actual shell glob form `33-*/` is only used in operator
  invocations from the command line, not in code.
- **Files modified:**
  `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts:12`, `:24`
- **Commit:** `32d9d4b`

**3. [Rule 1 — Bug] Nested backticks inside template literal broke tsc parser**

- **Found during:** Task 3 — second wave of tsc errors at line 139.
- **Issue:** The bucket-d spot-check renderer used a JS template literal
  (single backtick), and within that template literal I wrote literal
  backticks (`` `[✓ disagrees]` ``) intended to render as inline-code in
  the final markdown. Those literal backticks terminated the template
  literal prematurely.
- **Fix:** Escaped the inner backticks (`` \` ``) inside the template
  literal. ESLint also flagged backtick escapes inside single-quoted
  strings (which DO NOT need escaping) — fixed those to use plain
  backticks. The end-state: inside template literals → `` \` ``; inside
  single-quoted strings → `` ` ``.
- **Files modified:**
  `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts:139`, `:168`
- **Commit:** `32d9d4b`

**4. [Rule 3 — Blocking issue] ESLint `import/order` warning required type-import separation**

- **Found during:** Task 3 commit (lint-staged pre-commit hook).
- **Issue:** ESLint config enforces a blank line between value-import and
  type-only-import groups; missing the blank line emitted a warning.
- **Fix:** Added a blank line between the value imports
  (`cacheGetSafe`, `classifyEventActors`) and the type-only import
  (`ConflictEventEntity`).
- **Files modified:**
  `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts:40-41`
- **Commit:** `32d9d4b`

No architectural changes; no authentication gates.

## Notes for the planner / downstream waves

1. **Plan 33-02 must commit `cameo-codes.json`** as a sibling of
   `audit/run-audit.ts`. Until that file exists the audit script runs in
   degraded mode and bucket-b counts will be 0. The script emits a stderr
   warn on degraded launch so the operator never silently mis-reads the
   numbers.

2. **Plan 33-06 (operator-status) MUST import** `classifyEventActors` from
   `server/lib/actorClassifier.ts` — not re-implement the rules inline.
   Pitfall §1 only stays mitigated as long as both consumers depend on the
   shared module.

3. **The regex widening from `{3,5}` to `{3,6}` propagates to Plan 33-06.**
   When Plan 33-06 imports `classifyEventActors`, dashboard counts will use
   the same `{3,6}` bound. If anyone re-validates against CONTEXT.md D-02
   (which still says `{3,5}`), CONTEXT.md should be updated. I did not
   modify CONTEXT.md as part of this plan to keep the deviation auditable.

4. **The audit report stub at `33-AUDIT-REPORT.md` is intentionally a stub.**
   Real population requires Manual UAT against staging Redis (see
   `33-VALIDATION.md` Manual-Only Verifications row 1). Downstream waves
   that want to reference real bucket counts must wait for the operator's
   staging run.

## Self-Check: PASSED

**Files verified to exist:**

- `server/lib/actorClassifier.ts` — FOUND (110 lines)
- `server/__tests__/lib/actorClassifier.test.ts` — FOUND (86 lines)
- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/audit/run-audit.ts` — FOUND (331 lines)
- `.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/33-AUDIT-REPORT.md` — FOUND (75 lines)

**Commits verified in `git log`:**

- `17356cb` — `test(33): add failing actorClassifier unit tests (D-02 RED)` — FOUND
- `f1c9616` — `feat(33): implement actorClassifier shared module (D-02 GREEN)` — FOUND
- `32d9d4b` — `feat(33): add one-shot audit script + AUDIT-REPORT stub (D-01, D-03)` — FOUND

**Test suite verified green:**

- `npx vitest run server/__tests__/lib/actorClassifier.test.ts` → 12/12 pass
- Sample regression (6 LLM lib test files including eval harness + circuit
  breaker + DLQ + token budget): 98/98 pass
- `npx tsc --noEmit -p tsconfig.server.json` → 0 errors
