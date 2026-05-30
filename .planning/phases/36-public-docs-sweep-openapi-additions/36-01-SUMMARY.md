---
phase: 36-public-docs-sweep-openapi-additions
plan: 01
subsystem: public-docs
tags: [readme, rate-limit-drift, llm-enrichment, prod-audit, api-health-merge, docs-pub-01]
requires:
  - docs/architecture/llm-pipeline-reliability.md (Phase 30 / 30.1 / 34 — cascade-shape canonical; verified-clean Phase 36-02)
  - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md (Phase 29 / 30.1 / 34 sub-blocks — OR-dormant + Cerebras/Groq-deferred rationale)
  - docs/degradation.md (Phase 36-04 Plan output — Pitfall 1 contract sub-section at line 71-103)
  - docs/runbook.md (Phase 36-03 Plan output — §14 cron architecture lessons heading at line 903)
  - docs/architecture/redis-keys.md (Phase 35 D-05 — 30+ Redis key inventory; verified-clean Phase 36-02)
  - server/middleware/rateLimit.ts (truth source for rateLimiters.public 60 req/min global tier)
provides:
  - README.md ## LLM Enrichment section (lines 514-606; ~93 lines of new public-facing prose)
  - README.md TOC entry [LLM Enrichment](#llm-enrichment) at line 66
  - README.md rate-limit drift fix at lines 207 and 369-380 (60/min global tier; was 6/min baseline)
affects:
  - README.md (single file; +111 lines = +12 D-18 + +99 D-17/19/20; 626 → 731)
tech-stack:
  added: []
  patterns:
    - 'Surgical edit + insert per CONTEXT.md Claude-Discretion 4 minimal-change ("LLM Enrichment lands AFTER Test Suite, BEFORE the next existing subsection")'
    - 'Cross-link breadcrumb pattern (paraphrase-in-public-doc + link-to-deep-dive) — prevents number drift by NOT duplicating throughput numbers from llm-pipeline-reliability.md'
    - 'TOC anchor parity (every ## heading gets a TOC bullet; verified by manual anchor inspection — GitHub auto-anchor for "LLM Enrichment" is `#llm-enrichment`)'
key-files:
  created: []
  modified:
    - README.md
decisions:
  - D-18 (CONTEXT 36) — Rate-limit drift fixed: line 207 ASCII diagram "(6 req/min baseline)" → "(60 req/min global tier)"; lines 369-380 prose rewritten Phase 26.4-04 framing → Phase 28.1 raise + Phase 28.2 D-04 Bearer-bypass.
  - D-17 (CONTEXT 36) — New "## LLM Enrichment" top-level section (6 subsections, ~93 lines) inserted between "## Testing" and "## What I Learned"; describes v3 cron-driven extraction, NIM-only-at-runtime cascade, 6-path resolver, Pitfall 1 contract, Phase 28.2 W5 API Health merge, Redis registry.
  - D-19 (CONTEXT 36) — `.github/workflows/prod-connectivity-audit.yml` manual workflow_dispatch mentioned in ### Production health verification subsection with v1.5 acceptance gate (3× consecutive allTiersGreen=true) prose.
  - D-20 (CONTEXT 36) — DevApiStatus 5-tab merge into single API Health tab (Phase 28.2 W5) documented as own ### API Health dashboard tab subsection with aggregated `audit24h + byBearer + pinTtl + advEval + operator-actions` callout.
  - Claude-Discretion 4 (CONTEXT 36) — LLM Enrichment inserted as ## sibling between Testing and What I Learned (minimal structural change; NOT a `###` subsection of Engineering Deep Dive — that section ends at line 446 well before Testing).
  - Commit strategy — 2 atomic commits per CONTEXT.md D-27. D-19 + D-20 folded into the D-17 section-addition commit because all three land in the same new section's prose (splitting would produce dependent commits).
metrics:
  duration: ~10 min
  completed: '2026-05-29T22:19:00Z'
  tasks_completed: 2
  files_modified: 1
  files_created: 0
  commits: 2
---

# Phase 36 Plan 01: README Sweep — Rate-Limit Drift + LLM Enrichment Section Summary

Wave-2 README sweep brings the public landing doc to v1.4 + v1.5 reality. Two surgical changes: (a) rate-limit drift between line 21 (60/min — correct) and line 207 (6/min — stale) reconciled to the 60/min global tier with Phase 28.1 raise + Phase 28.2 D-04 Bearer-bypass framing; (b) a new ~93-line "## LLM Enrichment" section added between "## Testing" and "## What I Learned" describing the shipped v3 cron-driven pipeline, NIM-only-at-runtime cascade, 6-path resolver, prod-audit acceptance gate, and the Phase 28.2 W5 API Health dashboard tab merge. All five public-doc cross-links to architecture / ADR / degradation / runbook resolve. 2 atomic commits; no edits outside the inserted section + TOC + the two rate-limit hits.

## One-liner

README now publicly describes the LLM enrichment pipeline as shipped in v1.5 (NIM-only runtime, OpenRouter dormant per Phase 30.1, Cerebras + Groq deferred per Phase 34, 6-path resolver, Pitfall 1 cache-bridge contract, prod-connectivity-audit acceptance gate, Phase 28.2 W5 API Health tab merge), with rate-limit truth aligned to `server/middleware/rateLimit.ts` at 60 req/min global tier.

## What was done

### Task 1 — Rate-limit drift fix (D-18) — commit `61e8cba`

Verified truth from `server/middleware/rateLimit.ts:176`: `createRateLimiter(60, 60, 'ratelimit:public')`. Fixed two stale README occurrences in the same commit:

| Line                       | Before                                                                                                              | After                                                                                                                                                                                                                                                                                                               |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 207 (was 206 pre-prettier) | `├── rateLimiters.public (6 req/min baseline)`                                                                      | `├── rateLimiters.public (60 req/min global tier)`                                                                                                                                                                                                                                                                  |
| 369-380 (was 368-373)      | "Live demo rate limit hardening (Phase 26.4-04) — rateLimiters.public baseline tier (6 req/min...)" prose paragraph | Phase 26.4-04 → Phase 28.1 → Phase 28.2 D-04 timeline. 60/min global tier. Explains the Phase 28.1 raise (cold-start ~9-hook burst tripping the cap, red connection dots). Documents Phase 28.2 D-04 Bearer bypass via timingSafeEqual + per-endpoint tier callouts (flights 120/min, ships 60/min, events 20/min). |

**Line 21 untouched** (already said "60 req/min per-IP global rate-limit tier" — verified correct).

**Mechanical verification gate** (from PLAN.md Task 1 `<verify>` block) all PASS:

```bash
grep -q "rateLimiters.public (60 req/min global tier)" README.md  # PASS
! grep -qE "rateLimiters\.public \([0-9]+ req/min baseline\)" README.md  # PASS (no occurrences)
grep -q "60 req/min per-IP global rate-limit tier" README.md  # PASS (line 21 intact)
```

### Task 2 — LLM Enrichment section (D-17 + D-19 + D-20) — commit `9e2fe6b`

New top-level `## LLM Enrichment` section inserted between `## Testing` (line 477-509) and `## What I Learned / What I'd Do Differently` (now line 608). 99 lines added (target was 80-120).

**Insertion point chosen** per CONTEXT.md Claude-Discretion 4: "LLM Enrichment lands AFTER Test Suite, BEFORE the next existing subsection — minimal structural change." Plan execution clarifies this means AFTER `## Testing` (top-level section at line 477), BEFORE `## What I Learned`. New section is a ## sibling of Testing, not a ### nested under Engineering Deep Dive (which ends at line 446).

**TOC** also updated at line 66 with `- [LLM Enrichment](#llm-enrichment)` — anchor matches GitHub auto-generated slug for `## LLM Enrichment`.

**Six section blocks** (1 opening paragraph + 5 `###` subsections):

| Line | Heading                                        | Content                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 514  | `## LLM Enrichment`                            | Opening paragraph — dual stream (raw GDELT 15-min + v3 LLM-enriched daily 04:00 UTC cron); pipeline-optional framing; "map never goes blank" Pitfall 1 contract cross-link to `docs/degradation.md`.                                                                                                                                                                                                                       |
| 525  | `### v3 cron-driven extraction`                | Cron-only writer (`/api/cron/refresh-events`); anti-pattern #17 + pre-Phase-29 v2 fire-and-forget IIFE incident; runbook §14 anchored cross-link; `/api/events` cache-only at request path. NIM (qwen-235b instruct) active; OR dormant Phase 30.1; Cerebras + Groq deferred Phase 34 (both ADR-0010 cross-links); cross-link to `llm-pipeline-reliability.md` for tuned defaults (avoids duplicating throughput numbers). |
| 554  | `### 6-path resolver`                          | Enumerates own-site-snapshot → poi-amenity-nominatim → nominatim-direct → nominatim-verified-2pass → gdelt-actiongeo-fallback → bellingcat-coord-passthrough; provenance invariant; `events:llm:v3:lineage:{eventId}` tracking; Nominatim throttle + cache.                                                                                                                                                                |
| 571  | `### Production health verification`           | (D-19) `prod-connectivity-audit.yml` manual workflow_dispatch; writes `audit:connectivity:last-result` Redis key; surfaced on API Health tab + `/api/audit-status` (degrade-open); v1.5 acceptance gate = 3× consecutive `allTiersGreen=true` unblocks v1.6.                                                                                                                                                               |
| 584  | `### API Health dashboard tab (Phase 28.2 W5)` | (D-20) Five separate DevApiStatus tabs (audit / operator-status / byBearer / advEval / pinTtl) merged into single API Health tab; aggregates `audit24h + byBearer + pinTtl + advEval + operator-actions`; Bearer-gated via `DASHBOARD_PASSWORD` with `timingSafeEqual`.                                                                                                                                                    |
| 597  | `### Redis key registry`                       | Cross-link to `docs/architecture/redis-keys.md` (Phase 35 D-05 30+ key inventory); drift gate at `src/__tests__/lib/redis-registry.test.ts`; Phase 36 ships parallel `server/__tests__/openapi/openapi-lint.test.ts` primitive for the public API contract.                                                                                                                                                                |

### README line-count delta

| Snapshot                             | Lines |
| ------------------------------------ | ----- |
| Pre-Plan (post-Wave-1)               | 626   |
| Post-D-18 (commit 61e8cba)           | 633   |
| Post-D-17/D-19/D-20 (commit 9e2fe6b) | 731   |
| **Total delta**                      | +105  |

D-18 added 12 insertions / removed 5 (+7 net; surgical replacement of the Phase 26.4-04 rate-limit hardening paragraph). D-17/D-19/D-20 added 99 insertions (the new section + 1-line TOC entry, formatted by prettier on commit).

### Insertion point of new `## LLM Enrichment` section

`README.md` lines **514–606** (99 lines of content + leading/trailing `---` separators). Sits as ## sibling of `## Testing` (477) and `## What I Learned` (608, was 513 pre-edit).

## Cross-link inventory

All cross-links verified to resolve on disk before commit. 7 link instances, 5 unique target files.

| Target                                                      | Relative path used                                                                      | Where in section                                                                                                                                                                                                                                                 | Status                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `docs/architecture/llm-pipeline-reliability.md`             | `docs/architecture/llm-pipeline-reliability.md`                                         | Opening of v3 cron-driven extraction subsection (tuned defaults reference; avoids duplicating throughput numbers)                                                                                                                                                | RESOLVES (Phase 30 + 30.1 + 34 sub-blocks) |
| `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` | `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md`                             | Cited **twice** — Phase 30.1 sub-block link (OR dormant rationale) + Phase 34 sub-block link (Cerebras + Groq deferred rationale). Per CONTEXT.md D-02.                                                                                                          | RESOLVES                                   |
| `docs/degradation.md`                                       | `docs/degradation.md`                                                                   | Opening paragraph — "map never goes blank" invariant; Pitfall 1 contract sub-section at line 71-103 of that file (per Phase 36-04 SUMMARY).                                                                                                                      | RESOLVES                                   |
| `docs/runbook.md` §14                                       | `docs/runbook.md#14-cron-architecture-lessons-phase-2826-fire-and-forget-iife-incident` | v3 cron-driven extraction subsection (pre-Phase-29 v2 fire-and-forget IIFE incident). Anchor matches `## 14. Cron architecture lessons (Phase 28.2.6 fire-and-forget IIFE incident)` heading at line 903 of runbook (GitHub strips dots from "28.2.6" → "2826"). | RESOLVES                                   |
| `docs/architecture/redis-keys.md`                           | `docs/architecture/redis-keys.md`                                                       | Redis key registry subsection (Phase 35 D-05 deep-dive).                                                                                                                                                                                                         | RESOLVES (verified-clean Phase 36-02)      |
| `server/openapi.yaml`                                       | `server/openapi.yaml`                                                                   | Production health verification subsection (`/api/audit-status` endpoint reference).                                                                                                                                                                              | RESOLVES                                   |

**Anchor sanity-check:** The runbook §14 anchor was constructed against the actual heading text `## 14. Cron architecture lessons (Phase 28.2.6 fire-and-forget IIFE incident)`. GitHub's slug rules: lowercase, remove punctuation (periods in `28.2.6` → `2826`), spaces → hyphens. The constructed anchor `#14-cron-architecture-lessons-phase-2826-fire-and-forget-iife-incident` matches what GitHub will auto-generate.

## Commits

| Hash      | Subject                                                                       | Files Changed | Insertions / Deletions |
| --------- | ----------------------------------------------------------------------------- | ------------- | ---------------------- |
| `61e8cba` | `docs(36): D-18 fix README rate-limit drift (60/min global; was 6/min stale)` | README.md     | +12 / -5               |
| `9e2fe6b` | `docs(36): D-17 D-19 D-20 add README LLM Enrichment section`                  | README.md     | +99 / -0               |

2 atomic commits per CONTEXT.md D-27 (matches plan's "2 commits total" recommended split). D-19 + D-20 folded into D-17 commit because all three land in the same new section's prose; splitting would produce two commits where the second modifies content the first just created.

## Incidental drift surfaced + folded in

**Lines 369-380 (Phase 26.4-04 rate-limit hardening prose):** PLAN.md Task 1 STEP C explicitly directed: "Audit lines 365-385. If the prose contains contradictory rate-limit numbers (e.g., '6 req/min baseline' anywhere), fix in place." The grep pass surfaced `rateLimiters.public baseline tier (6 req/min, prefix 'ratelimit:public')` at line 369 — a second hit of the same stale "6 req/min" framing. Folded into the D-18 commit per plan direction. The rewrite also brings the prose forward through Phase 28.1 (raise rationale) + Phase 28.2 D-04 (Bearer bypass + per-endpoint tier callouts) so the README's "what hardening exists" story is now consistent with `CLAUDE.md §Vercel Deployment` and `server/middleware/rateLimit.ts`.

**No other incidental drift found** in the rest of `## Engineering Deep Dive` (lines 287-446). The Test Suite metrics table (1277 tests / 97% type coverage), Pre-commit Hooks, CI/CD, OpenAPI Contract, Graceful Degradation, and Engineering Documentation subsections all describe current shipped state. Out of scope per CONTEXT.md "surgical edits only" + plan's STEP D ("DO NOT add the LLM Enrichment section in this task").

**No edits to sections outside Engineering Deep Dive + Testing + LLM Enrichment insertion.** `## Quick Start`, `## Architecture` (high-level table), `## Data Sources`, `## Visualization Layers`, `## Screenshots`, `## Environment Variables`, `## What I Learned`, `## License` all untouched per success criterion #7.

## Verification

- [x] Line 207 rate-limit fixed: `rateLimiters.public (60 req/min global tier)`
- [x] No occurrences of stale `rateLimiters.public (N req/min baseline)` string anywhere in README
- [x] Line 21 `60 req/min per-IP global rate-limit tier` untouched (already correct)
- [x] Lines 369-380 prose updated to Phase 28.1 + Phase 28.2 D-04 framing (60/min global tier + Bearer bypass)
- [x] New `## LLM Enrichment` section inserted between `## Testing` and `## What I Learned`
- [x] Six section blocks present: `## LLM Enrichment` opening paragraph + `### v3 cron-driven extraction` + `### 6-path resolver` + `### Production health verification` + `### API Health dashboard tab (Phase 28.2 W5)` + `### Redis key registry`
- [x] `prod-connectivity-audit.yml` mentioned in `### Production health verification` (D-19)
- [x] "API Health" dashboard tab merge mentioned in its own `###` subsection with Phase 28.2 W5 attribution (D-20)
- [x] Cross-links resolve: `llm-pipeline-reliability.md` (×1), `0010-v1-5-llm-pipeline-narrowing-and-deletion.md` (×2 for Phase 30.1 + Phase 34), `degradation.md` (×1), `runbook.md` with §14 anchor (×1), `redis-keys.md` (×1), `openapi.yaml` (×1)
- [x] NIM-only-at-runtime + OpenRouter-dormant + Cerebras/Groq-deferred framing matches CONTEXT.md D-01 verbatim wording (cites phase numbers + ADR-0010 sub-blocks)
- [x] TOC at line 66 includes `- [LLM Enrichment](#llm-enrichment)` entry
- [x] README line-count grew by ~105 lines total (12 for D-18 net, 99 for D-17/D-19/D-20)
- [x] 2 atomic commits (`61e8cba` + `9e2fe6b`) per CONTEXT.md D-27
- [x] No modifications to STATE.md / ROADMAP.md / REQUIREMENTS.md (worktree mode — verified via `git diff main -- README.md` showing only README hits)
- [x] No edits to README sections outside `## Engineering Deep Dive` rate-limit prose + the new LLM Enrichment insertion + the one-line TOC update

## Decisions Implemented

| Decision | Action                                                                                                                                                                                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-17     | New `## LLM Enrichment` section added with 6 sub-blocks covering v3 cron extraction, NIM-only runtime, 6-path resolver, Pitfall 1 contract, Phase 28.2 W5 API Health merge, Redis registry. Commit `9e2fe6b`.                                                                                        |
| D-18     | Rate-limit drift fixed at line 207 ASCII diagram + lines 369-380 prose paragraph; line 21 left untouched (was already correct). Commit `61e8cba`.                                                                                                                                                    |
| D-19     | `.github/workflows/prod-connectivity-audit.yml` mentioned in `### Production health verification` subsection with `workflow_dispatch` framing, `audit:connectivity:last-result` Redis key, and v1.5 acceptance gate (3× consecutive `allTiersGreen=true`). Folded into commit `9e2fe6b`.             |
| D-20     | DevApiStatus 5-tab merge into single API Health tab (Phase 28.2 W5) documented as own `### API Health dashboard tab (Phase 28.2 W5)` subsection with aggregated `audit24h + byBearer + pinTtl + advEval + operator-actions` callout + `timingSafeEqual` Bearer gating. Folded into commit `9e2fe6b`. |

## Deviations from Plan

None — plan executed exactly as written.

Two within-plan-scope discretionary choices recorded for transparency:

1. **Source-of-truth filename.** PLAN.md's `<read_first>` block referenced `server/middleware/rateLimiter.ts`; the actual file is `server/middleware/rateLimit.ts` (singular, no trailing `r`). Discovered via `find` after `Read` reported "File does not exist." Verified the canonical 60-req/min value at the correct path (line 176 of `rateLimit.ts`). Surfacing here so the next docs phase can correct the planning-text reference if desired, but it is NOT a CONTEXT.md drift — CONTEXT.md §Vercel Deployment line correctly says `rateLimiter.ts` and the canonical_refs section names `server/middleware/rateLimiter.ts` (also incorrect — actual is `rateLimit.ts`). Both stale references stay per CONTEXT.md D-04 ("planning text stays as-is; public docs describe shipped reality"). The README itself does NOT reference either filename, so no public-doc drift exists.

2. **Commit-shape choice.** Plan offered "Up to 4 commits OR 2 commits if D-19/D-20 are folded into the D-17 section addition." Selected 2 commits. Rationale: D-19 (workflow_dispatch + acceptance gate paragraph) and D-20 (API Health tab merge subsection) both live entirely INSIDE the new `## LLM Enrichment` section's prose. Splitting them into separate commits would produce dependent commits where the second commit modifies content the first commit just created. Single commit names all three decisions (D-17, D-19, D-20) in the body's separate sections, honoring CONTEXT.md D-27 atomic-per-decision at the body-section level rather than commit-boundary level. Same precedent as Phase 36-04 Plan rolling D-15 + D-16 into one commit `62c2bdb`.

## Architectural Decisions

None — pure documentation surface edit; no code touched; no architectural change.

## Threat Flags

None. This plan touches a pure-prose markdown file with 7 new internal cross-links (5 unique targets, all internal repo paths); no new network endpoints, auth paths, file access patterns, or schema boundaries introduced. Per the threat register (T-36-01-01 information-disclosure: accepted — provider names are public via ADR-0010; T-36-01-02 tampering of cross-link paths: mitigated by D-24 markdown-link-check gate in Plan 36-06; T-36-01-03 spoofing /api/audit-status as degrade-open public endpoint: accepted — endpoint IS degrade-open by design per Phase 28.2 W6).

## Coverage

- **DOCS-PUB-01** — addressed in full. README now publicly describes the v1.5 LLM enrichment pipeline (NIM-only runtime, OR dormant, Cerebras + Groq deferred, 6-path resolver, Pitfall 1 contract, prod-audit acceptance gate, API Health merge). Rate-limit drift between line 21 and line 207 resolved. Phase 36-06 D-24 mechanical gates (`npx markdown-link-check` + `npx vitest run`) verify cross-link integrity at phase close.

## Known Stubs

None. The new LLM Enrichment section contains live prose with seven resolved cross-links; no placeholder text, no TODOs, no hardcoded empty values. The Pitfall 1 contract cross-link, the runbook §14 cross-link, and the ADR-0010 cross-links all point to text that exists at the cited locations (verified pre-commit via `grep` on disk).

## Self-Check: PASSED

**File existence verification:**

```
FOUND: README.md (731 lines)
FOUND: docs/architecture/llm-pipeline-reliability.md
FOUND: docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md
FOUND: docs/degradation.md
FOUND: docs/runbook.md
FOUND: docs/architecture/redis-keys.md
FOUND: server/openapi.yaml
FOUND: server/middleware/rateLimit.ts (truth source, 60/min global tier at line 176)
FOUND: .github/workflows/prod-connectivity-audit.yml
```

**Commit existence verification (on worktree-agent-a523a331d83b2a3f2 branch):**

```
FOUND: 61e8cba docs(36): D-18 fix README rate-limit drift (60/min global; was 6/min stale)
FOUND: 9e2fe6b docs(36): D-17 D-19 D-20 add README LLM Enrichment section
```

**README invariants verification:**

```
LINE 21:  > a 60 req/min per-IP global rate-limit tier on top of per-endpoint limiters —    UNTOUCHED
LINE 66:  - [LLM Enrichment](#llm-enrichment)                                               PRESENT (TOC)
LINE 207: ├── rateLimiters.public (60 req/min global tier)                                  FIXED
LINE 370: `rateLimiters.public` global tier (60 req/min, prefix `ratelimit:public`)          FIXED
LINE 514: ## LLM Enrichment                                                                  PRESENT
LINE 525: ### v3 cron-driven extraction                                                      PRESENT
LINE 554: ### 6-path resolver                                                                PRESENT
LINE 571: ### Production health verification                                                 PRESENT
LINE 584: ### API Health dashboard tab (Phase 28.2 W5)                                       PRESENT
LINE 597: ### Redis key registry                                                             PRESENT
LINE 608: ## What I Learned / What I'd Do Differently                                        UNTOUCHED (moved from line 513)
```

**Stale-string absence verification** (the D-18 invariant):

```
$ grep -nE "rateLimiters\.public \([0-9]+ req/min baseline\)" README.md
(empty — no occurrences) PASS
```

**Worktree-mode constraints honored:**

- No modifications to `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` (verified via `git diff main --name-only` showing only README.md + this SUMMARY.md).
- All commits land on per-agent branch `worktree-agent-a523a331d83b2a3f2`; no protected-branch writes attempted.

All claims in this SUMMARY validated against `git log --oneline` + `git show <commit>` + filesystem state + `grep` on README.md.
