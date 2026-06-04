# Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup Sweep — Research

**Researched:** 2026-05-26
**Domain:** Internal documentation hygiene + Redis-key registry parity + observability-key cleanup + bundle-size measurement
**Confidence:** HIGH (load-bearing claims grounded in exhaustive codebase grep; only minor speculative items flagged inline)

## Summary

Phase 35 closes the v1.5 documentation-and-cleanup track. It is a **read-mostly cleanup phase** with one mechanical drift gate (D-01 vitest) as the load-bearing primitive and one well-bounded code deletion (D-12 partial-key retirement). Every other deliverable is documentation authoring (CLAUDE.md edits, `docs/architecture/redis-keys.md`, ADR sub-block, freeClaudeRouter callers block, ~30-50 JSDoc one-liners). Risk surface is small; the failure mode for each artifact is wrong-but-non-load-bearing text.

The hand-maintained CLAUDE.md §Serverless Cache registry has drifted in expected ways during Phases 27-34: four keys are present in code but missing from the registry (`events:llm:v3:lineage:{eventId}`, `events:llm:v3:lineage-keys`, `events:llm:v3:group-lineage:{hash}`, `events:llm-pipeline-audit`); one key is in the registry but slated for retirement this phase (`events:llm:v3:partial`); the `markets:yahoo` registry entry under-describes its four actual concrete keys (`markets:yahoo:1d|5d|1mo|ytd`); and the `news:gdelt` entry shares a registry slot with `news:feed` but the two have different writers and TTL classes. The grep audit in this RESEARCH.md is the authoritative input for the deep-dive table at `docs/architecture/redis-keys.md` (D-05 / D-06).

**Primary recommendation:** Ship D-01 first — `src/__tests__/lib/redis-registry.test.ts` mirrors `colorBridge.test.ts`'s byte-identity-sentinel pattern + `urlLiveness.schema.test.ts`'s parse-and-assert pattern. It is the only deliverable that prevents this drift from recurring after Phase 36/37 close. Everything else is one-shot cleanup that the gate keeps honest going forward.

## Architectural Responsibility Map

| Capability                                       | Primary Tier                                        | Secondary Tier                                       | Rationale                                                                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drift-gate vitest (D-01)                         | Test harness (jsdom default)                        | Node fs (markdown + code read)                       | Mirrors `colorBridge.test.ts` location at `src/__tests__/lib/` so the existing `vitest run` picks it up without config change. jsdom default works — the test does no DOM work, only fs reads + regex parse. |
| Redis-key registry artifact (D-05)               | `docs/architecture/`                                | Markdown                                             | Same tier as `llm-pipeline-reliability.md` / `data-flows.md`; plain markdown + tables, no generator script (D-21 deferred).                                                                                  |
| CLAUDE.md §Serverless Cache edits (D-14, D-23)   | Repo root documentation                             | —                                                    | Surgical edits only; bounded subsection. Phase 29's DOCS-INT-01 trim discipline preserved.                                                                                                                   |
| Partial-key retirement (D-12)                    | `server/lib/llmEventExtractor.v3.ts` writer + tests | `server/__tests__/` test-fixture and assertion lines | Single atomic commit; production code only. Scripts (`peek-v3-partial.ts`, `snapshot-v3-redis.ts`, `clear-llm-cache-dev.ts`) have script-tier disposition decisions (see Pitfall 1).                         |
| `freeClaudeRouter.ts` callers block (D-15, D-16) | `server/lib/freeClaudeRouter.ts` top-of-file        | —                                                    | Comment-only edit; prepended above existing vendored-from header.                                                                                                                                            |
| JSDoc audit (D-09, D-10)                         | 7 modules in `server/lib/`                          | —                                                    | Public-API one-liners only; existing top-of-file blocks left untouched.                                                                                                                                      |
| Bundle-size measurement (D-19)                   | Build output `api/vercel-entry.js`                  | —                                                    | `wc -c` of the tsup output; no instrumentation.                                                                                                                                                              |
| Upstash command-budget delta (D-20, D-21)        | Operator (manual dashboard)                         | `.planning/phases/35-*/` (PNG screenshots)           | Manual capture per CONTEXT D-20; no CLI alternative available (Upstash REST `INFO commandstats` not exposed).                                                                                                |

## Standard Stack

### Core

| Library                                 | Version         | Purpose                                         | Why Standard                                                                                                                                                                                                |
| --------------------------------------- | --------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vitest`                                | ~3.x (existing) | Drift-gate test framework                       | Already in use; `colorBridge.test.ts`, `actorCatalog.test.ts`, `urlLiveness.schema.test.ts` all under vitest. No new framework needed. [VERIFIED: codebase grep + `vite.config.ts:55-77`]                   |
| `node:fs` `readFileSync`                | builtin         | Read markdown surfaces + source files in vitest | Pattern already used in `actorCatalog.test.ts:34, 56` to load `.planning/eval/*.json` and at `actorCatalog.test.ts:176-177` to load `factions.ts` source for sentinel comparison. [VERIFIED: codebase grep] |
| `node:path` `resolve` + `fileURLToPath` | builtin         | `__dirname` shim for ESM tests                  | Same pattern as `actorCatalog.test.ts:35-49`. [VERIFIED: codebase grep]                                                                                                                                     |

### Supporting

| Library                | Version  | Purpose                                                     | When to Use                                                                                                     |
| ---------------------- | -------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `zod` (existing, ~3.x) | existing | NOT needed — D-01 uses string-parsing not schema validation | Available if a future TTL-string consistency check (D-deferred) ever lands. [VERIFIED: package.json `zod ^3.x`] |

### Alternatives Considered

| Instead of                               | Could Use                   | Tradeoff                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readFileSync` + regex over markdown     | `remark` + AST traversal    | Regex is brittle vs. AST; but markdown source is hand-curated in one file (CLAUDE.md + redis-keys.md), under 200 lines, and the regex pattern is tightly scoped to backticked-key strings (`` `events:*` ``). Adding `remark` (not currently a dep) inflates dep count for a single test. **Reject AST approach.** |
| Single-pass node script                  | `vitest` invocation         | A standalone script could enforce parity but wouldn't fail in CI alongside other tests. Vitest gates against the existing `npm test` invocation (D-04). **Vitest is the right home.**                                                                                                                              |
| Generated `redis-keys.md` from code grep | Hand-authored + vitest gate | Generators have higher correctness ceiling but ship deferred per CONTEXT (D-deferred). The hand-authored + gate pattern matches `actorCatalog.test.ts` (per-entry assertions over hand-authored `actor-catalog.ts`). **Hand-authored matches precedent.**                                                          |

**Installation:** None — all dependencies already present in `package.json`. [VERIFIED: package.json read]

**Version verification:**

```bash
node -e "console.log(require('./package.json').devDependencies.vitest)"  # confirms vitest ~3.x already pinned
```

_No new packages introduced by Phase 35._ This eliminates the standard package-legitimacy audit (slopcheck, registry verification) — there is nothing to install.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition                          |
| ------- | -------- | --- | --------- | ----------- | --------- | ------------------------------------ |
| (none)  | —        | —   | —         | —           | n/a       | Phase 35 ships zero new dependencies |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

_Phase 35 deliverables are pure code/doc edits + a vitest using only existing infrastructure. Skipping slopcheck is justified because the input list is empty._

## Architecture Patterns

### System Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       Phase 35 Drift-Gate Vitest (D-01)                      │
│                                                                              │
│   CLAUDE.md §Serverless Cache ──┐                                            │
│                                 │                                            │
│                                 ├─►  parse backticked keys  ──►  set A       │
│                                 │     (regex: `key:string`)                  │
│   docs/architecture/redis-keys.md ─┘                                         │
│                                                                              │
│                                                                              │
│   server/**/*.ts (excl. _archive)                                            │
│   server/__tests__/**/*.ts        ──►  grep for prefix families ──►  set B   │
│   src/**/*.{ts,tsx}                     ('events:*', 'flights:*', ...)       │
│                                                                              │
│                                                                              │
│   assert A == B (modulo EXEMPT_KEYS) ──►  pass / fail at vitest run          │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────────┐
│                Phase 35 Partial-Key Retirement (D-12)                        │
│                                                                              │
│   BEFORE                                                                     │
│   ──────                                                                     │
│   server/lib/llmEventExtractor.v3.ts                                         │
│     :122   const EVENTS_LLM_V3_PARTIAL_KEY = 'events:llm:v3:partial'         │
│     :123   export { EVENTS_LLM_V3_KEY, EVENTS_LLM_V3_PARTIAL_KEY }           │
│     :475   await cacheSetSafe(EVENTS_LLM_V3_PARTIAL_KEY, payload, ...)       │
│             ▲                                                                │
│             │ (writer; no production reader exists)                          │
│                                                                              │
│   AFTER                                                                      │
│   ─────                                                                      │
│   Constant deleted, export reduced to EVENTS_LLM_V3_KEY only, writer removed │
│   from writePartialCache (function deletable entirely or stub-and-deprecate) │
│   Tests updated to drop two-key-discipline assertions; terminal-key kept     │
│   Production cleanup: natural TTL expiry (LLM_REDIS_TTL_SEC = 9000s ≈ 2.5h)  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

```
src/__tests__/lib/
├── redis-registry.test.ts     # NEW — D-01 drift gate (this phase)
├── colorBridge.test.ts        # existing — byte-identity template
├── actorCatalog.test.ts       # existing — catalog-invariant template
└── urlLiveness.schema.test.ts # existing — schema-pinning template

docs/architecture/
├── llm-pipeline-reliability.md  # existing — style template
├── data-flows.md                # existing
├── deployment.md                # existing
├── frontend.md                  # existing
├── system-context.md            # existing
└── redis-keys.md                # NEW — D-05 deep-dive inventory (this phase)
```

### Pattern 1: D-01 Vitest — Three-Surface Parity Assertion

**What:** Single vitest that (a) parses CLAUDE.md §Serverless Cache + `docs/architecture/redis-keys.md` for backticked key literals, (b) greps the codebase for known prefix families, (c) asserts symmetric-difference is empty modulo `EXEMPT_KEYS`.

**When to use:** Once per phase. Runs at the existing `vitest run` invocation; no new CI step (D-04).

**Example (sketch):**

```typescript
// src/__tests__/lib/redis-registry.test.ts
// @vitest-environment node
//
// Phase 35 D-01 — Redis-key registry drift gate.
//
// Parses the two markdown surfaces (CLAUDE.md §Serverless Cache + docs/architecture/redis-keys.md)
// and the codebase for Redis-key string literals, asserts every documented key is referenced in
// code and every code-referenced key is documented in BOTH surfaces (D-03 both-surfaces parity).
//
// Mirrors:
//   - colorBridge.test.ts byte-identity sentinel pattern (parse two surfaces, assert parity)
//   - actorCatalog.test.ts catalog-invariant pattern (per-entry assertions + orphan check)
//   - urlLiveness.schema.test.ts schema-pinning pattern (literal contracts fail loud on drift)
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '../../..');

// D-02 — Keys that legitimately exist in code but lack a production
// writer/reader pair (e.g. retired-but-not-yet-deleted, exempt-by-rationale).
// Empty at Phase 35 close; structurally available for future justified
// exemptions. Each entry must carry a one-line rationale comment.
const EXEMPT_KEYS: ReadonlyArray<{ key: string; reason: string }> = [
  // example shape: { key: 'events:llm:v2', reason: 'fallbackKeys in health.ts:315 — legacy probe of a retired key, no writer.' },
];

// Source: Claude's Discretion in CONTEXT.md (D-Discretion-1) — regex on
// backticked key strings. Surfaces CLAUDE.md and redis-keys.md both render
// keys this way; regex matches both.
const BACKTICK_KEY_RE =
  /`((?:events|flights|ships|sites|water|news|markets|geocode|llm|cron|operator|audit):[a-zA-Z0-9:_\-{}\.]+)`/g;

// Prefix families to grep in code (Claude's Discretion D-Discretion-2 — production .ts and .tsx).
const KEY_PREFIX_FAMILIES = [
  'events:',
  'flights:',
  'ships:',
  'sites:',
  'water:',
  'news:',
  'markets:',
  'geocode:',
  'llm:',
  'cron:',
  'operator:',
  'audit:',
];

// Allow-list of doc files exempt from "undocumented key" failure (the two
// markdown surfaces themselves; everything else in docs/ is informational).
const DOC_ALLOW_LIST = new Set([
  resolve(REPO_ROOT, 'CLAUDE.md'),
  resolve(REPO_ROOT, 'docs/architecture/redis-keys.md'),
]);

function extractKeysFromMarkdown(path: string): Set<string> {
  const src = readFileSync(path, 'utf-8');
  // Limit to the §Serverless Cache section in CLAUDE.md by finding the
  // anchor heading and stopping at the next `^## `. redis-keys.md is read
  // wholesale.
  const restricted = path.endsWith('CLAUDE.md')
    ? (src.split('## Serverless Cache')[1]?.split('\n## ')[0] ?? '')
    : src;
  const keys = new Set<string>();
  for (const m of restricted.matchAll(BACKTICK_KEY_RE)) {
    // Strip placeholder template parts so `events:url-liveness:{eventId}`
    // collapses to `events:url-liveness:`. Sidesteps the parametric-vs-
    // literal-key matching problem at the registry level.
    keys.add(m[1].replace(/\{[^}]+\}/g, '').replace(/:$/, ''));
  }
  return keys;
}

function walkTsFiles(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.git') continue;
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) walkTsFiles(path, acc);
    else if (/\.(ts|tsx)$/.test(name)) acc.push(path);
  }
  return acc;
}

function extractKeysFromCode(): Map<string, Set<string>> {
  const keys = new Map<string, Set<string>>();
  const files = [
    ...walkTsFiles(resolve(REPO_ROOT, 'server')),
    ...walkTsFiles(resolve(REPO_ROOT, 'src')),
  ];
  // Match string literals like 'events:llm:v3' or `events:url-liveness:${id}` or "flights:opensky"
  // The template-literal form needs special handling — match the prefix portion only.
  const literalRe = new RegExp(
    `['"\`]((?:${KEY_PREFIX_FAMILIES.map((p) => p.replace(':', '\\\\:')).join('|')})[a-zA-Z0-9:_\\-]*)`,
    'g',
  );
  for (const path of files) {
    const src = readFileSync(path, 'utf-8');
    for (const m of src.matchAll(literalRe)) {
      const key = m[1];
      if (!keys.has(key)) keys.set(key, new Set());
      keys.get(key)!.add(path.replace(REPO_ROOT + '/', ''));
    }
  }
  return keys;
}

describe('Phase 35 D-01 — Redis-key registry drift gate', () => {
  const claudeKeys = extractKeysFromMarkdown(resolve(REPO_ROOT, 'CLAUDE.md'));
  const redisKeysDoc = extractKeysFromMarkdown(
    resolve(REPO_ROOT, 'docs/architecture/redis-keys.md'),
  );
  const codeKeys = extractKeysFromCode();

  it('every documented key in CLAUDE.md is also documented in redis-keys.md (D-03)', () => {
    for (const k of claudeKeys)
      expect(redisKeysDoc.has(k), `${k} in CLAUDE.md but not redis-keys.md`).toBe(true);
  });

  it('every documented key in redis-keys.md is also documented in CLAUDE.md (D-03)', () => {
    for (const k of redisKeysDoc)
      expect(claudeKeys.has(k), `${k} in redis-keys.md but not CLAUDE.md`).toBe(true);
  });

  it.each([...claudeKeys])('documented key %s has ≥1 reference in code', (key) => {
    const exempt = EXEMPT_KEYS.find((e) => e.key === key);
    if (exempt) return; // skipped with reason
    // Match the normalized (placeholder-stripped) doc key against any code key
    // that starts with it. e.g. doc key `events:url-liveness:` matches code keys
    // `events:url-liveness:abc123` and `events:url-liveness-count`.
    const found = [...codeKeys.keys()].some((codeKey) => codeKey.startsWith(key));
    expect(found, `${key} documented but no code reference found`).toBe(true);
  });

  it('every code key matches a documented key (no undocumented drift)', () => {
    const documented = new Set([...claudeKeys, ...redisKeysDoc]);
    for (const [codeKey, refs] of codeKeys) {
      const hit = [...documented].some((d) => codeKey.startsWith(d));
      const exempt = EXEMPT_KEYS.find((e) => codeKey.startsWith(e.key));
      if (!hit && !exempt) {
        expect.fail(
          `Code key ${codeKey} (refs: ${[...refs].slice(0, 3).join(', ')}) is not documented in CLAUDE.md §Serverless Cache nor docs/architecture/redis-keys.md`,
        );
      }
    }
  });
});
```

**Source:** Pattern verified against three in-tree templates:

- `src/__tests__/lib/colorBridge.test.ts` — `describe('byte-identity invariant')` + `it.each`
- `src/__tests__/lib/actorCatalog.test.ts:74-92` — orphan check via `it.each(allCodes)` + Set lookup
- `server/__tests__/lib/urlLiveness.schema.test.ts` — `@vitest-environment node` for fs-heavy tests

### Pattern 2: D-05 Inventory Table — Markdown + Cross-Reference

**What:** Hand-authored `docs/architecture/redis-keys.md` with one table per prefix family (events:_, flights:_, etc.) — columns Key | Writers (file:line) | Readers (file:line) | TTL | Value shape | Business purpose | Cardinality | Classification.

**When to use:** Authored once at phase start; vitest gate keeps subsequent edits honest.

**Example header (verified against `docs/architecture/llm-pipeline-reliability.md` line 1-9):**

```markdown
# Redis Key Registry (v1.5)

> Auditable inventory of every Redis key written or read by `otg-iran-monitor` in production. Pinned by `src/__tests__/lib/redis-registry.test.ts` — drift fails the next `vitest run`.

**Source of truth:** Code (line references below). This document is the operator skim; the test is the gate.
**Companion surface:** `CLAUDE.md` §"Serverless Cache (Phase 13)" — same key list, one-line-per-key shape, refreshed in lockstep.
**Phase 35 measurement window:** Upstash command budget {baseline %} → {close %} (see `redis-budget-baseline-YYYY-MM-DD.png` / `redis-budget-close-YYYY-MM-DD.png` in `.planning/phases/35-*/`).

---

## events:\*

| Key            | Writers                                 | Readers                                                                                     | TTL                        | Value                   | Purpose                                                    | Cardinality                  | Classification |
| -------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------- | ----------------------- | ---------------------------------------------------------- | ---------------------------- | -------------- |
| `events:gdelt` | `server/routes/events.ts:62` (cacheSet) | `server/lib/llmExtractionPipeline.ts:77` (read); `server/routes/events.ts` Pitfall 1 bridge | 15-min logical / 2.5h hard | `ConflictEventEntity[]` | Raw GDELT cache; Pitfall 1 terminal fallback when v3 empty | ~5000 (post-WAR_START prune) | load-bearing   |

...
```

### Pattern 3: D-09 JSDoc One-Liner

**What:** Each `export function` / `export const` / `export interface` in the 7 LLM-pipeline modules gets a single `/** ... */` line above its declaration that describes what it does TODAY (not what it was designed to do in some prior phase).

**When to use:** D-09 commit per module (7 commits per CONTEXT.md D-25.4 recommendation).

**Example (verified against `llmExtractionPipeline.ts:196-201`):**

```typescript
/**
 * Kick off a new LLM extraction run if the cooldown / cold-cache / busy /
 * configured / raw-events guards permit. The actual work runs as a
 * fire-and-forget IIFE; this function returns synchronously after the
 * dispatch decision is made.
 */
export async function runRefreshExtraction(opts: RunRefreshOpts): Promise<RunRefreshResult> {
```

Already-good — Phase 35 verifies, doesn't rewrite. Audit scope is the per-export _delta_ from the current state.

### Anti-Patterns to Avoid

- **Auto-generating `redis-keys.md`:** The D-deferred generator script is out of scope (CONTEXT.md Deferred Ideas). Hand-authored + vitest is the entire deliverable.
- **Rewriting top-of-file JSDoc blocks:** D-09 scope is one-liners only. The "Phase 27.4.3 D-03" historical citations in top-of-file blocks are valued waymarkers, not noise.
- **Env-gating retired keys instead of deleting:** D-12 says delete. Env-gating leaves dead-code-on-a-switch — worse than just removing.
- **Touching `events:llm:v3` writers:** Phase 35 ships zero new writers to the terminal cache (anti-pattern #17 from `docs/runbook.md`; ADR-0010 invariant).
- **Touching `parseEnv()`:** D-05 (delete-not-env-gate) means no new env vars in Phase 35.

## Don't Hand-Roll

| Problem                | Don't Build                          | Use Instead                             | Why                                                                                               |
| ---------------------- | ------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Markdown AST traversal | `remark` / `unified` dep             | Tightly-scoped regex on backticked keys | Single test file, ~200 line input, hand-curated source. AST adds 3+ deps for marginal robustness. |
| Code file discovery    | `glob` lib                           | `node:fs` `readdirSync` walk            | Existing tests use the same approach (no `glob` dep at runtime).                                  |
| Test framework         | New CLI runner                       | `vitest run`                            | Existing harness; D-04 explicitly leverages the default invocation.                               |
| Bundle-size script     | Custom wrapper                       | `wc -c api/vercel-entry.js`             | One-shot measurement. CONTEXT.md D-19 explicitly chooses `wc -c` over instrumentation.            |
| Upstash budget script  | `scripts/measure-redis-budget.ts`    | Manual dashboard PNG screenshots        | Upstash REST does not expose `INFO commandstats`. D-20 honest-measurement surface.                |
| Registry generator     | `scripts/generate-redis-registry.ts` | Hand-authored doc + vitest gate         | CONTEXT.md defers the generator; hand-authored + gate matches `actorCatalog.test.ts` precedent.   |

**Key insight:** Phase 35's deliverables are deliberately minimal-tooling. Every operation either uses existing infrastructure (vitest, `wc -c`) or is one-shot manual (PNG screenshots). Custom tooling is consciously deferred to future phases.

## Runtime State Inventory

> Phase 35 is a documentation-and-cleanup phase with **one** runtime-state touchpoint: the `events:llm:v3:partial` Redis key in production (D-12 retirement). All other deliverables are doc/code edits with no runtime state.

| Category                             | Items Found                                                                                                                                                   | Action Required                                                                                                                                                  |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stored data (Redis)                  | `events:llm:v3:partial` entries written by every cron tick prior to deploy                                                                                    | **Code edit only** (delete writer). Production cleanup: **natural TTL expiry** within `LLM_REDIS_TTL_SEC` = 9000s (≈ 2.5h) of deploy. No data migration. (D-13.) |
| Live service config                  | None — Phase 35 ships no Vercel env var changes, no Upstash config changes, no cron schedule changes                                                          | None                                                                                                                                                             |
| OS-registered state                  | None — no Windows Task Scheduler / launchd / systemd / pm2 registrations referenced by Phase 35                                                               | None                                                                                                                                                             |
| Secrets / env vars                   | None — no new env vars introduced (D-05 delete-not-env-gate); no existing env var deleted or renamed                                                          | None                                                                                                                                                             |
| Build artifacts / installed packages | `api/vercel-entry.js` rebuilt by `npm run build` at deploy time; size delta captured by D-19 `wc -c`. No package.json changes (no new deps; nothing removed). | Standard rebuild on commit/deploy; no manual artifact deletion                                                                                                   |

**Nothing found in categories 2-4:** State verified explicitly by grep + script audit. Phase 35 is the rare phase that **only** touches Redis state, and only one key.

## Common Pitfalls

### Pitfall 1: Script-tier readers of the retired partial key

**What goes wrong:** `scripts/peek-v3-partial.ts` exists _solely_ to read `events:llm:v3:partial`. `scripts/snapshot-v3-redis.ts` reads it as part of a multi-key snapshot. `scripts/clear-llm-cache-dev.ts` includes it in the delete list. If D-12 deletes only the production code path, these scripts dangle.

**Why it happens:** CONTEXT.md D-12 enumerates 6 production code lines + 4 test files but does not list the 3 `scripts/` files.

**How to avoid:**

- **`scripts/peek-v3-partial.ts`** — DELETE the file entirely (it's a one-purpose dev-pass scratch helper; partial-key retirement leaves it pointing at a key that will never repopulate). Source: `scripts/peek-v3-partial.ts:1-90` reads only this key.
- **`scripts/snapshot-v3-redis.ts:13, :53, :144, :157`** — REMOVE the partial-key entries from the schema + the parallel fetch + the output object. Snapshot still functions; partial-key slot disappears. Single-commit edit.
- **`scripts/clear-llm-cache-dev.ts:20`** — REMOVE the `'events:llm:v3:partial'` string from the delete list. Backward-compat: leave `'events:llm:v2:partial'` in place (already-dead key from Phase 29; the dev-clear script targeting it is harmless against an empty key).

**Warning signs:** Search for `events:llm:v3:partial` after the D-12 commit lands; only test references and historical comments should remain. If `scripts/peek-v3-partial.ts` still exists at phase close, the cleanup is incomplete.

### Pitfall 2: `EVENTS_LLM_V3_PARTIAL_KEY` export removal breaks tests that import it

**What goes wrong:** `server/lib/llmEventExtractor.v3.ts:123` exports `EVENTS_LLM_V3_PARTIAL_KEY`. Removing the export must be paired with removing every consumer's import statement.

**Why it happens:** TypeScript compiler errors will catch unused imports IF strictNullChecks/noUnusedLocals is set; otherwise silent dangling imports survive. (Project has TypeScript strict mode per CLAUDE.md.)

**How to avoid:** After deletion, `npm run typecheck` (or `tsc --noEmit`) must pass. The grep audit above shows ZERO production-side imports of `EVENTS_LLM_V3_PARTIAL_KEY` — only `llmEventExtractor.v3.ts:122` declares it and `:123` exports it and `:475` writes it. The `events:llm:v3:partial` **string literal** appears in tests + scripts + comments; those references are the D-12 cleanup target, not the constant export.

**Warning signs:** A test file with `import { EVENTS_LLM_V3_PARTIAL_KEY } from '...'` that doesn't compile after the writer is deleted. Verified: no test file currently imports the constant by name (all use the literal string).

### Pitfall 3: CLAUDE.md `markets:yahoo` entry under-describes the actual 4-key family

**What goes wrong:** CLAUDE.md:130 says `**markets:yahoo**`. The actual keys written are `markets:yahoo:1d`, `markets:yahoo:5d`, `markets:yahoo:1mo`, `markets:yahoo:ytd` (one per `range` query param). The D-01 vitest must handle this gracefully or it'll flag a false "documented key never referenced" failure.

**Why it happens:** Hand-maintained registries naturally drift toward shorthand.

**How to avoid:** D-01's key-matching strategy must be **prefix match** not exact match. The example test code above uses `codeKey.startsWith(key)` for this reason. CLAUDE.md edit (D-23): change `markets:yahoo` → `markets:yahoo:{range}` to mirror the actual schema.

**Warning signs:** D-01 vitest reports `markets:yahoo` as documented-but-undefined while `markets:yahoo:1d` is found in code. If you see this failure, fix CLAUDE.md not the test.

### Pitfall 4: `news:gdelt` and `news:feed` share a CLAUDE.md entry but have different writers

**What goes wrong:** CLAUDE.md:129 says `**news:gdelt** + **news:feed**` together. They're related but materially different:

- `news:feed` — written by `server/routes/news.ts:28` after RSS + GDELT-DOC merge + dedup
- `news:gdelt` — written by GDELT-DOC adapter (`adapters/gdelt-doc.ts`) before clustering; READ by `server/lib/llmEventExtractor.v3.ts:107` (`const NEWS_KEY = 'news:gdelt'`) for the LLM prompt's NEWS BLOCK; READ by `server/routes/events.ts:672` for fallback path

These are different lifecycle classes — one is a render-target cache, the other is an LLM-input cache. Inventory table (D-06) must split them.

**Why it happens:** Phase 13-era shorthand grouping. Phase 33 actor-aware enrichment widened the gap.

**How to avoid:** D-05 redis-keys.md gives each key its own row. D-23 CLAUDE.md edit splits the joint entry into two one-liners.

**Warning signs:** Operator confusion during incidents — "is news:gdelt empty because of the LLM stage or because of the upstream GDELT pull?" The split makes the diagnosis chain explicit.

### Pitfall 5: `_eval` directory inside `api/` may confuse `wc -c` scope

**What goes wrong:** `api/` contains `_eval` subdirectory (per `ls`). If the D-19 measurement command is `wc -c api/*` instead of `wc -c api/vercel-entry.js`, the answer is wrong.

**Why it happens:** Sloppy globbing.

**How to avoid:** D-19's measurement command is **explicitly** `wc -c api/vercel-entry.js` — single-file path. CONTEXT.md D-19 specifies this exactly.

**Warning signs:** Reported baseline ≠ 1,779,504 bytes at 2026-05-26. If your number differs, you measured the wrong path.

### Pitfall 6: jsdom environment vs node environment for the D-01 test

**What goes wrong:** Default vitest config is `environment: 'jsdom'` (`vite.config.ts:56`). For fs-heavy tests, `node` is more appropriate (avoids the jsdom global setup tax + a few jsdom-specific globals that can interfere).

**Why it happens:** The default jsdom environment is the project convention for frontend tests; server-tier tests opt into `node` via `@vitest-environment node` comment at the top of the file.

**How to avoid:** Add `// @vitest-environment node` as line 1 of `src/__tests__/lib/redis-registry.test.ts`. Pattern verified against `server/__tests__/lib/urlLiveness.schema.test.ts:1` and 4+ other node-env tests under `server/__tests__/`. Note: even though the file is _under_ `src/__tests__/`, the per-file environment directive overrides the global default.

**Warning signs:** Test runs in jsdom env without the directive; will work for now (the fs ops still execute) but is one ESM-quirk away from breaking.

## Code Examples

### Common Operation 1: Mark a key as load-bearing in the inventory table

```markdown
| `events:llm:v3` | `server/lib/llmExtractionPipeline.ts:88` (const) + cron writer | `server/routes/events.ts:78`; `server/lib/healthSources.ts:53`; `server/lib/urlLiveness.ts:585` | 9000s (≈2.5h hard; logical TTL = 900s logical) | `ConflictEventEntity[]` | Terminal LLM-enriched cache; sole cache served to `/api/events`. ADR-0010 invariant — only key written by the cascade. | 1 (single key, no parameterization) | **load-bearing** |
```

### Common Operation 2: Mark a key as observability with a cap

```markdown
| `events:llm-dlq` | `server/lib/llmDLQ.ts:60` `redis.sadd` | `server/lib/llmDLQ.ts:88` `redis.smembers`; `/api/operator-status` aggregator | 7d (`DLQ_TTL_SEC` = `7*24*3600`); SADD capped 200 entries (`DLQ_MAX`) | JSON-stringified `DLQEntry`: `{id, reason, lastError (≤500 char), timestamp}` | Dead-letter queue for events that exhaust the retry budget; surfaces in dashboard for drill-down | ≤ 200 (bounded by code) | observability |
```

### Common Operation 3: Mark a key as retire

```markdown
| `events:llm:v3:partial` | (none after Phase 35 D-12) | (none — no production reader) | (n/a) | (n/a) | **RETIRED Phase 35 / SIMPLIFY-02.** Hobby-era 300s-budget mitigation. Production cleanup: natural TTL expiry within 2.5h of deploy (entries were always `LLM_REDIS_TTL_SEC`-bound). Historical: see ADR-0010 Phase 35 sub-block. | 0 (post-retirement) | **retire** |
```

### Common Operation 4: freeClaudeRouter callers block (D-16 verbatim form)

```typescript
/**
 * Free Claude Router — multi-provider cascade for LLM-backed extraction + geocoding.
 *
 * Live production callers (verified Phase 35 / 2026-05-MM):
 *   - server/lib/llmEventExtractor.v3.ts:40 — sole runtime extractor; calls
 *     callLLM for each event-group batch.
 *   - server/lib/llmResolver.ts:15 — 6-path geocode resolver; calls callLLM for
 *     the nominatim-verified-2pass reranker only.
 *   - server/adapters/llm-provider.ts:23 — bridge wrapper; re-exports callLLM
 *     for legacy import paths (Phase 27.4.3 D-03 cascade replacement).
 *
 * Active cascade shape (Phase 34 close): NIM primary (qwen-235b instruct);
 * OpenRouter dormant (skipOpenRouter: true at extractor sites per Phase 30.1);
 * Cerebras + Groq deferred (Phase 34 close — see ADR-0010 Phase 34 sub-block).
 *
 * Test callers (NOT live production but listed for completeness; see Phase 35
 * 35-VERIFICATION.md):
 *   - server/__tests__/lib/freeClaudeRouter.test.ts (canonical contract)
 *   - server/__tests__/lib/freeClaudeRouter.retryAfterMs.test.ts:67
 *   - server/__tests__/lib/llmEventExtractor.v3-adaptive.test.ts:94,107
 *   - server/__tests__/lib/llmLineage-prefilter.test.ts:108,142
 *   - server/__tests__/lib/llmResolver.test.ts:35,39
 *   - server/__tests__/adapters/llm-provider.test.ts:20
 *   - server/__tests__/lib/llmEventExtractor.v3.canonicalize.test.ts:56
 *   - server/__tests__/lib/llmEventExtractor.v3.prompt.test.ts:34
 *   - server/__tests__/lib/urlLiveness.probe.test.ts (mock-strategy citation)
 *   - server/__tests__/lib/urlLiveness.sweep.test.ts (mock-strategy citation)
 *   - server/__tests__/routes/llm-optional.test.ts:194
 */

// Vendored from https://github.com/Alishahryar1/free-claude-code  (...existing block continues)
```

**Source for live caller list:** grep audit at `/Users/zackmaz/Desktop/otg-iran-monitor/scripts/probe-openrouter.ts:44` (script — NOT live runtime), `server/lib/llmEventExtractor.v3.ts:40`, `server/lib/llmResolver.ts:15`, `server/adapters/llm-provider.ts:23`. CONTEXT.md D-15 stated 3 production callers; **scout was correct**. The `scripts/` callers (`probe-openrouter.ts`, `bakeoff-v3.ts:35`, `bakeoff-v3-direct.ts:25`) are dev-only tools and should be footnoted, not promoted to "live production caller."

### Common Operation 5: D-12 partial-key writer deletion (delta)

```typescript
// BEFORE (server/lib/llmEventExtractor.v3.ts:115-123)
const EVENTS_LLM_V3_KEY = 'events:llm:v3';
/**
 * Partial-progress cache for the v3 extractor — written per-batch from
 * writePartialCache. Holds LLMCachePayload<EnrichedEventV3> envelopes so
 * DevApiStatus / /llm-status can show in-flight progress without colliding
 * with the terminal ConflictEventEntity[] key above. Readers of the main
 * /api/events endpoint NEVER touch this key.
 */
const EVENTS_LLM_V3_PARTIAL_KEY = 'events:llm:v3:partial';
export { EVENTS_LLM_V3_KEY, EVENTS_LLM_V3_PARTIAL_KEY };

// AFTER (D-12)
const EVENTS_LLM_V3_KEY = 'events:llm:v3';
export { EVENTS_LLM_V3_KEY };
```

And remove the writer function (`writePartialCache` at `:462-480`) along with every callsite (`finishBatch` at `:619` invokes it; replace `await writePartialCache(results, c, totalBatches, false)` with the deletion + any progress side-effect that survives).

**Caveat:** Verify `LLMCachePayload` interface at `:269-274` — does anything ELSE consume that type, or is it solely tied to the partial-key writer? Grep:

```bash
rg "LLMCachePayload" --type ts -g '!node_modules'
```

If `LLMCachePayload` is only referenced by the partial-key writer + its tests, delete the interface too. If anything else holds it, leave the interface and just remove the writer.

## State of the Art

| Old Approach                                             | Current Approach                                   | When Changed             | Impact                                                                                                        |
| -------------------------------------------------------- | -------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Hand-maintained registry rotting silently between phases | Mechanical drift gate vitest (D-01)                | This phase               | Registry parity asserted at `vitest run`; reviewer no longer needs to spot drift in PR diff                   |
| Two-key discipline (terminal + partial)                  | One-key discipline (terminal only)                 | This phase / SIMPLIFY-02 | Pro 800s makes terminal writes reliable; partial-key scaffolding has no live purpose. Single source of truth. |
| 1-line-per-key CLAUDE.md as sole inventory               | Two-tier: CLAUDE.md skim + redis-keys.md deep-dive | This phase / D-05        | Operator-incident skim stays terse; deep-dive lives in `docs/architecture/` matching the existing convention. |
| `LLMCachePayload` envelope as observability vehicle      | (envelope deletable; no live reader)               | This phase / D-12        | Type-level cleanup + bundle-size reduction.                                                                   |

**Deprecated/outdated:**

- `events:llm:v3:partial` — retired this phase per SIMPLIFY-02.
- `events:llm:v2:partial` — already retired Phase 29 along with v2 extractor; only the `scripts/clear-llm-cache-dev.ts:22` reference remains as a defensive cleanup target (harmless — del-ing an empty key is a no-op).
- `LLMCachePayload` (if no other consumer found) — retired this phase as part of D-12.

## Phase Requirements

| ID               | Description                                                                                             | Research Support                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------- | --- | ----------- | ---------------- | ----------- | --------------- |
| **DOCS-INT-02**  | JSDoc one-liners audited + brought current on 7 LLM-pipeline modules                                    | D-09 / D-10 commits; 7-commit cadence per CONTEXT D-25.4. Module enumeration verified: `llmExtractionPipeline.ts` (5 exports), `llmEventExtractor.v3.ts` (~13 exports), `llmResolver.ts` (8 exports), `llmCircuitBreaker.ts` (5 exports), `llmDLQ.ts` (4 exports), `llmTokenBudget.ts` (7 exports), `llmExtractorWatchdog.ts` (2 exports). Total ~44 exports → upper bound of CONTEXT's "~30-50 one-liners" estimate. Audit finds most existing JSDoc is true-today; the rare ones to rewrite are those citing now-deleted code paths (D-10). |
| **DOCS-INT-03**  | Redis key registry verified against actual writers/readers in code; orphans removed; missing keys added | D-01 vitest enforces; D-14 adds 4 missing keys (`events:llm:v3:lineage:{eventId}`, `events:llm:v3:lineage-keys`, `events:llm:v3:group-lineage:{hash}`, `events:llm-pipeline-audit`); D-23 also splits the misjoined `news:gdelt + news:feed` registry entry and corrects `markets:yahoo` → `markets:yahoo:{range}`. Grep audit below lists every key found.                                                                                                                                                                                   |
| **REDIS-OPT-01** | Full Redis key inventory as a single auditable artifact                                                 | D-05 ships `docs/architecture/redis-keys.md`. D-06 column shape: Key                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Writers | Readers | TTL | Value shape | Business purpose | Cardinality | Classification. |
| **REDIS-OPT-02** | Each key classified as load-bearing / observability / retire with rationale                             | D-08 classification enum applied per-row. Counts (from current registry): `load-bearing` ≈ 15, `observability` ≈ 9, `retire` = 1 (the partial-key).                                                                                                                                                                                                                                                                                                                                                                                           |
| **REDIS-OPT-03** | TTLs right-sized against producer cadence                                                               | D-17 review reads as the load-bearing outcome; D-18 caps replay-history if discovered uncapped (NOT YET CHECKED — see Open Question 1).                                                                                                                                                                                                                                                                                                                                                                                                       |
| **REDIS-OPT-04** | Upstash command-budget pre/post delta measured                                                          | D-20 manual dashboard PNG screenshots + D-21 primary-driver attribution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| **SIMPLIFY-02**  | Retire `events:llm:v3:partial` observability key                                                        | D-12 single atomic commit. 7 production refs in `llmEventExtractor.v3.ts` + 2 supporting comments in `llmExtractionPipeline.ts` + 4 test files + 3 script files (Pitfall 1) all touched in this commit. Production cleanup via natural TTL (D-13).                                                                                                                                                                                                                                                                                            |
| **SIMPLIFY-05**  | `freeClaudeRouter.ts` caller audit                                                                      | D-15 keep-with-callers-block. Verified 3 production callers (`llmEventExtractor.v3.ts:40`, `llmResolver.ts:15`, `llm-provider.ts:23`) + 10 test files. D-16 top-of-file block format.                                                                                                                                                                                                                                                                                                                                                         |
| **SIMPLIFY-07**  | Bundle-size delta `api/vercel-entry.js` measured                                                        | D-19 `wc -c` baseline = 1,779,504 bytes (verified 2026-05-26). Re-measure at phase close; delta + percentage + drivers in SUMMARY.md + ADR-0010 sub-block per D-22.                                                                                                                                                                                                                                                                                                                                                                           |

## Assumptions Log

| #   | Claim                                                                                                                                                                                                                                                                                                            | Section                      | Risk if Wrong                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | The vitest drift gate (D-01) at `src/__tests__/lib/` works with the existing default vitest config when annotated `// @vitest-environment node`.                                                                                                                                                                 | Pitfall 6 + Pattern 1 sketch | If wrong, gate test errors at run time but doesn't silently pass. Mitigation: try-and-see; the `urlLiveness.schema.test.ts` precedent at `server/__tests__/lib/` proves the comment-override works; we are extending the pattern to `src/__tests__/lib/`. Both the example sketch and existing tests show the pattern works regardless of directory. |
| A2  | The 3 `scripts/` files referencing `events:llm:v3:partial` (`peek-v3-partial.ts`, `snapshot-v3-redis.ts`, `clear-llm-cache-dev.ts`) are dev-pass scratch tools that the operator does not invoke from cron or CI. Verified by reading top-of-file comments but not by full git-blame audit.                      | Pitfall 1 disposition        | If a cron job or CI workflow invokes any of these, deletion breaks operations. **Recommend planner confirm with operator before deletion**, especially `peek-v3-partial.ts` (which is the only file that becomes 100% dead after D-12).                                                                                                              |
| A3  | `LLMCachePayload` interface (`llmEventExtractor.v3.ts:269-274`) has no consumer OTHER than the partial-key writer. Not yet ripgrepped; high probability based on `EVENTS_LLM_V3_PARTIAL_KEY` having only 3 refs but worth re-confirming during planning.                                                         | Common Operation 5 caveat    | If wrong, the interface stays but the writer can still be deleted. Low risk — TypeScript compile will catch any dangling reference.                                                                                                                                                                                                                  |
| A4  | The 4 markets keys (`markets:yahoo:1d`, `markets:yahoo:5d`, `markets:yahoo:1mo`, `markets:yahoo:ytd`) are the only `markets:yahoo:*` keys ever written. Yahoo route at `markets.ts:18` lists exactly these 4 in the `z.enum`.                                                                                    | Pitfall 3 + Inventory table  | Verified by reading `markets.ts:17-19` Zod enum — these 4 are the only possible values. **Low risk.**                                                                                                                                                                                                                                                |
| A5  | The replay-history key referenced by REDIS-OPT-03 / D-18 wording is `operator:replay-quota:{bearerFingerprint}:{YYYY-MM-DD}` (the daily INCR counter), NOT a separate history key. There is no observable separate replay-history key in code.                                                                   | Open Question 1 below        | If wrong, the cap-applying decision targets the wrong key. The grep audit found NO key matching "replay-history" — there is only the per-day quota counter. **High likelihood D-18 wording was loose**, recommend planner confirm with operator before applying a cap.                                                                               |
| A6  | The D-19 baseline of 1,779,504 bytes from CONTEXT.md scout matches the current build output. Verified by `wc -c api/vercel-entry.js` returning exactly 1779504 at research time.                                                                                                                                 | Pitfall 5 / D-19             | None — re-verified during this research.                                                                                                                                                                                                                                                                                                             |
| A7  | The `news:gdelt` writer is the GDELT-DOC adapter at `server/adapters/gdelt-doc.ts` (called by news + events routes). Not directly grepped at adapter level; only the LLM-extractor reader (`llmEventExtractor.v3.ts:107`) and the events.ts fallback reader (`server/routes/events.ts:672`) were grep-confirmed. | Pitfall 4 + Inventory table  | Planning should grep `'news:gdelt'` in `server/adapters/` to confirm writer location for the inventory table column. **Low risk** — the writer exists somewhere because the key has known readers.                                                                                                                                                   |

**If this table is empty:** Phase 35 has 7 [ASSUMED] items; the planner should fold confirmations into the first plan (35-01) as task-level grep verifications before authoring the inventory row.

## Open Questions (RESOLVED)

> Resolution status set at plan-check time. Each question's operational handler is named below. The planner has already woven these into the plan structure — this section now exists as a backstop trace, not a TODO.

1. **What does REDIS-OPT-03 / D-18 mean by "replay-history not yet capped"?**
   - What we know: The wording is "DLQ at 200 entries / 7d, audit log at 500 / 30d already; replay history not yet capped." That implies a separate replay-history key beyond `operator:audit-log` (the audit log) and `events:llm-dlq` (the DLQ). The codebase grep finds only `operator:replay-quota:*` (per-day counter, already TTL'd 48h) and `operator:audit-log` (already capped 500/30d).
   - What's unclear: Is there an undocumented replay-history key that wasn't in the grep? Or is D-18's wording referring to `operator:audit-log` and the operator's mental model treats it as the de-facto replay-history (which IS already capped 500/30d)?
   - **RESOLVED:** Operator clarification is baked into Plan **35-05 Task 1** as a `checkpoint:decision` step. The plan presents three options to the operator (A: D-18 is no-op, audit-log is the replay history; B: add a cap to a newly-discovered key; C: defer to a follow-up phase) and routes the remainder of 35-05 accordingly. If the answer is "audit-log is the replay history" then D-18 lands as a SUMMARY.md line ("all observability keys verified capped") with zero code change — a load-bearing outcome per D-17 precedent.

2. **Should the `LLMCachePayload` interface be retired alongside the partial-key writer (D-12)?**
   - What we know: The interface is defined at `llmEventExtractor.v3.ts:269-274`, exported, and used by `writePartialCache:462`. No other consumer in production code was grep-found.
   - What's unclear: Tests that mock the writer might assert on `LLMCachePayload` shape; the partial-key test files (`llmExtractionPipeline.{terminalShape,incrementalWrite,crossBoundary}.test.ts`) likely use the type.
   - **RESOLVED:** Plan **35-02 Task 1** Pre-flight Grep B drives the keep-vs-retire decision before Task 2 fires. The grep step `rg "LLMCachePayload" --type ts -g '!node_modules'` runs as a hard gate — if only test references remain after the D-12 deletion plan, the interface ships in the same atomic commit; if a non-test consumer survives, the interface is left in place and documented inline. Either outcome is a single-task fork inside 35-02.

3. **Do any cron handlers or CI workflows invoke the 3 partial-key script files?**
   - What we know: `scripts/peek-v3-partial.ts` (one-purpose dev pass), `scripts/snapshot-v3-redis.ts` (multi-key snapshot tool), `scripts/clear-llm-cache-dev.ts` (dev clear).
   - What's unclear: GitHub Actions workflows under `.github/workflows/` or `package.json` scripts that wrap them.
   - **RESOLVED:** Plan **35-02 Task 1** Pre-flight Grep A confirms no CI/cron wrappers before the delete-the-file disposition is taken. Grep target: `grep -rn "peek-v3-partial\|snapshot-v3-redis\|clear-llm-cache-dev" .github/ package.json`. If anything wraps these scripts, the disposition shifts from delete-the-file to scope-edit-the-file at the same task; either branch lands inside 35-02 atomically.

4. **Is there any cardinality measurement automation that the CONTEXT.md "deferred" section misses?**
   - What we know: CONTEXT.md "Out of scope" notes "Cardinality measurement automation … not a continuously-updated value."
   - What's unclear: Whether the existing `snapshot-cron-watch.ts` or `analyze-llm-run.ts` scripts emit anything cardinality-shaped that could be referenced.
   - **RESOLVED:** Informational disposition only — no new automation lands. The `docs/architecture/redis-keys.md` Cardinality column (D-06, D-07) cites "via `snapshot-cron-watch.ts` daily snapshot" for keys those scripts already touch (`events:llm:v3`, `events:llm-summary:v3`, `events:llm-dlq`) and "one-shot manual SCAN at phase close" for the rest. Reuses existing infrastructure where it exists; no Phase 35 commit ships new measurement code.

## Environment Availability

> Phase 35 has minimal external dependencies (no new APIs, no new runtimes).

| Dependency                         | Required By                                | Available             | Version                                  | Fallback                                                           |
| ---------------------------------- | ------------------------------------------ | --------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| `vitest` (existing dev dep)        | D-01 drift gate test                       | ✓                     | per `package.json`                       | — (load-bearing)                                                   |
| `node:fs`, `node:path`, `node:url` | D-01 test (parse markdown + walk codebase) | ✓                     | Node ≥ 20 (CLAUDE.md §Vercel Deployment) | — (load-bearing)                                                   |
| `wc` (coreutils)                   | D-19 bundle-size measurement               | ✓ (macOS Darwin 25.1) | system default                           | — (load-bearing)                                                   |
| Upstash dashboard browser access   | D-20 operator screenshot capture           | ✓ (operator-driven)   | —                                        | Manual transcription as markdown table (D-Discretion-6 supplement) |
| `git`                              | All commits                                | ✓                     | already in use                           | —                                                                  |
| `npm run build`                    | D-19 re-measurement at phase close         | ✓                     | per `package.json`                       | —                                                                  |

**Missing dependencies with no fallback:** none
**Missing dependencies with fallback:** Upstash REST API does NOT expose `INFO commandstats` cleanly per CONTEXT D-20 — manual dashboard reading is the documented honest surface. This is not a "missing dependency" so much as an "explicit choice of manual measurement."

## Grep Audit — Authoritative Input for D-05 Inventory

> This section is the **load-bearing grep output** consumed by the planner when authoring `docs/architecture/redis-keys.md`. Every code reference is verified at file:line.

### `events:*` family (15 keys + 1 retire)

| Key                                  | Production writer(s)                                                                                                                                                                                                                 | Production reader(s)                                                                                                                                         | TTL                                                                        | Notes                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `events:gdelt`                       | `server/routes/events.ts:62` (declared `EVENTS_KEY`); written by GDELT polling + backfill paths in same file                                                                                                                         | `server/lib/llmExtractionPipeline.ts:77` (read by extractor as raw input); `server/routes/events.ts` Pitfall 1 terminal fallback                             | 15-min logical / 2.5h hard                                                 | Raw GDELT cache. CLAUDE.md ✓                                                                                                                                       |
| `events:backfill-ts`                 | `server/routes/events.ts:71` declared; written by `backfillEvents()` 1h cooldown sentinel                                                                                                                                            | Same file (cooldown check)                                                                                                                                   | 1h logical                                                                 | CLAUDE.md ✓ (mentioned in "events accumulator" line)                                                                                                               |
| `events:llm:v3`                      | `server/lib/llmEventExtractor.v3.ts:114` declared `EVENTS_LLM_V3_KEY`; `server/lib/llmExtractionPipeline.ts:88` exported `LLM_EVENTS_KEY_ACTIVE`; written by cron-only `mergeAndPersistLlmEntities` at end of `runRefreshExtraction` | `server/routes/events.ts:78`; `server/lib/healthSources.ts:53`; `server/lib/urlLiveness.ts:585` splice writer; `server/routes/operator-status.ts` aggregator | 9000s (`LLM_REDIS_TTL_SEC`) hard                                           | **load-bearing terminal cache**; CLAUDE.md ✓                                                                                                                       |
| `events:llm:v3:partial`              | `server/lib/llmEventExtractor.v3.ts:122` declared `EVENTS_LLM_V3_PARTIAL_KEY`; writer at `:475` `cacheSetSafe(EVENTS_LLM_V3_PARTIAL_KEY, payload, LLM_REDIS_TTL_SEC)`                                                                | **NONE** (no production reader — verified by grep)                                                                                                           | 9000s                                                                      | **RETIRED in this phase (D-12 / SIMPLIFY-02)**                                                                                                                     |
| `events:llm:v3:lineage:{eventId}`    | `server/lib/llmLineage.ts:20` declared `LINEAGE_KEY_PREFIX`; `:57-72` writer (HSET + EXPIRE)                                                                                                                                         | (read-only by `snapshot-v3-redis.ts:80` script + Plan 04 DrillDownRow surface in DevApiStatus)                                                               | 7d (`LINEAGE_TTL_SEC = 7*24*3600`)                                         | **MISSING from CLAUDE.md ❌** — must be added (D-14)                                                                                                               |
| `events:llm:v3:lineage-keys`         | `server/lib/llmLineage.ts:21` declared `LINEAGE_INDEX_KEY`; `:78-80` writer (ZADD + ZREMRANGEBYRANK + EXPIRE)                                                                                                                        | (read-only by lineage drill-down)                                                                                                                            | 7d; capped 500 entries (`LINEAGE_MAX_ENTRIES`)                             | **MISSING from CLAUDE.md ❌** — must be added (D-14)                                                                                                               |
| `events:llm:v3:group-lineage:{hash}` | `server/lib/llmLineage.ts:110` declared `GROUP_LINEAGE_KEY_PREFIX`; WRITE-SIDE NOT YET IMPLEMENTED (read-side only in 27.4.4; per code comment :104)                                                                                 | `server/lib/llmEventExtractor.v3.ts:529-` (pre-filter read path inside `processEventGroupsV3`)                                                               | 7d (`GROUP_LINEAGE_TTL_SEC`)                                               | **MISSING from CLAUDE.md ❌** — must be added (D-14). Reader-only currently; document as such.                                                                     |
| `events:llm-summary:v3`              | `server/lib/llmExtractionPipeline.ts:91` `LLM_SUMMARY_KEY_ACTIVE`; written by `runRefreshExtraction` post-run                                                                                                                        | `server/routes/events.ts:81`; `scripts/analyze-llm-run.ts:289`; `scripts/snapshot-cron-watch.ts:508`                                                         | 24h (`LLM_SUMMARY_TTL_SEC = 86400`)                                        | CLAUDE.md ✓                                                                                                                                                        |
| `events:llm-dlq`                     | `server/lib/llmDLQ.ts:60` `redis.sadd`                                                                                                                                                                                               | `server/lib/llmDLQ.ts:88` `redis.smembers`; `/api/operator-status` aggregator                                                                                | 7d (`DLQ_TTL_SEC`); SADD bounded 200 (`DLQ_MAX`)                           | CLAUDE.md ✓                                                                                                                                                        |
| `events:llm-process-ts`              | `server/routes/events.ts:84` declared; `server/lib/llmExtractionPipeline.ts:100`; written by `runRefreshExtraction` start                                                                                                            | `runRefreshExtraction` cooldown check at `:231`                                                                                                              | (no explicit TTL — sentinel; behaves as cooldown marker)                   | CLAUDE.md ✓                                                                                                                                                        |
| `events:llm-eval-baseline:v3`        | `server/lib/llmEvalHarness.ts:78` declared `BASELINE_KEY`; written by `runEval()` after each cron-tick eval run                                                                                                                      | `server/routes/operator-status.ts` aggregator; `scripts/eval-detail.ts`                                                                                      | 90d                                                                        | CLAUDE.md ✓                                                                                                                                                        |
| `events:llm-eval-adversarial:v3`     | `server/lib/llmEvalHarness.ts:462` declared `ADVERSARIAL_KEY`; `runAdversarialEval()` writer                                                                                                                                         | `server/routes/operator-status.ts:348`                                                                                                                       | 90d                                                                        | CLAUDE.md ✓                                                                                                                                                        |
| `events:llm-pipeline-audit`          | `server/lib/pipelineAudit.ts:18` declared `PIPELINE_AUDIT_KEY`; `:33-35` writer (LPUSH + LTRIM + EXPIRE)                                                                                                                             | `server/lib/pipelineAudit.ts:44` `listPipelineAudit` (LRANGE)                                                                                                | 90d (`PIPELINE_AUDIT_TTL_SEC`); bounded 200 entries (`PIPELINE_AUDIT_MAX`) | **MISSING from CLAUDE.md ❌** — must be added (D-14). Surfaces operator-driven pipeline-version flips (historical record post-Phase-29 — no new writers expected). |
| `events:url-liveness:{eventId}`      | `server/lib/urlLiveness.ts:62` declared `URL_LIVENESS_KEY_PREFIX`; `:454` writer (probe + persist)                                                                                                                                   | `pruneDeadUrlEvents`; `/api/operator-status` aggregator                                                                                                      | Tiered TTL: live 7d, terminal-dead (404/403/dead-host) 24h, unknown 1h     | CLAUDE.md ✓                                                                                                                                                        |
| `events:url-liveness-count`          | `server/lib/urlLiveness.ts:71` declared `URL_LIVENESS_COUNT_KEY`; INCR/DECR by probe writer + prune                                                                                                                                  | `server/routes/operator-status.ts`                                                                                                                           | None (persistent sidecar)                                                  | CLAUDE.md ✓                                                                                                                                                        |

### `flights:*` family

| Key               | Writer                                                                   | Reader                                                        | TTL                                 | Notes                                            |
| ----------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------ |
| `flights:opensky` | `server/routes/flights.ts:26` declared; written by OpenSky adapter poll  | Same file (read on `/api/flights?source=opensky`)             | short (per `FLIGHTS_REDIS_TTL_SEC`) | CLAUDE.md ✓ (under `flights:{source}` shorthand) |
| `flights:adsblol` | `server/routes/flights.ts:27` declared; written by adsb.lol adapter poll | Same file + `server/lib/healthSources.ts:35` for health probe | short                               | CLAUDE.md ✓ (under shorthand)                    |

### `ships:*` family

| Key         | Writer                               | Reader                                       | TTL          | Notes       |
| ----------- | ------------------------------------ | -------------------------------------------- | ------------ | ----------- |
| `ships:ais` | `server/routes/ships.ts:13` declared | Same file + `server/lib/healthSources.ts:36` | 10-min stale | CLAUDE.md ✓ |

### `sites:*` family

| Key        | Writer                                                                    | Reader                                       | TTL | Notes       |
| ---------- | ------------------------------------------------------------------------- | -------------------------------------------- | --- | ----------- |
| `sites:v3` | `server/routes/sites.ts:58` + `server/routes/cron-warm.ts:28` (warm path) | Same file + `server/lib/healthSources.ts:44` | 24h | CLAUDE.md ✓ |

### `water:*` family

| Key                   | Writer                                           | Reader                            | TTL | Notes       |
| --------------------- | ------------------------------------------------ | --------------------------------- | --- | ----------- |
| `water:facilities:v3` | `server/routes/water.ts:122` + `cron-warm.ts:29` | Same file + `healthSources.ts:46` | 24h | CLAUDE.md ✓ |
| `water:precip`        | `server/routes/water.ts:125`                     | Same file + `healthSources.ts:48` | 6h  | CLAUDE.md ✓ |

### `news:*` family — needs SPLIT in registry

| Key          | Writer                                                                                                   | Reader                                                                                          | TTL            | Notes                                                                                      |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------ |
| `news:feed`  | `server/routes/news.ts:28` declared `NEWS_FEED_KEY`; written post-merge after RSS + GDELT-DOC clustering | Same file + `healthSources.ts:40`                                                               | 15-min logical | **CLAUDE.md JOINS this with `news:gdelt` ❌** — must be split (D-23). Render-target cache. |
| `news:gdelt` | (write side in GDELT-DOC adapter — confirm during plan)                                                  | `server/lib/llmEventExtractor.v3.ts:107` (LLM prompt NEWS BLOCK); `server/routes/events.ts:672` | 15-min         | LLM-input cache. Different lifecycle class from `news:feed`.                               |

### `markets:*` family — needs REFINEMENT

| Key                                                        | Writer                                                              | Reader                                                 | TTL | Notes                                                                         |
| ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | --- | ----------------------------------------------------------------------------- |
| `markets:yahoo:{range}` where `range ∈ {1d, 5d, 1mo, ytd}` | `server/routes/markets.ts:26` `cacheKey = `markets:yahoo:${range}`` | Same file + `healthSources.ts:41` (`markets:yahoo:1d`) | 60s | CLAUDE.md says `markets:yahoo` ❌ — refine to `markets:yahoo:{range}` (D-23). |

### `geocode:*` family

| Key                                 | Writer                                                                                     | Reader    | TTL                    | Notes       |
| ----------------------------------- | ------------------------------------------------------------------------------------------ | --------- | ---------------------- | ----------- |
| `geocode:{lat},{lon}`               | `server/routes/geocode.ts:17` (legacy reverse-geocode prefix)                              | Same file | 30d logical / 90d hard | CLAUDE.md ✓ |
| `geocode:fwd:constrained:v2:{hash}` | `server/lib/llmResolver.ts:38` declared `GEOCODE_CACHE_PREFIX`; written in 6-path resolver | Same file | 30d hard               | CLAUDE.md ✓ |

### `llm:*` family

| Key                                | Writer                                                                                                                                        | Reader                                                                       | TTL                                           | Notes       |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------- | ----------- |
| `llm:tokens:{provider}:YYYY-MM-DD` | `server/lib/llmTokenBudget.ts:54` `todayKey()` + `incrDailyTokens` `redis.multi().incrby`                                                     | Same file `getDailyTokens` + `shouldPauseNewEvents` + `/api/operator-status` | 48h (`TTL_48H_SEC`)                           | CLAUDE.md ✓ |
| `llm:lastProgress`                 | `server/lib/llmProgress.ts:508` exported `LLM_LASTPROGRESS_KEY`; written in `resetProgress` always + `updateProgress` on terminal transitions | `server/routes/health.ts` `probeLlmStatus` (with in-memory fallback)         | 7d (`LLM_LASTPROGRESS_TTL_SEC` per CLAUDE.md) | CLAUDE.md ✓ |

### `cron:*` family

| Key                            | Writer                                                                                                            | Reader                                                       | TTL                          | Notes                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------- | ------------------------------------------ |
| `cron:lastTick:health`         | `server/routes/cron-health.ts:131` `cacheSetSafe(..., CRON_LASTTICK_TTL_SEC)`                                     | `server/lib/healthSources.ts` `probeCronTick`; `/api/health` | 7d (`CRON_LASTTICK_TTL_SEC`) | CLAUDE.md ✓ (under `cron:lastTick:<name>`) |
| `cron:lastTick:warm`           | `server/routes/cron-warm.ts:85`                                                                                   | Same as above                                                | 7d                           | CLAUDE.md ✓                                |
| `cron:lastTick:refresh-events` | `server/routes/refresh-events-cron.ts:74` (AFTER `runRefreshExtraction` resolves — D-03 honest-failure semantics) | Same as above                                                | 7d                           | CLAUDE.md ✓                                |

### `operator:*` family

| Key                                                      | Writer                                                                                                    | Reader                                                  | TTL                   | Notes       |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------- | ----------- |
| `operator:audit-log`                                     | `server/lib/operatorAudit.ts:34` exported `OPERATOR_AUDIT_KEY`; `redis.sadd` from prune + replay handlers | `server/routes/operator-status.ts:289` `redis.smembers` | 30d; SADD bounded 500 | CLAUDE.md ✓ |
| `operator:replay-quota:{bearerFingerprint}:{YYYY-MM-DD}` | `server/lib/replayQuota.ts:29` declared `QUOTA_KEY_PREFIX`; INCR + EXPIRE                                 | Same file `checkReplayQuota`                            | 48h                   | CLAUDE.md ✓ |
| `operator:prune-quota:{bearerFingerprint}:{YYYY-MM-DD}`  | `server/lib/pruneQuota.ts:49` declared `QUOTA_KEY_PREFIX`; INCR + EXPIRE                                  | Same file `checkPruneQuota`                             | 48h                   | CLAUDE.md ✓ |

### `audit:*` family

| Key                              | Writer                                                                 | Reader                                                                               | TTL | Notes       |
| -------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | --- | ----------- |
| `audit:connectivity:last-result` | `.github/workflows/prod-connectivity-audit.yml:215` (GH-Actions write) | `server/routes/audit-status.ts:39` declared `AUDIT_KEY`; read by `/api/audit-status` | 7d  | CLAUDE.md ✓ |

### Summary count

- **Total documented in CLAUDE.md (post Phase 29 trim):** ~22 entries (some umbrella-shorthand)
- **Total actual keys in code:** ~27 distinct keys (counting parametric prefixes once; `markets:yahoo:{range}` counted as 1; tier-by-tier across families)
- **Missing from CLAUDE.md:** 4 (the lineage trio + pipeline-audit), per CONTEXT.md D-14
- **In CLAUDE.md but slated for retirement:** 1 (`events:llm:v3:partial`), per CONTEXT.md D-12
- **CLAUDE.md entries needing refinement (split or parametrize):** 2 (`news:gdelt`+`news:feed` joint, `markets:yahoo` → `markets:yahoo:{range}`), per Pitfall 3 + Pitfall 4

**CONTEXT.md's scout was correct on the 4-missing/1-retire claim. This research surfaces 2 additional refinement targets the scout missed.**

## Validation Architecture

### Test Framework

| Property           | Value                                                          |
| ------------------ | -------------------------------------------------------------- |
| Framework          | `vitest` ~3.x (existing)                                       |
| Config file        | `vite.config.ts:55-77` (`test: { environment: 'jsdom', ... }`) |
| Quick run command  | `npx vitest run src/__tests__/lib/redis-registry.test.ts`      |
| Full suite command | `npx vitest run`                                               |

### Phase Requirements → Test Map

| Req ID                         | Behavior                                                                                                                                                                                                                             | Test Type         | Automated Command                                                                                                                                                                                                                                                                                                                             | File Exists?              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| DOCS-INT-03 + REDIS-OPT-01     | Registry parity (3-surface: CLAUDE.md ↔ redis-keys.md ↔ code)                                                                                                                                                                        | unit (drift gate) | `npx vitest run src/__tests__/lib/redis-registry.test.ts`                                                                                                                                                                                                                                                                                     | ❌ Wave 0 — to be created |
| SIMPLIFY-02                    | After D-12 commit, no production code references `EVENTS_LLM_V3_PARTIAL_KEY` constant nor reads/writes the literal `'events:llm:v3:partial'` (except for explicit historical comments and the test files updated in the same commit) | unit + grep       | `npx vitest run server/__tests__/lib/llmExtractionPipeline.terminalShape.test.ts server/__tests__/lib/llmExtractionPipeline.incrementalWrite.test.ts server/__tests__/lib/llmExtractionPipeline.crossBoundary.test.ts server/__tests__/cache/redis-prefix.test.ts` (these tests must still pass after the partial-key assertions are dropped) | ✅ exists                 |
| DOCS-INT-02                    | All 7 LLM-pipeline modules compile + their tests pass                                                                                                                                                                                | unit (full suite) | `npx vitest run` + `npx tsc --noEmit`                                                                                                                                                                                                                                                                                                         | ✅ exists                 |
| SIMPLIFY-05                    | `freeClaudeRouter.ts` callers block added; existing tests still pass                                                                                                                                                                 | smoke             | `npx vitest run server/__tests__/lib/freeClaudeRouter.test.ts`                                                                                                                                                                                                                                                                                | ✅ exists                 |
| REDIS-OPT-03 (D-18)            | Replay-history cap applies IF a key is identified                                                                                                                                                                                    | unit              | (depends on whether a cap-target key emerges; if `operator:replay-quota` is the target, existing `server/lib/__tests__/replayQuota.test.ts` already pins behavior)                                                                                                                                                                            | ✅ exists                 |
| REDIS-OPT-04 (D-19)            | Bundle-size `wc -c api/vercel-entry.js` returns a finite integer matching the deploy artifact                                                                                                                                        | manual-only       | `wc -c api/vercel-entry.js` (one-shot at phase start + phase close)                                                                                                                                                                                                                                                                           | n/a (build artifact)      |
| REDIS-OPT-04 (D-20)            | Upstash budget delta captured                                                                                                                                                                                                        | manual-only       | Operator captures PNG screenshot from Upstash dashboard                                                                                                                                                                                                                                                                                       | n/a (manual)              |
| SIMPLIFY-07 (D-19 measurement) | Bundle-size baseline + close delta in SUMMARY.md + ADR                                                                                                                                                                               | manual review     | git diff against PROJECT.md / ADR-0010 captures the recorded numbers                                                                                                                                                                                                                                                                          | n/a                       |

### Sampling Rate

- **Per task commit (D-N):** Targeted vitest for the surface touched (e.g. partial-key test files after D-12).
- **Per wave merge:** `npx vitest run` full suite plus `npx tsc --noEmit`.
- **Phase gate:** Full suite green; `npx vitest run src/__tests__/lib/redis-registry.test.ts` green specifically (the drift gate is the load-bearing test for this phase).

### Wave 0 Gaps

- [ ] `src/__tests__/lib/redis-registry.test.ts` — NEW for D-01; covers DOCS-INT-03 + REDIS-OPT-01 parity assertions
- [ ] `docs/architecture/redis-keys.md` — NEW for D-05; the artifact the test parses

_All other phase requirements are exercised by existing tests._

## Security Domain

> Phase 35 is doc/cleanup; security surface is small but non-zero.

### Applicable ASVS Categories

| ASVS Category         | Applies | Standard Control                                                                                                                                           |
| --------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V2 Authentication     | no      | No new endpoints; no auth surface change                                                                                                                   |
| V3 Session Management | no      | No new endpoints                                                                                                                                           |
| V4 Access Control     | partial | `freeClaudeRouter.ts` callers block must not leak credentials; D-16 example block contains zero secret material (no API keys, no Bearer tokens) — verified |
| V5 Input Validation   | no      | No new user-input surfaces; D-01 vitest reads only repo-internal files                                                                                     |
| V6 Cryptography       | no      | No crypto changes                                                                                                                                          |
| V7 Error Handling     | partial | D-01 vitest must not leak file contents on assertion failure beyond the offending key name                                                                 |
| V14 Configuration     | partial | No env var changes (D-05 delete-not-env-gate)                                                                                                              |

### Known Threat Patterns for `vitest` drift-gate

| Pattern                                                              | STRIDE                 | Standard Mitigation                                                                                                       |
| -------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Vitest reading arbitrary files via path injection                    | Tampering              | The test reads HARDCODED paths (`resolve(__dirname, '../../..', 'CLAUDE.md')` etc.). No user input is fed into the path.  |
| Repo enumeration via test (privacy / IP exposure)                    | Information Disclosure | Test runs in CI/CD against committed code only; no production data, no secrets. The grep target is `*.ts` / `*.tsx`.      |
| Test failure message leaking sensitive content                       | Information Disclosure | Assertion failure messages cite the key name + the file path; never the full file contents. Verified in Pattern 1 sketch. |
| Race between test reading `LLMCachePayload` and post-D-12 code state | n/a                    | The D-12 commit is atomic; tests are updated in the same commit. No partial-state window.                                 |

## Sources

### Primary (HIGH confidence)

- `/Users/zackmaz/Desktop/otg-iran-monitor/CLAUDE.md` §"Serverless Cache (Phase 13)" (lines 107-140) — current 22-entry registry
- `/Users/zackmaz/Desktop/otg-iran-monitor/.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-CONTEXT.md` — user decisions verbatim
- `/Users/zackmaz/Desktop/otg-iran-monitor/.planning/REQUIREMENTS.md` — normative acceptance text for DOCS-INT-02, DOCS-INT-03, REDIS-OPT-01..04, SIMPLIFY-02, SIMPLIFY-05, SIMPLIFY-07
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmEventExtractor.v3.ts` (read lines 1-150, 240-280, 435-480, 595-625) — all partial-key references confirmed
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmLineage.ts` (full read) — the 3 missing-from-CLAUDE.md keys defined here
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/pipelineAudit.ts` (full read) — 4th missing key + writer/reader pair
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmExtractionPipeline.ts` (read lines 75-200) — registry shape + partial-key comments
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmCircuitBreaker.ts` (full read) — JSDoc audit state
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmDLQ.ts` (full read) — JSDoc audit state
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmTokenBudget.ts` (full read) — JSDoc audit state
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/llmExtractorWatchdog.ts` (full read) — JSDoc audit state
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/lib/freeClaudeRouter.ts` (read lines 1-100; export list) — D-15 callers
- `/Users/zackmaz/Desktop/otg-iran-monitor/src/__tests__/lib/colorBridge.test.ts` (full read) — D-01 vitest template (byte-identity)
- `/Users/zackmaz/Desktop/otg-iran-monitor/src/__tests__/lib/actorCatalog.test.ts` (full read) — D-01 vitest template (catalog-invariant)
- `/Users/zackmaz/Desktop/otg-iran-monitor/server/__tests__/lib/urlLiveness.schema.test.ts` (full read) — D-01 vitest template (schema-pinning)
- `/Users/zackmaz/Desktop/otg-iran-monitor/docs/architecture/llm-pipeline-reliability.md` (read lines 1-60) — D-05 markdown style template
- `/Users/zackmaz/Desktop/otg-iran-monitor/vite.config.ts` (read test config) — vitest config baseline
- `wc -c api/vercel-entry.js` returned `1779504` at 2026-05-26 16:00 PT — D-19 baseline confirmed

### Secondary (MEDIUM confidence)

- Multiple ripgrep sweeps across `server/`, `src/`, `scripts/` confirmed key references (writers + readers + scripts)
- ADR-0010 structure read (sub-block convention validated for D-22)

### Tertiary (LOW confidence)

- _None._ All claims in this research are grep-verified or read-verified against the codebase. The 7 `[ASSUMED]` items in the Assumptions Log are flagged.

## Metadata

**Confidence breakdown:**

- Standard stack: HIGH — zero new deps; existing infrastructure
- Architecture: HIGH — three in-tree templates verified for the D-01 vitest pattern
- Pitfalls: HIGH — Pitfalls 1, 2, 3, 4 surfaced by grep that CONTEXT.md scout missed
- Registry parity ground-truth: HIGH — exhaustive grep across 6 key prefix families × full codebase

**Research date:** 2026-05-26
**Valid until:** 2026-06-25 (30 days; codebase moves slowly post-Phase-34 close)

---

_Phase: 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu_
_Research authored: 2026-05-26_
