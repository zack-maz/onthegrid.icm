---
status: pending
captured: 2026-04-22T02:40:00Z
source: Phase 27.4 close-out session
category: tech-debt
priority: low
blocking: false
target_phase: 27.4.3
---

# Phase 27.4.3 — deck.gl v9 type drift

Explicitly scoped OUT of Phase 27.4.1 during 2026-04-22 session. Placeholder
for when the real deck.gl migration phase opens.

## In-scope errors

8 `TS2353: 'depthTest' does not exist in type 'Parameters'` errors in
`src/hooks/useEntityLayers.ts` at lines 376, 407, 441, 472, 514, 549, 591, 617. All 8 are the same pattern:

```ts
parameters: { depthTest: false },
```

All apply to IconLayer instances that need to render on top of 3D terrain
without z-fighting.

## Root cause

deck.gl v9 migrated to Luma.gl v9's strict `GPUParameters` type (WebGPU-aligned).
`depthTest: boolean` was a v8 WebGL flag and is not part of the v9 type surface.
Runtime still tolerates it (either aliased internally or silently ignored),
which is why the app works visually.

## Fix options

1. **Cast (minimal):** `parameters: { depthTest: false } as any` — 30 sec,
   zero behavioral risk, hides the drift.
2. **Migrate per v9:** `parameters: { depthCompare: 'always' }` — runtime-
   correct per v9 spec, requires visual verification against terrain at
   mountain-pass camera angles.
3. **Extract helper constant:** `OVERLAY_LAYER_PARAMS = { depthCompare: 'always' }`
   — same verification burden as option 2, cleaner evolution story.

## Audit to do at phase start

Before committing to a fix, grep the full codebase for other v9 type drift:

- `depthTest`, `blend`, `blendFunc`, `cullFace` uses in other layer hooks
- `as any` casts on layer props (often hides the same kind of drift)
- Any other `parameters: { ... }` objects with legacy WebGL flag names

Related files to scan: `src/hooks/useWaterLayers.ts`, `src/components/map/layers/*.tsx`.

## Not in-scope

- 20 TS errors in `server/lib/llmEventExtractor.v1.ts` → Phase 27.4.1
- 1 TS error in `server/adapters/llm-provider.ts` line 232 → Phase 27.4.1
  (adjacent to LLM pipeline scope)

## Why low priority

- No runtime impact (app renders correctly)
- Only 8 errors on a 29-error baseline (~28% of remaining TS debt)
- Cross-cutting concern deserves its own phase with visual QA budget
