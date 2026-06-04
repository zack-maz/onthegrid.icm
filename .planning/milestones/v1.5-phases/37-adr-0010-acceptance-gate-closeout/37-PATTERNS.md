# Phase 37: ADR-0010 + Acceptance Gate Closeout — Pattern Map

**Mapped:** 2026-05-30
**Phase character:** Pure docs / ADR / CHANGELOG / SUMMARY / tracking phase (zero production code)
**Files analyzed:** 5 modified or created, plus 1 read-only workflow
**Analogs found:** 5 / 5 (every file has at least one strong analog in the existing repo)

## File Classification

| New/Modified File                                                              | Role                               | Data Flow                                                                          | Closest Analog(s)                                                                                                                                                                                                      | Match Quality                    |
| ------------------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                    | ADR (architecture decision record) | append-only doc + body rewrite                                                     | Existing Phase 30 / 30.1 / 34 / 35 sub-blocks within the same file                                                                                                                                                     | exact (self-extension)           |
| `.planning/phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md` (NEW)    | phase close summary                | structured markdown (frontmatter + decision table + rollup + framing-gap callouts) | `.planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md` (primary, 423 lines) + `.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-SUMMARY.md` (secondary, 134 lines) | exact                            |
| `CHANGELOG.md` (v1.5 entry inserted ABOVE existing v1.4 entry)                 | release-history doc                | append-at-top                                                                      | `CHANGELOG.md` `[v1.4]` entry (lines 5-49)                                                                                                                                                                             | exact (same file, sibling entry) |
| `.planning/ROADMAP.md` (Phase 37 row + DOCS-PUB-04 + LLM-RELI-07 flips)        | planning tracking                  | row mutation in checklist + table                                                  | Existing Phase 36 row (`- [x] **Phase 36: ...` + `### Progress` table row + plan checklist `[x] 36-06-PLAN.md`)                                                                                                        | exact                            |
| `.planning/REQUIREMENTS.md` (DOCS-PUB-04 + LLM-RELI-07 flips)                  | requirements traceability          | row mutation in checklist + table                                                  | Existing DOCS-PUB-03 + DOCS-PUB-05 status rows (Phase 36 close 2026-05-30 pattern)                                                                                                                                     | exact                            |
| `.planning/STATE.md` (last_updated, last_activity, progress, Current Position) | resume-state YAML + prose          | scalar field updates + prose block rewrite                                         | Existing `last_updated` + `last_activity` + `## Current Position` block format (current Phase 37 CONTEXT-gathered state — flips to closed at end)                                                                      | exact (self-mutation)            |
| `.github/workflows/prod-connectivity-audit.yml`                                | GitHub Actions workflow            | READ-ONLY — triggered 3× via `workflow_dispatch`                                   | (no modification; this is the gate observation target)                                                                                                                                                                 | n/a — read-only                  |

---

## Pattern Assignments

### `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` (ADR, append-only doc + body rewrite)

**Analog:** Same file, existing Phase 30 / 30.1 / 34 / 35 sub-blocks. The Phase 37 close sub-block (D-04) appends as the **6th and final v1.5 sub-block** below the Phase 35 sub-block.

**Status-line pattern** (lines 1-5):

```markdown
# ADR-0010: v1.5 LLM pipeline narrowing and deletion

**Status:** Accepted
**Date:** 2026-05-11
**Deciders:** solo author
```

**D-05 second-line append shape** (after the rewrite — preserve line 3 verbatim, add new line 4):

```markdown
**Status:** Accepted
**Status:** Accepted (v1.5 closed YYYY-MM-DD)
```

Per CONTEXT D-05 — both lines coexist as a two-state visual; the original `2026-05-11` date is preserved as the Phase-29-open acceptance point.

**Sub-block-per-phase canonical shape** (Phase 30 — lines 52-81, the richest exemplar):

```markdown
## Phase 30 Sub-block (appended 2026-05-17)

Phase 30 added the numbers Phase 29 deferred ("characterize, propose, validate at 800s"). All decisions are atomic per-commit (CONTEXT D-08). Architecture-level numbers live in [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md); this sub-block records the _decisions_ themselves.

- **D-01 (telemetry):** `retryAfterMs?: number | null` field added to `callHistory[]` rows in `server/lib/llmProgress.ts`. [...]
- **D-02 (tuning method):** Characterize (Run 1 at v1.4 defaults) → Propose (analytical, from Run-1 numbers) → Validate (Run 2). [...]
- **D-03 (eval gate):** Run-2 regression tolerance = ±3pp absolute at 5/20/100km [...]
- **D-04 (SIMPLIFY-01):** [...]
- **D-05 (SIMPLIFY-03):** [...]
- **D-06 (docs home):** [...]
- **D-07 (env tunability):** [...]

**Rollback recipe** (preserves v1.4 numerical behavior modulo soft-warn deletion):

\`\`\`bash
LLM_V3_CONCURRENCY=12 LLM_BATCH_SIZE=2 LLM_BATCH_TIMEOUT_MS=90000
\`\`\`

**Out of scope (carries forward):**

- 7-day cron-stability watch on tuned defaults → Phase 31 (LLM-RELI-06)
- [...]
```

**Phase 34 sub-block** (lines 108-131) is the closest shape match for Phase 37 because both are close-out / deferral / honest-declaration sub-blocks, not net-new-feature sub-blocks:

```markdown
## Phase 34 Sub-block (appended 2026-05-23)

Phase 34 was inserted 2026-05-19 to restore Cerebras + Groq adapters [...]

**Outcome: `cerebras-groq-deferred` (operator decision — probe not run).** [...]

- **D-01 (scope choice):** Honest deferral — operator skipped probe + adapter restoration. [...]
- **D-02 (close-out branch):** Triggered the "both providers deferred" branch baked into CONTEXT.md D-02. [...]
- **D-08 (terminal fallback):** Unchanged from Phase 30.1 — `/api/events` continues to serve raw GDELT [...]
- **D-31 (CLAUDE.md):** "Active providers" line updated [...]

**Phase-35-or-later follow-up candidates (if the deferral is reconsidered):**

- Run `scripts/probe-cerebras-groq.ts` [...]
- Adopt a paid provider tier [...]

**Architecture-level numbers** (none — no probe ran): [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md#multi-provider-cascade-phase-34-2026-05-23). This sub-block records the **decision**; the architecture doc records the **deferral rationale** (mirrors the Phase 30 + 30.1 sub-block convention).

**Out of scope (carries forward to future phases):**

- All four LLM-RELI-08..11 requirements close as Done with the deferral outcome. [...]
- Existing planning artifacts [...] remain in `.planning/phases/34-.../` as the audit trail [...]
```

**Phase 35 sub-block** (lines 133-148) shows the structure when the sub-block is the _milestone-close-adjacent_ shape (concrete measurements + bundle deltas + closing assertions):

```markdown
## Phase 35 Sub-block (appended 2026-05-27)

Phase 35 closed the v1.5 documentation-and-cleanup track deferred while LLM-RELI ran. [...]

- **D-01 (drift gate):** `src/__tests__/lib/redis-registry.test.ts` parses [...] 39 assertions across 4 sub-suites at phase close [...]
- **D-12 (SIMPLIFY-02):** `events:llm:v3:partial` observability key [...] retired [...] 358 LOC removed in a single atomic commit.
- **D-19 (bundle-size delta):** `api/vercel-entry.js` baseline = **1,779,504 bytes** (2026-05-26); close = **1,790,243 bytes** (2026-05-27). Delta = **+10,739 bytes (+0.60%)**. [...]
- **D-22 (this sub-block):** Captures Phase 35 close measurements + decisions. Mirrors Phase 30 / 30.1 / 34 sub-block convention.

**Outcome:** 6 plans executed; 6/9 requirements closed at phase end [...]. 17 atomic commits land on `feature/35-...`. Branch ready for merge to main.

**Architecture-level numbers:** [`docs/architecture/redis-keys.md`](../architecture/redis-keys.md) — the 32-key deep-dive inventory authored in plan 35-01 and pinned by the drift gate.
```

**`<expand_at_36>` HTML comment marker** at line 150 — to be deleted by D-02:

```markdown
<expand_at_36>

## Consequences
```

This is the literal text between the Phase 35 sub-block close and the existing Consequences header. The marker sits alone on its own line; deleting it leaves a clean blank line before `## Consequences`.

**Existing Consequences / Alternatives / References block** (lines 152-201) is what gets rewritten by D-02 against milestone-final reality:

```markdown
## Consequences

### Positive

- Smaller bundle, fewer code paths.
- Rollback path simplified: `git revert <Phase 29 range>`.
- The active code path is obviously the active code path — no flag-gated
  branches, no preserved-for-rollback modules to triage during incidents.

### Negative

- The Phase 27.4 D-26/D-40 deep-rollback lock is superseded. [...]
- ADR-0009 (the two-key-split for partial vs terminal v2 reads) becomes
  partially historical [...]

### Neutral

- `shouldPauseNewEvents()` soft-cap pause becomes unreachable
  post-narrowing [...]

## Alternatives Considered

- **Archive v1.ts + v2.ts to `attic/`** (original SIMPLIFY-06 plan).
  Rejected per CONTEXT D-02: [...]
- **Add `LLM_PIPELINE_ENABLED` env-var kill-switch.** Rejected per
  D-05: [...]

## References

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md`
  (D-01 through D-11)
- Phase 27.4 D-26/D-40 lock [...]
- ADR-0009 — Two-key split for LLM partial progress vs terminal reads [...]
- Commit range: <filled in at PR merge time>

---

_Template source: Michael Nygard, "Documenting Architecture Decisions"
(2011). Short format, immutable once Accepted — supersede with a new
ADR rather than editing the body. The status line may be updated._
```

**D-02 absorption instruction for the planner:** the rewritten Consequences / Alternatives / References blocks expand the surface to reflect Phase 30.1 (OR-restore choice rejected) and Phase 34 (Cerebras/Groq-provision choice rejected) alternatives plus extra positive/negative bullets per CONTEXT D-02. References block adds the 9 phase CONTEXT.md paths + commit ranges (filled at PR merge) + cross-links to `docs/architecture/llm-pipeline-reliability.md` + `docs/architecture/redis-keys.md` + ADR-0009 + ADR-0011 + the 7 v1.5 phase SUMMARY.md paths.

---

### `.planning/phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md` (NEW phase close summary)

**Primary analog:** `.planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md` (423 lines — the larger / richer template that includes audit tables + framing-gap callouts + 3-gate verification block).
**Secondary analog:** `.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-SUMMARY.md` (134 lines — the slimmer template whose `## Decision-by-Decision Outcome` style + frontmatter is the simpler shape).

**Frontmatter pattern** (Phase 36 — lines 1-74; Phase 35 is similar but more compact):

```yaml
---
phase: 36-public-docs-sweep-openapi-additions
milestone: v1.5
type: phase-close
closed: 2026-05-30
branch: feature/36-public-docs-sweep-openapi-additions
plan_count: 6
plan_status: 6/6 complete
requirements_satisfied:
  [
    DOCS-PUB-01,
    DOCS-PUB-02,
    DOCS-PUB-03,
    DOCS-PUB-05,
    DOCS-API-01,
    DOCS-API-02,
    DOCS-API-03,
    DOCS-API-04,
    DOCS-API-05,
    DOCS-API-06,
    DOCS-API-07,
  ]
requirements_deferred: [DOCS-PUB-04]
unblocks_phase: 37
tags:
  - phase-close
  - public-docs
  - openapi
  - audit-table
  - framing-gap
  - three-gate-verification
  - mechanical-drift-gate
key-files:
  created:
    - .planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md
    - server/__tests__/openapi/openapi-lint.test.ts (Plan 36-05)
  modified:
    - README.md (Plan 36-01)
    - docs/architecture/README.md (Plan 36-02)
metrics:
  duration_days: 1
  plans: 6
  atomic_commits: 26
  files_modified: 16
  test_total: 2380 passed (was 2379 baseline; +1 from D-08 lint gate)
---
```

**For Phase 37 the planner adapts:** `requirements_satisfied: [DOCS-PUB-04, LLM-RELI-07]`; `unblocks_phase: v1.6 promotion (999.5 first)`; `metrics.atomic_commits: ~6-9` (3 plans × 2-3 commits each); `test_total: 2380 (unchanged — no new tests)`; `bundle_delta_bytes: 0` (no code touched).

**Decision-by-Decision Outcome table — Phase 35 style** (5 columns) used by D-19:

```markdown
| ID   | Plan  | Outcome | Notes                                                    |
| ---- | ----- | ------- | -------------------------------------------------------- |
| D-01 | 35-01 | landed  | Drift gate at `src/__tests__/lib/redis-registry.test.ts` |
| D-12 | 35-02 | landed  | partial-key retired across 10 surfaces; 358 LOC removed  |
| D-15 | 35-03 | landed  | freeClaudeRouter callers block prepended                 |
```

**Decision-by-Decision Outcome table — Phase 36 style** (6 columns; the richer shape, recommended for Phase 37 per CONTEXT D-19):

```markdown
| D-N  | Title                                                         | Plan(s)             | Outcome | Commit Ref(s)         | Notes                                                                                                                 |
| ---- | ------------------------------------------------------------- | ------------------- | ------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D-01 | Honest shipped reality across README + architecture + runbook | 36-01, 36-02, 36-03 | shipped | (rollup)              | NIM-only-at-runtime framing lands in all 3 public docs                                                                |
| D-02 | Cite phase number + ADR-0010 inline for each provider state   | 36-01, 36-02, 36-03 | shipped | (rollup)              | Phase 30.1 (OR dormant) + Phase 34 (Cerebras + Groq deferred) cross-links live in README LLM Enrichment + runbook §13 |
| D-03 | Rewrite runbook + degradation chain to "v3 → raw GDELT"       | 36-03, 36-04        | shipped | `5ef53e1` + `62c2bdb` | No v1/v2/v3 chain remains in public docs                                                                              |
```

**Phase 37 adaptation per CONTEXT D-19:** columns `D-N | Decision | Plan | Status | Commit Ref` — drop "Notes" or fold into commit ref. ~19 rows for D-01..D-19. Per CONTEXT discretion item: do NOT add an "Hours spent" column.

**Framing-Gap Callouts block** (Phase 36 — lines 196-243) is the shape D-15 inherits + extends with row #7. The 6 callout rows ARE the verbatim carryforward content per CONTEXT D-15:

```markdown
## Framing-Gap Callouts (D-04 + Wave-1/2 surfacing)

Per phase-36 D-04 policy, the planning artifacts ROADMAP.md and PROJECT.md are NOT retroactively edited to fix wording that predates v1.5 shipped reality. SUMMARY.md captures the gaps so future reviewers can navigate the divergence between planning brief and shipped state without re-discovering them.

### 1. "NIM + OpenRouter narrowed cascade" (ROADMAP.md success criterion #1)

**Planning text:** "the v3 LLM pipeline (NIM + OpenRouter narrowed cascade)"
**Shipped reality:** **NIM-only at runtime.** OpenRouter is DORMANT per [ADR-0010 Phase 30.1 sub-block](../../../docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) — free-tier probe landed in not-viable bucket. Cerebras + Groq DEFERRED per [ADR-0010 Phase 34 sub-block](../../../docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) — operator chose to skip provisioning. Public docs (README §LLM Enrichment, runbook §13 NIM throttle handling, `docs/architecture/llm-pipeline-reliability.md` "Multi-Provider Cascade (Phase 34)") describe runtime state, not declared chain.

**Why preserved:** Phase 36 D-04 policy — planning artifacts are historical brief; public docs are the surface of truth.

### 2. "10 markdown files (21 Mermaid diagrams)" (ROADMAP.md success criterion #2 / PROJECT.md / CONTEXT.md D-11)

**Planning text:** "The 10 markdown files in `docs/architecture/` (21 Mermaid diagrams)" — ROADMAP.md. CONTEXT.md D-11 hypothesized 22 diagrams.
**Shipped reality:** **12 markdown files** (8 in `docs/architecture/` + 4 in `docs/architecture/ontology/`, including Phase 30 `llm-pipeline-reliability.md` and Phase 35 `redis-keys.md`). **21 Mermaid diagrams** (NOT 22; Plan 36-02 grep audit confirmed 21: 9 data-flows + 3 frontend + 4 state-machines + 2 deployment + 2 system-context + 1 types).

**Why preserved:** Phase 36 D-04 policy.

### 3. "v3 → v2 → v1 → raw GDELT fallback chain" (ROADMAP.md success criterion #4)

**Planning text:** "the explicit v3 → v2 → v1 → raw GDELT fallback chain"
**Shipped reality:** **v3 → raw GDELT** (no v1, no v2). [...]

### 4. Source-of-truth filename for rate-limit middleware

**Surfaced by:** Plan 36-01 D-18 execution.
**Planning text:** CLAUDE.md §Vercel Deployment line 152 + CONTEXT.md `canonical_refs` reference `server/middleware/rateLimiter.ts`.
**Shipped reality:** The actual file is `server/middleware/rateLimit.ts` (no trailing `r`). [...]

### 5. ADR-0011 §3 body still describes `events:llm:v3:partial` as live

**Surfaced by:** Plan 36-02 D-21 execution.
**Planning text:** ADR-0011 §3 body text (lines 71-79) describes `events:llm:v3:partial` as a live observability key.
**Shipped reality:** Partial key was RETIRED in Phase 35 (SIMPLIFY-02; commits `events:llm:v3:partial` retired across 10 surfaces). [...]

### 6. `/api/events/llm-pipeline` rename to `/api/events/llm-status`

**Surfaced by:** Plan 36-05 D-05 execution (handler grep).
**Planning text:** CONTEXT.md D-05 + ROADMAP.md success criterion #5 documented `/api/events/llm-pipeline` GET + POST as a target for the OpenAPI sweep.
**Shipped reality:** Endpoint was DELETED in **Phase 29 D-02 part A**. The surviving observability reader is `/api/events/llm-status` (events.ts:345, dashboardAuth-gated). [...]
```

**Per CONTEXT D-15** — these 6 callouts copy forward into 37-SUMMARY.md **verbatim** (preserve the `### N.` heading + `**Planning text:**` + `**Shipped reality:**` + `**Why preserved:**` / `**Surfaced by:**` shape). Then add row 7:

```markdown
### 7. Acceptance-gate cadence — back-to-back vs 24-48h-spaced (Phase 37 D-08 NOTE)

**Surfaced by:** Plan 37-02 execution.
**Planning text:** CONTEXT.md D-06 specifies "1 run per day across 24-48 hours" for the 3-consecutive-green observation; D-08 NOTE permits operator to compress to back-to-back if rationale is logged.
**Shipped reality:** [either "Cadence ran as specified — no deviation"; OR "Operator compressed to back-to-back ~N min apart; rationale: ___"]

**Why preserved:** Framing-gap-in-SUMMARY policy (Phase 36 D-04 inherited).
```

**3-Gate Verification Results block** (Phase 36 — lines 246-280) is the shape D-13 inherits — Plan 37-03 close runs the same 3 gates:

```markdown
## 3-Gate Verification Results (D-24)

### Gate 1: Full test suite — `npx vitest run`

**Result:** ✓ PASSED — **186 test files / 2380 tests passed**; 0 failed; 19 skipped; 5 `it.todo()` stubs.
**Duration:** 56.12s.
**Run timestamp:** 2026-05-30 05:25 UTC.

### Gate 2: OpenAPI spec lint — `npx @redocly/cli lint server/openapi.yaml --format=stylish`

**Result:** ✓ PASSED — **0 errors, 35 warnings** (all pre-existing style debt [...]).
**Run timestamp:** 2026-05-30 05:30 UTC.

### Gate 3: Markdown link check — `markdown-link-check` per `npm run docs:lint` script scope

**Result:** ✓ PASSED for Phase-36-introduced surface. Pre-existing rot documented (7 dead links; out-of-scope per plan-specific notes).
**Scope:** README.md + `docs/architecture/**/*.md` + `docs/runbook.md` + `docs/degradation.md` + `docs/adr/*.md`. (NOT `.planning/`; NOT `docs/brainstorms/`; NOT `docs/superpowers/`.)
**Run timestamp:** 2026-05-30 05:31 UTC.
```

**Phase 37 adapts:** same 3 gates, run on the Phase 37 ADR rewrite surface. Markdown-link-check verifies the rewritten Consequences / Alternatives / References cross-links resolve (the ADR rewrite introduces many new cross-links to `.planning/phases/*/CONTEXT.md` + `*-SUMMARY.md` paths + `docs/architecture/*.md`).

**Headline outcomes block** (Phase 36 — lines 82-94; bullet list at top of SUMMARY):

```markdown
## Top-line outcomes

- **5 new OpenAPI endpoint entries** added [...]
- **4 reusable component schemas** declared [...]
- **2 mechanical drift gates** landed [...]
- [...]
```

**Phase 37 adaptation:** 1 ADR rewrite + 1 close sub-block + 3 gate-run evidence triplets + 1 CHANGELOG entry + 4 tracking flips.

---

### `CHANGELOG.md` — v1.5 entry inserted ABOVE existing v1.4 entry (D-18)

**Analog:** `CHANGELOG.md` lines 5-49 — the existing `## [v1.4]` entry is the **verbatim template** for the v1.5 entry. D-18 mirrors this shape exactly.

**Title + span + framing paragraph** (lines 5-9):

```markdown
## [v1.4] — GDELT Redo & Performance — 2026-05-08

**Span:** 2026-04-09 → 2026-05-08 (29 days, 18 phases shipped, 1 deferred to backlog)

GDELT pipeline rebuilt around a structured LLM extraction layer (Cerebras → Groq → NIM v3 with parallel concurrency limiter), plus a full performance & operational hardening sweep against the stabilized v1.3 codebase. Daily cron triad (`/api/cron/{health,warm,refresh-events}`) replaces fire-and-forget extraction baked into request handlers. Production observability surface unified into the `API Health` tab with tier-grouped freshness, eval scores, adversarial robustness, DLQ, and operator audit log. Load test (originally Phase 28.3) deferred to backlog as `Phase 999.5` — promotes when `prod-connectivity-audit.yml` is exit-0 green for 3 consecutive runs.
```

**Phase 37 adaptation:**

```markdown
## [v1.5] — LLM Reliability & Reveal Prep — YYYY-MM-DD

**Span:** 2026-05-09 → YYYY-MM-DD (~N days, 10 phases shipped — 29 / 30 / 30.1 / 31 / 32 / 33 / 34 / 35 / 36 / 37)

[1-paragraph milestone framing — NIM-only honest at runtime; v1+v2 extractors deleted Phase 29; LLM-optional architecture proven; Pro upgrade landed; public docs swept; OpenAPI gates landed; mechanical drift gates added (Redis registry + OpenAPI lint + markdown-link-check); 999.5 load test promotion gate observed at v1.5 close.]
```

**Headline deliverables shape** (lines 11-21 — bullets organized by track):

```markdown
### Headline deliverables

- **Structured LLM extraction (Phases 27 → 27.4.6):** v1 Cerebras + v2 watchdog/DLQ + v3 NIM parallel batches. [...]
- **Reliability primitives (Phases 27.4 → 27.4.6):** circuit breaker (sliding 10-call window, 5min pause >30% error), DLQ (200-entry SADD bounded set, 7d TTL [...]), token budget [...], watchdog [...].
- **Cron-driven pipeline (Phase 27.4.6 + 28.2.6):** `/api/events` is now cache-only. [...]
- **Cleanup sweep (Phase 28.1, 7 waves):** ghost code deletion via knip + ts-prune triage. [...]
- **Dev/Prod sync (Phase 28.2):** domain rename [...]
- **API Health tab merge (Phase 28.2):** [...]
- **Connectivity audit workflow (Phase 28.2 W6):** [...]
- **API green-light gate (Phase 28.2.5):** [...]
- **Audit-tier completeness (Phase 28.2.7):** [...]
```

**Phase 37 adaptation:** 8 tracks per CONTEXT D-18 — `LLM-RELI` (Phase 29 / 30 / 30.1 / 34), `GHOST` (Phase 32), `ACTOR` (Phase 33), `DOCS-INT` (Phase 29 / 35), `REDIS-OPT` (Phase 35), `SIMPLIFY` (Phase 29 / 30 / 35), `DOCS-PUB` (Phase 36 / 37), `DOCS-API` (Phase 36).

**Quantitative snapshot shape** (lines 23-31):

```markdown
### Quantitative snapshot

- vitest baseline: 1700 → 2193 (+493 new tests)
- TypeScript errors: 8 → 0
- Lint errors: 0 → 0; warnings: 22 → 18
- Bundle: 1.2 MB → 1.72 MB (LLM pipeline + geocoder + eval harness + adversarial harness)
- Cron jobs: 2 → 3 (within Hobby cap)
- Critical-tier endpoints: 3 → 4 (added `llmEvents`)
- Eval ground-truth set: 0 → 50 events / 11 countries
```

**Phase 37 adaptation per CONTEXT D-16:** test count delta (2193→2380 over v1.5; Phase 37 adds 0 → unchanged from Phase 36 close); bundle delta (1.72MB→1,790,243 bytes at Phase 35 close; Phase 37 adds 0 bytes); ADR count delta (8→11 — ADR-0009 Phase 27.4.3 + ADR-0010 + ADR-0011 = 3 net adds); Redis key registry growth (32 keys at Phase 35 close; Phase 37 delta 0); cron job count (3, unchanged); commit count across v1.5 phases (rough sum from `git log`); operator hours spent (rough estimate from per-phase SUMMARY hours).

**Migration notes shape** (lines 33-38):

```markdown
### Migration notes (v1.3 → v1.4)

- **Domain change:** `irt-monitoring.vercel.app` retired; canonical alias is `otg-iran-monitor.vercel.app` on Vercel project `otg-iran-monitor`. Update any bookmarks, monitoring, or external scripts.
- **Operator Bearer:** prod surfaces (DevApiStatus dashboard, operator endpoints) require `Authorization: Bearer ${DASHBOARD_PASSWORD}`. Same Bearer skips global rate-limit tier (Phase 28.2 D-04).
- **Cron schedule:** `/api/events` no longer triggers extraction; `/api/cron/refresh-events` does, daily at 04:00 UTC. [...]
- **Pipeline version:** `LLM_PIPELINE_V3=true` is the default in production. Runtime override via `POST /api/events/llm-pipeline {"version": "v1"|"v2"|"v3"|null}`. Override clears with `null`.
```

**Phase 37 adaptation per CONTEXT D-18:** Vercel Pro plan required for `maxDuration: 800` (Phase 29 D-08); CLAUDE.md trimmed (Phase 29 DOCS-INT-01); v1+v2 extractors deleted — rollback is `git revert` not flag flip (Phase 29 D-02 supersedes Phase 27.4 D-26/D-40); partial-key retired (Phase 35 SIMPLIFY-02); OR dormant + Cerebras/Groq deferred — single-provider DLQ baseline is known known (Phase 30.1 + 34).

**Deferred section shape** (lines 40-49):

```markdown
### Deferred to v1.5+ (carried forward)

- **Phase 999.5 (was 28.3):** Performance optimization + 1–300 VU k6 sweep. Decision lock preserved at `.planning/phases/999.5-performance-load-test/999.5-CONTEXT.md`.
- **Phase 27.3.3:** Romanization of non-Latin water-facility names (~125 facilities currently filtered by Latin-script admission gate).
- **Phase 999.2:** `api/vercel-entry.js` build-artifact discipline (migrate to Vercel Build Output API).
- **Phase 999.3:** Phase 27.4.6 cron first-tick passive verification.
- **Phase 999.4:** Cron route hydrates pipeline override (`await refreshPipelineOverride()` in `refresh-events-cron.ts`).
- Telegram OSINT integration (carried from v1.3).
- GDELT BigQuery adapter (carried from v1.3).
- Satellite imagery overlay (carried from v1.2).
```

**Phase 37 adaptation per CONTEXT D-18:** `### Deferred to v1.6+ (carried forward)` — 999.5 load test (now unblocked, promotes at v1.6 start), REVEAL-01 polish, REVEAL-02 public domain, Cerebras/Groq adapter restoration, paid-OR conversion, adaptive Retry-After NIM limiter, per-provider eval infrastructure, `cascade_exhausted` DLQ taxonomy.

**Single commit:** per CONTEXT D-18 — `docs(37): CHANGELOG[v1.5] milestone entry` at Plan 37-03 close.

---

### `.github/workflows/prod-connectivity-audit.yml` — READ-ONLY (Step 3 inline node script + sidecar shape)

**Status:** Read-only — Phase 37 does NOT modify the workflow. Plan 37-02 triggers it 3× via `workflow_dispatch` (operator out-of-band per D-09); Plan 37-03 embeds the resulting sidecar JSON payloads inline in 37-SUMMARY.md per D-08.

**Step 3 inline assertion (lines 87-246)** — the gate logic the operator observes:

```yaml
- name: Write audit result to Redis sidecar
  id: sidecar
  if: always()
  env:
    API_BASE_URL: ${{ inputs.target_url }}
    DASHBOARD_PASSWORD: ${{ secrets.PROD_DASHBOARD_PASSWORD }}
    UPSTASH_REDIS_REST_URL: ${{ secrets.UPSTASH_REDIS_REST_URL }}
    UPSTASH_REDIS_REST_TOKEN: ${{ secrets.UPSTASH_REDIS_REST_TOKEN }}
    SMOKE_RESULT: ${{ steps.smoke.outcome }}
    RATELIMIT_RESULT: ${{ steps.ratelimit.outcome }}
    GH_RUN_ID: ${{ github.run_id }}
  run: |
    node --input-type=module -e '
      [...]
      const payload = {
        status: overallStatus,
        runId: process.env.GH_RUN_ID,
        timestamp: new Date().toISOString(),
        endpoints,
        durationMs: 0,
        // Phase 28.2.5 D-09 additions — tier-green gate result.
        allTiersGreen,
        tierStatus,
      };
      [...]
      const key = "audit:connectivity:last-result";
      const value = JSON.stringify(payload);
      [...]
      process.exit(allTiersGreen ? 0 : 1);
    '
```

**Sidecar payload contract** — the literal shape that gets embedded as fenced JSON code blocks in 37-SUMMARY.md per D-08:

```json
{
  "status": "pass",
  "runId": "<GH Actions run id>",
  "timestamp": "2026-MM-DDTHH:MM:SS.sssZ",
  "endpoints": {
    "/api/health": "pass",
    "/api/flights": "pass",
    "/api/ships": "pass",
    "/api/events": "pass",
    "/api/sources": "pass",
    "/api/markets": "pass",
    "/api/news": "pass",
    "/api/water": "pass",
    "/api/audit-status": "pass",
    "/api/operator-status": "pass"
  },
  "durationMs": 0,
  "allTiersGreen": true,
  "tierStatus": {
    "critical": "healthy",
    "nonCritical": "healthy",
    "static": "healthy",
    "probeOnly": "healthy",
    "cron": "healthy"
  }
}
```

**Tier-status enum** (from `server/routes/audit-status.ts:54-60`):

```typescript
tierStatus?: {
  critical?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  nonCritical?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  static?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  probeOnly?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
  cron?: 'healthy' | 'degraded' | 'unhealthy' | 'unknown';
};
```

**Schema pinned by:** `server/routes/__tests__/audit-status.test.ts` — the `'matches CI workflow JSON shape contract'` test (line 97) + the `'matches Phase 28.2.5 tier-green schema extension'` test (line 130). Both directions of drift fail LOUDLY on the next `vitest run`.

**Per CONTEXT D-08 — 37-SUMMARY.md format for the 3-row evidence block:**

```markdown
## Acceptance Gate Observation (LLM-RELI-07)

Per CONTEXT.md D-06..D-08 — 3 consecutive `prod-connectivity-audit.yml` exit-0 runs with `audit:connectivity:last-result.allTiersGreen === true`, observed 1-per-day across 24-48 hours (crosses the 04:00 UTC daily cron tick).

### Run 1 of 3 — YYYY-MM-DD HH:MM UTC

**GitHub Actions run URL:** https://github.com/<org>/otg-iran-monitor/actions/runs/<runId>
**Sidecar payload (`audit:connectivity:last-result`):**

\`\`\`json
{
"status": "pass",
"runId": "<run-1-id>",
"timestamp": "<run-1-iso>",
"endpoints": { ... },
"durationMs": 0,
"allTiersGreen": true,
"tierStatus": { "critical": "healthy", "nonCritical": "healthy", "static": "healthy", "probeOnly": "healthy", "cron": "healthy" }
}
\`\`\`

### Run 2 of 3 — YYYY-MM-DD HH:MM UTC

[... same shape ...]

### Run 3 of 3 — YYYY-MM-DD HH:MM UTC

[... same shape ...]

**Streak status:** 3/3 consecutive greens observed; LLM-RELI-07 satisfied; v1.6 promotion unblocked.
```

---

### `.planning/ROADMAP.md` (Phase 37 flip)

**Analog:** Existing Phase 36 row in the same file. Row format is the checklist-style `- [x] **Phase NN: ...**` followed by inline narrative; the `### Progress` table at the bottom also flips.

**Phase row format** (current Phase 36 row in ROADMAP.md):

```markdown
- [x] **Phase 36: Public Docs Sweep + OpenAPI Additions** — ✓ CLOSED 2026-05-30. README sweep (rate-limit drift + LLM Enrichment section); 12 architecture markdown files audited (7 edited / 5 verified-clean); 21 Mermaid blocks audited (3 edited / 18 verified-clean); ADR-0011 Phase 36 sub-block; runbook §6 rewrite + §13-§16 SRE-template appendage; degradation.md Pitfall 1 contract; OpenAPI 3.0.3 spec gained 5 new endpoints + 2 verified-clean entries + 4 reusable schemas + 2 named securitySchemes (cronSecret + operatorBearer); Redocly lint vitest + markdown-link-check script wired as mechanical drift gates. 26 atomic commits across 6 plans (3 waves). DOCS-PUB-04 (ADR-0010 milestone close) deferred to Phase 37.
- [ ] **Phase 37: ADR-0010 + Acceptance Gate Closeout** — Capture v1.5 LLM-pipeline decisions in a new ADR (ADR-0010 — the 0009 slot is taken by the existing Accepted two-key-split ADR); observe `prod-connectivity-audit.yml` exit-0 with `allTiersGreen=true` for 3 consecutive runs; lock the milestone close.
```

**Phase 37 flip:** change `[ ]` → `[x]`, append `— ✓ CLOSED YYYY-MM-DD. ADR-0010 milestone-final rewrite + Phase 37 close sub-block (the 6th and final v1.5 sub-block); status line gained second line "Accepted (v1.5 closed YYYY-MM-DD)"; 3 consecutive prod-connectivity-audit.yml greens observed across 24-48h; CHANGELOG[v1.5] entry; 37-SUMMARY.md; ROADMAP/REQUIREMENTS/STATE flips. ~N atomic commits across 3 plans. v1.6 promotion unblocked (999.5 first phase).`

**Progress table row format** (lines 319-329):

```markdown
### Progress

| Phase                                                                         | Plans Complete | Status      | Completed  |
| ----------------------------------------------------------------------------- | -------------- | ----------- | ---------- |
| 29. LLM Provider Chain Narrowing & LLM-Optional Architecture & CLAUDE.md Trim | 13/13          | Complete    | 2026-05-11 |
| [...]                                                                         | [...]          | [...]       | [...]      |
| 36. Public Docs Sweep + OpenAPI Additions                                     | 6/6            | Complete    | 2026-05-30 |
| 37. ADR-0010 + Acceptance Gate Closeout                                       | 0/0            | Not started | -          |
```

**Phase 37 flip:** change `0/0 | Not started | -` → `3/3 | Complete | YYYY-MM-DD`.

**Milestone-summary heading row** (line 96 — top-of-milestone bullet):

```markdown
## Milestone v1.5: LLM Reliability & Reveal Prep — 🚧 IN PROGRESS
```

**Phase 37 flip:** change `🚧 IN PROGRESS` → `✅ SHIPPED YYYY-MM-DD`. The `Started: 2026-05-09` + `Acceptance gate: ...` block stays; append `Closed: YYYY-MM-DD` line and update acceptance gate language to `OBSERVED: 3 consecutive prod-connectivity-audit.yml exit-0 runs YYYY-MM-DD..YYYY-MM-DD; 999.5 load test unblocked for v1.6.`

---

### `.planning/REQUIREMENTS.md` (DOCS-PUB-04 + LLM-RELI-07 flips)

**Analog:** Existing DOCS-PUB-03 + DOCS-PUB-05 rows (closed Phase 36, 2026-05-30) — same `[x]` checklist style and traceability-table row shape.

**Checklist row format** (DOCS-PUB-03, currently checked):

```markdown
- [x] **DOCS-PUB-03**: `docs/runbook.md` (676 lines) gains v1.4 + v1.5 incidents — NIM throttle handling, cron architecture lessons (28.2.6 fire-and-forget IIFE diagnosis), force-trigger runbook (`?force=true`), prod-connectivity-audit retry path. **(Phase 36 close 2026-05-30: §6 rewrite-in-place — Hobby 10s → Pro 800s — with old-anchor shim; §13-§16 SRE-template appendage covering all 4 incident playbooks; commits `0cef703` + `5ef53e1`.)**
```

**DOCS-PUB-04 current Pending row:**

```markdown
- [ ] **DOCS-PUB-04**: New ADR (ADR-0010 — `docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md` was committed 2026-04-24 and already occupies the 0009 slot) documenting the v1.5 LLM-pipeline decisions: stay on v3, narrow active providers to NIM + OpenRouter, retire Cerebras + Groq from runtime cascade, LLM-optional architecture. Captures the rationale, trade-offs, and rollback plan. **(Phase 37 territory — ADR-0010 milestone-close sub-block. Phase 36 closed without touching DOCS-PUB-04 per CONTEXT D-04 + plan-specific notes.)**
```

**Phase 37 flip:** `[ ]` → `[x]`; replace the `**(Phase 37 territory — ...)**` annotation with `**(Phase 37 close YYYY-MM-DD: ADR-0010 body rewrite to milestone-final shipped state + 5 historical sub-blocks preserved + Phase 37 close sub-block appended as 6th and final v1.5 sub-block + status line gained second line "Accepted (v1.5 closed YYYY-MM-DD)"; commits <range>.)**`

**LLM-RELI-07 current Pending row:**

```markdown
- [ ] **LLM-RELI-07**: `prod-connectivity-audit.yml` exit-0 with `audit:connectivity:last-result.allTiersGreen === true` for **3 consecutive runs** (the v1.5 → v1.6 promotion gate; unblocks 999.5 load test).
```

**Phase 37 flip:** `[ ]` → `[x]`; append `**(Phase 37 close YYYY-MM-DD: 3 consecutive greens observed 1-per-day across 24-48 hours per CONTEXT D-06; evidence triplets — GH Actions run URL + ISO timestamp + sidecar JSON payload — inline in 37-SUMMARY.md §Acceptance Gate Observation. v1.6 promotion unblocked.)**`

**Traceability table row format** (lines 131-179 — the per-requirement status table):

```markdown
| Requirement | Phase | Status  |
| ----------- | ----- | ------- |
| [...]       | [...] | [...]   |
| LLM-RELI-07 | 37    | Pending |
| [...]       | [...] | [...]   |
| DOCS-PUB-04 | 37    | Pending |
```

**Phase 37 flip:** both rows change `Pending` → `Complete (YYYY-MM-DD)`.

**Footer line format** (line 191):

```markdown
_Last updated: 2026-05-30 after Phase 36 close — DOCS-PUB-01/02/03/05 + DOCS-API-01..07 flipped to Complete; DOCS-PUB-04 deferred to Phase 37 (ADR-0010 milestone-close sub-block) per CONTEXT D-04._
```

**Phase 37 flip:** append a new line — `_Last updated: YYYY-MM-DD after Phase 37 close — DOCS-PUB-04 + LLM-RELI-07 flipped to Complete; v1.5 milestone shipped; v1.6 promotion unblocked (999.5 first phase)._`

---

### `.planning/STATE.md` (Phase 37 close flips)

**Analog:** Same file, current Phase-37-CONTEXT-gathered state (lines 1-40). Self-mutation — same scalar field shape, updated values.

**YAML frontmatter pattern** (lines 1-14):

```yaml
---
gsd_state_version: 1.0
milestone: v1.5
milestone_name: LLM Reliability & Reveal Prep — 🚧 IN PROGRESS
status: Phase 37 context gathered 2026-05-30 (19 decisions across 4 areas); 3 plans planned (37-01 ADR rewrite / 37-02 gate observation / 37-03 close); ready for /gsd:plan-phase 37
last_updated: '2026-05-30T00:00:00.000Z'
last_activity: 2026-05-30 -- Phase 37 CONTEXT.md committed (ee990e5); awaiting /gsd:plan-phase 37
progress:
  total_phases: 15
  completed_phases: 8
  total_plans: 59
  completed_plans: 55
  percent: 53
---
```

**Phase 37 close flip:**

- `milestone_name` → `LLM Reliability & Reveal Prep — ✅ SHIPPED YYYY-MM-DD`
- `status` → `v1.5 milestone closed YYYY-MM-DD via Phase 37; ADR-0010 milestone-final rewrite + close sub-block landed; 3 consecutive prod-connectivity-audit.yml greens observed; CHANGELOG[v1.5] entry committed; v1.6 promotion unblocked (999.5 first phase).`
- `last_updated` → `YYYY-MM-DDT00:00:00.000Z`
- `last_activity` → `YYYY-MM-DD -- Phase 37 closed; v1.5 milestone shipped; ROADMAP/REQUIREMENTS/STATE flips committed (<commit>)`
- `progress.completed_phases` → 9 (was 8)
- `progress.completed_plans` → 58 (was 55, +3 from Phase 37)
- `progress.percent` → recompute

**Current Position prose block** (lines 24-39):

```markdown
## Current Position

Phase: 37 (adr-0010-acceptance-gate-closeout) — CONTEXT GATHERED, AWAITING PLAN
Plan: 0 of 3 (planned slice: 37-01 ADR rewrite / 37-02 gate observation / 37-03 close)
Status: Phase 37 CONTEXT.md committed ee990e5 with 19 decisions across ADR scope / gate protocol / plan decomposition / SUMMARY framing. Ready for /gsd:plan-phase 37.
Last activity: 2026-05-30 -- Phase 37 context gathered (CONTEXT + DISCUSSION-LOG); commit ee990e5

Resume file: [`.planning/phases/37-adr-0010-acceptance-gate-closeout/37-CONTEXT.md`](phases/37-adr-0010-acceptance-gate-closeout/37-CONTEXT.md).

[...]

Phase 36 close artifact: [`.planning/phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md`](phases/36-public-docs-sweep-openapi-additions/36-SUMMARY.md).

[...]

Acceptance gate (set at milestone start, blocks v1.6 promotion): prod-connectivity-audit.yml exit-0 with allTiersGreen=true for 3 consecutive runs (LLM-RELI-07; observed in Phase 37 closeout).
```

**Phase 37 close flip:**

```markdown
## Current Position

Phase: v1.6 (UNBLOCKED — 999.5 promotion ready) — V1.5 CLOSED
Plan: v1.5 milestone shipped via Phase 37 (3/3 plans complete); next is /gsd:plan-milestone v1.6 or pull 999.5 from backlog
Status: v1.5 LLM Reliability & Reveal Prep milestone closed YYYY-MM-DD. ADR-0010 milestone-final + Phase 37 close sub-block landed; 3 consecutive prod-connectivity-audit.yml greens observed YYYY-MM-DD..YYYY-MM-DD; CHANGELOG[v1.5] entry committed; ROADMAP/REQUIREMENTS/STATE flipped.
Last activity: YYYY-MM-DD -- Phase 37 closed (commit <range>); v1.5 milestone shipped

Resume file: [`.planning/phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md`](phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md).

Phase 37 close artifact: [`.planning/phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md`](phases/37-adr-0010-acceptance-gate-closeout/37-SUMMARY.md).

Acceptance gate: ✓ OBSERVED YYYY-MM-DD — 3 consecutive prod-connectivity-audit.yml exit-0 runs with allTiersGreen=true (LLM-RELI-07 satisfied; 999.5 load test promotion to v1.6 unblocked).
```

---

## Shared Patterns

### Verification gate trio (D-13 — inherits Phase 36 D-24)

**Source:** `package.json` scripts (`openapi:lint`, `docs:lint`) + standard vitest invocation.
**Apply to:** Plan 37-03 close step.

**Literal invocations:**

```bash
# Gate 1: Full vitest suite — must be 2380 GREEN (baseline at Phase 36 close).
# Includes Phase 35 D-01 redis-registry.test.ts + Phase 36 D-08 openapi-lint.test.ts
# + all earlier schema-pinning tests.
npx vitest run

# Gate 2: OpenAPI spec lint — no spec errors. Same gate Phase 36 D-08 wired.
npx @redocly/cli lint server/openapi.yaml --format=stylish

# Gate 3: Markdown link check — markdown-link-check across docs/ + README + ADRs.
# Catches broken cross-references created by the ADR rewrite.
npm run docs:lint
```

**`docs:lint` script from `package.json:36`** (the literal command-line behind Gate 3):

```json
"docs:lint": "markdown-link-check --quiet README.md && find docs -name '*.md' -not -path '*/brainstorms/*' -not -path '*/superpowers/*' -print0 | xargs -0 -n1 markdown-link-check --quiet"
```

**Scope:** README.md + every `*.md` under `docs/` except `docs/brainstorms/**` and `docs/superpowers/**`. This catches ADR cross-link rot at scale because the ADR rewrite (D-02) introduces many new cross-links to `.planning/phases/*/CONTEXT.md` + `*-SUMMARY.md` paths that must resolve. NOTE: `.planning/` is OUT of scope for `docs:lint` — links from `docs/adr/*.md` into `.planning/*` are NOT checked by the gate. Recommend Plan 37-01 manually spot-checks any `.planning/` cross-links since they bypass the gate.

**`openapi:lint` script from `package.json:35`:**

```json
"openapi:lint": "redocly lint server/openapi.yaml --format=stylish"
```

### Atomic per-decision commits (Phase 30 D-08 → 31 → 32 → 33 → 34 → 35 → 36 D-27 invariant)

**Source:** Phase 36-SUMMARY.md commit log (lines 282-317).
**Apply to:** All Phase 37 plans.

**Commit-prefix conventions:** `docs(37):` / `chore(37):` — body names the decision number. Example shapes from Phase 36:

```
docs(36): D-09 sweep system-context.md
docs(36): D-21 append Phase 36 sub-block to ADR-0011 (NIM-only runtime cascade reaffirmation)
docs(36): D-18 fix README rate-limit drift (60/min global; was 6/min stale)
docs(36): D-17 D-19 D-20 add README LLM Enrichment section
chore(36): D-24 run 3-gate verification (vitest + Redocly + markdown-link-check; all green)
docs(36): complete plan 04 — degradation contract update SUMMARY
```

**Phase 37 adaptation per CONTEXT D-12:** Phase 37 uses `docs(37):` / `chore(37):` prefixes (no new conventions). Example targets:

```
docs(37): D-01 rewrite ADR-0010 body to milestone-final shipped state
docs(37): D-02 absorb expand_at_36 marker + rewrite Consequences/Alternatives/References
docs(37): D-04 append Phase 37 close sub-block to ADR-0010 (6th and final v1.5 sub-block)
docs(37): D-05 add second status line "Accepted (v1.5 closed YYYY-MM-DD)"
chore(37): D-06 D-07 D-08 capture gate observation run 1/2/3 evidence triplet
docs(37): D-18 CHANGELOG[v1.5] milestone entry
docs(37): D-14 D-15 D-16 D-17 D-19 author 37-SUMMARY.md (rollup + framing-gaps + snapshot + promotion + table)
docs(37): close phase 37 — ROADMAP/REQUIREMENTS/STATE flips
chore(37): run 3-gate verification (vitest + Redocly + markdown-link-check; all green)
```

### Operator out-of-band action callout (Phase 29 D-08 Vercel Pro upgrade precedent)

**Source:** Phase 29 plans' "Operator out-of-band action" framing — and Phase 36 SUMMARY's Plan 36-05 D-28 "manual branch-cut" deviation note.
**Apply to:** Plan 37-02 task list (per CONTEXT D-09).

**Callout shape — adapt for Plan 37-02:**

```markdown
**Operator out-of-band action (REQUIRED before Plan 37-02 task list runs):**

The `prod-connectivity-audit.yml` workflow_dispatch trigger requires GitHub Actions UI access OR `gh workflow run prod-connectivity-audit.yml` with credentials the executor agent does NOT have. The executor will FAIL on auth if it attempts to trigger.

Plan 37-02 task structure:

- (a) [operator] trigger run #1 via GitHub Actions UI or `gh workflow run`; wait for green; capture run URL + sidecar JSON payload from `/api/audit-status`
- (b) [operator] same for run #2 (≥24h after run #1, ≤48h)
- (c) [operator] same for run #3 (≥24h after run #2, ≤48h)
- (d) [executor] commit the 3 evidence triplets into 37-SUMMARY.md draft + cross-link from ADR-0010 close sub-block

Hard reset: if any of runs 1/2/3 lands red (workflow exit-1 OR `allTiersGreen=false`), the streak wipes and operator restarts from run #1.

No helper script (`scripts/run-prod-audit-thrice.sh`) is added — premature automation for a one-shot phase-close action (CONTEXT D-09).
```

### Architecture-level numbers footer (Phase 30 / 30.1 / 34 / 35 sub-block convention)

**Source:** Closing of every existing v1.5 sub-block in ADR-0010.
**Apply to:** D-04 Phase 37 close sub-block (per CONTEXT Claude's-discretion item — recommended yes).

**Literal shape from Phase 35 sub-block** (line 148):

```markdown
**Architecture-level numbers:** [`docs/architecture/redis-keys.md`](../architecture/redis-keys.md) — the 32-key deep-dive inventory authored in plan 35-01 and pinned by the drift gate. Future Redis-key work edits CLAUDE.md + `redis-keys.md` in lockstep or the gate fails.
```

**From Phase 30.1 sub-block** (line 101):

```markdown
**Architecture-level numbers** (probe + percentages + cascade decision): [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md#cascade-reality-phase-301-2026-05-17). This sub-block records the **decision**; the architecture doc records the **measurement** (mirrors the Phase 30 sub-block convention).
```

**Phase 37 adaptation:**

```markdown
**Architecture-level numbers:** [`docs/architecture/llm-pipeline-reliability.md`](../architecture/llm-pipeline-reliability.md) for the cumulative measurement story across Phases 30 / 30.1 / 34. This sub-block records the milestone-close **decision**; the architecture doc records the cumulative cross-phase **measurement** chain (mirrors the Phase 30 / 30.1 / 34 / 35 sub-block convention).
```

### Out-of-scope-carries-forward block (every v1.5 sub-block precedent)

**Source:** Every existing ADR-0010 sub-block closes with this block.
**Apply to:** D-04 Phase 37 close sub-block tail.

**Literal shape from Phase 30 sub-block** (lines 74-80):

```markdown
**Out of scope (carries forward):**

- 7-day cron-stability watch on tuned defaults → Phase 31 (LLM-RELI-06)
- Eval-harness ground-truth fixture bundling fix (blocker for D-03 correctness gate) → Phase 31 prerequisite or follow-up plan
- `events:llm:v3:partial` retirement → Phase 35 (SIMPLIFY-02)
- Per-batch adaptive sizing (`V3_ADAPTIVE_BATCH`) — deferred until Phase 31 data argues for it
- Diff-filter cache-key mismatch [...] — follow-up plan TBD
```

**Phase 37 adaptation per CONTEXT `<deferred>` section:**

```markdown
**Out of scope (carries forward to v1.6+):**

- 999.5 Performance Optimization + 1-300 VU k6 sweep — unblocked by Phase 37 acceptance gate; promotes from `.planning/phases/999.5-performance-load-test/` into v1.6 as the first phase
- REVEAL-01 polish (landing page, demo flows, social-share assets, hero GIF) — v1.6 territory
- REVEAL-02 public domain — v1.6 milestone-open scoping question
- Cerebras + Groq adapter restoration — future provider-restoration phase per ADR-0010 Phase 34 sub-block follow-up candidates
- Paid-OR conversion (~$0.04/day = ~$1.20/mo for full coverage) — per ADR-0010 Phase 30.1 sub-block
- Adaptive Retry-After-aware NIM limiter — per ADR-0010 Phase 30 sub-block `retryAfterMs` field already on `callHistory`
- Per-provider eval infrastructure + `cascade_exhausted` DLQ taxonomy — deferred alongside provider restoration
- ADR-0011 Phase 37 sub-block — milestone-close work concentrated in ADR-0010; future "ADR hygiene" phase could add cross-links
- OpenAPI full-spec audit + Zod-handler reconciliation — Phase 36 D-05 capped at additions; future "API hardening" phase
- ROADMAP / REQUIREMENTS retroactive rewording for the 7 framing gaps — future "planning artifact refresh" phase
```

---

## No Analog Found

None. Every Phase 37 file or artifact has at least one strong existing analog in the repo:

| File                         | Analog quality                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ADR-0010 rewrite + sub-block | exact (5 existing sub-blocks in the same file)                                                                 |
| 37-SUMMARY.md                | exact (Phase 35 + Phase 36 SUMMARY.md)                                                                         |
| CHANGELOG[v1.5]              | exact (CHANGELOG[v1.4])                                                                                        |
| ROADMAP.md flips             | exact (Phase 36 row pattern)                                                                                   |
| REQUIREMENTS.md flips        | exact (DOCS-PUB-03 / DOCS-PUB-05 close pattern)                                                                |
| STATE.md flips               | exact (self-mutation of current YAML frontmatter + Current Position prose block)                               |
| prod-connectivity-audit.yml  | read-only (no modification — Step 3 inline node script + sidecar payload shape pinned by audit-status.test.ts) |

This is consistent with Phase 37's character: a pure docs / tracking-flip / close-ritual phase that inherits every pattern from Phase 35 + 36 with one new sub-block append + one new CHANGELOG entry + one acceptance-gate observation.

---

## Metadata

**Analog search scope:** `docs/adr/`, `.planning/phases/35-*`, `.planning/phases/36-*`, `CHANGELOG.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md`, `.github/workflows/`, `server/routes/audit-status.ts`, `server/routes/__tests__/audit-status.test.ts`, `package.json`.

**Files scanned:** 11 (3 ADR + 2 SUMMARY + 1 CHANGELOG + 3 planning + 1 workflow + 1 audit-status route + 1 test).

**Pattern extraction date:** 2026-05-30.

**Project skills directory:** none found (`.claude/skills/` and `.agents/skills/` both absent — no skill files to load).

**CLAUDE.md alignment notes:** Phase 37 ships zero new production cache writers (anti-pattern #17 preserved); the gate observation reads the existing `audit:connectivity:last-result` sidecar (written by the workflow itself; documented in CLAUDE.md §"Active Redis keys"); ADR-0010 References block will cite CLAUDE.md §"LLM Event Pipeline" + §"Serverless Cache" as operator-skim entry points per CONTEXT canonical_refs but does NOT trim CLAUDE.md (Phase 29 D-06 5018-token budget preserved).
