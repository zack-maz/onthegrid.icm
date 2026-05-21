# Phase 33: Actor Metadata Audit, Canonical Catalog & Eval Expansion - Context

**Gathered:** 2026-05-21
**Status:** Ready for planning
**Mode:** --auto (recommended-default selections; auto-advanced to plan-phase)

<domain>
## Phase Boundary

Make actor metadata in `events:llm:v3` operator-trustworthy via four mechanical changes that ship as one atomic phase:

1. **One-time audit** of the live `events:llm:v3` snapshot quantifies actor-failure buckets (null/empty, raw CAMEO code, ambiguous generic, source-disagreement) with representative examples per bucket. Report committed as a phase artifact.
2. **Canonical actor catalog** at `server/data/actor-catalog.ts` ships with the Iran-conflict-relevant actors (IDF / IRGC / USMIL / Hezbollah / Houthis / Hamas / Kataib Hezbollah / etc.) mapped alias → canonical. Contract test pins no-duplicate / no-orphan invariants.
3. **v3 extractor integration** — server-side post-mapping walks each event's `actors[]` through the catalog at extract time. A new `actorConfidence` field (parallel array, enum `'high' | 'medium' | 'low'`) joins `enrichedEventV3` forward-compat (cache key stays `events:llm:v3`).
4. **Eval + dashboard surfacing** — `runEval()` is extended with actor-match scoring against `expectedActor1` / `expectedActor2` on the ground-truth fixtures (resolver-only constraint preserved by scoring the LIVE `events:llm:v3` snapshot, not by re-extracting via LLM); 3 actor-confusion adversarial injections added; `/api/operator-status` gains an `actorQuality` block surfaced inside the existing 28.2 W5 D-23 quality-metrics block on the API Health tab.

**Requirements covered:** ACTOR-01, ACTOR-02, ACTOR-03, ACTOR-04, ACTOR-05.

**Out of scope (deferred elsewhere):**

- **Retroactive re-extraction of `events:llm:v3` entries through the new catalog.** D-18 is forward-only — the daily 04:00 UTC cron overwrites entries naturally within 24h. No migration script, no special writer path (preserves anti-pattern #17).
- **LLM-driven source-disagreement detection (ACTOR-01 bucket d).** Deterministic auto-detection covers buckets a/b/c; bucket d is reserved for human spot-check in the audit report — running a second LLM pass against the live cache just for audit classification is not budgeted.
- **Sub-faction breakdown beyond `us | iran | neutral`.** Catalog reuses the existing 3-way `Faction` enum from `src/lib/factions.ts`; finer-grained alliance modeling (e.g. "axis of resistance" sub-clusters) is a separate phase.
- **`actorConfidence` retroactive backfill on existing v3 entries.** Forward-compat default fills missing values with `'low'` server-side; existing cache entries roll over via the daily cron within 24h.
- **CAMEO codebook loaded at runtime.** Audit's bucket-b detection uses a static committed reference list (e.g. `.planning/phases/33-*/cameo-codes.txt`); not a runtime dependency.
- **New Redis sidecars for actor-quality counters.** Counters computed lazily inside `/api/operator-status` over the already-loaded `events:llm:v3` array (D-16). Matches Phase 32 D-13 smallest-blast-radius principle.
- **Per-actor object shape (`{actor, confidence}`) on the schema.** D-10 picks index-locked parallel arrays for shape simplicity; converting to per-actor object is a future migration if a new field demands it.

**Carrying forward (locked, not re-decided here):**

- **Cron-only writers (anti-pattern #17).** All writes to `events:llm:v3` happen inside `/api/cron/refresh-events`. `/api/events` stays read-only. Catalog-integration changes ship inside `llmEventExtractor.v3.ts` post-validate.
- **TypeScript ~5.9.3 pinned.** `logger.child({ module: 'actor-catalog' })` for new code; never `console.*`.
- **Zod schema discipline.** `actorConfidence` ships as a Zod enum extension to `enrichedEventV3`; the JSON Schema `EVENT_EXTRACTION_SCHEMA_V3` is updated alongside.
- **Static-data pattern.** `server/data/actor-catalog.ts` mirrors `src/lib/factions.ts` / `src/lib/ethnicGroups.ts` (typed module, no Redis, no env tunables, no runtime config).
- **Atomic per-decision commits.** Each D-N below is its own commit. `feat(33):` / `docs(33):` / `chore(33):` / `test(33):` prefixes.
- **Branch-per-phase from `main`.** Planner / executor cuts `feature/33-actor-metadata-audit-canonical-catalog-eval-expansion` from `main` before any code change. CONTEXT.md, DISCUSSION-LOG.md, and the checkpoint may sit on the current branch as scaffold.
- **Vercel Pro 800s `maxDuration`** is live (Phase 29 D-08). Extractor with catalog integration runs inside the existing daily cron budget; no operational impact expected.
- **Discriminated-union cache-read safety.** `enrichedEventAny` Zod union admits v3 payloads with or without `actorConfidence` during the forward-compat rollout window.

</domain>

<decisions>
## Implementation Decisions

### Audit methodology (ACTOR-01)

- **D-01:** Audit runs as a one-shot script in `.planning/phases/33-*/audit/` (not under `npm test` or CI). Reads the live `events:llm:v3` cache via either the existing operator-status drill-down or a direct Redis SCAN snapshot. Output committed as `.planning/phases/33-*/33-AUDIT-REPORT.md`. Matches Phase 31's `watch:snapshot` style — audit is one-time, not continuous.
- **D-02:** Failure-bucket detection rules are **deterministic for 3 of 4 buckets**:
  - **(a) null/empty:** `actors == null || actors.length === 0 || actors.every(a => a.trim().length === 0)`.
  - **(b) raw CAMEO code:** any actor string matching `/^[A-Z]{3,5}$/` AND present in a committed CAMEO actor codebook (`.planning/phases/33-*/cameo-codes.txt` or similar phase-local reference).
  - **(c) ambiguous generic:** actor string matches a static deny-list (case-insensitive): `['soldiers', 'forces', 'militants', 'troops', 'fighters', 'the army', 'gunmen', 'attackers', 'rebels', 'insurgents', 'militia']`. Curated, not LLM-derived.
  - **(d) source-disagreement:** **NOT auto-detected.** Reserved for human spot-check rubric in the audit report. Running a second LLM pass against live cache just to classify mismatches is not budgeted for this phase.
- **D-03:** Audit output shape (`33-AUDIT-REPORT.md`):
  - Per-bucket count + percentage against total live event count.
  - 5-10 representative examples per bucket (eventId, actors, sourceUrl).
  - Bucket-d ("source-disagreement") section seeded with 10 spot-check candidates picked at random from buckets a/b/c overlap — operator marks them manually with `[✓ disagrees]` / `[✗ matches source]` annotations.
  - Findings feed into D-04's catalog seeding and D-15's adversarial injection design.

### Catalog data model + seeding (ACTOR-02)

- **D-04:** Catalog lives at `server/data/actor-catalog.ts` (path matches REQUIREMENTS.md ACTOR-02 verbatim). Static TypeScript module — no Redis read, no env tunable, no runtime config. Pattern mirrors `src/lib/factions.ts` and `src/lib/ethnicGroups.ts`.
- **D-05:** Catalog shape:
  ```ts
  export interface CanonicalActor {
    canonicalName: string;        // e.g. "Israeli Defense Forces"
    aliases: string[];            // lowercase: ["idf", "israel defense forces", ...]
    cameoCodes: string[];         // e.g. ["ISRMIL", "MIL"]
    affiliation: Faction;         // reuses src/lib/factions.ts: 'us' | 'iran' | 'neutral'
  }
  export const ACTOR_CATALOG: ReadonlyArray<CanonicalActor> = [...];
  /** Build at module load: Map<aliasOrCanonical (lowercase), CanonicalActor>. */
  export const ACTOR_LOOKUP: ReadonlyMap<string, CanonicalActor>;
  export function canonicalize(name: string): CanonicalActor | null;
  ```
- **D-06:** Geographic scope = Iran-conflict-relevant actors only. Seed set driven by ACTOR-01 audit findings, with a starting baseline of ~30-50 entries covering: IDF, IRGC (+ IRGC Quds Force, IRGC Aerospace Force), Iranian Armed Forces, US Armed Forces (+ USCENTCOM, US Navy, US Air Force, US Army), Hezbollah, Houthis (Ansar Allah), Hamas, Palestinian Islamic Jihad, Kataib Hezbollah, Asaib Ahl al-Haq, Harakat Hezbollah al-Nujaba, Popular Mobilization Forces, Syrian Arab Army, Russian Aerospace Forces, Royal Saudi Air Force, Saudi-led Coalition, Turkish Armed Forces, Kurdish forces (SDF / Peshmerga / PKK). Out-of-scope actors fall through unchanged. Final list locked during executor pass against the audit report.
- **D-07:** Contract test at `src/__tests__/lib/actorCatalog.test.ts` asserts: (a) no duplicate canonical names, (b) every entry's `cameoCodes[]` matches the committed CAMEO codebook (no orphan codes), (c) every alias resolves to exactly one canonical entry (`ACTOR_LOOKUP` build raises if duplicate alias detected), (d) `canonicalize()` is case-insensitive, (e) `canonicalize('UNKNOWN_ALIAS')` returns `null`. Mirrors Phase 32 D-22 schema-pinning pattern + the `colorBridge.test.ts` byte-identity-sentinel pattern.

### Canonicalization integration point (ACTOR-03)

- **D-08:** **Server-side post-mapping** is the canonicalization point. Inside `llmEventExtractor.v3.ts`, after the Zod-validated batch response is parsed and before the v3 entries are written to `events:llm:v3`, walk each event's `actors: string[]` through `canonicalize(name)`. Matched aliases get replaced by their `canonicalName`; unmatched actors pass through unchanged. Rationale: deterministic + auditable. The LLM's compliance with a prompt instruction is non-binding; the catalog is the single source of truth.
- **D-09:** **Prompt updated with a best-effort hint.** `llmEventExtractor.v3.ts` SYSTEM_PROMPT line 143 ("9. actors: array of actor names involved") is extended with: "Prefer canonical full names (e.g., 'Islamic Revolutionary Guard Corps' over 'IRGC' or 'Iranian forces'). Server-side mapping handles known variants." Not the enforcement point; D-08 is.
- **D-10:** **`actorConfidence` shape = parallel array, index-locked to `actors[]`.**
  ```ts
  actorConfidence: z.array(z.enum(['high', 'medium', 'low']))
    .superRefine((arr, ctx) => { /* asserts arr.length === actors.length */ })
  ```
  Forward-compat default: if the LLM omits `actorConfidence` or returns the wrong length, the extractor fills/repairs with `'low'` for every entry server-side before write. Project pattern (cf. `aliases: string[]`) prefers flat arrays over per-actor objects.
- **D-11:** **Cache key stays `events:llm:v3`** (no bump to v3.1). Field is additive + forward-compat:
  - LLM payloads that omit it are repaired server-side with `'low'` defaults (D-10).
  - Readers that don't consume `actorConfidence` (events.ts route, frontend) ignore the extra field via Zod's `.strict()` preserved through `.extend()` — note: schema must explicitly allow the extra field at the schema level since v3 is strict.
  - **Caveat for planner:** verify in research whether `enrichedEventV3.extend({ actorConfidence })` keeps strict() correctly admitting the new field for existing-no-actorConfidence v3 payloads in cache during the rollout window. If strict() rejects existing entries, fall back to making `actorConfidence` optional (`z.array(...).optional()`) for the rollout window and tighten in a follow-up cleanup phase.
- **D-12:** **Schema canonical definition lives in `server/lib/llmSchema.ts`** (extends `enrichedEventV3`). `EVENT_EXTRACTION_SCHEMA_V3` JSON Schema (the LLM wire contract) gains the new field — `actorConfidence: { type: 'array', items: { type: 'string', enum: ['high', 'medium', 'low'] } }`.

### Eval harness extension (ACTOR-04)

- **D-13:** **Eval scores the LIVE `events:llm:v3` cache** against ground-truth `expectedActor1` / `expectedActor2`. The resolver-only constraint (Phase 27.4 D-25 — eval does NOT call the LLM) is preserved by sourcing actor predictions from the cached extraction result, NOT by re-extracting per eval run. Match rule:
  - Find the live event whose `groupKey` (or other stable join key) matches the ground-truth event `id`. If no live event exists, count as a miss for actor scoring (consistent with resolver miss semantics).
  - Live `actors[]` must contain case-insensitive substring of `expectedActor1` AND (if `expectedActor2 !== null`) of `expectedActor2`. Canonical match preferred; alias match acceptable.
  - Score: `actorMatchRate = matchedEvents / totalGroundTruthEventsWithExpectedActors`.
  - Output: `evalScore.actorMatchRate` field on the `runEval()` return shape, mirrored on `events:llm-eval-baseline:v3`.
- **D-14:** **Ground-truth fixture extension** — `.planning/eval/ground-truth-events.json` events gain optional `expectedActor1: string | null` and `expectedActor2: string | null`. Null = "no actor expectation for this event" (eval skips actor scoring for that entry). Backfill: ACTOR-01 audit findings drive the seed values; target ≥30 of 50 events backfilled at phase close. Fixture schema bump tracked in the committed `version` field — version stays at `1` if additive-optional; bump to `2` only if a breaking change is necessary.
- **D-15:** **Adversarial injection set (ACTOR-04 deliverable)** — 3 actor-confusion injections appended to `.planning/eval/adversarial-injections.json`:
  - **Side-swap:** Prompt designed to confuse `actor1` ↔ `actor2` (e.g., a news headline phrased so the attacker is named after the victim).
  - **Ambiguity injection:** Source mentions only "the forces" or "the troops" — eval expects `actorConfidence` to mark `'low'` for any extracted entry.
  - **Code-as-actor injection:** Source carries a raw CAMEO code (e.g., `USMIL`, `IRNMIL`) in the actor field — eval expects post-mapping to expand to canonical (e.g., "United States Military"). Adversarial set stays under 10 total entries (fits the existing fixture budget).

### Dashboard surfacing (ACTOR-05)

- **D-16:** **Counter location = `/api/operator-status` response gains a top-level `actorQuality` block** alongside the existing `prune` and audit-log blocks. Shape:
  ```ts
  actorQuality: {
    totalEvents: number;
    nullActors: number;          // bucket (a) from D-02
    rawCameoActors: number;      // bucket (b) from D-02
    ambiguousActors: number;     // bucket (c) from D-02
    lowConfidenceActors: number; // count where any actor entry has actorConfidence='low'
    sample: Array<{
      eventId: string;
      actors: string[];
      actorConfidence: ('high' | 'medium' | 'low')[];
      issue: 'null' | 'raw-cameo' | 'ambiguous' | 'low-confidence';
    }>;
  }
  ```
  Computed lazily on each `/api/operator-status` call by scanning the already-deserialized `events:llm:v3` payload. **No new Redis sidecar** (matches Phase 32 D-13 smallest-blast-radius). `sample` capped at 20 entries (matches `LIMIT_DRILL_DOWN` from `operator-status.ts:50`).
- **D-17:** **Dashboard render** — `src/components/ui/DevApiStatus.tsx` adds an "Actor Quality" sub-block inside the existing 28.2 W5 D-23 quality-metrics block (rendered as a row alongside Operator Actions, ~line 1481). Layout: `Null: X · Raw-CAMEO: Y · Ambiguous: Z · Low-confidence: W`. Drill-down list reuses the same expandable row pattern as the prune block (Phase 32 D-10). No new aggregator endpoint; reuses the existing `/api/operator-status` poll loop.

### Backfill strategy (cross-cutting)

- **D-18:** **Forward-only canonicalization.** Existing `events:llm:v3` entries are NOT re-extracted to add `actorConfidence` or apply the catalog retroactively. The daily 04:00 UTC `/api/cron/refresh-events` cron overwrites entries naturally over the 24h window. Operator can force a full refresh via `GET /api/cron/refresh-events?force=true` (existing operator surface) immediately after deploy if needed. Preserves anti-pattern #17 (cron-only writer); no special migration script writing to `events:llm:v3`.

### Branch + commit discipline (locked from prior phases)

- **D-19:** Branch `feature/33-actor-metadata-audit-canonical-catalog-eval-expansion` cut from `main` before any code change. CONTEXT.md, DISCUSSION-LOG.md, and the discuss-phase checkpoint may sit on the current branch as scaffold.
- **D-20:** Atomic per-decision commits with `feat(33):` / `docs(33):` / `chore(33):` / `test(33):` prefixes. ~20 D-N decisions → roughly 20 commits + close PR.

### Claude's Discretion

- **Audit script execution surface.** Whether the audit script is a standalone Node script (`node .planning/phases/33-*/audit/run-audit.ts` via tsx) or a vitest with `describe.skip` that's manually flipped — researcher picks based on what's simplest to commit alongside the report.
- **CAMEO codebook source.** The committed reference list at `.planning/phases/33-*/cameo-codes.txt` (or `.json`) — researcher picks the format (txt vs structured JSON) and whether to source from GDELT's published codebook URL (with a committed snapshot) or from the existing internal CAMEO references already in `server/adapters/gdelt.ts` constants.
- **Canonicalize() ordering when multiple aliases match.** Edge case: an actor string that matches both alias "idf" and alias "israel" (if both exist). Researcher picks deterministic ordering — recommended: longest-alias-wins to avoid generic-name shadowing.
- **`expectedActor1` / `expectedActor2` precedence when ground-truth event has both.** Whether eval requires both to be matched (AND) or either (OR) — D-13 picks AND; researcher reviews against the audit findings during ground-truth backfill and may relax to OR for events where attribution is genuinely ambiguous in the source.
- **JSON Schema rendering of `actorConfidence` for the LLM wire contract.** Whether to mark it required at the wire level (gives the LLM a forcing function) or optional (relies on server-side repair). Recommended: required at wire level with server-side repair as defense-in-depth, but researcher can pick optional if NIM rejects required-array-of-enums under its relaxed JSON-Schema enforcement.
- **Catalog → faction integration.** Whether the `affiliation` field on `CanonicalActor` is used in this phase (e.g., surfaced in the dashboard sample) or just reserved for future use. Recommended: store it, don't surface it yet.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap + requirements

- `.planning/ROADMAP.md` §"Phase 33: Actor Metadata Audit, Canonical Catalog & Eval Expansion" — goal, depends-on, success criteria
- `.planning/REQUIREMENTS.md` §"Event Metadata Accuracy" — ACTOR-01..05 normative requirement text

### LLM extraction pipeline (load-bearing for D-08..D-12)

- `server/lib/llmEventExtractor.v3.ts` — v3 extractor; SYSTEM_PROMPT line 143 actor instruction (D-09 extension); post-validate hook is where D-08 catalog mapping is applied
- `server/lib/llmSchema.ts` — `enrichedEventV3` Zod schema (D-10 `actorConfidence` extension); `EVENT_EXTRACTION_SCHEMA_V3` JSON Schema (D-12 wire contract); `enrichedEventAny` discriminated union (forward-compat rollout)
- `server/lib/llmExtractionPipeline.ts` — `runRefreshExtraction()` + `enrichedV3ToEntities()` (the writer path D-08 lands inside)
- `server/adapters/gdelt.ts:241-247` — raw GDELT `actor1`, `actor2`, `cameoCode` fields; reference for D-02 bucket-b regex + codebook validation
- `CLAUDE.md` §"LLM Event Pipeline" — anti-pattern #17 (cron-only writer; never re-introduce fire-and-forget); D-08/D-18 enforced by this contract

### Static-data + catalog patterns (load-bearing for D-04..D-07)

- `src/lib/factions.ts` — pattern template: typed module, alias→canonical Map, Faction enum reused by D-05's `affiliation`
- `src/lib/ethnicGroups.ts` — sibling static-data module; same pattern (typed const, exported lookup)
- `server/__tests__/lib/freeClaudeRouter.test.ts` — schema-pinning contract test pattern (template for D-07)
- `src/__tests__/lib/colorBridge.test.ts` — byte-identity sentinel pattern (template for D-07's catalog invariants)

### Eval harness (load-bearing for D-13..D-15)

- `server/lib/llmEvalHarness.ts` — `runEval()` resolver-only design (Phase 27.4 D-25); D-13 extends without violating the resolver-only constraint
- `.planning/eval/ground-truth-events.json` — fixture; D-14 extends with `expectedActor1` / `expectedActor2`
- `.planning/eval/adversarial-injections.json` — fixture; D-15 appends 3 actor-confusion injections
- `server/lib/llmProgress.ts` — `LLMRunSummary` shape; D-13 mirrors `actorMatchRate` field here

### Dashboard surface (load-bearing for D-16..D-17)

- `server/routes/operator-status.ts:1-80` — aggregator pattern; D-16 adds `actorQuality` block following existing `prune` block shape
- `src/components/ui/DevApiStatus.tsx:1475-1540` — Operator Actions block + quality-metrics block from Phase 28.2 W5 D-23; D-17 mounts the actor sub-block here
- `server/routes/health.ts:182` — `probeCronTick` reader pattern; reference for how aggregator route consumes Redis state

### Operator action pattern (precedent, not directly extended)

- `.planning/phases/32-ghost-event-url-liveness-dashboard-prune/32-CONTEXT.md` — atomic-per-decision commit discipline + smallest-blast-radius philosophy that D-13/D-16 inherit
- `server/middleware/dashboardAuth.ts` — Bearer-gate middleware (NOT extended in Phase 33; `/api/operator-status` already gated)

### Architecture history (context, not load-bearing)

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — D-08 Vercel Pro 800s `maxDuration` decision (governs extractor budget)
- `.planning/phases/31-cron-stability-validation-7-day-watch/31-CONTEXT.md` — cron-tick discipline; snapshot harness pattern (template for D-01 audit-script style)
- `docs/architecture/llm-pipeline-reliability.md` — tuned defaults reference; Phase 33 adds the actor-quality dimension to the same observability surface
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — broader v1.5 narrative; Phase 33 sits inside the Event Metadata Accuracy track (independent of the LLM-RELI track)
- `docs/runbook.md` — operator playbook; actor-quality drill-down workflow likely earns a paragraph in Phase 35's docs sweep

### CAMEO reference (audit-only; not load-bearing in production code)

- `server/adapters/gdelt.ts` constants — existing internal CAMEO references; potential source for D-02 codebook seeding (researcher's call)
- External: GDELT CAMEO codebook (committed snapshot at `.planning/phases/33-*/cameo-codes.{txt,json}` per D-02 / Claude's Discretion above)

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`src/lib/factions.ts`** — static-data + alias-lookup template for D-04 / D-05. `Faction` enum (`'us' | 'iran' | 'neutral'`) reused as `CanonicalActor.affiliation` (D-05).
- **`src/lib/ethnicGroups.ts`** — second static-data sibling, confirms the pattern; no behavioral difference vs factions.ts.
- **`server/lib/llmEventExtractor.v3.ts` post-validate site** — already walks each parsed batch response before write; D-08 adds the `actors[]` canonicalization step at the same site (likely line 246 ish, after `enrichedEventV3.parse`).
- **`server/lib/llmSchema.ts` `enrichedEventV3.extend(...)`** — Zod schema extension pattern; D-10 / D-11 use this directly. Note: v2 was extended to v3 with just `schemaVersion: z.literal('v3')` — the extension mechanic is already proven.
- **`server/lib/llmEvalHarness.ts` `runEval()`** — already returns a typed score; D-13 adds the `actorMatchRate` dimension. The resolver-only design (Phase 27.4 D-25) is preserved.
- **`server/routes/operator-status.ts` aggregator** — already scans `events:llm:v3` for the prune drill-down (D-16 piggybacks on the same scan rather than adding a separate one).
- **`DevApiStatus.tsx` Operator Actions block** — render template for D-17's actor-quality sub-block. Reuses the same expandable-drill-down + count-row pattern.

### Established Patterns

- **Static-data pattern.** Catalog ships as `server/data/actor-catalog.ts` — typed const, exported lookup, no Redis, no env tunables. Matches factions.ts / ethnicGroups.ts.
- **Discriminated-union forward-compat.** `enrichedEventAny` already handles v1/v2/v3 coexistence; D-11 extends v3 additively without bumping cache key.
- **Atomic per-decision commits.** Each D-N lands as its own commit (`feat(33):` / `docs(33):` / `chore(33):` / `test(33):`). 20 decisions → roughly 20 commits + close PR.
- **Branch-per-phase from `main`.** `feature/33-actor-metadata-audit-canonical-catalog-eval-expansion`. CONTEXT.md may sit on current branch; code work must branch first.
- **Schema-pinning contract test.** D-07 mirrors `freeClaudeRouter.test.ts` + `colorBridge.test.ts` — invariants asserted at test time fail loudly on drift.
- **Cron-only writers (anti-pattern #17).** D-18 forward-only backfill — no migration script touches `events:llm:v3` directly; the daily cron rolls entries forward naturally.
- **Lazy computation over sidecars.** D-16 computes actor-quality counters inline during `/api/operator-status` rather than maintaining a separate Redis sidecar. Matches Phase 32 D-13.

### Integration Points

- **`server/data/actor-catalog.ts` (NEW)** — exports `ACTOR_CATALOG`, `ACTOR_LOOKUP`, `canonicalize(name)`. Imported by:
  - `server/lib/llmEventExtractor.v3.ts` for D-08 server-side mapping.
  - `src/__tests__/lib/actorCatalog.test.ts` for D-07 contract assertions.
  - Potentially `server/routes/operator-status.ts` for D-16 bucket classification (or duplicated detection rules — researcher's call).
- **`server/lib/llmSchema.ts`** — `enrichedEventV3` gains `actorConfidence`; `EVENT_EXTRACTION_SCHEMA_V3` gains the wire-contract field.
- **`server/lib/llmEventExtractor.v3.ts`** — post-validate site gains the catalog-mapping step (D-08); SYSTEM_PROMPT line 143 extended (D-09); `actorConfidence` repair logic added pre-write (D-10).
- **`server/lib/llmEvalHarness.ts` `runEval()`** — return shape extended with `actorMatchRate`; loop adds actor-match scoring against `expectedActor1` / `expectedActor2` from ground truth.
- **`.planning/eval/ground-truth-events.json`** — fixture gains optional `expectedActor{1,2}` per event.
- **`.planning/eval/adversarial-injections.json`** — fixture gains 3 actor-confusion entries.
- **`server/routes/operator-status.ts` `/api/operator-status` response** — gains `actorQuality` top-level block alongside existing `prune` and audit-log blocks.
- **`src/components/ui/DevApiStatus.tsx`** — gains actor-quality sub-block inside the existing quality-metrics block (~line 1481).
- **`.planning/phases/33-*/33-AUDIT-REPORT.md` (NEW)** — phase artifact; committed but never imported. Drives ACTOR-02 catalog seeding and ACTOR-04 ground-truth backfill via human review.

</code_context>

<specifics>
## Specific Ideas

- **"Catalog as single source of truth."** The deliberate choice in D-08 to canonicalize server-side (not via the prompt) mirrors the Phase 28.1 D-13 colorBridge philosophy: a single static module defines the canonical labels, runtime walks all candidate inputs through it. Avoids LLM-compliance variance.
- **"Forward-only on backfill."** D-18 explicitly rejects a migration script in favor of letting the daily cron roll entries forward within 24h. Preserves anti-pattern #17 and keeps Phase 33 a structural-improvement phase, not a data-migration phase.
- **"Eval extension stays resolver-only."** D-13 scores actor predictions from the LIVE cache, NOT by re-extracting per eval run. This is a deliberate design constraint — Phase 27.4 D-25 budgeted eval to be cheap; running full extraction in eval would 100x the cost. The compromise is that actor-quality eval requires a recent cron run to have populated the cache (acceptable; the cron runs daily).
- **"Bucket-d (source-disagreement) reserved for human spot-check."** D-02 explicitly does NOT auto-detect this bucket in the audit. The cost of a second LLM pass to compare extracted actors to source text against the live cache is not worth the audit's signal-to-noise — operator spot-check on 10 candidates from buckets a/b/c overlap is the cheaper path.
- **"Three adversarial injections, one per failure mode."** D-15's count (3) is deliberately small: each injection targets a distinct ACTOR-01 bucket (side-swap = bucket-d, ambiguity = bucket-c, code-as-actor = bucket-b). Larger fixture sets add noise without adding signal.

</specifics>

<deferred>
## Deferred Ideas

- **LLM-driven source-disagreement detection (ACTOR-01 bucket d).** Auto-detecting events where the extracted actor disagrees with the source URL requires a second LLM pass over the live cache. Defer until a future phase budgets it explicitly; spot-check covers the immediate audit need.
- **Sub-faction breakdown.** Catalog `affiliation` uses the existing 3-way `Faction` enum. Finer-grained alliance modeling (e.g. "axis of resistance" sub-clusters, Iranian-aligned militias by country, etc.) is a separate phase if the operator surface ever demands it.
- **Catalog editing via dashboard / operator endpoint.** D-04 catalog is static-only. If catalog updates become frequent enough to want a runtime mutation surface, promote to a Redis-backed registry — until then, static commits + atomic per-decision PRs.
- **Per-actor object schema (`{actor, confidence}`).** D-10 picks parallel-array shape; future migration to per-actor objects would be needed if additional per-actor fields ever ship (e.g. `actorRole: 'attacker' | 'defender' | 'casualty-source'`). Not budgeted now.
- **Retroactive backfill of `events:llm:v3` with `actorConfidence`.** D-18 is forward-only. If operator ever wants an immediate post-deploy cache refresh, the existing `?force=true` cron surface covers it.
- **Actor catalog → frontend rendering layer.** Catalog is server-only in Phase 33. Frontend rendering of canonical names (e.g., showing "Islamic Revolutionary Guard Corps" instead of "IRGC" in the EventDetail panel) is a frontend phase if operator wants it; today the catalog only affects what's stored in cache.
- **CAMEO codebook automatic re-sync.** D-02 / D-07 reference a committed CAMEO codebook snapshot. If GDELT updates the codebook upstream, the catalog test will fail on the next mismatch — at that point a separate cleanup phase syncs the snapshot. Not auto-syncing for now.
- **Confidence model refinement.** `actorConfidence` is currently a 3-bucket enum (`high | medium | low`). A numeric score (0..1, similar to `confidence`) might be more eval-friendly long-term. Deferred until the 3-bucket enum proves insufficient.

</deferred>

---

_Phase: 33-actor-metadata-audit-canonical-catalog-eval-expansion_
_Context gathered: 2026-05-21_
_Mode: --auto (recommended-default selections; advancing to plan-phase)_
