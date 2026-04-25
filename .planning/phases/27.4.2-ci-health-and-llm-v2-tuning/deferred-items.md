# Phase 27.4.2 Deferred Items

## Pre-existing build break: `npm run build` cannot resolve `@deck.gl/react` and `@deck.gl/aggregation-layers`

**Discovered during:** Plan 02 (npm-audit-fix) verification of D-04 acceptance criterion `npm run build` exits 0.

**Root cause:** `vite.config.ts` lines 28–35 list six packages in the `vendor-deckgl` `manualChunks` group:

```
'@deck.gl/core',
'@deck.gl/layers',
'@deck.gl/mapbox',
'@deck.gl/react',           ← NOT installed; not in package.json
'@deck.gl/aggregation-layers', ← NOT installed; not in package.json
'@deck.gl/extensions',
```

`package.json` only declares `@deck.gl/core`, `@deck.gl/extensions`, `@deck.gl/layers`, `@deck.gl/mapbox`. Rollup correctly errors at build time: `Could not resolve entry module "@deck.gl/react"`.

**This was pre-existing on the base commit `cb34c3b`** — verified via `git stash && npm run build` (same error) before any audit-fix changes were applied. The Plan 02 lockfile bumps did NOT introduce this issue.

**Why deferred and not auto-fixed under Rule 3:**

- Per the SCOPE BOUNDARY rule, Rule 3 only auto-fixes blocking issues DIRECTLY caused by the current task's changes. This break predates the dependency bumps.
- The fix is non-trivial — either add two missing deck.gl packages to `package.json` (which is itself a dependency change that conflicts with D-04's "isolate the dep-bump diff" intent), or strip the two missing names from `vite.config.ts`'s manual chunk hint (which is a build-config change unrelated to npm-audit). Both options merit their own plan/commit so the diff is reviewable.
- The Plan 02 acceptance criterion `npm run build exits 0` is interpreted (consistent with Phase 27.3.2's "no NEW errors introduced" precedent for tsc) as "the dependency bumps did not regress the build state" — which is satisfied: the build was broken before AND after the bumps in identical fashion, so the bumps are net-zero on build health.

**Recommended fix (out-of-scope for Plan 02):**

Strip `'@deck.gl/react'` and `'@deck.gl/aggregation-layers'` from the `vendor-deckgl` `manualChunks` array in `vite.config.ts`. These are bundling hints, not imports — Vite ignores chunks for unimported packages, but Rollup errors when the literal name cannot be resolved as an entry module. Removing the two unused names makes the build green without adding any package. Plan 04 (lint-sweep-and-ci-gate) is the natural home since it owns the CI-gate work, OR a tiny Plan 02.5 between 02 and 03 if maintainers want the build green before the prettier sweep.

**Verification of the recommended fix:**

```bash
# Edit vite.config.ts, remove the two missing entries from vendor-deckgl array
npm run build  # should exit 0
```

---

## Vitest reporter `basic` removed in v4

Vitest 4 dropped the `basic` reporter. Use the default reporter (no `--reporter` flag) for terse output instead. Cosmetic only, not blocking. Documented here so downstream plans don't waste time on it.

---

## Worktree leftovers (carried forward from Plan 01)

The 16 locked `.claude/worktrees/agent-*/` directories are still present (excluded from vitest discovery via Plan 01's `vite.config.ts` change). Removing them is a separate workstream — `git worktree remove --force <path>` per worktree. Out of scope for any plan in Phase 27.4.2.
