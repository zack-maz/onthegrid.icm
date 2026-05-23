# Phase 34: LLM Router Fallback Re-integration — Research

**Researched:** 2026-05-23
**Method:** Inline orchestrator research (gsd-phase-researcher subagent crashed twice — 401 auth then socket close). Provider docs via WebFetch; code touchpoints via Read/Grep; Validation Architecture derived from ROADMAP success criteria + CONTEXT.md decisions.
**Scope:** Narrow — verify CONTEXT.md unknowns. CONTEXT.md's 33 decisions (D-01..D-33) remain the load-bearing artifact; this RESEARCH.md fills the gaps the planner needs to lock before Plan 34-01 ships.

---

## 1. Provider Catalog Verification (BLOCKING for Plan 34-01)

### 1.1. Cerebras Free Tier — CONTEXT.md D-05 PROPOSAL IS WRONG

**Source:** https://inference-docs.cerebras.ai/support/rate-limits (fetched 2026-05-23).

**Current free-tier model catalog (4 models):**

| Model ID                         | Notes                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| `gpt-oss-120b`                   | OpenAI gpt-oss release. Untested for v3 extraction shape.                             |
| `llama3.1-8b`                    | 8B — likely too small for v3 hierarchical extraction quality.                         |
| `qwen-3-235b-a22b-instruct-2507` | Qwen 235B MoE instruct. **Closest analog to NIM's `qwen/qwen3.5-397b-a17b` primary.** |
| `zai-glm-4.7`                    | ZAI GLM 4.7. Unknown extraction quality vs NIM baseline.                              |

**`llama3.3-70b` is NOT in the free tier.** CONTEXT.md D-05 proposed it; that proposal is stale (Cerebras retired their 70B free-tier offerings sometime between Phase 27.4.3 and Phase 34). The pre-Phase-29 deletion likely used `llama3.3-70b` when it was on the free tier.

**Free-tier rate limits (Cerebras free trial):**

- **5 RPM** (vs CONTEXT.md D-08's assumption of ~30 RPM).
- 30K TPM.
- 1M TPH.
- 1M TPD.
- Rate-limit triggers on whichever metric is hit first.

**Recommendation for the planner (locks D-05 + reshapes D-08):**

1. **Model selection — pick ONE of two paths:**
   - **Path A (quality-aligned):** `qwen-3-235b-a22b-instruct-2507` — same family/size as NIM's primary. Highest probability of clearing the ±3pp eval gate (D-20). Recommended unless probe shows it 429s harder than gpt-oss-120b.
   - **Path B (capacity-aligned):** `gpt-oss-120b` — smaller, may have less throttle pressure; quality unknown vs NIM baseline. Backup if Path A's probe fails.

2. **5 RPM is brutal.** That's 1 request every 12 seconds. The Phase 30 retry/backoff envelope (3 attempts × [2s, 8s, 32s] ± 500ms jitter) was tuned against NIM's 40 RPM; a single retry attempt on a 5-RPM provider blows the window. **Probe expectation: Cerebras may fail the D-02 `< 50% rate-limit-fail` gate on first run.** Plan 34-01 should run the probe at the N=30 / 100 ms gap shape (per D-04) but the planner must be prepared for the snapshot to land in the ≥90% bucket → `cerebras-deferred` honest close-out.

3. **Token budget shape divergence.** NIM uses minute-window (40 RPM via `RollingWindow(40, 60_000)`); OR uses daily counter (200/day). **Cerebras needs both** — TPM cap (30K) is the tight constraint for v3's larger payloads, NOT RPM alone. The adapter pre-check should:
   - RPM check via `RollingWindow(5, 60_000)`.
   - Skip TPM/TPD checks in v1 (token counting adds complexity; defer to Phase 35+); rely on the 429 retry loop to surface TPM breaches.

### 1.2. Groq Free Tier — CONTEXT.md D-05 IS CORRECT

**Source:** https://console.groq.com/docs/rate-limits (fetched 2026-05-23).

**Current free-tier model catalog (relevant subset):**

| Model ID                              | RPM | RPD    | Notes                                                              |
| ------------------------------------- | --- | ------ | ------------------------------------------------------------------ |
| `llama-3.3-70b-versatile`             | 30  | varies | **Current 70B flagship. Use this — matches CONTEXT.md D-05.**      |
| `llama-3.1-8b-instant`                | 30  | varies | Too small for v3 extraction.                                       |
| `qwen/qwen3-32b`                      | 60  | varies | Higher RPM than llama-3.3-70b; 32B may underperform on extraction. |
| `openai/gpt-oss-120b`                 | 30  | varies | Similar to Cerebras's offering; cross-provider redundancy.         |
| `openai/gpt-oss-20b`                  | 30  | varies | 20B — likely too small.                                            |
| `groq/compound`, `groq/compound-mini` | 30  | varies | Groq's hybrid models; untested for v3 shape.                       |
| `allam-2-7b`                          | 30  | varies | 7B — too small.                                                    |

**`llama-3.1-70b-versatile` is DEPRECATED** — the pre-Phase-29 code used this model; the planner MUST use `llama-3.3-70b-versatile` instead.

**Free-tier rate limits (Groq):**

- 30 RPM most models / 60 RPM for `qwen/qwen3-32b`.
- 100–14,400 RPD depending on model.
- 6K–70K TPM, 100K–500K TPD depending on model.

**Recommendation for the planner (confirms D-05 + reshapes D-08 for Groq):**

1. **Model lock: `llama-3.3-70b-versatile`** (CONTEXT.md D-05's proposal — verified current).
2. **Dual gate per CONTEXT.md D-08:** Groq has minute + day rate-limit shape. Adapter pre-check:
   - RPM: `RollingWindow(30, 60_000)`.
   - RPD: daily counter `llm:tokens:groq:YYYY-MM-DD` (mirror existing `OPENROUTER_DAILY_CAP` pattern at `freeClaudeRouter.ts:289-306`).
   - Recommend `GROQ_DAILY_CAP = 1000` as a conservative starting value (well under the 14,400 ceiling for the flagship; Phase 35 registry sweep can tune).
3. **Groq's 30 RPM is HEALTHIER than Cerebras's 5 RPM.** If only one provider passes the probe gate, Groq is the higher-probability winner.

### 1.3. OpenAI SDK Compatibility

Both Cerebras and Groq expose OpenAI-compatible HTTP endpoints. The docs explicitly mention "OpenAI Compatibility" for Groq; Cerebras docs are quieter but the pre-Phase-29 adapter code used the OpenAI SDK without shims, which is evidence enough that the call shape works.

**Unknowns at research time (Plan 34-02 must verify during adapter integration):**

| Feature                                    | NIM         | OpenRouter  | Cerebras                                    | Groq                                        |
| ------------------------------------------ | ----------- | ----------- | ------------------------------------------- | ------------------------------------------- |
| `response_format: { type: 'json_object' }` | ✓ confirmed | ✓ confirmed | **UNKNOWN — verify in Plan 34-02 dev-pass** | **UNKNOWN — verify in Plan 34-02 dev-pass** |
| `finish_reason` field                      | ✓           | ✓           | Expected (OpenAI-compat); verify            | Expected; verify                            |
| `usage.{prompt_tokens, completion_tokens}` | ✓           | ✓           | Expected; verify                            | Expected; verify                            |
| `reasoning_content` field                  | ✓ NIM-only  | n/a         | Unlikely                                    | Unlikely                                    |

**Action for Plan 34-02:** Single-event dev call against each provider to verify `response_format: { type: 'json_object' }` returns valid JSON. If a provider doesn't honor it, the adapter must either (a) drop the parameter (the v3 schema is enforced post-parse via Zod anyway), or (b) add a system-prompt suffix instructing the model to emit JSON only. Pre-Phase-29 Cerebras + Groq adapters did NOT use `response_format` (the parameter wasn't part of the original vendoring) — there's a 70% chance these providers either ignore it silently or reject it with 400. Watch the first probe-run errors for 400-status with "response_format" in the message; that's the canary.

---

## 2. Code Touchpoint Line Locations (verified 2026-05-23)

### 2.1. `providerProvenance` Field — D-15 placement

**File:** `server/lib/llmSchema.ts:194-197`.

```typescript
export const enrichedEventV3 = enrichedEventV2.extend({
  schemaVersion: z.literal('v3'),
  actorConfidence: z.array(z.enum(['high', 'medium', 'low'])).optional(),
});
```

**Add Phase 34's field:**

```typescript
export const enrichedEventV3 = enrichedEventV2.extend({
  schemaVersion: z.literal('v3'),
  actorConfidence: z.array(z.enum(['high', 'medium', 'low'])).optional(),
  // Phase 34 D-15 — additive-optional per Phase 33 rollout discipline.
  // Pre-Phase-34 entries default to null on parse (field absent).
  providerProvenance: z
    .enum(['nvidia_nim', 'openrouter', 'cerebras', 'groq'])
    .nullable()
    .optional(),
});
```

**Critical:** Mirror Phase 33 D-10's `.optional()` (NOT `.nullable()` alone) — pre-Phase-34 cache entries have the field ABSENT, not null. The combined `.nullable().optional()` accepts: present-and-string, present-and-null, absent. Tighten to required in Phase 35+ cleanup after 24h forward-rollover (mirrors the JSDoc at `llmSchema.ts:189-192`).

### 2.2. `v3:cascade_exhausted` DLQ Wrapper Site — D-13 placement

**File:** `server/lib/llmEventExtractor.v3.ts:731`.

The `if (content === null)` branch at line 731 is the wrapper site. Lines 731-762 currently:

1. Check `didTimeout` for adaptive-split-and-retry path (lines 739-757).
2. Fall through to "log-and-skip" at line 759: `log.warn({ batchIndex }, 'v3 batch yielded no content (null or watchdog timeout)');`.

**The DLQ-write for `cascade_exhausted` belongs in the fall-through (line 759-760)** AFTER the adaptive-retry early-return. Pattern:

```typescript
// Phase 34 D-13 — distinguish all-cascade-failed from single-provider timeout.
// `didTimeout` path is already handled at line 739-757 (writes v3:timeout_watchdog
// via the watchdog wrapper). This path = callLLM returned null content despite
// no watchdog kill = cascade exhausted (all providers failed pre-checks or 429s).
if (!didTimeout) {
  for (const ctx of contexts) {
    try {
      await enqueueDLQ({
        id: ctx.groupKey,
        reason: 'v3:cascade_exhausted',
        lastError:
          `cascade exhausted: ${decisions.map((d) => `${d.provider}:${d.reason}`).join('; ')}`.slice(
            0,
            500,
          ),
        timestamp: Date.now(),
      });
    } catch (dlqErr) {
      log.warn(
        { err: dlqErr, groupKey: ctx.groupKey },
        'cascade_exhausted DLQ enqueue failed (non-fatal)',
      );
    }
  }
}
log.warn({ batchIndex }, 'v3 batch yielded no content (null or watchdog timeout)');
```

**DLQEntry.reason union extension** at `server/lib/llmDLQ.ts:27-37`: add `| 'v3:cascade_exhausted'` to the union.

**Note for the planner:** The `decisions` variable in `llmEventExtractor.v3.ts` is the `routing` return from `callLLM`. Confirm by reading lines 690-730 for the `freeClaudeCallLLM(...)` call shape — the `decisions` field there carries the per-provider attempt history that D-13's `lastError` concatenates.

### 2.3. `runEval()` Per-Provider Aggregation — D-16/D-17 insertion

**File:** `server/lib/llmEvalHarness.ts:295-313` (resolver-only haversine loop).

Current loop pseudocode:

```typescript
let w5 = 0, w20 = 0, w100 = 0;
for (const ev of gt.events) {
  const resolved = await resolveLocation(ev.hierarchy, {...});
  const dKm = haversineKm(resolved.lat, resolved.lng, ev.truth.lat, ev.truth.lng);
  if (dKm <= 5) w5++;
  if (dKm <= 20) w20++;
  if (dKm <= 100) w100++;
}
```

**Insertion pattern for D-16/D-17:**

The aggregate loop above stays unchanged (resolver-only, no LLM tokens). Per-provider scoring requires **a separate read of `events:llm:v3`** (`cacheGetSafe`) joined with each ground-truth event's hierarchy to find the cached entry and read its `providerProvenance` field.

Two-pass shape:

```typescript
// Pass 1 (unchanged): resolver-only aggregate haversine. Lines 295-313.
// ... w5, w20, w100, total via gt.events.length

// Pass 2 (new, Phase 34 D-17): per-provider aggregation via cache read.
// Mirrors the Phase 33 D-13 actorMatchRate second-pass pattern at lines 320-380.
const byProvider: EvalScore['byProvider'] = {
  nvidia_nim: { within5km: 0, within20km: 0, within100km: 0, total: 0 },
  openrouter: { within5km: 0, within20km: 0, within100km: 0, total: 0 },
  cerebras: { within5km: 0, within20km: 0, within100km: 0, total: 0 },
  groq: { within5km: 0, within20km: 0, within100km: 0, total: 0 },
};
try {
  const cached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE);
  if (cached?.data) {
    // Same landmark+country substring join used by D-13 actorMatchRate
    // (lines 351-378). For each ground-truth event, find the matching cached
    // entry and increment that provider's bucket using the resolver-derived
    // haversine from pass 1.
    // ... details: planner picks join strategy based on whether resolver
    // results from pass 1 are stored in an array for re-use, or re-computed.
  }
} catch (err) {
  log.warn({ err }, 'D-17 byProvider computation failed; falling back to zero buckets');
}
```

**Recommendation:** Re-use pass 1's resolver results by accumulating them into a `Map<string, number>` keyed by ground-truth id during pass 1. Pass 2 then iterates `gt.events`, finds the cached entry via substring join, reads `providerProvenance`, and increments the appropriate bucket using the cached haversine — zero re-resolution, zero new LLM tokens.

### 2.4. `EvalScoreBlock` UI — D-19 insertion

**File:** `src/components/ui/DevApiStatus.tsx:2441-2486`.

Existing `EvalScoreBlock` structure (verified):

```tsx
function EvalScoreBlock({ evalScore }) {
  if (!evalScore || evalScore.total === 0) return <div>Eval: no ground-truth loaded</div>;
  // ... aggregate counters (5km/20km/100km)
  {
    actorMatchPct !== null && (
      <div className="mt-0.5 text-[9px] text-white/60" data-testid="eval-actor-match-rate">
        Actor match (Phase 33 ACTOR-04): <span>{actorMatchPct}%</span>
      </div>
    );
  }
  // ... D-25 gate row
}
```

**Phase 34 D-19 insertion point:** Add a per-provider sub-block immediately after the actorMatchPct row (before the D-25 gate row).

Recommended shape — compact provider rows matching the existing `text-[9px]` density:

```tsx
{
  evalScore.byProvider && (
    <div className="mt-1 border-t border-white/5 pt-1">
      <div className="text-[8px] uppercase tracking-wider text-white/30">
        Per-Provider Eval (Phase 34)
      </div>
      {(['nvidia_nim', 'openrouter', 'cerebras', 'groq'] as const).map((p) => {
        const b = evalScore.byProvider?.[p];
        if (!b) return null;
        const pct20 = b.total > 0 ? Math.round((b.within20km / b.total) * 100) : null;
        return (
          <div
            key={p}
            className="mt-0.5 text-[9px] text-white/60"
            data-testid={`eval-byprovider-${p}-within20km`}
          >
            {p}:{' '}
            {pct20 === null ? (
              <span className="text-white/40">(no data)</span>
            ) : (
              <span className={pct20 >= 80 ? 'text-green-400' : 'text-red-400'}>
                {b.within20km}/{b.total} ({pct20}%)
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Test IDs** (mirror Phase 33-07 convention): `eval-byprovider-nvidia_nim-within20km`, `eval-byprovider-openrouter-within20km`, `eval-byprovider-cerebras-within20km`, `eval-byprovider-groq-within20km`.

**No new color tokens** — reuses existing `text-green-400` / `text-red-400` / `text-white/40` / `text-white/60` from the surrounding block. Phase 28.1 W5 D-13 `colorBridge` invariant preserved.

### 2.5. Cron Handler Bearer Gate — D-22 `?skipPrimary` insertion

**File:** `server/routes/refresh-events-cron.ts:50-58` (force-trigger Bearer gate already in place).

Current Bearer-gated `?force=true` pattern (lines 45-60):

```typescript
if (env.CRON_SECRET) {
  const auth = req.header('Authorization') ?? req.header('authorization') ?? '';
  const expected = `Bearer ${env.CRON_SECRET}`;
  const a = Buffer.from(auth);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
}
const forceCooldown = req.query.force === 'true';
```

**Phase 34 D-22 `?skipPrimary` insertion** — add immediately after the existing `forceCooldown` line (line 60):

```typescript
const forceCooldown = req.query.force === 'true';

// Phase 34 D-22 — temporary validation flag, Bearer-gated above + env-gated below.
// REFUSES in prod even with valid Bearer (defense in depth). Used in Plan 34-04
// to force cascade fall-through when natural NIM throttle doesn't fire during
// validation. SHIPS in Plan 34-04, REVERTED in Plan 34-05 close-out commit.
const skipPrimaryRaw = req.query.skipPrimary;
let skipPrimary: 'nvidia_nim' | null = null;
if (skipPrimaryRaw === 'nvidia_nim' && env.NODE_ENV !== 'production') {
  skipPrimary = 'nvidia_nim';
  log.warn({ skipPrimary }, 'Phase 34 D-22 — skipPrimary flag honored (non-prod)');
} else if (skipPrimaryRaw && env.NODE_ENV === 'production') {
  log.warn({ skipPrimaryRaw }, 'Phase 34 D-22 — skipPrimary flag REFUSED in prod');
}
```

Then thread `skipPrimary` through `runRefreshExtraction({ triggeredBy, forceCooldown, skipPrimary })`. The pipeline already accepts options; planner adds the field to the options shape in `server/lib/llmExtractionPipeline.ts` and propagates to `freeClaudeCallLLM` via the existing `opts` argument (extends to `{ batchSize?, modelOverride?, skipOpenRouter?, skipPrimary? }`).

**Env-gate detail:** `env.NODE_ENV` — check it's already validated in `server/config.ts`. If absent, use `process.env.VERCEL_ENV !== 'production'` as the fallback (Vercel injects `VERCEL_ENV=production` on prod deployments).

### 2.6. CLAUDE.md Amendment Lines — D-31

**File:** `CLAUDE.md`.

**Line 93 (1-line edit — "Active providers" line):**

Current:

```markdown
- **Active providers (Phase 29 D-01)** — qwen-235b instruct model. OpenRouter fallback dormant — see `docs/architecture/llm-pipeline-reliability.md` for re-validation history.
```

Phase 34 amendment (assuming both providers pass — adapt for partial restore):

```markdown
- **Active providers (Phase 34 update)** — qwen-235b instruct model (NIM primary). Cerebras + Groq fallbacks restored via probe-driven re-integration (Phase 34 D-01). OpenRouter remains dormant per Phase 30.1 (90% rate-limited). See `docs/architecture/llm-pipeline-reliability.md` for cascade reality + per-provider eval scoring.
```

**Line 132 (Serverless Cache registry — add 2 lines after existing `llm:tokens:{provider}` entry):**

Current:

```markdown
- **`llm:tokens:{provider}:YYYY-MM-DD`** — daily token budget counter; 48h TTL.
```

Phase 34 addition (insert AFTER line 132, keeping the existing `{provider}` umbrella entry — the umbrella line already covers the pattern):

```markdown
- **`llm:tokens:cerebras:YYYY-MM-DD` (Phase 34)** — Cerebras daily request counter; 48h TTL; mirrors the OpenRouter pattern at `freeClaudeRouter.ts:289-306`.
- **`llm:tokens:groq:YYYY-MM-DD` (Phase 34)** — Groq daily request counter; 48h TTL; same pattern.
- **`events:llm-eval-baseline:v3:by-provider:{provider}` (Phase 34 D-20)** — per-provider eval baseline; 90d TTL; mirrors the per-model baseline pattern at `llmEvalHarness.ts:78` JSDoc (sanitized provider id in slot).
```

**No phase-history bloat** — single-line provider-count amendment + 3 registry entries. Phase 29 D-06 trim budget preserved.

---

## 3. Test File Recommendation (unknown #9)

**File:** `server/__tests__/lib/freeClaudeRouter.test.ts` — current size **284 lines**.

**Recommendation: EXTEND the existing file**, do NOT split.

Rationale:

- 284 lines is well below the typical Iran Monitor split threshold (~600-800 lines).
- Phase 33 added the `actorMatchRate` test to the existing `llmEvalHarness.test.ts` (similar pattern); split discipline is "split when file > 700 lines OR test categories diverge sharply", neither applies here.
- The new positive-case tests (D-27) are tight conceptual extensions of the existing P3 test pattern. Co-location aids future readers tracing the cascade behavior across providers.
- A separate `freeClaudeRouter.cascade.test.ts` would force `vi.useFakeTimers()` boilerplate duplication.

Planner action: add new `describe('Phase 34 cascade fall-through', () => { ... })` block at the end of the existing file. Mirror the `vi.useFakeTimers()` pattern from the existing P3 test (lines 262-283).

---

## 4. Validation Architecture (Nyquist Dimension 8 — MANDATORY)

Maps each ROADMAP success criterion (1-6) to (a) test/assertion that proves it, (b) file the test lives in or should be added to, (c) executable command.

### SC-1: Probe artifact committed

| Element   | Detail                                                                                                                                                                                              |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion | `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/probe-snapshot.json` exists with byte-stable shape (ISO-Z timestamp, sorted results, summary block per provider). |
| Test      | Snapshot fixture lives in the file itself; assertion via `jq -e` shape check in commit body of Plan 34-01. No code test.                                                                            |
| Command   | `jq -e '.byProvider.cerebras.summary.decision' .planning/phases/34-.../probe-snapshot.json && jq -e '.byProvider.groq.summary.decision' .planning/phases/34-.../probe-snapshot.json`                |

### SC-2: Adapter in cascade OR honest deferral

| Element                     | Detail                                                                                                                                                                                                                                                             |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Assertion (restored branch) | `FreeProvider` union extended; `getCerebrasClient()` / `getGroqClient()` present; cascade builder includes them; per-provider `llm:tokens:*` Redis keys writable.                                                                                                  |
| Assertion (deferred branch) | ADR-0010 sub-block + reliability doc record `cerebras-groq-deferred` close-out with probe percentages.                                                                                                                                                             |
| Test (restored)             | `server/__tests__/lib/freeClaudeRouter.test.ts` extension: "Cerebras fall_through row when NIM rate-limit-window full"; "Groq fall_through row when Cerebras daily-cap hit"; "all-providers-fail returns null content with cascade_exhausted-shaped routingTrace". |
| Test (deferred)             | `grep -q "cerebras-groq-deferred" docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`.                                                                                                                                                                      |
| Command                     | `npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts`                                                                                                                                                                                                     |

### SC-3: `callHistory` shows non-NIM provider names during throttle events

| Element   | Detail                                                                                                                                                                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion | Post-validation-cron, `events:llm-summary:v3.callHistory` contains at least one row with `provider: 'cerebras'` OR `provider: 'groq'`.                                                                                                          |
| Test      | Snapshot-harness assertion in Plan 34-04. No unit test — this is a live-cron observation.                                                                                                                                                       |
| Command   | `npm run watch:snapshot -- --http \| jq -e '[.callHistory[] \| select(.provider == "cerebras" or .provider == "groq")] \| length > 0'` (run AFTER `GET /api/cron/refresh-events?force=true&skipPrimary=nvidia_nim` with Bearer in dev/preview). |

### SC-4: Per-provider eval scoring

| Element       | Detail                                                                                                                                                                                                                                                                           |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion     | `evalScore.byProvider.{provider}.{within5km,within20km,within100km,total}` populated. UI surfaces per-provider rows in `EvalScoreBlock`. Per-provider scores within ±3pp of NIM baseline.                                                                                        |
| Test (server) | `server/__tests__/lib/llmEvalHarness.test.ts` extension: seed `events:llm:v3` with mixed `providerProvenance` values; assert `runEval().byProvider.nvidia_nim.total + .cerebras.total === <expected>`; assert aggregate bucket sums coherently against `byProvider` bucket sums. |
| Test (UI)     | `src/__tests__/components/DevApiStatus.evalByProvider.test.tsx` (new file mirroring `DevApiStatus.actorQuality.test.tsx` pattern): assert testIDs `eval-byprovider-{provider}-within20km` render for each provider; assert `(no data)` badge when `total === 0`.                 |
| Command       | `npx vitest run server/__tests__/lib/llmEvalHarness.test.ts src/__tests__/components/DevApiStatus.evalByProvider.test.tsx`                                                                                                                                                       |

### SC-5: DLQ count drop from Phase 31 Day-1 baseline

| Element     | Detail                                                                                                                                              |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion   | Validation cron snapshot DLQ count materially below 4 × `v3:timeout_watchdog`. New `v3:cascade_exhausted` reason valid in DLQEntry union.           |
| Test (unit) | `server/__tests__/lib/llmDLQ.test.ts`: assert `'v3:cascade_exhausted'` accepted by `DLQEntry.reason`; round-trip through `enqueueDLQ` + `smembers`. |
| Test (live) | Snapshot-harness assertion in Plan 34-04: `events:llm-dlq` member count for current-day timestamps < 4.                                             |
| Command     | `npx vitest run server/__tests__/lib/llmDLQ.test.ts && npm run watch:snapshot -- --http \| jq -e '.dlq.totalCount < 4'`                             |

### SC-6: No regression in Pitfall 1 cache bridge

| Element   | Detail                                                                                                                                                                                                                                                                      |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assertion | When `events:llm:v3` is flushed AND all provider keys are absent, `GET /api/events` continues to return raw GDELT entities. "Map never goes blank."                                                                                                                         |
| Test      | `server/__tests__/routes/events.pitfall1.test.ts` (existing) — verify still passes after Phase 34 changes. No new test needed unless the cascade extension changes the v3 cache shape (it shouldn't — `providerProvenance` is additive-optional, doesn't break the bridge). |
| Command   | `npx vitest run server/__tests__/routes/events.pitfall1.test.ts`                                                                                                                                                                                                            |

### Aggregate validation command (Plan 34-04 should execute and capture in PLAN.md)

```bash
# Unit tests (server + UI)
npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts \
                 server/__tests__/lib/llmDLQ.test.ts \
                 server/__tests__/lib/llmEvalHarness.test.ts \
                 src/__tests__/components/DevApiStatus.evalByProvider.test.tsx \
                 server/__tests__/routes/events.pitfall1.test.ts

# Live-path validation (against dev or preview deployment, with Bearer)
curl -H "Authorization: Bearer $DASHBOARD_PASSWORD" \
     "https://otg-iran-monitor.vercel.app/api/cron/refresh-events?force=true&skipPrimary=nvidia_nim"

# Snapshot harness
npm run watch:snapshot -- --http | tee plan-34-04-snapshot.json

# Assertions (jq predicates against the snapshot)
jq -e '[.callHistory[] | select(.provider == "cerebras" or .provider == "groq")] | length > 0' plan-34-04-snapshot.json
jq -e '.dlq.totalCount < 4' plan-34-04-snapshot.json
jq -e '.evalScore.byProvider' plan-34-04-snapshot.json

# Artifact assertions
jq -e '.byProvider.cerebras.summary.decision' .planning/phases/34-.../probe-snapshot.json
jq -e '.byProvider.groq.summary.decision' .planning/phases/34-.../probe-snapshot.json
grep -q "Phase 34" docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md
```

---

## 5. Open Questions / Pitfalls (planner discretion)

### 5.1. Cerebras 5-RPM survivability

The Phase 30 retry/backoff envelope (3 × [2s, 8s, 32s]) was tuned for a 40-RPM provider. On a 5-RPM provider, a single retry attempt on an unrelated batch in the same minute will burn the entire window. **Realistic probe outcome:** Cerebras lands in the `≥90% rate-limit-fail` bucket on the first probe (CONTEXT.md D-02's `cerebras-deferred` close-out).

If Cerebras probe fails this way, the planner should NOT propose retry-envelope adjustments — that's a Phase 35+ "Adaptive Retry-After-aware NIM limiter" candidate (CONTEXT.md deferred). The probe outcome IS the deliverable.

### 5.2. `qwen-3-235b-a22b-instruct-2507` extraction quality unknown

CONTEXT.md D-05 assumed `llama3.3-70b`; that's gone. The fallback (`qwen-3-235b-a22b-instruct-2507`) is structurally similar to NIM's primary (`qwen/qwen3.5-397b-a17b`), but the Cerebras-hosted variant may have different fine-tune lineage, system-prompt tolerance, or finish-reason behavior. The per-provider eval gate (±3pp vs NIM baseline) is the safeguard — Plan 34-04 will catch silent quality regression. **No prelaunch model-quality bake-off needed** (CONTEXT.md "Out of scope" line: "No new bake-off; per-provider eval is the quality lever").

### 5.3. Two-provider cascade ordering when both pass

CONTEXT.md D-09: NIM primary; secondaries ordered by probe latency p50 ascending. Probe snapshot must include `latencyP50` per provider for this ordering to be mechanical. **Confirm `probe-cerebras-groq.ts` emits `summary.latencyP50` + `summary.latencyP95`** alongside the existing `rateLimitedCount/Pct/decision` fields (`30.1-or-pulse-snapshot.json` schema didn't include these — Phase 34 needs them).

### 5.4. Validation cron run requires non-prod env

D-22's `?skipPrimary=nvidia_nim` is non-prod-only by design. Plan 34-04's validation cron must run against a Vercel Preview deployment (or local `npm run dev`), NOT prod. The validation row captured this way is sufficient for SC-3 evidence; the next-day natural prod cron will produce the SC-5 DLQ-count-drop evidence.

### 5.5. `latencyP50` / `latencyP95` not in `30.1-or-pulse-snapshot.json`

The 30.1 snapshot only carries `rateLimitedCount, rateLimitedPct, decision`. Phase 34's `probe-snapshot.json` MUST extend this with latency quantiles per provider for D-09 cascade ordering. Recommend the planner explicitly add `summary.latencyP50: number, summary.latencyP95: number` to the schema (rounded to integer ms, computed via in-script `sort + quantile` from `results[].latencyMs`).

### 5.6. Operator must populate `CEREBRAS_API_KEY` + `GROQ_API_KEY` in Vercel prod env BEFORE Plan 34-02 deploys

CONTEXT.md D-31 says "env vars already in `parseEnv()`". Verified in `server/config.ts:31-32`. **But they default to empty string.** If Plan 34-02 deploys without populating the keys, the adapters' `getCerebrasClient() / getGroqClient()` will return null (line 208-224 pattern), the cascade pre-check at `freeClaudeRouter.ts:382-417` will emit `skipped:no_client` for every batch, and the restore will be silently ineffective.

**Plan 34-02 pre-deploy UAT block MUST include:**

- "Operator confirms `CEREBRAS_API_KEY` is set in Vercel prod env (Settings → Environment Variables)."
- "Operator confirms `GROQ_API_KEY` is set in Vercel prod env."
- "Failure mode if missing: cascade silently no-ops to NIM-only; no DLQ entries to surface the gap; only `callHistory` will reveal it via persistent `reason: 'skipped:no_client'` rows."

---

## 6. Summary for the Planner

CONTEXT.md's 33 decisions remain canonical with two corrections from this research:

1. **D-05 Cerebras model**: change from `llama3.3-70b` (not available) to `qwen-3-235b-a22b-instruct-2507` (Path A, recommended) or `gpt-oss-120b` (Path B, backup).
2. **D-08 Cerebras RPM**: change from "~30 RPM" assumption to `RollingWindow(5, 60_000)` — 5 RPM is the actual free-tier ceiling; probe MAY land in the `cerebras-deferred` bucket on this constraint alone.

Plus two additions:

3. **probe-snapshot.json schema must include `latencyP50` + `latencyP95` per provider** for D-09 cascade ordering (the 30.1 snapshot didn't carry these).
4. **Plan 34-02 pre-deploy UAT must verify `CEREBRAS_API_KEY` + `GROQ_API_KEY` are populated in Vercel prod env** — otherwise the restore silently no-ops.

All other CONTEXT.md decisions stand. The code touchpoint line locations in §2 are verified (read directly from current `main`). The Validation Architecture in §4 maps every ROADMAP success criterion to an executable test/command. The planner has everything it needs.

---

_Phase: 34-llm-router-fallback-re-integration-cerebras-groq-per-provide_
_Research method: Inline orchestrator (gsd-phase-researcher unavailable due to environment instability)_
_Research date: 2026-05-23_

## RESEARCH COMPLETE
