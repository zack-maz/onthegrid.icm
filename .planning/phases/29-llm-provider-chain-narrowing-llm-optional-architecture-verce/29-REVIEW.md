---
phase: 29
reviewer: gsd-code-reviewer
depth: standard
date: 2026-05-12
status: issues_found
files_reviewed: 38
diff_base: db62ce1bb0bc154924d5960538a8436a1cea3e7b
findings:
  critical: 0
  warning: 5
  info: 7
  total: 12
---

# Phase 29 Code Review

**Reviewed:** 2026-05-12
**Depth:** standard
**Files reviewed:** 38 authored + 1 generated bundle (informational only)
**Status:** issues_found

## Summary

Phase 29 is a well-executed simplification sweep: the v1+v2 extractor modules and Cerebras/Groq adapters were excised cleanly, the active path collapses to v3-only with clear documentation, and the LLM-optional architecture is proven by a CI-enforced integration test (`server/__tests__/routes/llm-optional.test.ts`). ADR-0010 + ADR-0011 are excellent — they capture both the deletion rationale and the positive architecture. The 800s `maxDuration` lock in `vercel.json` is correctly scoped to `api/vercel-entry.js`.

Findings below are all narrow. The only meaningful bug is a token-budget probe in the adversarial eval that still references the deleted `cerebras` provider — it has no functional impact today (the function falls through on a missing provider key) but it makes the soft-cap defense permanently a no-op until token budget is repointed at NIM/OpenRouter. The remaining items are stale documentation and interface-shape mismatches with no current runtime consequence.

The single `api/vercel-entry.js` finding is informational only — the file is a tsup output regenerated from `server/vercel.ts`.

---

## Warnings

### WR-01: Adversarial eval token-budget probe still references deleted `cerebras` provider

**File:** `server/lib/llmEvalHarness.ts:446-448`

Phase 29 ADR-0010 deleted Cerebras + Groq from the runtime path, but `runAdversarialEval()` still calls `getDailyTokens('cerebras')` and `budgetState('cerebras', used)` to gate the hard-cap short-circuit. With the Cerebras key no longer set in any env, `getDailyTokens('cerebras')` returns 0 (or a stale historical counter), so `budgetState` will never reach `'hard'` and the defensive short-circuit is permanently unreachable. The comment on L443-444 ("token-budget defense … doesn't push the eval over the wire") describes behavior that no longer triggers.

This is also semantically wrong: the resolver is now exercised against the NIM/OpenRouter cascade, so the relevant budget to gate on is `nvidia_nim` (or both `nvidia_nim` + `openrouter`), not the deleted Cerebras counter.

Note that `server/lib/llmTokenBudget.ts:31-33` still types `DAILY_LIMITS` as `Record<Provider, number>` with only `cerebras` + `groq` entries, so changing the argument to `'nvidia_nim'` will not type-check without extending `Provider` first.

**Fix:**

```ts
// llmTokenBudget.ts — extend Provider + DAILY_LIMITS
export type Provider = 'nvidia_nim' | 'openrouter';
export const DAILY_LIMITS: Record<Provider, number> = {
  nvidia_nim: 1_000_000,
  openrouter: 200_000,
};

// llmEvalHarness.ts:446-448 — gate on whichever provider is the primary
const used = await getDailyTokens('nvidia_nim');
if (budgetState('nvidia_nim', used) === 'hard') {
  log.warn('adversarial sub-eval skipped — NVIDIA NIM token budget at hard cap');
  // ... unchanged
}
```

Open Question 4 in RESEARCH.md (per CLAUDE.md L17 and ADR-0010 alternatives) already commits to pruning the legacy Cerebras/Groq env vars in Phase 30; that pruning should pull this call site with it. Until then the adversarial eval's token-budget defense is logically dead code.

### WR-02: `AdversarialEvalPayload.byCategory` declares a `leaked` field that the writer never emits

**File:** `server/routes/operator-status.ts:48-55`

The reader-side interface declares `byCategory?: Record<string, { total: number; blocked: number; leaked: number }>`, but the writer in `server/lib/llmEvalHarness.ts:366` declares + emits only `Record<string, { total: number; blocked: number }>` (the test in `server/routes/__tests__/operator-status.test.ts:99-102` confirms the writer shape). The `leaked` field on `byCategory` entries will always be `undefined` at runtime, but TypeScript treats it as `number`. Any UI consumer that reads `advEval.byCategory[cat].leaked` will see `undefined` rendered as `NaN` after arithmetic.

Likely copy-pasted from the top-level `AdversarialEvalResult` shape (which legitimately has a top-level `leaked: number`).

**Fix:**

```ts
// operator-status.ts:48-55 — match the writer
interface AdversarialEvalPayload {
  total: number;
  blocked: number;
  leaked: number;
  score?: number;
  byCategory?: Record<string, { total: number; blocked: number }>;
  generatedAt?: string;
}
```

If `leaked` per-category IS desired, fix the writer at `llmEvalHarness.ts:483-510` instead (track `byCategory[cat].leaked += 1` in the leak branch + add the field to `runAdversarialEval`'s return type).

### WR-03: Stale `pipeline-swap` operation type in `operator-status.ts` AuditEntry

**File:** `server/routes/operator-status.ts:38-42`

Phase 29 D-02 part A deleted the `/api/events/llm-pipeline` POST route and with it the `pipeline-swap` audit operation. But `AuditEntry.operation: 'pipeline-swap' | 'replay'` still lists `'pipeline-swap'`, the aggregator at L100-101 still tabulates `swaps` per fingerprint, and the response shape at L104-107 still emits `swaps: number` for every Bearer. The corresponding DevApiStatus test at `src/components/ui/__tests__/DevApiStatus.operatorActions.test.tsx:144-148` still asserts the `swaps` field renders.

Not a bug per se — the field is forward-compatible with historical entries that may still be in Redis under the 30d audit-log TTL. But after the 30d window elapses, `swaps` will be permanently 0 for every fingerprint and the dashboard column will be visual noise.

The route comment at L40-42 ("Kept minimal so the route is forward-compatible with future Plan 03 / Plan 06 audit extensions") suggests this was intentional. If so, the comment should explicitly note that `pipeline-swap` is being retained for backward compatibility with the 30-day-TTL audit log, not for future writes.

**Fix:** Add a comment documenting the legacy status, or plan a follow-up to drop `swaps` from the response after the 30-day audit log TTL window.

### WR-04: Comment in `loadRecentEnrichedEvents` references the deleted Pitfall 1 v2/v1 promotion path

**File:** `server/routes/events.ts:130-134`

The JSDoc on `loadRecentEnrichedEvents` says: "The Pitfall 1 bridge in the main GET handler can promote stale v2/v1 cache data when the v3 cache is empty, but the dev drill-down projects only the active key." But Phase 29 D-02 part C explicitly removed v2/v1 cache reads from the bridge — the comment at L501-507 in the same file confirms the bridge now reads "v3 cache → raw GDELT only." The drill-down comment is documenting behavior that the code two pages later notes was deleted.

**Fix:**

```ts
// Phase 29 D-02 part C — v3-only terminal cache. The Pitfall 1 bridge in
// the main GET handler now falls through directly to raw GDELT when v3 is
// empty (v2/v1 read legs were deleted alongside the v1+v2 extractor modules).
// The dev drill-down projects only the active v3 key.
```

### WR-05: Type for `RecentEnrichedEvent.data.confidence` from cache shadows v3 schema's `confidence`

**File:** `server/routes/events.ts:144-186` (`loadRecentEnrichedEvents`)

The projection at L143-186 reads `d.confidence ?? 0` from `entity.data`, but `enrichedV3ToEntities` in `server/lib/llmExtractionPipeline.ts:556-587` never writes `confidence` to `template.data` — it writes `severity`, `actors`, `casualties`, etc., but not the v3 `confidence` score. Result: every drill-down row's confidence display is hardcoded to 0 even when the LLM emitted a valid 0–1 confidence.

`d.reasoning` (L182) is fine — the writer at `llmExtractionPipeline.ts:587` does write `reasoning: enriched.reasoning`.

**Fix:** Either:

1. Add `confidence: enriched.confidence` to the data spread in `enrichedV3ToEntities`, OR
2. Source confidence from `llmProgress.recentEvents` (which the v3 extractor populates with `confidence: enrichedEvt.confidence` at `llmEventExtractor.v3.ts:839`) instead of from the cached entity.

Option 2 is cleaner because the data is already structured correctly there; option 1 widens the cached entity shape and requires a schema bump.

---

## Info

### IN-01: Stale `Cerebras` reference in env-var comment

**File:** `server/config.ts:52-54`

The doc comment for `LLM_BATCH_TIMEOUT_MS` says "Default 90_000 ms hard-kills a batch that Cerebras never returns from." After Phase 29 Plan 03, Cerebras is gone from the runtime path; the relevant providers are NVIDIA NIM + OpenRouter.

**Fix:** "Default 90_000 ms hard-kills a batch that the LLM provider (NIM / OpenRouter) never returns from."

### IN-02: Stale `Cerebras` reference in eval harness doc comment

**File:** `server/lib/llmEvalHarness.ts:13`

"This avoids the 4M-tokens/day Cerebras-busting worst case from full re-extraction." Cerebras-specific rationale is no longer accurate (NIM is the primary), even if the underlying point — "resolver-only is cheap" — still holds.

**Fix:** Replace with provider-agnostic phrasing: "This avoids the worst-case token spend from full LLM re-extraction (~hundreds of K tokens/day at NIM rates)."

### IN-03: `AppConfig` interface still has `cerebras`/`groq` slots

**File:** `server/config.ts:171-213` (`AppConfig` interface + `config` export)

The `AppConfig` interface and the exported `config` object still surface `cerebras: { apiKey: string }` and `groq: { apiKey: string }` slots. CLAUDE.md L17 + the comments at L31-49 note these are retained "for one deploy window so `git revert` can roll back without a config schema change" and "Phase 30 prunes them per RESEARCH.md Open Question 4." This is fine as a temporary state, but it's worth confirming Phase 30 closes this loop — leaving these slots is a footgun for future code that reads `config.cerebras.apiKey` expecting it to work.

**Fix:** No action needed in Phase 29 — per design. Suggest adding `@deprecated` JSDoc on the `cerebras`/`groq` slots so editors flag accidental reads:

```ts
export interface AppConfig {
  // ...
  /** @deprecated Phase 29 retirement — Phase 30 removes. Do not read. */
  cerebras: { apiKey: string };
  /** @deprecated Phase 29 retirement — Phase 30 removes. Do not read. */
  groq: { apiKey: string };
  // ...
}
```

### IN-04: `RecentEnrichedEvent.location` interface no longer mirrors v3 schema (missing `confidence`)

**File:** `server/routes/events.ts:102-121`

`RecentEnrichedEvent.location` shape is `{country, admin1, city, neighborhood, landmark}` but the v3 schema's `LocationHierarchyV2` includes `confidence: number` as the 6th field (see `llmSchema.ts` exports referenced in `llmEventExtractor.v3.ts:64`). The omission is intentional per the L94-101 comment ("Match RecentEnrichedEvent on the client side") but that comment block still references the v2 extractor's "richer fields … not yet persisted." Phase 29 would have been the natural moment to update the comment to describe what v3 actually persists vs. what gets dropped on projection.

**Fix:** Either drop the v2-era apology comment (since the projection is now structurally complete for v3) or document the specific v3 fields intentionally omitted from the projection (`location.confidence`, `groupKey` suffix handling).

### IN-05: `vercel.json` cron schedule comment-out drift

**File:** `vercel.json:4-8`

The cron schedule in `vercel.json` enumerates 3 entries (health, warm, refresh-events), but CLAUDE.md L101 specifies these as the "Hobby cap 3 entries" — which contradicts the Vercel Pro upgrade documented in ADR-0010 + CLAUDE.md L141. After the Pro upgrade, the 3-cron cap is no longer enforced, so the CLAUDE.md note describing it as "Hobby cap" is misleading.

**Fix:** Update CLAUDE.md "Cron schedule (Hobby cap 3 entries)" → "Cron schedule (3 entries; was Hobby-tier capped, now retained as design choice post-Pro upgrade)" or similar. The `vercel.json` itself is fine.

### IN-06: Topbar import for `hasDashboardKey` is dev-gated but unconditionally imported

**File:** `src/components/layout/Topbar.tsx:9`

`hasDashboardKey` is imported at module scope but is only referenced inside `DevApiStatusTriggerInner` (L104), which itself is reachable only via `DevApiStatusTrigger` — there's no DEV-mode gate at the import level. Vite's tree-shaking should drop the unused branch in production, but the file as it reads suggests an unconditional auth check, when actually the trigger is dev-or-authed-only. Not a bug, just confusing on first read.

**Fix:** No code change needed; the comment block at L78-94 explains the wrapper-vs-inner split well. Consider moving the comment closer to the import to make the trigger's prod behavior explicit at the import site.

### IN-07: Generated bundle `api/vercel-entry.js` — informational only

**File:** `api/vercel-entry.js`

Per the review prompt, `api/vercel-entry.js` is a tsup-generated bundle from `server/vercel.ts`. Skimmed the prefix (cache wrapper, prefix proxy logic, NON_KEY_METHODS / SCAN_METHODS / EVAL_METHODS sets) — output looks structurally consistent with `server/cache/redis.ts` shape. No source-level concerns surfaced from the bundle scan.

**Fix:** No action.

---

## Out-of-scope items flagged for awareness (not findings)

- **`shouldPauseNewEvents()` soft-cap pause is unreachable** post-narrowing per ADR-0010 Consequences (Neutral). Documented as Phase 30 cleanup; no action needed in Phase 29.
- **The `processEventGroups` ExtractorRun tagged shape with only the `'v3'` arm** (`server/lib/llmEventExtractor.ts:36-58`) is intentional per the file's JSDoc — call sites continue to compile without rewriting branch tables. The discriminated union with only one arm is dead structure but harmless.
- **Test coverage** for the new Phase 29 deletion paths is good — `events.test.ts:506-521` regression-guards the deleted `/llm-pipeline` route, `llm-optional.test.ts` exercises the LLM-disabled path, `events.replayQuota.test.ts:368-388` byte-shape pins Pitfall 6.

---

## Relevant absolute file paths

- `/Users/zackmaz/Desktop/my_world/server/lib/llmEvalHarness.ts` — WR-01, IN-02
- `/Users/zackmaz/Desktop/my_world/server/routes/operator-status.ts` — WR-02, WR-03
- `/Users/zackmaz/Desktop/my_world/server/routes/events.ts` — WR-04, WR-05, IN-04
- `/Users/zackmaz/Desktop/my_world/server/config.ts` — IN-01, IN-03
- `/Users/zackmaz/Desktop/my_world/server/lib/llmTokenBudget.ts` — referenced by WR-01 (Provider type widening)
- `/Users/zackmaz/Desktop/my_world/server/lib/llmExtractionPipeline.ts` — referenced by WR-05 (writer site)
- `/Users/zackmaz/Desktop/my_world/CLAUDE.md` — IN-05
- `/Users/zackmaz/Desktop/my_world/src/components/layout/Topbar.tsx` — IN-06
- `/Users/zackmaz/Desktop/my_world/api/vercel-entry.js` — IN-07 (generated bundle, no source action)

_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
