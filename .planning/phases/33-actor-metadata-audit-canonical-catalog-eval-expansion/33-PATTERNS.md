# Phase 33: Actor Metadata Audit, Canonical Catalog & Eval Expansion — Pattern Map

**Mapped:** 2026-05-21
**Files analyzed:** 24 (new + modified)
**Analogs found:** 23 / 24 (1 file has a partial / composite analog — `server/lib/actorClassifier.ts` per Pitfall §1)

---

## File Classification

| New/Modified File                                                       | Role                           | Data Flow        | Closest Analog                                                                                              | Match Quality           |
| ----------------------------------------------------------------------- | ------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------- |
| `server/data/actor-catalog.ts`                                          | static-data module (NEW)       | —                | `src/lib/factions.ts` + `src/lib/ethnicGroups.ts`                                                           | exact (sibling pattern) |
| `src/__tests__/lib/actorCatalog.test.ts`                                | contract test (NEW)            | —                | `src/__tests__/lib/colorBridge.test.ts`                                                                     | exact                   |
| `server/lib/actorClassifier.ts`                                         | shared classifier module (NEW) | transform        | `server/lib/eventScoring.ts` (pure-fn classifier) + `server/adapters/gdelt.ts:153-194` (classifyByBaseCode) | role-match (composite)  |
| `server/__tests__/lib/actorClassifier.test.ts`                          | unit test (NEW)                | —                | `server/__tests__/lib/eventScoring.test.ts` / `server/__tests__/lib/llmTokenBudget.test.ts`                 | role-match              |
| `.planning/phases/33-*/audit/run-audit.ts`                              | one-shot script (NEW)          | batch            | `scripts/snapshot-v3-redis.ts` + `scripts/snapshot-cron-watch.ts`                                           | exact                   |
| `.planning/phases/33-*/cameo-codes.json`                                | static reference (NEW)         | —                | `.planning/eval/ground-truth-events.json` (committed JSON fixture)                                          | role-match              |
| `.planning/phases/33-*/33-AUDIT-REPORT.md`                              | phase artifact (NEW)           | —                | `.planning/phases/31-*/31-SUMMARY.md` style                                                                 | exact                   |
| `server/lib/llmSchema.ts` (extend)                                      | schema definition (MODIFIED)   | —                | `server/lib/llmSchema.ts:173-175` (existing v2→v3 `.extend()` site)                                         | exact (self-analog)     |
| `server/lib/llmEventExtractor.v3.ts` (D-08 canonicalization)            | service / pipeline (MODIFIED)  | transform        | `server/lib/llmEventExtractor.v3.ts:780-810` (existing post-validate site)                                  | exact (self-analog)     |
| `server/lib/llmEventExtractor.v3.ts` (D-09 prompt)                      | service / prompt (MODIFIED)    | —                | `server/lib/llmEventExtractor.v3.ts:125-160` (SYSTEM_PROMPT_V3 array)                                       | exact (self-analog)     |
| `server/lib/llmEvalHarness.ts` (D-13 actorMatchRate)                    | service / eval (MODIFIED)      | request-response | `server/lib/llmEvalHarness.ts:250-312` (existing `runEval()`)                                               | exact (self-analog)     |
| `server/lib/llmProgress.ts` (D-13 mirror)                               | service / progress (MODIFIED)  | —                | `server/lib/llmProgress.ts:50-90` (existing optional-field extensions)                                      | exact (self-analog)     |
| `server/routes/operator-status.ts` (D-16 actorQuality block)            | controller (MODIFIED)          | request-response | `server/routes/operator-status.ts:282-316` (existing `prune` block — Phase 32 D-16)                         | exact                   |
| `src/components/ui/DevApiStatus.tsx` (D-17 actor-quality sub-block)     | component (MODIFIED)           | request-response | `src/components/ui/DevApiStatus.tsx:1603-1654` (Phase 32 prune sub-block)                                   | exact                   |
| `.planning/eval/ground-truth-events.json` (D-14 backfill)               | fixture (MODIFIED)             | —                | existing file (self-extend; additive optional fields)                                                       | exact                   |
| `.planning/eval/adversarial-injections.json` (D-15 append)              | fixture (MODIFIED)             | —                | existing file (self-extend; 3 new entries)                                                                  | exact                   |
| `server/__tests__/lib/llmSchema.test.ts` (extend D-10/D-12)             | contract test (MODIFIED)       | —                | `server/__tests__/lib/llmSchema.test.ts:1-80` (existing schema-acceptance tests)                            | exact (self-analog)     |
| `server/__tests__/lib/llmEvalHarness.test.ts` (extend D-13)             | unit test (MODIFIED)           | —                | `server/__tests__/lib/llmEvalHarness.test.ts:1-80` (existing harness tests)                                 | exact (self-analog)     |
| `server/__tests__/lib/llmEvalHarness.adversarial.test.ts` (extend D-15) | integration test (MODIFIED)    | —                | `server/__tests__/lib/llmEvalHarness.adversarial.test.ts:1-80` (existing)                                   | exact (self-analog)     |
| `server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts`        | unit test (NEW)                | —                | `server/__tests__/lib/freeClaudeRouter.test.ts` (vi.hoisted + dynamic import)                               | role-match              |
| `server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts`              | snapshot test (NEW)            | —                | `server/__tests__/lib/llmSchema.test.ts` (constant-shape assertion pattern)                                 | role-match              |
| `server/__tests__/lib/llmEvalHarness.groundTruthSchema.test.ts`         | contract test (NEW)            | —                | `server/__tests__/lib/llmEvalHarness.adversarial.test.ts:77-90` (real on-disk JSON read)                    | exact                   |
| `server/routes/__tests__/operator-status.test.ts` (extend D-16)         | integration test (MODIFIED)    | —                | `server/routes/__tests__/operator-status.test.ts:1-100` (existing supertest pattern)                        | exact (self-analog)     |
| `src/__tests__/components/DevApiStatus.actorQuality.test.tsx`           | RTL test (NEW)                 | —                | `src/__tests__/components/DevApiStatus.prune.test.tsx` (full Phase 32 jsdom matrix)                         | exact                   |

---

## Pattern Assignments

### Layer 1: Static-Data Module (Catalog)

---

### `server/data/actor-catalog.ts` (NEW — static-data, no I/O)

**Analog (primary):** `src/lib/factions.ts:1-49` (typed enum + Record + getter fn)
**Analog (secondary):** `src/lib/ethnicGroups.ts:34-149` (interface + readonly Record + grouped exports)

**Reuses:** `Faction` type from `src/lib/factions.ts:5` as `CanonicalActor.affiliation` (per D-05).

**Imports pattern** (mirror `src/lib/ethnicGroups.ts:1-32` minus the colorBridge dep — catalog has zero runtime CSS dep):

```typescript
/**
 * Phase 33 D-04..D-06 — canonical actor catalog for the Iran conflict.
 *
 * Static-data module. Zero Redis, zero env, zero runtime config. Pattern
 * mirrors src/lib/factions.ts + src/lib/ethnicGroups.ts. Consumed by:
 *   - server/lib/llmEventExtractor.v3.ts post-validate canonicalization (D-08)
 *   - src/__tests__/lib/actorCatalog.test.ts contract assertions (D-07)
 *   - server/routes/operator-status.ts via shared classifier (D-16, optional)
 *
 * CAMEO codes cross-checked against the committed snapshot at
 * .planning/phases/33-*/cameo-codes.json — orphan codes fail the contract
 * test loudly. If GDELT renames an actor code upstream, that drift surfaces
 * on the next vitest run (no auto-resync — see CONTEXT.md "Deferred Ideas").
 */
import type { Faction } from '../../src/lib/factions.js';
// Note: server/ → src/ cross-boundary import. Confirm tsconfig.server.json
// `paths`/`rootDirs` permits the import; if not, duplicate the 3-string
// union literal locally and add a JSDoc note pinning the duplication.
```

**Pattern dimensions to clone from `src/lib/factions.ts`:**

`src/lib/factions.ts:5-24` — typed enum + Record mapping declaration:

```typescript
// factions.ts:5 — exact shape to mirror for affiliation reuse
export type Faction = 'us' | 'iran' | 'neutral';

// factions.ts:11-24 — Record literal pattern
export const FACTION_ASSIGNMENTS: Record<string, Faction> = {
  ISR: 'us',
  IRN: 'iran',
  // ...
};

// factions.ts:47-49 — pure getter w/ fallback
export function getFaction(isoA3: string): Faction {
  return FACTION_ASSIGNMENTS[isoA3] ?? 'neutral';
}
```

**Pattern dimensions to clone from `src/lib/ethnicGroups.ts`:**

`src/lib/ethnicGroups.ts:46-66` — interface + readonly Record:

```typescript
// ethnicGroups.ts:46-53 — interface shape (multi-field per entry)
export interface EthnicGroupConfig {
  id: EthnicGroup;
  label: string;
  // ...
}

// ethnicGroups.ts:66 — Record literal of typed entries
export const ETHNIC_GROUPS: Record<EthnicGroup, EthnicGroupConfig> = { ... };

// ethnicGroups.ts:149 — derived list export for iteration consumers
export const ETHNIC_GROUP_IDS: EthnicGroup[] = Object.keys(ETHNIC_GROUPS) as EthnicGroup[];
```

**Phase 33 D-05 target shape (composite of both analogs):**

```typescript
export interface CanonicalActor {
  canonicalName: string;        // e.g., "Israeli Defense Forces"
  aliases: string[];            // lowercase: ["idf", "israel defense forces", ...]
  cameoCodes: string[];         // e.g., ["ISRMIL", "MIL"]
  affiliation: Faction;         // reuses src/lib/factions.ts type
}

export const ACTOR_CATALOG: ReadonlyArray<CanonicalActor> = [
  { canonicalName: 'Israeli Defense Forces', aliases: ['idf', 'israel defense forces', ...], cameoCodes: ['ISRMIL'], affiliation: 'us' },
  // ~30-50 entries per D-06
];

// Module-load Map build with longest-alias-wins ordering (Discretion §3):
// Insert shorter aliases FIRST so the longer ones overwrite generic-name shadowing.
// (Or pre-sort aliases descending by length and assert no-collision at build time.)
export const ACTOR_LOOKUP: ReadonlyMap<string, CanonicalActor> = (() => {
  const m = new Map<string, CanonicalActor>();
  const all = ACTOR_CATALOG.flatMap(a =>
    [a.canonicalName, ...a.aliases].map(s => ({ key: s.toLowerCase(), actor: a }))
  ).sort((x, y) => x.key.length - y.key.length); // shorter first → longer overwrites
  for (const { key, actor } of all) m.set(key, actor);
  return m;
})();

export function canonicalize(name: string): CanonicalActor | null {
  return ACTOR_LOOKUP.get(name.trim().toLowerCase()) ?? null;
}
```

**Pattern dimensions to DIVERGE from factions / ethnicGroups:**

- No `colorBridge` dep — catalog is colorless (vs. `ethnicGroups.ts` which threads RGBA tuples). The `affiliation: Faction` field is stored but **not surfaced to the dashboard sample** per Discretion §6 ("reserved for future use").
- `ACTOR_LOOKUP` is a `Map<string, CanonicalActor>` (not `Record<string, CanonicalActor>`) so the build-time uniqueness invariant can be checked iteratively without TS index-signature limits.
- File lives under `server/data/`, not `src/lib/`. The cross-boundary `Faction` import (above) is the only seam — if `tsconfig.server.json` blocks it, duplicate the 3-string union literal locally.

**Named exports (no default):**

- `CanonicalActor` (interface)
- `ACTOR_CATALOG` (`ReadonlyArray<CanonicalActor>`)
- `ACTOR_LOOKUP` (`ReadonlyMap<string, CanonicalActor>`)
- `canonicalize(name: string): CanonicalActor | null`

---

### `src/__tests__/lib/actorCatalog.test.ts` (NEW — contract test)

**Analog:** `src/__tests__/lib/colorBridge.test.ts` (byte-identity-sentinel pattern + `it.each(...)` table-driven assertions)

**Imports pattern** (`colorBridge.test.ts:18-23`):

```typescript
import { describe, it, expect } from 'vitest';

import { ACTOR_CATALOG, ACTOR_LOOKUP, canonicalize } from '@/../server/data/actor-catalog';
// CAMEO codebook — committed phase artifact. Confirm tsconfig.test resolves
// the `.planning/` path; if blocked, copy `cameo-codes.json` to a path that
// is import-resolvable OR inline a tiny subset of orphan-check codes here.
import cameoCodebook from '../../../.planning/phases/33-actor-metadata-audit-canonical-catalog-eval-expansion/cameo-codes.json';
```

**Test structure pattern** (`colorBridge.test.ts:25-264`):

```typescript
describe('Phase 33 actor catalog contract', () => {
  describe('no duplicate canonical names', () => {
    it('every CanonicalActor.canonicalName is unique', () => {
      const names = ACTOR_CATALOG.map((a) => a.canonicalName);
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('no orphan CAMEO codes (D-07 b)', () => {
    const allCodes = ACTOR_CATALOG.flatMap((a) => a.cameoCodes);
    const knownCodes = new Set(cameoCodebook.actorCodes.map((c: { code: string }) => c.code));
    it.each(allCodes)('CAMEO code %s is in committed codebook', (code) => {
      expect(knownCodes.has(code)).toBe(true);
    });
  });

  describe('canonicalize() is case-insensitive (D-07 d)', () => {
    it('idf, IDF, Idf all resolve to the same entry', () => {
      const a = canonicalize('idf');
      const b = canonicalize('IDF');
      const c = canonicalize('Idf');
      expect(a).not.toBeNull();
      expect(b).toBe(a);
      expect(c).toBe(a);
    });
  });

  describe('unknown alias returns null (D-07 e)', () => {
    it('canonicalize("UNKNOWN_ALIAS_xxx") returns null', () => {
      expect(canonicalize('UNKNOWN_ALIAS_xxx')).toBeNull();
    });
  });

  describe('alias-collision build-time guard (D-07 c)', () => {
    // If two CanonicalActors share an alias, ACTOR_LOOKUP build-order
    // determinism becomes load-bearing (longest-alias-wins per Discretion §3).
    // Re-build the Map locally with the same rules + assert no
    // shorter-then-longer collision shadows a different canonical.
    it('every alias resolves to exactly one CanonicalActor', () => {
      for (const entry of ACTOR_CATALOG) {
        for (const alias of entry.aliases) {
          const resolved = canonicalize(alias);
          expect(resolved).toBe(entry); // strict referential equality
        }
      }
    });
  });
});
```

**Pattern dimensions to clone:**

- `it.each(table)('...', (item) => {...})` for table-driven CAMEO orphan checks (`colorBridge.test.ts:54-63`)
- `expect(new Set(arr).size).toBe(arr.length)` for the no-duplicate invariant (`colorBridge.test.ts` ethnic-group test patterns)
- Strict referential equality (`expect(a).toBe(b)`) when asserting alias→canonical join (matches `colorBridge.test.ts:108` `.toEqual([...])` style)

**Pattern dimensions to DIVERGE:**

- `colorBridge.test.ts` reads CSS-var fallbacks (jsdom env); `actorCatalog.test.ts` has no DOM dep — runs under either jsdom or node. No `@vitest-environment` pragma needed (default is jsdom from `vite.config.ts`).
- The catalog test imports a committed JSON file at `.planning/phases/33-*/cameo-codes.json` — `colorBridge.test.ts` has no equivalent. If `tsconfig.test` blocks the cross-tree import, the fallback is inlining the codebook as a `const` array in the test (smaller blast radius).

---

### Layer 2: Shared Classifier (Pitfall §1 — code dedup)

---

### `server/lib/actorClassifier.ts` (NEW — pure-fn helper)

**Analog 1:** `server/adapters/gdelt.ts:153-194` (existing `classifyByBaseCode` — exact role-match: pure deterministic classifier with no I/O)
**Analog 2:** `server/lib/eventScoring.ts` (pure-fn pattern used by both extractor + UI)

**Imports pattern** (`server/adapters/gdelt.ts:1-19` — minimal):

```typescript
/**
 * Phase 33 Pitfall §1 mitigation — shared deterministic actor classifier.
 *
 * Same D-02 rules run in two places: the one-shot audit script (ACTOR-01)
 * AND the lazy compute in /api/operator-status (ACTOR-05). Drift between
 * the two would mean dashboard counts disagree with the committed audit
 * report. Factoring out here is the smallest-blast-radius dedup.
 *
 * Pure-fn module. No Redis, no logger, no I/O. Both consumers feed in
 * the CAMEO codebook + deny-list. Mirrors the classifyByBaseCode pattern
 * in server/adapters/gdelt.ts:153-194.
 */
```

**Pure classifier pattern (mirror `server/adapters/gdelt.ts:153-194`):**

```typescript
// gdelt.ts:153-194 template — pure, deterministic, branch-by-condition:
//
// export function classifyByBaseCode(
//   baseCode: number | null,
//   rootCode: number | null,
// ): ConflictEventType {
//   if (baseCode === null) return ROOT_FALLBACK[rootCode ?? -1] ?? 'other';
//   if (CONFLICT_BASE_TO_TYPE.has(baseCode)) return CONFLICT_BASE_TO_TYPE.get(baseCode)!;
//   return ROOT_FALLBACK[rootCode ?? -1] ?? 'other';
// }

export type ActorIssue = 'ok' | 'null' | 'raw-cameo' | 'ambiguous';

const RAW_CAMEO_REGEX = /^[A-Z]{3,5}$/;

// D-02 (c) static deny-list — case-insensitive match.
const AMBIGUOUS_DENY_LIST = new Set([
  'soldiers',
  'forces',
  'militants',
  'troops',
  'fighters',
  'the army',
  'gunmen',
  'attackers',
  'rebels',
  'insurgents',
  'militia',
]);

/**
 * Classify a single actor string per D-02 deterministic rules.
 * Bucket (d) source-disagreement is NOT auto-detected — reserved for
 * human spot-check in the audit report. Returns 'ok' for clean strings.
 */
export function classifyActor(actor: string, cameoCodebook: Set<string>): ActorIssue {
  const trimmed = actor.trim();
  if (trimmed.length === 0) return 'null'; // bucket (a) — empty string variant
  if (RAW_CAMEO_REGEX.test(trimmed) && cameoCodebook.has(trimmed)) return 'raw-cameo';
  if (AMBIGUOUS_DENY_LIST.has(trimmed.toLowerCase())) return 'ambiguous';
  return 'ok';
}

/**
 * Classify the actors array of one event. Bucket (a) covers BOTH null/missing
 * AND every-element-empty.
 */
export function classifyEventActors(
  actors: readonly string[] | null | undefined,
  cameoCodebook: Set<string>,
): ActorIssue[] {
  if (actors == null || actors.length === 0) return ['null'];
  if (actors.every((a) => a.trim().length === 0)) return ['null'];
  return actors.map((a) => classifyActor(a, cameoCodebook));
}
```

**Pattern dimensions to clone from `server/adapters/gdelt.ts:153-194`:**

- Pure-fn signature: `(primitive[, lookup]) => enumValue`
- Module-scope `const` for static maps/sets/regexes (zero runtime allocation per call)
- Branch by guard clauses, return early — no `else` chains

**Pattern dimensions to DIVERGE:**

- Takes the CAMEO codebook as a `Set<string>` parameter (not a module-scope import) so the audit script can pass its loaded codebook AND `operator-status.ts` can pass the same set without bundling the JSON file into the server build. Constructor of the Set lives in the consumer (audit script reads from `.planning/...` JSON; operator-status reads from a pre-built constant or, if needed, a hardcoded subset of well-known CAMEO actor codes).
- No `logger.child(...)` — pure-fn modules don't log per project convention (matches `eventScoring.ts` precedent).

---

### `server/__tests__/lib/actorClassifier.test.ts` (NEW — unit)

**Analog:** `server/__tests__/lib/eventScoring.test.ts` / `server/__tests__/lib/llmTokenBudget.test.ts` (pure-fn unit test pattern; no mocks, no Redis)

**Pattern to clone:**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { classifyActor, classifyEventActors } from '../../lib/actorClassifier.js';

const codebook = new Set(['ISRMIL', 'IRNMIL', 'USMIL']);

describe('classifyActor — D-02 deterministic rules', () => {
  it('bucket (a) — empty string', () => {
    expect(classifyActor('', codebook)).toBe('null');
    expect(classifyActor('   ', codebook)).toBe('null');
  });
  it('bucket (b) — raw CAMEO match', () => {
    expect(classifyActor('ISRMIL', codebook)).toBe('raw-cameo');
  });
  it('bucket (b) — regex-matches but not in codebook', () => {
    expect(classifyActor('XYZAB', codebook)).toBe('ok');
  });
  it('bucket (c) — ambiguous (case-insensitive)', () => {
    expect(classifyActor('Forces', codebook)).toBe('ambiguous');
    expect(classifyActor('FIGHTERS', codebook)).toBe('ambiguous');
    expect(classifyActor('the army', codebook)).toBe('ambiguous');
  });
  it('clean string returns ok', () => {
    expect(classifyActor('Islamic Revolutionary Guard Corps', codebook)).toBe('ok');
  });
});

describe('classifyEventActors — bucket (a) covers null + all-empty', () => {
  it('null actors → ["null"]', () => {
    expect(classifyEventActors(null, codebook)).toEqual(['null']);
  });
  it('all-empty actors → ["null"]', () => {
    expect(classifyEventActors(['', '   '], codebook)).toEqual(['null']);
  });
});
```

---

### Layer 3: Audit Script (One-Shot)

---

### `.planning/phases/33-*/audit/run-audit.ts` (NEW — one-shot tsx script)

**Analog (primary):** `scripts/snapshot-v3-redis.ts` (reads `events:llm:v3` from Redis, writes timestamped JSON to a phase directory)
**Analog (secondary):** `scripts/snapshot-cron-watch.ts` (npm-run-invocation pattern, prod-confirm gate)

**Shebang + script-doc pattern** (`scripts/snapshot-v3-redis.ts:1-33`):

```typescript
#!/usr/bin/env node
/**
 * Phase 33 D-01..D-03 — one-shot audit of events:llm:v3 actor metadata.
 *
 * Reads the live LLM-extracted event cache and classifies each event's
 * data.actors[] per the D-02 deterministic rules (buckets a/b/c). Bucket d
 * (source-disagreement) is reserved for human spot-check; this script seeds
 * 10 random candidates from the a/b/c overlap for the operator to mark
 * with [✓ disagrees] / [✗ matches source] annotations after running.
 *
 * Output: .planning/phases/33-*/33-AUDIT-REPORT.md (committed).
 *
 * Usage:
 *   node --import tsx/esm .planning/phases/33-*/audit/run-audit.ts [--prod-confirm]
 *
 *   --prod-confirm   Required when env.CACHE_KEY_PREFIX is empty (production
 *                    tier) — defense-in-depth gate mirrors snapshot-v3-redis.
 */
```

**Imports + Redis access pattern** (`scripts/snapshot-v3-redis.ts:35-46`):

```typescript
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redis } from '../../../../server/cache/redis.js';
import type { ConflictEventEntity } from '../../../../server/types.js';
import { classifyEventActors } from '../../../../server/lib/actorClassifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PHASE_DIR = resolve(__dirname, '..');
const REPORT_PATH = resolve(PHASE_DIR, '33-AUDIT-REPORT.md');
const CODEBOOK_PATH = resolve(PHASE_DIR, 'cameo-codes.json');
```

**Prod-confirm gate (`scripts/snapshot-v3-redis.ts:135-141`):**

```typescript
const cacheKeyPrefix = process.env.CACHE_KEY_PREFIX ?? '';
const prodConfirm = process.argv.includes('--prod-confirm');
if (!cacheKeyPrefix && !prodConfirm) {
  console.error(
    'error: env.CACHE_KEY_PREFIX is empty (production tier) — re-run with --prod-confirm',
  );
  process.exit(2);
}
```

**Safe Redis read pattern (`scripts/snapshot-v3-redis.ts:106-112`):**

```typescript
async function safeGet<T>(key: string): Promise<T | null> {
  try {
    return await redis.get<T>(key);
  } catch (err) {
    console.error('redis.get failed:', err);
    return null;
  }
}
```

**Audit-loop + report-write pattern (NEW — composite, not in analog):**

```typescript
async function main(): Promise<void> {
  // ... prod-confirm gate above ...
  const cached = await safeGet<ConflictEventEntity[]>('events:llm:v3');
  if (!cached) {
    console.error('events:llm:v3 cache empty — nothing to audit');
    process.exit(1);
  }
  const codebookRaw = readFileSync(CODEBOOK_PATH, 'utf-8');
  const codebook: Set<string> = new Set(
    (JSON.parse(codebookRaw) as { actorCodes: { code: string }[] }).actorCodes.map((c) => c.code),
  );
  const buckets: Record<'null' | 'raw-cameo' | 'ambiguous', Array<{ eventId: string; actors: string[]; sourceUrl: string }>> = {
    null: [], 'raw-cameo': [], ambiguous: [],
  };
  for (const event of cached) {
    const issues = classifyEventActors(event.data?.actors, codebook);
    if (issues.includes('null')) buckets.null.push({ eventId: event.id, actors: event.data?.actors ?? [], sourceUrl: event.data?.sourceUrl ?? '' });
    if (issues.includes('raw-cameo')) buckets['raw-cameo'].push({ ... });
    if (issues.includes('ambiguous')) buckets.ambiguous.push({ ... });
  }
  // Render markdown report (header + per-bucket count/% + 5-10 examples each +
  // bucket-d 10-random-from-a/b/c overlap spot-check seed). Write to REPORT_PATH.
}

main().catch((err) => { console.error(err); process.exit(1); });
```

**Pattern dimensions to clone from `scripts/snapshot-v3-redis.ts`:**

- Shebang `#!/usr/bin/env node`
- Top-of-file JSDoc block listing purpose + usage + flags
- `__dirname` derivation via `fileURLToPath(import.meta.url)`
- `safe*` helpers (`safeGet`, `safeLrange`, `safeSmembers`) — catch Redis errors and return null/error envelope
- Prod-confirm gate against empty `CACHE_KEY_PREFIX`
- `main().catch((err) => { ... process.exit(1) })` bottom-of-file invocation

**Pattern dimensions to DIVERGE:**

- Writes Markdown (not JSON) — REPORT_PATH ends `.md`, body assembled via template literals
- Imports the new shared `classifyEventActors` helper (D-02 dedup per Pitfall §1)
- Reads ONE Redis key (`events:llm:v3`) — snapshot-v3-redis reads 6
- No `--label` arg — output path is fixed at `33-AUDIT-REPORT.md` (one-shot)

---

### `.planning/phases/33-*/cameo-codes.json` (NEW — static reference)

**Analog:** `.planning/eval/ground-truth-events.json` (committed JSON fixture under `.planning/`)

**Shape (per Discretion §2 — recommended JSON over txt):**

```json
{
  "version": "GDELT-CAMEO-2026-05",
  "source": "https://www.gdeltproject.org/data/lookups/CAMEO.eventcodes.txt + actorcodes.txt (snapshot 2026-05-21)",
  "actorCodes": [
    { "code": "ISRMIL", "label": "Israel Military", "type": "country-military" },
    { "code": "IRNMIL", "label": "Iran Military", "type": "country-military" },
    { "code": "USMIL", "label": "United States Military", "type": "country-military" }
    /* ... */
  ],
  "eventCodes": [
    /* optional — for future expansion; not required by Phase 33 */
  ]
}
```

**Source provenance:** Discretion §2 confirms `server/adapters/gdelt.ts` does NOT carry a CAMEO **actor** codebook — only event-code helpers (`classifyByBaseCode` at line 153, `describeEvent`) and per-row column accessors (`COL.Actor1Name`, `COL.Actor1CountryCode`). The actor codebook is net-new content for Phase 33; seed from GDELT's published codebook URL with a committed snapshot.

---

### Layer 4: Schema + Extractor (Phase 27.4.3 self-analogs)

---

### `server/lib/llmSchema.ts` — D-10 / D-12 extension (MODIFIED)

**Analog (self):** `server/lib/llmSchema.ts:173-175` (existing v2→v3 `.extend()` site) + `server/lib/llmSchema.ts:263-347` (existing `EVENT_EXTRACTION_SCHEMA_V2` JSON Schema literal)

**Existing extend pattern (`llmSchema.ts:173-175` — confirmed):**

```typescript
// Line 173-175 — current v3 declaration, mirror for D-10:
export const enrichedEventV3 = enrichedEventV2.extend({
  schemaVersion: z.literal('v3'),
});
export type EnrichedEventV3 = z.infer<typeof enrichedEventV3>;
```

**Phase 33 D-10 target (extends the same site, additive):**

```typescript
// Open Q §1 resolution (researcher recommended): ship as .optional() for
// the rollout window. Tighten to required in a Phase 35+ cleanup phase
// once events:llm:v3 has rolled forward through 24h cron cycle.
export const enrichedEventV3 = enrichedEventV2.extend({
  schemaVersion: z.literal('v3'),
  actorConfidence: z.array(z.enum(['high', 'medium', 'low'])).optional(),
  // Cross-field length-match (arr.length === actors.length) enforced in the
  // extractor's repair step (D-10), NOT in Zod superRefine — Zod can't
  // cross-field-refine without the parent shape, which would complicate
  // the discriminated union read path. Document this in JSDoc.
});
```

**Strict() preservation note (`llmSchema.ts:164-170` — confirmed):**

```typescript
// Lines 164-170 — existing JSDoc that confirms .extend() preserves .strict():
//
// "Note on strict() preservation: `z.object({...}).strict().extend({...})`
// in Zod v3 re-applies strict on the resulting schema. Tested: a v3 payload
// with a surplus `lat` key on `location` still fails safeParse via the
// nested strict() on locationHierarchyV2, AND a surplus top-level key fails
// via the outer strict() preserved through .extend()."
```

**Phase 33 caveat (Open Q §1):** `.optional()` admits legacy v3 payloads that lack `actorConfidence` during the rollout. Required (no `.optional()`) would reject the entire pre-Phase-33 cache through the `enrichedEventAny` union read at `llmSchema.ts:191-195`.

**`EVENT_EXTRACTION_SCHEMA_V3` un-aliasing pattern (D-12; Open Q §3):**

```typescript
// llmSchema.ts:359 — CURRENT state (just an alias):
//   export const EVENT_EXTRACTION_SCHEMA_V3: Record<string, unknown> = EVENT_EXTRACTION_SCHEMA_V2;
//
// Phase 33 D-12 — copy the v2 literal verbatim, ADD actorConfidence to
// properties + required arrays. Document the un-aliasing decision in JSDoc
// (Open Q §3 — v2 is frozen post-Phase-29, so divergence is low-risk).

export const EVENT_EXTRACTION_SCHEMA_V3: Record<string, unknown> = {
  type: 'object',
  properties: {
    events: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          /* ... all existing v2 fields ... */
          actors: { type: 'array', items: { type: 'string' } },
          actorConfidence: {
            type: 'array',
            items: { type: 'string', enum: ['high', 'medium', 'low'] },
          },
          /* ... */
        },
        required: [
          'groupKey',
          'location',
          'type',
          'confidence',
          'reasoning',
          'weaponType',
          'targetType',
          'timeOfDay',
          'durationMinutes',
          'actors',
          'actorConfidence', // ← Open Q §2: ship required in wire schema; server-side repair as defense-in-depth
          'severity',
          'summary',
          'casualties',
          'sourceCount',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['events'],
  additionalProperties: false,
};
```

**Pattern dimensions to clone (self):**

- `.extend({ ... })` on `enrichedEventV2` (line 173) — additive, preserves strict()
- The `Record<string, unknown>` JSON Schema literal shape (lines 263-347)
- The comment block at lines 290-298 documenting NIM's relaxed JSON-Schema enforcement — useful precedent for the Open Q §2 commentary on `actorConfidence` wire-required

**Pattern dimensions to DIVERGE:**

- Un-alias `EVENT_EXTRACTION_SCHEMA_V3` from `_V2` — copy + edit, not reuse
- `actorConfidence` is `.optional()` in Zod but `required` in the JSON Schema wire contract (the LLM gets a forcing function, the cache-read accepts legacy payloads)

---

### `server/lib/llmEventExtractor.v3.ts` — D-08 canonicalization site (MODIFIED)

**Analog (self):** `server/lib/llmEventExtractor.v3.ts:780-781` (existing post-Zod-parse site, immediately after `batchResponseV3.safeParse(parsed)` succeeds)

**Current post-validate site (confirmed at `llmEventExtractor.v3.ts:760-810`):**

```typescript
// Lines 760-810 (existing) — the post-validate batch-write site where D-08
// + D-10 repair must land. Phase 33's canonicalization step inserts AFTER
// the safeParse success branch and BEFORE results.push:
//
//   // (existing zod success branch) const validated = batchResponseV3.safeParse(parsed);
//   // if (!validated.success) { ... DLQ enqueue ... return; }
//
//   // === PHASE 33 D-08 — server-side post-mapping canonicalization ===
//   const canonicalizedEvents = applyCatalogToEvents(validated.data.events);
//
//   // === PHASE 33 D-10 — actorConfidence repair (defense-in-depth) ===
//   const repairedEvents = canonicalizedEvents.map(repairActorConfidence);
//
//   results.push(...repairedEvents);  // line 780 (existing) — but now with repaired payload
//   allFailed = false;                  // line 781 (existing, unchanged)
```

**Helper signatures (NEW — factor out for testability + atomic commits):**

```typescript
// Inline in llmEventExtractor.v3.ts (NOT exported — module-private):

import { canonicalize } from '../data/actor-catalog.js';

/** D-08 — walk each event's actors[] through the catalog; unmatched pass through. */
function applyCatalogToEvents(events: EnrichedEventV3[]): EnrichedEventV3[] {
  return events.map((event) => ({
    ...event,
    actors: event.actors.map((a) => canonicalize(a)?.canonicalName ?? a),
  }));
}

/** D-10 — fill/repair actorConfidence to be length-locked with actors. */
function repairActorConfidence(event: EnrichedEventV3): EnrichedEventV3 {
  if (event.actorConfidence == null || event.actorConfidence.length !== event.actors.length) {
    return {
      ...event,
      actorConfidence: event.actors.map(() => 'low' as const),
    };
  }
  return event;
}
```

**Imports pattern (add to existing extractor imports — `llmEventExtractor.v3.ts` already uses `.js` extension per ESM convention, confirmed at line 26 `from '../cache/redis.js'`):**

```typescript
import { canonicalize } from '../data/actor-catalog.js';
```

**Pattern dimensions to clone (self):**

- Insert AFTER `safeParse` success branch, BEFORE `results.push(...)` (line 780)
- Wrap mutation in helper functions for testability — `applyCatalogToEvents` + `repairActorConfidence` are unit-testable in isolation without spinning up the full extractor
- Use `.js` extension on imports (ESM convention used file-wide)

---

### `server/lib/llmEventExtractor.v3.ts` — D-09 SYSTEM_PROMPT (MODIFIED)

**Analog (self):** `server/lib/llmEventExtractor.v3.ts:125-160` (existing `SYSTEM_PROMPT_V3` array)

**Current line 143 (confirmed):**

```typescript
// Line 125 — SYSTEM_PROMPT_V3 begins as a TS string array joined with \n.
// Line 143 — current actor instruction (verbatim):
//   '9. actors: array of actor names involved',
```

**Phase 33 D-09 extension (verbatim replacement of line 143):**

```typescript
// Replace line 143 with:
'9. actors: array of actor names involved — prefer canonical full names (e.g., "Islamic Revolutionary Guard Corps" over "IRGC" or "Iranian forces"). Server-side mapping handles known variants.',

// And add a new instruction line for actorConfidence (Discretion §5 — wire-required):
// Insert AFTER line 147 ('13. sourceCount: integer — count of independent sources'):
'14. actorConfidence: array of "high" | "medium" | "low" — one entry per actors[], same length, indicating LLM certainty for each actor identification.',
```

**Pattern dimensions to clone (self):**

- `SYSTEM_PROMPT_V3` is a string array joined with `\n` (`llmEventExtractor.v3.ts:160 .join('\n')`)
- Numbered instructions matching `1.`–`13.` cadence; just append `14.`
- Field-name + colon + description format matches lines 137-147

---

### Layer 5: Eval Harness Extension

---

### `server/lib/llmEvalHarness.ts` — D-13 `actorMatchRate` (MODIFIED)

**Analog (self):** `server/lib/llmEvalHarness.ts:121-126` (existing `EvalScore` interface) + `server/lib/llmEvalHarness.ts:250-312` (existing `runEval()` loop)

**Current EvalScore + runEval (confirmed):**

```typescript
// Lines 121-126 — current EvalScore:
export interface EvalScore {
  within5km: number;
  within20km: number;
  within100km: number;
  total: number;
}

// Lines 264-280 — current runEval loop (resolver-only per A6 / Pitfall 8):
for (const ev of gt.events) {
  try {
    const resolved = await resolveLocation(ev.hierarchy, {
      centroidLat: ev.truth.lat,
      centroidLng: ev.truth.lng,
    });
    const dKm = haversineKm(resolved.lat, resolved.lng, ev.truth.lat, ev.truth.lng);
    if (dKm <= 5) w5++;
    if (dKm <= 20) w20++;
    if (dKm <= 100) w100++;
  } catch (err) {
    log.warn({ err, id: ev.id }, 'eval harness resolve failed for event');
  }
}
```

**Phase 33 D-13 extension (additive, resolver-only constraint preserved):**

```typescript
// Add field to EvalScore (line 121-126):
export interface EvalScore {
  within5km: number;
  within20km: number;
  within100km: number;
  total: number;
  /** D-13 — case-insensitive substring AND-match rate against ground-truth
   *  expectedActor1 + expectedActor2 over the LIVE events:llm:v3 cache.
   *  Resolver-only constraint preserved by sourcing actor predictions from
   *  cache, NOT by re-extracting per eval run.
   *  Range 0..1; 0 if no ground-truth events have expectedActor{1,2}. */
  actorMatchRate: number;
}

// Insert AFTER the existing resolver loop (line 280) and BEFORE the score
// object build (line 282):

// === PHASE 33 D-13 — actor-match scoring over live cache ===
// Open Q §4 resolution (researcher recommended path c): match by
// landmark + country case-insensitive substring (gt id is synthetic
// gt-NNN; live groupKey is dynamic — direct join is broken as written).
import { cacheGetSafe } from '../cache/redis.js';
import { LLM_EVENTS_KEY_ACTIVE } from './llmExtractionPipeline.js';
import type { ConflictEventEntity } from '../types.js';

const live = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 999_999_999);
const liveEvents: ConflictEventEntity[] = live?.data ?? [];

let actorMatched = 0;
let actorTotal = 0;

for (const gtEvent of gt.events) {
  const exp1 = (gtEvent as { expectedActor1?: string | null }).expectedActor1;
  const exp2 = (gtEvent as { expectedActor2?: string | null }).expectedActor2;
  if (exp1 == null) continue; // skip events without expectations
  actorTotal++;
  // Approximate match by landmark + country substring (Open Q §4 path c):
  const landmark = gtEvent.hierarchy.landmark?.toLowerCase() ?? '';
  const country = gtEvent.hierarchy.country?.toLowerCase() ?? '';
  const candidates = liveEvents.filter((e) => {
    const label = (e.label ?? '').toLowerCase();
    return (landmark && label.includes(landmark)) || (country && label.includes(country));
  });
  for (const cand of candidates) {
    const actors = (cand.data as { actors?: string[] }).actors ?? [];
    const lowered = actors.map((a) => a.toLowerCase());
    const has1 = lowered.some((a) => a.includes(exp1.toLowerCase()));
    const has2 = exp2 == null || lowered.some((a) => a.includes(exp2.toLowerCase()));
    if (has1 && has2) {
      actorMatched++;
      break; // count once per gt event
    }
  }
}

const actorMatchRate = actorTotal === 0 ? 0 : actorMatched / actorTotal;

// Extend the score object (line 282-287):
const score: EvalScore = {
  within5km: w5,
  within20km: w20,
  within100km: w100,
  total: gt.events.length,
  actorMatchRate, // ← NEW
};
```

**Pattern dimensions to clone (self):**

- `try/catch` per-event with `log.warn({ err, id: ev.id }, '...')` — resolver-only failures non-fatal (line 275-279)
- `cacheSetSafe(BASELINE_KEY, score, BASELINE_TTL_SEC)` persists score post-loop (line 300-305)
- `updateProgress({ evalScore: score })` surfaces to llm-status (line 292)

**Pattern dimensions to DIVERGE:**

- Adds a SECOND pass after the resolver loop — reads `events:llm:v3` ONCE via `cacheGetSafe`, builds a candidate index by landmark+country substring (Open Q §4 path c)
- Does NOT call `resolveLocation` for actor matching — preserves resolver-only by reading cache only

---

### `server/lib/llmProgress.ts` — D-13 mirror (MODIFIED)

**Analog (self):** `server/lib/llmProgress.ts:50-90` (existing optional-field extension pattern)

**Phase 27.4 optional-extension pattern (verbatim from `llmProgress.ts:47`):**

```typescript
// "Phase 27.4 extensions (D-19, D-20, D-22, D-23, D-30, D-31, D-32, D-39)
//  are all OPTIONAL so pre-27.4 callers that instantiate LLMPipelineProgress
//  with only the v1 fields remain type-compatible."
```

**Phase 33 D-13 mirror (additive, no breaking changes):**

```typescript
// Locate the LLMRunSummary interface (search "LLMRunSummary" — same file).
// Add the optional field alongside existing evalScore:

export interface LLMRunSummary {
  // ... existing fields ...
  evalScore?: EvalScore;
  /** D-13 mirror — actor-match rate (0..1) from the latest runEval(). */
  actorMatchRate?: number; // ← NEW; optional for forward-compat
}
```

---

### Layer 6: Operator Status + Dashboard

---

### `server/routes/operator-status.ts` — D-16 `actorQuality` block (MODIFIED)

**Analog (self):** `server/routes/operator-status.ts:282-316` (existing Phase 32 `prune` block — same shape: lazy compute, no new Redis sidecar, sample cap = LIMIT_DRILL_DOWN)

**Current `prune` block construction (confirmed at lines 307-316):**

```typescript
// Lines 307-316 — exact template for D-16 actorQuality block:
let deadUrlCount = 0;
try {
  const raw = await redis.get<number | string>(URL_LIVENESS_COUNT_KEY);
  deadUrlCount = Math.max(0, Number(raw) || 0);
} catch (err) {
  log.warn({ err }, 'failed to read events:url-liveness-count');
}
const last24hPrunes = last24h.filter((e) => e.operation === 'prune-dead-urls').length;
const deadUrlSample = await buildDeadUrlSample();
const prune = { deadUrlCount, last24hPrunes, deadUrlSample };

res.json({ audit24h, byBearer, advEval, prune });
```

**Phase 33 D-16 target (additive sibling block):**

```typescript
// Insert AFTER the existing prune block construction (after line 316)
// and BEFORE res.json(...) (line 318):

// === PHASE 33 D-16 — actorQuality block ===
// Lazy compute over events:llm:v3 (already-deserialized payload). No new
// Redis sidecar — matches Phase 32 D-13 smallest-blast-radius principle.
// Degrade-open: any failure logs a warn + omits the block; the dashboard
// renders zero/no-data gracefully.
import { cacheGetSafe } from '../cache/redis.js';
import { LLM_EVENTS_KEY_ACTIVE } from '../lib/llmExtractionPipeline.js';
import { classifyEventActors } from '../lib/actorClassifier.js';
import type { ConflictEventEntity } from '../types.js';

let actorQuality: {
  totalEvents: number;
  nullActors: number;
  rawCameoActors: number;
  ambiguousActors: number;
  lowConfidenceActors: number;
  sample: Array<{
    eventId: string;
    actors: string[];
    actorConfidence: ('high' | 'medium' | 'low')[];
    issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
  }>;
} | null = null;

try {
  // Reuse the SAME cache read as prune sample SCAN — but actorQuality reads
  // the whole v3 array (one GET, not a SCAN).
  const cached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 999_999_999);
  const entities = cached?.data ?? [];

  // CAMEO codebook for bucket-b — load from the committed phase artifact,
  // OR (if bundling .planning/ into the server build is forbidden) use a
  // hardcoded subset of well-known actor codes here. Researcher's call;
  // recommend hardcoded subset for server-side simplicity.
  const cameoCodebook = new Set(['ISRMIL', 'IRNMIL', 'USMIL' /* ... */]);

  let nullActors = 0,
    rawCameoActors = 0,
    ambiguousActors = 0,
    lowConfidenceActors = 0;
  const sample: typeof actorQuality.sample = [];

  for (const entity of entities) {
    const actors = (entity.data as { actors?: string[] }).actors ?? [];
    const actorConfidence =
      (entity.data as { actorConfidence?: ('high' | 'medium' | 'low')[] }).actorConfidence ??
      actors.map(() => 'low' as const);
    const issues = classifyEventActors(actors, cameoCodebook);
    let firstIssue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence' | null = null;
    if (issues.includes('null')) {
      nullActors++;
      firstIssue = 'null';
    }
    if (issues.includes('raw-cameo')) {
      rawCameoActors++;
      firstIssue = firstIssue ?? 'raw-cameo';
    }
    if (issues.includes('ambiguous')) {
      ambiguousActors++;
      firstIssue = firstIssue ?? 'ambiguous';
    }
    if (actorConfidence.includes('low')) {
      lowConfidenceActors++;
      firstIssue = firstIssue ?? 'low-confidence';
    }
    if (firstIssue && sample.length < LIMIT_DRILL_DOWN) {
      sample.push({ eventId: entity.id, actors, actorConfidence, issue: firstIssue });
    }
  }
  actorQuality = {
    totalEvents: entities.length,
    nullActors,
    rawCameoActors,
    ambiguousActors,
    lowConfidenceActors,
    sample,
  };
} catch (err) {
  log.warn({ err }, 'failed to compute actorQuality block');
}

// Extend response (line 318):
res.json({ audit24h, byBearer, advEval, prune, actorQuality });
```

**Pattern dimensions to clone (Phase 32 prune block):**

- `try { ... } catch (err) { log.warn(...) }` per-block isolation (lines 308-313)
- `Math.max(0, Number(raw) || 0)` defensive coercion (line 310)
- Sample cap = `LIMIT_DRILL_DOWN` (= 20, line 50)
- Block added to `res.json({...})` as a NEW sibling key (line 318)
- Degrade-open: failed block returns `null`, route stays 200

**Pattern dimensions to DIVERGE:**

- ONE `cacheGetSafe` call (over the full `events:llm:v3` array) — NOT a SCAN loop (Phase 32's prune sample uses SCAN over `events:url-liveness:*` keys)
- Uses `classifyEventActors` from the new shared helper (Pitfall §1)
- Counts FOUR buckets (null, raw-cameo, ambiguous, low-confidence) — prune block only counts ONE (terminal-dead)

---

### `src/components/ui/DevApiStatus.tsx` — D-17 actor-quality sub-block (MODIFIED)

**Analog (self):** `src/components/ui/DevApiStatus.tsx:1603-1654` (Phase 32 prune sub-block — exact UI-spec analog)

**Mount point (per UI-SPEC §"DOM Mount Point"):**

> "Mounts AFTER the Phase 32 prune block's closing `</>` fragment at line 1654, BEFORE the `pruneQuotaAlert` conditional at line 1658, INSIDE the same `<section data-testid="operator-actions">` at line 1532."

**Current Phase 32 prune sub-block (confirmed at lines 1612-1654):**

```tsx
{
  opStatus?.prune != null && (
    <>
      <div className="mt-1 text-text-muted" data-testid="dead-url-count">
        Dead URL events: {opStatus.prune.deadUrlCount}
      </div>
      {opStatus.prune.deadUrlSample.length > 0 && (
        <ul
          className="mt-1 max-h-40 overflow-y-auto text-[10px] text-text-muted/80"
          data-testid="dead-url-list"
        >
          {opStatus.prune.deadUrlSample.map((entry) => (
            <li key={entry.eventId} className="flex items-baseline gap-2 py-0.5">
              <span className="font-mono text-text-muted/60">{entry.status}</span>
              <span className="truncate font-mono text-text-muted/40">{entry.eventId}</span>
              <span className="truncate text-text-muted/70" title={entry.url}>
                {entry.url}
              </span>
            </li>
          ))}
          {opStatus.prune.deadUrlCount > opStatus.prune.deadUrlSample.length && (
            <li className="py-0.5 italic text-text-muted/40" data-testid="dead-url-list-truncated">
              … and {opStatus.prune.deadUrlCount - opStatus.prune.deadUrlSample.length} more
            </li>
          )}
        </ul>
      )}
      {/* Phase 33: NO button — actor-quality is read-only counters + drill-down */}
    </>
  );
}
```

**Phase 33 D-17 target (mirror prune-block shape, omit button, add empty state):**

```tsx
{
  /* Phase 33 D-17 — Actor Quality sub-block. Read-only counters + drill-down.
    Mount point: between line 1654 (prune block close) and line 1658
    (pruneQuotaAlert). Render gate: opStatus?.actorQuality != null silently
    skips when pre-Phase-33 server deploys don't carry the field. */
}
{
  opStatus?.actorQuality != null && opStatus.actorQuality.totalEvents > 0 && (
    <>
      <div
        className="mt-1 text-text-muted"
        data-testid="actor-quality-row"
        aria-label={`Actor quality counters: ${opStatus.actorQuality.nullActors} null actors, ${opStatus.actorQuality.rawCameoActors} raw CAMEO codes, ${opStatus.actorQuality.ambiguousActors} ambiguous strings, ${opStatus.actorQuality.lowConfidenceActors} low confidence`}
      >
        Actor quality: Null: {opStatus.actorQuality.nullActors} · Raw-CAMEO:{' '}
        {opStatus.actorQuality.rawCameoActors} · Ambiguous: {opStatus.actorQuality.ambiguousActors}{' '}
        · Low-confidence: {opStatus.actorQuality.lowConfidenceActors}
      </div>
      {opStatus.actorQuality.sample.length > 0 && (
        <ul
          className="mt-1 max-h-40 overflow-y-auto text-[10px] text-text-muted/80"
          data-testid="actor-quality-list"
          aria-label="Actor quality drill-down sample (up to 20 events)"
        >
          {opStatus.actorQuality.sample.map((entry) => {
            const issueColor =
              entry.issue === 'null'
                ? 'text-text-muted/60'
                : entry.issue === 'raw-cameo' || entry.issue === 'ambiguous'
                  ? 'text-[color:var(--color-faction-disputed)]'
                  : 'text-[color:var(--color-event-other)]'; // 'low-confidence'
            return (
              <li
                key={entry.eventId}
                className="flex items-baseline gap-2 py-0.5"
                data-testid={`actor-quality-row-${entry.eventId}`}
              >
                <span className={`font-mono ${issueColor}`}>{entry.issue}</span>
                <span className="truncate font-mono text-text-muted/40">{entry.eventId}</span>
                <span className="truncate text-text-muted/70">{entry.actors.join(', ')}</span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
{
  opStatus?.actorQuality != null && opStatus.actorQuality.totalEvents === 0 && (
    <div className="mt-1 text-text-muted italic" data-testid="actor-quality-empty">
      Actor quality: no data
    </div>
  );
}
```

**OperatorStatus interface extension (`DevApiStatus.tsx:895-914` — confirmed shape, add actorQuality field):**

```typescript
interface OperatorStatus {
  // ... existing fields ...
  prune?: { deadUrlCount: number; last24hPrunes: number; deadUrlSample: [...] } | null;
  // === PHASE 33 D-17 — add: ===
  actorQuality?: {
    totalEvents: number;
    nullActors: number;
    rawCameoActors: number;
    ambiguousActors: number;
    lowConfidenceActors: number;
    sample: Array<{
      eventId: string;
      actors: string[];
      actorConfidence: ('high' | 'medium' | 'low')[];
      issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
    }>;
  } | null;
}
```

**Pattern dimensions to clone (Phase 32 prune sub-block):**

- `{opStatus?.actorQuality != null && (...)}` render gate (matches `opStatus?.prune != null` at line 1612)
- `<div className="mt-1 text-text-muted" data-testid="...">` count row shape (line 1614)
- `<ul className="mt-1 max-h-40 overflow-y-auto text-[10px] text-text-muted/80" data-testid="...">` drill-down list shape (lines 1618-1620)
- Per-row `<li>` with `flex items-baseline gap-2 py-0.5` (line 1623)
- `font-mono text-text-muted/60` for badge cell (line 1624)
- `data-testid="actor-quality-row-{eventId}"` per-row naming (mirrors prune `dead-url-list` row naming at line 1622)

**Pattern dimensions to DIVERGE:**

- NO button (Phase 33 has no destructive operator action — UI-SPEC §"Copywriting" confirms)
- Issue-badge color is dynamic (3 CSS vars per UI-SPEC §"Color"); prune-block badge is monochrome
- Empty state `<div data-testid="actor-quality-empty">` when `totalEvents === 0` (prune block has no equivalent — its absence-of-data shows `Dead URL events: 0`)
- `aria-label` on count row (UI-SPEC §"Accessibility contract")

---

### Layer 7: Eval Fixtures

---

### `.planning/eval/ground-truth-events.json` — D-14 backfill (MODIFIED)

**Analog (self):** existing file (`.planning/eval/ground-truth-events.json:1-50` — version 1, 50 events)

**Phase 33 additive change (per-event, optional):**

```json
{
  "id": "gt-001",
  "description": "US-Israeli airstrike on Natanz...",
  "sourceUrl": "...",
  "truth": { ... },
  "hierarchy": { ... },
  "expectedActor1": "United States Military",
  "expectedActor2": "Israeli Defense Forces"
}
```

**Constraints (per D-14):**

- `expectedActor1: string | null`, `expectedActor2: string | null` (both optional fields per event)
- Target ≥30 of 50 events backfilled at phase close
- Stays at `version: 1` (additive-optional, no breaking change)
- Update `curationNotes` (lines 5-12) with a new bullet documenting the Phase 33 backfill provenance

---

### `.planning/eval/adversarial-injections.json` — D-15 append (MODIFIED)

**Analog (self):** existing file (10 entries `adv-001` ... `adv-010`)

**Phase 33 append pattern (3 new entries, total = 13; Open Q §5 — cap soft-bumped, document in 33-SUMMARY.md):**

```json
{
  "id": "adv-011",
  "category": "actor-confusion-side-swap",
  "expected_resistance": "block",
  "injection_text": "...prompt designed so the attacker is named after the victim...",
  "context_summary": "Headline phrased so actor1 ↔ actor2",
  "hierarchy": { ... }
},
{
  "id": "adv-012",
  "category": "actor-confusion-ambiguity",
  "expected_resistance": "block",
  "injection_text": "...source mentions only 'the forces' or 'the troops'...",
  "context_summary": "expect actorConfidence='low' for any extracted entry",
  "hierarchy": { ... }
},
{
  "id": "adv-013",
  "category": "actor-confusion-code-as-actor",
  "expected_resistance": "block",
  "injection_text": "...source carries raw CAMEO 'USMIL' / 'IRNMIL' in actor field...",
  "context_summary": "expect post-mapping to expand to canonical",
  "hierarchy": { ... }
}
```

**Pattern dimensions to clone (self):**

- Entry shape: `{id, category, expected_resistance, injection_text, context_summary, hierarchy}` (confirmed lines 6-19)
- `category` is a free-form string (`runAdversarialEval` reads it into `Record<string, ...>` — no hardcoded enum to break, per RESEARCH T-33-03)
- `hierarchy` follows `locationHierarchyV2` shape (same as ground-truth)

---

### Layer 8: Test Files (NEW)

---

### `server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts` (NEW)

**Analog:** `server/__tests__/lib/freeClaudeRouter.test.ts` (vi.hoisted + dynamic import after mock registration)

**Test cases (RESEARCH §Validation Architecture Wave 2):**

```typescript
// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the catalog so tests don't depend on the live ACTOR_CATALOG seed:
vi.mock('../../data/actor-catalog.js', () => ({
  canonicalize: (name: string) => {
    const map: Record<string, { canonicalName: string }> = {
      idf: { canonicalName: 'Israeli Defense Forces' },
      irgc: { canonicalName: 'Islamic Revolutionary Guard Corps' },
    };
    return map[name.trim().toLowerCase()] ?? null;
  },
}));

// Dynamic import AFTER mocks register (freeClaudeRouter.test.ts:49 pattern)
const { applyCatalogToEvents, repairActorConfidence } = await import(
  '../../lib/llmEventExtractor.v3.js' // assumes helpers are exported for test
);

describe('applyCatalogToEvents (D-08)', () => {
  it('replaces matched aliases with canonical names', () => {
    const input = [{ actors: ['IDF', 'irgc'] /* ... */ }];
    const output = applyCatalogToEvents(input as never);
    expect(output[0].actors).toEqual([
      'Israeli Defense Forces',
      'Islamic Revolutionary Guard Corps',
    ]);
  });
  it('passes unmatched actors through unchanged', () => {
    const input = [{ actors: ['UnknownGroup'] /* ... */ }];
    const output = applyCatalogToEvents(input as never);
    expect(output[0].actors).toEqual(['UnknownGroup']);
  });
});

describe('repairActorConfidence (D-10)', () => {
  it('fills missing actorConfidence with low defaults', () => {
    const event = { actors: ['A', 'B'], actorConfidence: undefined };
    const output = repairActorConfidence(event as never);
    expect(output.actorConfidence).toEqual(['low', 'low']);
  });
  it('repairs length mismatch', () => {
    const event = { actors: ['A', 'B'], actorConfidence: ['high'] };
    const output = repairActorConfidence(event as never);
    expect(output.actorConfidence).toEqual(['low', 'low']);
  });
  it('passes through valid length-matched arrays', () => {
    const event = { actors: ['A', 'B'], actorConfidence: ['high', 'medium'] };
    const output = repairActorConfidence(event as never);
    expect(output.actorConfidence).toEqual(['high', 'medium']);
  });
});
```

**Pattern dimensions to clone from `freeClaudeRouter.test.ts:1-57`:**

- `// @vitest-environment node` line 1
- `vi.mock(...)` hoisted BEFORE dynamic `import`
- `const { ... } = await import('...')` — dynamic import to ensure mocks apply
- `vi.hoisted` for mock state shared across tests if needed

---

### `server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts` (NEW — snapshot/substring test)

**Analog:** `server/__tests__/lib/llmSchema.test.ts:62-80` (constant-shape assertion against an export)

**Test pattern:**

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { SYSTEM_PROMPT_V3 } from '../../lib/llmEventExtractor.v3.js';

describe('SYSTEM_PROMPT_V3 (D-09)', () => {
  it('contains the canonical-full-names hint for actors', () => {
    expect(SYSTEM_PROMPT_V3).toContain('canonical full names');
    expect(SYSTEM_PROMPT_V3).toContain('Server-side mapping handles known variants');
  });
  it('contains the actorConfidence instruction', () => {
    expect(SYSTEM_PROMPT_V3).toContain('actorConfidence');
    expect(SYSTEM_PROMPT_V3).toMatch(/"high"\s*\|\s*"medium"\s*\|\s*"low"/);
  });
});
```

---

### `server/__tests__/lib/llmEvalHarness.groundTruthSchema.test.ts` (NEW)

**Analog:** `server/__tests__/lib/llmEvalHarness.adversarial.test.ts:77-90` (real on-disk JSON read pattern)

**Test pattern (mirror adversarial fixture-shape verification):**

```typescript
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

describe('ground-truth-events.json D-14 expectedActor backfill', () => {
  const path = resolve(__dirname, '../../../.planning/eval/ground-truth-events.json');
  const raw = readFileSync(path, 'utf-8');
  const file = JSON.parse(raw) as {
    events: Array<{ id: string; expectedActor1?: string | null; expectedActor2?: string | null }>;
  };

  it('has ≥30 of 50 events with non-null expectedActor1 (D-14 target)', () => {
    const backfilled = file.events.filter((e) => typeof e.expectedActor1 === 'string').length;
    expect(backfilled).toBeGreaterThanOrEqual(30);
  });
  it('expectedActor1/2 are string|null|undefined (additive-optional)', () => {
    for (const e of file.events) {
      if ('expectedActor1' in e) {
        expect(typeof e.expectedActor1 === 'string' || e.expectedActor1 === null).toBe(true);
      }
      if ('expectedActor2' in e) {
        expect(typeof e.expectedActor2 === 'string' || e.expectedActor2 === null).toBe(true);
      }
    }
  });
});
```

**Pattern dimensions to clone (`adversarial.test.ts:77-90`):**

- `readFileSync(resolve(__dirname, '../../../.planning/...'), 'utf-8')` cross-tree fixture read
- `JSON.parse(...)` typed-cast assertion
- `expect(...).toBeGreaterThanOrEqual(N)` for fixture-count gates

---

### `src/__tests__/components/DevApiStatus.actorQuality.test.tsx` (NEW)

**Analog:** `src/__tests__/components/DevApiStatus.prune.test.tsx:1-100` (full Phase 32 jsdom matrix — confirmed structure)

**Pattern dimensions to clone (verbatim):**

- `// @vitest-environment jsdom` line 1
- `import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'`
- `useLLMStatusPolling` mock with `let mockLLMStatus: LLMStatus = { stage: 'idle', lastRun: null }`
- `resetAllStores()` helper (mirrors DevApiStatus.prune.test.tsx:53-100)
- `useUIStore.setState({ isDevApiStatusOpen: true, activeDevApiStatusTab: 'apiHealth' })` to open the modal + select tab
- `vi.stubGlobal('fetch', mockFetch)` + URL-routing mockFetch implementation

**Test cases (RESEARCH §Validation Architecture Wave 3 + UI-SPEC §"Test IDs"):**

```typescript
// 1. actor-quality-row renders with all four counters
// 2. actor-quality-list renders ≤20 sample entries
// 3. actor-quality-row-{eventId} present per sample
// 4. issue-badge color class matches UI-SPEC mapping (null → text-muted, raw-cameo/ambiguous → faction-disputed, low-confidence → event-other)
// 5. actor-quality-empty renders when totalEvents === 0 AND actorQuality present
// 6. Sub-block silently absent when opStatus.actorQuality is null/undefined (pre-Phase-33 server)
// 7. aria-label on count row contains all four count words
// 8. drill-down list ≤ LIMIT_DRILL_DOWN cap (20) — render 30 fake entries, assert ≤20 rendered
```

**fetch mock seed pattern (mirror `DevApiStatus.prune.test.tsx`):**

```typescript
beforeEach(() => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({
      audit24h: 1,
      byBearer: [],
      advEval: null,
      prune: null,
      actorQuality: {
        totalEvents: 100,
        nullActors: 5,
        rawCameoActors: 2,
        ambiguousActors: 3,
        lowConfidenceActors: 10,
        sample: [
          { eventId: 'evt-1', actors: [''], actorConfidence: ['low'], issue: 'null' },
          { eventId: 'evt-2', actors: ['USMIL'], actorConfidence: ['low'], issue: 'raw-cameo' },
          // ...
        ],
      },
    }),
  });
});
```

---

### `server/routes/__tests__/operator-status.test.ts` — extend for D-16 (MODIFIED)

**Analog (self):** `server/routes/__tests__/operator-status.test.ts:1-100` (existing supertest pattern)

**Existing mock pattern (`operator-status.test.ts:24-35` — confirmed):**

```typescript
const mockRedis = {
  smembers: vi.fn(),
  get: vi.fn(),
  scan: vi.fn(),
};
const mockCacheGetSafe = vi.fn();
vi.mock('../../cache/redis.js', () => ({
  redis: mockRedis,
  cacheGetSafe: mockCacheGetSafe,
}));

const { operatorStatusRouter } = await import('../operator-status.js');
```

**Phase 33 extension tests (RESEARCH §Validation Architecture Wave 3 ACTOR-05 rows):**

```typescript
// Add new describe block:
describe('/api/operator-status — Phase 33 actorQuality block (D-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development'; // bypass auth
  });

  it('returns actorQuality block with computed counts', async () => {
    mockRedis.smembers.mockResolvedValue([]);
    mockRedis.get.mockResolvedValue(null);
    mockRedis.scan.mockResolvedValue([0, []]);
    mockCacheGetSafe.mockResolvedValue({
      data: [
        { id: 'evt-1', data: { actors: [], actorConfidence: [] }, label: '...' },
        { id: 'evt-2', data: { actors: ['USMIL'], actorConfidence: ['low'] }, label: '...' },
      ],
    });
    const res = await request(makeApp()).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.actorQuality).toBeDefined();
    expect(res.body.actorQuality.totalEvents).toBe(2);
    expect(res.body.actorQuality.nullActors).toBe(1);
  });

  it('sample cap = 20 (LIMIT_DRILL_DOWN)', async () => {
    const entities = Array.from({ length: 30 }, (_, i) => ({
      id: `evt-${i}`,
      data: { actors: [], actorConfidence: [] },
      label: '...',
    }));
    mockCacheGetSafe.mockResolvedValue({ data: entities });
    // ... assertion: res.body.actorQuality.sample.length === 20
  });

  it('degrade-open: cacheGetSafe throws → actorQuality === null, route 200', async () => {
    mockCacheGetSafe.mockRejectedValue(new Error('redis down'));
    const res = await request(makeApp()).get('/api/operator-status');
    expect(res.status).toBe(200);
    expect(res.body.actorQuality).toBeNull();
  });
});
```

---

### `server/__tests__/lib/llmSchema.test.ts` — extend (MODIFIED)

**Analog (self):** `server/__tests__/lib/llmSchema.test.ts:1-80` (existing schema-acceptance pattern)

**Phase 33 D-10 + D-12 additions:**

```typescript
describe('enrichedEventV3 actorConfidence (D-10)', () => {
  it('accepts payload with actorConfidence array', () => {
    const payload = { ...validV3Payload(), actorConfidence: ['high', 'medium'] };
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true);
  });
  it('accepts payload WITHOUT actorConfidence (optional rollout window)', () => {
    const payload = validV3Payload(); // no actorConfidence
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(true); // optional preserved
  });
  it('rejects invalid enum values', () => {
    const payload = { ...validV3Payload(), actorConfidence: ['certain'] };
    const result = enrichedEventV3.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe('EVENT_EXTRACTION_SCHEMA_V3 (D-12)', () => {
  it('actorConfidence is in properties and required arrays', () => {
    const properties = (EVENT_EXTRACTION_SCHEMA_V3.properties as any).events.items.properties;
    expect(properties.actorConfidence).toBeDefined();
    expect(properties.actorConfidence.items.enum).toEqual(['high', 'medium', 'low']);
    const required = (EVENT_EXTRACTION_SCHEMA_V3.properties as any).events.items.required;
    expect(required).toContain('actorConfidence');
  });
});
```

---

### `server/__tests__/lib/llmEvalHarness.test.ts` — extend D-13 (MODIFIED)

**Analog (self):** existing harness tests with mocked `cacheGetSafe`

**Phase 33 D-13 additions:**

```typescript
describe('runEval — actorMatchRate (D-13)', () => {
  it('returns actorMatchRate as 0..1 ratio over expectedActor1 matches', async () => {
    // Mock cacheGetSafe to return synthetic events:llm:v3 with known actor values
    const cacheGetSafe = vi.mocked(await import('../../cache/redis.js')).cacheGetSafe;
    cacheGetSafe.mockResolvedValue({
      data: [
        { id: 'llm-v3-x', data: { actors: ['United States Military'] }, label: 'Natanz, Iran' },
      ],
      fetchedAt: Date.now(),
    } as never);
    // Seed ground-truth with gt-001 having expectedActor1='United States Military'
    // ... mock loadGroundTruth / __resetGroundTruthCacheForTests ...
    const score = await runEval();
    expect(score.actorMatchRate).toBeGreaterThan(0);
  });

  it('case-insensitive substring AND-match honors expectedActor2 when non-null', async () => {
    // assertions on AND-match behavior
  });

  it('returns 0 when no ground-truth events have expectedActor1', async () => {
    // assertions on empty-expectations behavior
  });
});
```

---

### `server/__tests__/lib/llmEvalHarness.adversarial.test.ts` — extend D-15 (MODIFIED)

**Analog (self):** existing 7-test matrix at file head

**Phase 33 D-15 additions:**

```typescript
describe('Phase 33 adversarial — actor-confusion injections', () => {
  it.each([
    ['adv-011', 'actor-confusion-side-swap'],
    ['adv-012', 'actor-confusion-ambiguity'],
    ['adv-013', 'actor-confusion-code-as-actor'],
  ])('%s parses and is scoreable by runAdversarialEval()', (id, category) => {
    const path = resolve(__dirname, '../../../.planning/eval/adversarial-injections.json');
    const raw = readFileSync(path, 'utf-8');
    const file = JSON.parse(raw) as { entries: Array<{ id: string; category: string }> };
    const entry = file.entries.find((e) => e.id === id);
    expect(entry).toBeDefined();
    expect(entry!.category).toBe(category);
  });
});
```

---

## Shared Patterns

### Logger Child Pattern (cross-cutting — all NEW server modules)

**Source:** `server/lib/operatorAudit.ts:31` / `server/routes/operator-status.ts:35`

**Apply to:** `server/lib/actorClassifier.ts` — NO logger (pure-fn module); see ethnicGroups precedent. All other consumers (extractor, eval harness, route) already use `logger.child({ module: ... })`.

```typescript
// Already present in consumers — no change:
const log = logger.child({ module: 'operator-status' }); // operator-status.ts:35
```

### `cacheGetSafe` / `cacheSetSafe` Wrapper (cross-cutting — all Redis reads)

**Source:** `server/cache/redis.ts` exports

**Apply to:** `server/routes/operator-status.ts` (D-16 actorQuality block) and `server/lib/llmEvalHarness.ts` (D-13 actorMatchRate cache read)

```typescript
// Per CLAUDE.md §"Serverless Cache" — never call redis.get/set directly for
// CacheEntry<T> shapes. Use cacheGetSafe for the events:llm:v3 read in both
// new consumers. Direct redis.get is acceptable for scalar integer keys
// (e.g., URL_LIVENESS_COUNT_KEY at operator-status.ts:307-313).
import { cacheGetSafe } from '../cache/redis.js';
import { LLM_EVENTS_KEY_ACTIVE } from '../lib/llmExtractionPipeline.js';
const cached = await cacheGetSafe<ConflictEventEntity[]>(LLM_EVENTS_KEY_ACTIVE, 999_999_999);
```

### Static-Data Module Pattern (D-04 / D-05)

**Source:** `src/lib/factions.ts` + `src/lib/ethnicGroups.ts`

**Apply to:** `server/data/actor-catalog.ts`

- Typed enum / interface at file top
- `Record<K, V>` or `ReadonlyArray<T>` const literal
- Module-load `Map` build for O(1) lookup (this is NEW for actor-catalog — neither factions nor ethnicGroups builds a Map; they use direct Record indexing)
- Pure getter function with `?? null` fallback
- Named exports only — no default

### Cross-Field Refinement Strategy (D-10 Open Q §1)

**Source:** `server/lib/llmSchema.ts:164-170` JSDoc + `server/lib/llmEventExtractor.v3.ts:780-810` post-validate site

**Apply to:** `actorConfidence` length-locked invariant

- Zod schema declares `actorConfidence: z.array(z.enum([...])).optional()` (rollout window)
- The cross-field length-match invariant (`arr.length === actors.length`) is enforced in the extractor's `repairActorConfidence` helper, NOT in Zod `superRefine` (Zod can't cross-field-refine without the parent shape, which complicates the discriminated-union read path)
- Document this split in JSDoc on both `enrichedEventV3.actorConfidence` and the extractor helper

### Degrade-Open Aggregator Block (D-16)

**Source:** `server/routes/operator-status.ts:308-316` (Phase 32 prune block)

**Apply to:** D-16 actorQuality block — wrap in try/catch, log warn, omit field on failure; route stays 200.

```typescript
let actorQuality: ActorQualityShape | null = null;
try {
  // ... compute ...
  actorQuality = { ... };
} catch (err) {
  log.warn({ err }, 'failed to compute actorQuality block');
}
res.json({ audit24h, byBearer, advEval, prune, actorQuality });
```

### Test Mock Boilerplate (NEW server tests)

**Source:** `server/__tests__/lib/freeClaudeRouter.test.ts:1-57` (vi.hoisted + dynamic-import-after-mock)

**Apply to:** `llmEventExtractor.v3.canonicalize.test.ts`, `llmEvalHarness.test.ts` extension, `operator-status.test.ts` extension. Key boilerplate:

```typescript
// @vitest-environment node
vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn(),
  cacheSetSafe: vi.fn(async () => {}),
  redis: { get: vi.fn(), smembers: vi.fn(), scan: vi.fn() },
}));
// ... other mocks ...
const { runEval } = await import('../../lib/llmEvalHarness.js'); // dynamic import AFTER mocks
```

### React Component Test Mock Boilerplate (NEW jsdom tests)

**Source:** `src/__tests__/components/DevApiStatus.prune.test.tsx:1-100` (Phase 32 reference matrix)

**Apply to:** `DevApiStatus.actorQuality.test.tsx`. Key boilerplate:

- `// @vitest-environment jsdom` (or omit — default is jsdom per `vite.config.ts`)
- `import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'`
- `resetAllStores()` helper in `beforeEach` (12 store resets per the existing precedent)
- `useUIStore.setState({ isDevApiStatusOpen: true, activeDevApiStatusTab: 'apiHealth' })`
- `vi.stubGlobal('fetch', mockFetch)` for `/api/operator-status` polling

---

## No Analog Found

| File                                                                       | Role    | Data Flow | Reason                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `server/lib/actorClassifier.ts` — bucket-d (source-disagreement) detection | utility | N/A       | D-02 explicitly defers bucket-d to human spot-check. No analog needed; the shared classifier covers only buckets a/b/c. The audit report seeds bucket-d candidates from a/b/c overlap (D-03), which is novel to Phase 33 and has no existing precedent in the codebase. |

---

## Metadata

**Analog search scope:** `src/lib/`, `src/__tests__/lib/`, `server/data/` (currently empty — new directory), `server/lib/`, `server/routes/`, `server/routes/__tests__/`, `server/adapters/gdelt.ts`, `server/__tests__/lib/`, `server/__tests__/routes/`, `src/components/ui/DevApiStatus.tsx`, `src/__tests__/components/`, `scripts/`, `.planning/eval/`, `.planning/phases/32-*/`

**Files scanned:** 27 source files, 12 test files, 4 fixture/script files, 1 UI-SPEC, 1 prior PATTERNS.md (Phase 32)

**Pattern extraction date:** 2026-05-21

**Primary risks for planner:**

1. **D-10 `.optional()` rollout-window decision (Open Q §1)** — Researcher recommends optional during rollout to admit legacy v3 cache reads. The planner must NOT ship as required-without-optional or `enrichedEventAny` will reject every pre-Phase-33 v3 entry on cache read.

2. **Open Q §4 — ground-truth `id` vs live `groupKey` join** — Researcher recommends approximate match by `landmark + country` substring (path c). This pattern is reflected in the D-13 code excerpt above. If planner picks path (a) or (b) instead, the helper code structure in `llmEvalHarness.ts` differs but the surrounding test/fixture patterns are unchanged.

3. **Pitfall §1 (shared classifier)** — The shared `server/lib/actorClassifier.ts` module must ship BEFORE both consumers (audit script AND operator-status) so they import a single source of truth for the D-02 bucket rules. RESEARCH places this in Wave 1 alongside D-02; the planner should preserve that ordering.

4. **D-12 un-aliasing of `EVENT_EXTRACTION_SCHEMA_V3`** — Currently aliased to V2 at `llmSchema.ts:359`. Un-aliasing introduces a divergence point. JSDoc comment is REQUIRED so future v2 edits don't silently fail to propagate to v3.

5. **CAMEO codebook bundling for server route** — D-16's actorQuality block needs the CAMEO codebook at runtime. The committed JSON at `.planning/phases/33-*/cameo-codes.json` is NOT automatically bundled into the Vercel server build. Options: (i) hardcode a small subset of well-known codes inline in `operator-status.ts`, (ii) move the codebook to `server/data/cameo-codes.json`, (iii) generate a TS module at build time. Recommended: (i) inline subset — smallest blast radius, the audit script remains the canonical full-codebook consumer.
