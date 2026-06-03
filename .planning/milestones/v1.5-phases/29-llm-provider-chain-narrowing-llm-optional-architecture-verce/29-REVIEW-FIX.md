---
phase: 29
fixed_at: 2026-05-12T21:10:09Z
review_path: .planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-REVIEW.md
iteration: 1
findings_in_scope: 5
fixed: 5
skipped: 0
status: all_fixed
---

# Phase 29: Code Review Fix Report

**Fixed at:** 2026-05-12T21:10:09Z
**Source review:** .planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-REVIEW.md
**Iteration:** 1

**Summary:**

- Findings in scope: 5 (WR-01 through WR-05; 7 IN-\* findings out of scope this pass)
- Fixed: 5
- Skipped: 0

Each fix landed as an atomic commit on `feature/29-llm-cascade-narrowing-claude-md-cleanup`. The full server test suite (91 files / 1113 tests) passes after all five commits; `npx tsc --noEmit` is clean for every modified file.

Note on WR-01: the REVIEW.md fix snippet proposed narrowing `Provider` from `'cerebras' | 'groq'` to `'nvidia_nim' | 'openrouter'`, but the actual current state of `server/lib/llmTokenBudget.ts` already re-exports the 4-arm `Provider` union from `llmCircuitBreaker.ts` (and `DAILY_LIMITS` already had all four entries with `nvidia_nim`/`openrouter` set to 0). Narrowing would have broken `shouldPauseNewEvents` plus the 17-test `llmTokenBudget.test.ts` fixture suite (which still asserts `cerebras`/`groq` semantics). The pragmatic fix kept the 4-arm union and instead lifted `nvidia_nim`/`openrouter` to real ceilings (1M / 200K) so the `runAdversarialEval` budget probe — re-pointed to `nvidia_nim` — is semantically correct and activatable rather than perpetually short-circuiting. Phase 30 prunes the legacy slots per RESEARCH.md Open Q4.

## Fixed Issues

### WR-01: Adversarial eval token-budget probe still references deleted `cerebras` provider

**Files modified:** `server/lib/llmTokenBudget.ts`, `server/lib/llmEvalHarness.ts`
**Commit:** 0c90604
**Applied fix:** Updated `DAILY_LIMITS.nvidia_nim` from 0 to 1_000_000 and `DAILY_LIMITS.openrouter` from 0 to 200_000 so the budget gate has real ceilings to compare against. Re-pointed the `runAdversarialEval` token-budget probe from `getDailyTokens('cerebras')`/`budgetState('cerebras', used)` to `'nvidia_nim'` — the active v3 cascade primary. Refreshed the surrounding JSDoc to call out the WR-01 rationale and the lingering "dormant until v3 token tracking is plumbed" caveat (per ADR-0010 / RESEARCH.md Open Q4). Verified by `npx vitest run server/__tests__/lib/llmEvalHarness.adversarial.test.ts` (8/8) and `npx vitest run server/__tests__/lib/llmTokenBudget.test.ts` (17/17).

### WR-02: `AdversarialEvalPayload.byCategory` declares a `leaked` field the writer never emits

**Files modified:** `server/routes/operator-status.ts`
**Commit:** ffd8f40
**Applied fix:** Dropped `leaked: number` from the per-category entry shape on `AdversarialEvalPayload.byCategory`. The writer in `llmEvalHarness.ts:483-510` only tracks `{ total, blocked }` per category — the aggregate `leaked` count lives at the top level. The reader-side type was likely copy-pasted from `AdversarialEvalResult` and would always render `undefined` (NaN after arithmetic) at runtime. Confirmed no client consumers reference `byCategory.*.leaked` via `grep`. Verified by `npx vitest run server/routes/__tests__/operator-status.test.ts` (3/3).

### WR-03: Stale `pipeline-swap` operation type in `operator-status.ts` AuditEntry

**Files modified:** `server/routes/operator-status.ts`
**Commit:** 5edf751
**Applied fix:** Added a long-form JSDoc paragraph on the `AuditEntry` interface explicitly documenting that `'pipeline-swap'` is retained for backward compatibility with the 30-day audit-log TTL (since Phase 29 D-02 part A deleted the only writer of that operation tag). Calls out the natural-decay path: per-fingerprint `swaps` counter falls to 0 once the last legacy entry expires, with no new writes adding to it. Comment-only change — no semantics shift. Tests 3/3 pass.

### WR-04: Comment in `loadRecentEnrichedEvents` references the deleted Pitfall 1 v2/v1 promotion path

**Files modified:** `server/routes/events.ts`
**Commit:** 178b123
**Applied fix:** Replaced the stale comment on `loadRecentEnrichedEvents` that claimed "the Pitfall 1 bridge in the main GET handler can promote stale v2/v1 cache data when the v3 cache is empty" — which contradicted the actual L501-507 comment in the same file documenting that the bridge now goes "v3 cache -> raw GDELT only" after Phase 29 D-02 part C deleted the v2/v1 read legs. New comment matches the runtime invariant and cross-references L501-507. Tests 37/37 events + 160/160 routes pass.

### WR-05: Type for `RecentEnrichedEvent.data.confidence` from cache shadows v3 schema's `confidence`

**Files modified:** `server/routes/events.ts`
**Commit:** b3b5613
**Applied fix:** Applied REVIEW.md Option 2 (per fixer prompt direction). `enrichedV3ToEntities` in `server/lib/llmExtractionPipeline.ts:556-587` never writes `confidence` to `template.data`, so the prior `d.confidence ?? 0` lookup always rendered 0 in the dev drill-down. Rather than widen the cached entity shape (Option 1 — requires a cache-schema bump), now indexes confidence by groupKey from `llmProgress.recentEvents` (which v3 already populates at `llmEventExtractor.v3.ts:839` with `confidence: enrichedEvt.confidence`). Built a `Map<groupKey, confidence>` up-front and looked it up in the `.map` projection, with a 0 fallback only when the in-memory progress singleton has no entry for the groupKey (cold start / cross-run cache survival edge cases). Dropped the now-unused `confidence: number` slot from the local `d` type assertion. Tests 37/37 events + 160/160 routes pass; full server suite 1113/1113 pass.

---

_Fixed: 2026-05-12T21:10:09Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
