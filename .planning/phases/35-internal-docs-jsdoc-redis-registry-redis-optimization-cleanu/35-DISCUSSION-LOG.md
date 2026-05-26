# Phase 35: Internal Docs (JSDoc) + Redis Registry + Redis Optimization + Cleanup Sweep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu
**Areas discussed:** Inventory artifact shape & drift-detection; `events:llm:v3:partial` retirement path; JSDoc audit scope; Measurement protocol (Upstash budget + bundle-size delta)
**Mode:** Default (4 single-question turns per area)

---

## Phase 35 framing (pre-discussion)

ROADMAP success criteria are 8/8 already locked, so this discussion is procedural rather than scope-defining. Scout surfaced concrete inputs:

- **4 keys missing from CLAUDE.md §Serverless Cache registry** (`events:llm:v3:lineage:{eventId}`, `events:llm:v3:lineage-keys`, `events:llm:v3:group-lineage:{hash}`, `events:llm-pipeline-audit`).
- **1 key flagged for retirement** (`events:llm:v3:partial`, 7 production refs + 5 test refs).
- **`freeClaudeRouter.ts` has 8 importers** (3 production + 5 test) → NOT orphan → "keep with documented callers" path.
- **Bundle baseline** = 1,779,504 bytes (≈1.70 MB) as of 2026-05-26.
- **Phase 34 closed `cerebras-groq-deferred`** → no new Cerebras/Groq Redis keys to inventory (ROADMAP carve-out moot).
- **DOCS-INT-01 (CLAUDE.md trim) already shipped in Phase 29** — Phase 35 only verifies §Serverless Cache subsection.

Carry-forward locks (NOT re-discussed): atomic per-decision commits, branch-per-phase, cron-only writer discipline, schema-pinning contract test pattern, Vercel Pro 800s `maxDuration`, TypeScript ~5.9.3, `logger.child` Pino, Pitfall 1 cache bridge invariant, `parseEnv()` fail-fast.

---

## Area 1: Inventory artifact shape & drift-detection

### Sub-question 1a: How should the Redis registry stay in sync with code?

| Option                                 | Description                                                                                                                                                                                                                                                                               | Selected |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Test-enforced registry parity          | `src/__tests__/lib/redis-registry.test.ts` parses CLAUDE.md + `redis-keys.md`, greps codebase, asserts every documented key has ≥1 writer + ≥1 reader and every grepped key is documented. Drift fails next `vitest run`. Matches Phase 32 D-22 / Phase 33 D-07 schema-pinning precedent. | ✓        |
| Hand-maintained + reviewer discipline  | Phase 35 lands the artifact + the trim. Future phases update the registry as part of their PR template (manual). No test. Lower friction now, but rot risk: this is exactly the problem Phase 35 exists to fix.                                                                           |          |
| Generated artifact + light commit hook | A `scripts/generate-redis-registry.ts` greps the codebase, builds the table, writes `docs/architecture/redis-keys.md`. CLAUDE.md links to it. Husky hook runs the script pre-commit; `git diff` flags drift. Heavier ergonomic but auto-syncs.                                            |          |

**User's choice:** Test-enforced registry parity (Recommended)
**Notes:** Selected from option preview. Rationale: the hand-maintained option produced the exact 4 missing keys that triggered this phase — same mechanism would rot again. The generator option introduces a tool that itself can rot. The test is the simplest "fails loudly" mechanism aligned with existing schema-pinning precedent.

---

### Sub-question 1b: Where does the human-readable inventory artifact live, and what columns does it carry?

| Option                                                    | Description                                                                                                                                                                                                                                                                  | Selected |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Separate `docs/architecture/redis-keys.md` — full table   | Per ROADMAP success criterion #2. CLAUDE.md keeps 1-line-per-key skim; new file carries full deep-dive table. Columns: key, writers (file:line), readers (file:line), TTL, value shape, business purpose, cardinality estimate, classification. Vitest parses both surfaces. | ✓        |
| Embed full table inside CLAUDE.md                         | Folds deep-dive into existing CLAUDE.md §Serverless Cache. Single source. Drawback: undoes part of Phase 29's 73% trim — table bloat costs token budget every Claude session.                                                                                                |          |
| Minimal table — columns dictated by what the vitest reads | Keep artifact lean: only key + writers + readers + classification (4 columns). TTL/shape/purpose/cardinality stay in source-code JSDoc next to the constant. Less drift surface but less operator-readable.                                                                  |          |

**User's choice:** Separate `docs/architecture/redis-keys.md` — full table (Recommended)
**Notes:** Preserves Phase 29 trim discipline. Two surfaces (CLAUDE.md skim + deep-dive table) get cross-validated by the D-01 vitest.

---

## Area 2: `events:llm:v3:partial` retirement path (SIMPLIFY-02)

### Sub-question 2: How should `events:llm:v3:partial` be retired?

| Option                                                     | Description                                                                                                                                                                                                                          | Selected |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Delete entirely                                            | Remove writer at `:475`, constant + export at `:122-123`, drop two-key-discipline assertions in 3 test files, remove CLAUDE.md entry. Production cleanup: natural TTL expiry. Matches ROADMAP success criterion #6 "preferred" path. | ✓        |
| Env-gate behind `LLM_PARTIAL_OBSERVABILITY=true`           | Wrap writer in `if (process.env.LLM_PARTIAL_OBSERVABILITY === 'true')`. Default off in prod; operators can re-enable. Keeps code path; documents env var; tests need `vi.stubEnv` flip.                                              |          |
| Hybrid — delete writer, keep constant export for forensics | Remove writer + production code path but keep `EVENTS_LLM_V3_PARTIAL_KEY` exported so future post-incident scripts can target it by name.                                                                                            |          |

**User's choice:** Delete entirely (Recommended)
**Notes:** User initially requested clarification on the question — after presenting framing again, user selected "yes go with your recommended." Rationale: env-gating leaves dead-code-on-a-switch (worse than just deleting); the partial-key was Hobby-era 300s-budget mitigation that Pro 800s makes unnecessary.

---

## Area 3: JSDoc audit scope (DOCS-INT-02)

### Sub-question 3: How deep should the JSDoc audit go?

| Option                                               | Description                                                                                                                                                                                                                                                                                                          | Selected |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Tight scope — public-API one-liners only             | Honors success criterion #5 verbatim. Each exported function/class/type gets a single accurate JSDoc line. Top-of-file blocks left untouched even if they cite retired phase numbers — those are historical waymarkers, valuable in their own right. Fast, surgical, minimal diff. ~30-50 one-liners across 7 files. | ✓        |
| Public-API + refresh stale top-of-file blocks        | Same one-line audit on public APIs, plus rewrite top-of-file blocks so they describe what the module does TODAY (no retired-phase citations except as bottom-of-block 'history' lines). Larger diff, larger surface for review.                                                                                      |          |
| Audit-only — produce stale-JSDoc report, no rewrites | Produce a phase artifact flagging stale-but-tolerable comments. No code changes. Doesn't satisfy success criterion #5 — effectively kicks the can.                                                                                                                                                                   |          |

**User's choice:** Tight scope — public-API one-liners only (Recommended)
**Notes:** Top-of-file blocks left intact as historical waymarkers. Edge case: the partial-key reference at `llmEventExtractor.v3.ts:13-14` becomes false-by-construction after SIMPLIFY-02 lands — planner handles that in the same atomic commit (D-11).

---

## Area 4: Measurement protocol (REDIS-OPT-04 + SIMPLIFY-07)

### Sub-question 4: How should the Upstash command-budget pre/post delta (REDIS-OPT-04) be captured? (bundle-size delta = trivial `wc -c`; not asking about that part)

| Option                                                           | Description                                                                                                                                                                                                                                                                                                    | Selected |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Manual Upstash dashboard screenshot — baseline + close           | Operator captures Upstash dashboard "Commands" metric at phase start (committed as `redis-budget-baseline-YYYY-MM-DD.png`) and at phase close (`redis-budget-close-YYYY-MM-DD.png`). Delta + percentage + primary driver in SUMMARY.md + ADR-0010. Lowest implementation cost; honest about what's measurable. | ✓        |
| Committed `scripts/measure-redis-budget.ts` — self-instrumenting | Script monkey-patches `redis` to count cmd calls during a window. More precise; significantly more work; risks production interference if not removed.                                                                                                                                                         |          |
| Skip absolute measurement — document the driver, not the delta   | Acknowledge Upstash REST API doesn't expose commandstats. ADR-0010 + SUMMARY.md document drivers of expected reduction without claiming a measured delta. Fails success criterion #4 strictly read.                                                                                                            |          |

**User's choice:** Manual Upstash dashboard screenshot — baseline + close (Recommended)
**Notes:** Bundle-size delta handled via `wc -c api/vercel-entry.js` per D-19. Both pre/post measurements land in SUMMARY.md + ADR-0010 Phase 35 sub-block per D-22.

---

## Pre-discovered facts (resolved without explicit question)

- **SIMPLIFY-05** (`freeClaudeRouter.ts` audit): scout showed 8 importers → NOT orphan → keep with documented top-of-file callers block (per success criterion #7). Documented as D-15 / D-16 in CONTEXT.md.
- **Missing keys to register**: 4 keys flagged automatically by D-01 vitest on first run. Captured as D-14 in CONTEXT.md.
- **Phase 34 close `cerebras-groq-deferred`**: no Cerebras/Groq token-budget keys exist. ROADMAP carve-out moot. Inventory records "absent (Phase 34 deferred)" for those slots.

---

## Claude's Discretion

Captured in CONTEXT.md §Decisions §Claude's Discretion:

- Vitest's markdown-parsing approach (regex vs fenced-block) — recommended regex on backticked-key strings.
- Codebase-scan file extensions for the vitest — recommended `.ts` + `.tsx` + explicit allow-list of `.md` doc files.
- Inventory table grouping (prefix family vs classification) — recommended prefix family.
- `freeClaudeRouter.ts` callers block placement (above vs replacing existing header) — recommended prepend.
- JSDoc commit granularity (per module vs per public-API) — recommended per module (7 commits).
- Upstash screenshot format (PNG vs markdown transcription) — recommended PNG.
- Whether vitest enforces TTL-string consistency — recommended NOT in Phase 35 (out of scope).
- Whether the 6-plan structure under D-25 collapses or expands — recommended planner decides based on research findings.

---

## Deferred Ideas

Captured in CONTEXT.md §Deferred:

- **Phase 36 prep**: README provider count update, Mermaid cascade diagram, runbook cross-reference to `redis-keys.md`, OpenAPI continuity.
- **Phase 37 prep**: 3× consecutive `prod-connectivity-audit.yml` exit-0 acceptance gate.
- **Future phases**: TTL-string consistency vitest, generated `redis-keys.md` script, continuous Upstash command-budget telemetry, continuous bundle-size CI gate, JSDoc top-of-file block refresh phase, hit/miss telemetry instrumentation, per-host throttle inventory.
- **Within Phase 35 conditional**: Replay-history key cap (if discovered uncapped during D-18 review).

---

_End of discussion log._
