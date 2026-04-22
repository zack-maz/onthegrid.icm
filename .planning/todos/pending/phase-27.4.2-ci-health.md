---
status: pending
captured: 2026-04-22T02:45:00Z
source: Phase 27.4 close-out session
category: ci-health
priority: medium
blocking: false
target_phase: 27.4.2
---

# Phase 27.4.2 — CI Health (flip main from red to green)

Captured during Phase 27.4 close-out on 2026-04-22. `main`'s CI has been red
for multiple phases on a mix of pre-existing test/lint/audit/format issues
that each accumulated too little justification to trigger their own phase.
27.4.2 bundles them so that `main` goes green and CI can become a real merge
gate instead of advisory noise.

## In-scope items

### C — 32 filter test failures (high value)

File: `src/__tests__/filters.test.ts`

Root cause: Phase 27.2 commit `2c7e6ae` added `enabledPrecisions` to
`FilterState` but fixture helpers in this file weren't updated. 32 tests
fail with `TypeError: Cannot read properties of undefined (reading 'length')`.

Fix: add a default `enabledPrecisions: ['exact', 'neighborhood', 'city', 'region']`
(or whatever matches current FilterState defaults) to whatever factory function
produces the test FilterState object.

Effort: ~15 minutes.

### E — 4 npm audit vulnerabilities (security)

- `flatted <=3.4.1` — high — prototype pollution (GHSA-rf6f-7fwh-wjgh)
- `path-to-regexp 8.0.0 - 8.3.0` — high — ReDoS (GHSA-j3q9-mxjg-w52f, GHSA-27v5-c462-wpq7)
- `picomatch 4.0.0 - 4.0.3` — high — POSIX character class injection (GHSA-3v7f-55p6-f55p)
- `brace-expansion <1.1.13 || >=4.0.0 <5.0.5` — moderate — ReDoS (GHSA-f886-m6hf-6m8v)

All are transitive deps. Fix via `npm audit fix` — may require minor bumps of
`@typescript-eslint/*`, `express-rate-limit` sub-deps, or similar. Verify no
breaking changes to direct dep behavior.

Effort: ~10 minutes + test-suite run to verify.

### F + G — prettier format warnings (~25 files)

Root cause: prettier config evolved after these files were written, OR
prettier wasn't enforced at commit time on some earlier phases.

Files flagged:

- `.planning/phases/27-*/27-*-SUMMARY.md` (8 files)
- `.planning/phases/27.3.2-*/27.3.2-*-SUMMARY.md` (5 files)
- `.planning/phases/27.4-llm-enrichment-improvements/*.md` (~10 files)
- `server/__tests__/adapters/llm-provider.test.ts`
- `server/__tests__/adapters/nominatim-forward.test.ts`
- `server/__tests__/lib/eventGrouping.test.ts`
- plus several more flagged in the last CI run (see commit 364cdfc CI logs)

Fix: `npm run format` (prettier --write .) — inspect the diff carefully to
ensure only whitespace/quote changes, no semantic drift. Commit as a single
"chore(ci): apply prettier to pre-existing files" commit to keep the blame
layer thin.

Effort: ~30 seconds to run + 10 minutes to review the diff.

### I — ~20 lint warnings (low priority)

Mostly `react-refresh/only-export-components` and similar. These don't
technically block the CI job (0 errors pre-27.4), but the job still exits
non-zero because of either `--max-warnings 0` or the audit step.

Audit before fixing: many warnings legitimately flag "this file mixes
components and utilities" — fixing them means file splits, not just silencing.

Effort: ~1-2 hours if done thoughtfully.

## Out-of-scope for 27.4.2

- **H — Vercel preview deploy failure** — probably needs preview-env secrets
  (LLM API keys, Redis config). Better handled in its own micro-phase or as
  part of a deployment review. May not be worth fixing if preview deploys
  aren't part of the dev workflow.
- **Phase 27.4.3 — deck.gl v9 type drift** — separate phase, different
  concern (TS types vs test/format/audit). See
  `phase-27.4.3-deckgl-v9-type-drift.md`.
- **20 TS errors in `llmEventExtractor.v1.ts`** — scoped to Phase 27.4.1.

## Why it's medium priority (not high)

- No runtime impact — map renders correctly, data pipelines work
- Server test suite passes 11695/11695 (only client tests regress)
- Security vulns are all in transitive deps not on the hot path
- But: having main red all the time means CI can't gate merges, which is a
  compounding risk as the codebase grows

## Sequencing

Can run in parallel with 27.4.1 (no overlapping files) OR after. Recommend
after so the 27.4.1 v1-extractor cleanup lands first and any format changes
to `server/lib/llmEventExtractor.v1.ts` get absorbed into the TS-narrowing
commit rather than splitting across two phases.
