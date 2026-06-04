# Phase 36: Public Docs Sweep + OpenAPI Additions — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-29
**Phase:** 36-public-docs-sweep-openapi-additions
**Areas discussed:** Cascade language stance, OpenAPI scope, Architecture docs touch scope, Anything-else gap-fill, Plan structure granularity

---

## Cascade language stance

### Q1: How should README + architecture body describe the v3 LLM pipeline cascade?

| Option                                          | Description                                                                                                                                          | Selected |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Honest shipped reality                          | "NIM-only at runtime; OpenRouter dormant (Phase 30.1); Cerebras + Groq deferred (Phase 34)." Matches `routingTrace` and llm-pipeline-reliability.md. | ✓        |
| Hybrid — declared chain + dormant-state callout | "NIM (primary) → OpenRouter (declared fallback, currently dormant)" + footnote on Cerebras/Groq deferred.                                            |          |
| Aspirational ROADMAP wording                    | "NIM + OpenRouter narrowed cascade." Contradicts shipped routingTrace.                                                                               |          |

**User's choice:** Honest shipped reality
**Notes:** Locks the framing across README + 3 architecture docs + runbook + degradation.

### Q2: How explicit should the docs be about WHY OpenRouter is dormant + Cerebras/Groq deferred?

| Option                                                  | Description                                                           | Selected |
| ------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Cite phase + ADR-0010 inline                            | Phase number + ADR cross-link per provider. High information density. | ✓        |
| Terse — "currently dormant" / "currently deferred" only | No phase numbers; rationale lives in ADR-0010.                        |          |
| Phase numbers only, no ADR cross-link                   | "Phase 30.1: OR dormant. Phase 34: Cerebras + Groq deferred."         |          |

**User's choice:** Cite phase + ADR-0010 inline

### Q3: How should runbook handle the v3 → raw GDELT fallback chain wording?

| Option                         | Description                                                                                        | Selected |
| ------------------------------ | -------------------------------------------------------------------------------------------------- | -------- |
| Rewrite to shipped chain       | "v3 → raw GDELT (Pitfall 1 terminal fallback)." Acknowledges ROADMAP wording was stale in SUMMARY. | ✓        |
| Annotate the chain             | "v3 → raw GDELT (v1/v2 retired Phase 29)." Preserves historical waymarker.                         |          |
| Keep ROADMAP wording literally | "v3 → v2 → v1 → raw GDELT" even though modules don't exist.                                        |          |

**User's choice:** Rewrite to shipped chain

### Q4: Update ROADMAP/REQUIREMENTS wording to match shipped reality during this phase?

| Option                                     | Description                                         | Selected |
| ------------------------------------------ | --------------------------------------------------- | -------- |
| Leave ROADMAP/REQUIREMENTS untouched       | Planning text stays; SUMMARY notes the framing gap. | ✓        |
| Strikethrough/annotate ROADMAP phase entry | Small ROADMAP edit with parenthetical.              |          |
| Full ROADMAP/REQUIREMENTS update           | Rewrite Phase 36 SC + DOCS-PUB-01/02. Scope creep.  |          |

**User's choice:** Leave ROADMAP/REQUIREMENTS untouched

---

## OpenAPI scope

### Q1: OpenAPI sweep scope — additions-only or audit the existing 14 entries too?

| Option                         | Description                                                    | Selected |
| ------------------------------ | -------------------------------------------------------------- | -------- |
| Additions + lightweight verify | 5 new endpoints + single-pass verify on existing 14.           | ✓        |
| Strict additions-only          | 5 new endpoints; explicitly no review of existing 14.          |          |
| Full audit + additions         | Reconcile every spec entry against its handler. Massive scope. |          |

**User's choice:** Additions + lightweight verify

### Q2: OpenAPI security schemes — single bearerAuth or split by purpose?

| Option                                   | Description                                                 | Selected |
| ---------------------------------------- | ----------------------------------------------------------- | -------- |
| Split: cronSecret + operatorBearer       | Two scheme entries; /api/cron/refresh-events declares both. | ✓        |
| Single bearerAuth                        | One scheme; description prose distinguishes paths.          |          |
| No scheme — just per-path security notes | Skip components.securitySchemes.                            |          |

**User's choice:** Split: cronSecret + operatorBearer

### Q3: Response schema depth — inline, $ref components, or hybrid?

| Option                                          | Description                                         | Selected |
| ----------------------------------------------- | --------------------------------------------------- | -------- |
| Hybrid — reusable to components, one-off inline | Matches existing spec's CacheResponse $ref pattern. | ✓        |
| All inline                                      | Duplication risk if shapes change.                  |          |
| Everything $ref'd into components               | Navigation-heavy; no value for one-off shapes.      |          |

**User's choice:** Hybrid

### Q4: Mechanical validation of updated OpenAPI spec?

| Option                                      | Description                                              | Selected |
| ------------------------------------------- | -------------------------------------------------------- | -------- |
| Lint gate via `npx @redocly/cli lint`       | Vitest shells out; fails CI on spec errors.              | ✓        |
| JS-YAML parse + handwritten invariants only | Catches structural issues; misses spec-conformance bugs. |          |
| Trust on read — spot-check during review    | Zero infra; relies on operator vigilance.                |          |

**User's choice:** Lint gate via `npx @redocly/cli lint`

---

## Architecture docs touch scope

### Q1: Architecture docs sweep — selective or full audit?

| Option                              | Description                                                            | Selected |
| ----------------------------------- | ---------------------------------------------------------------------- | -------- |
| Targeted v1.5-drift sweep           | Audit all 12 files; edit only where drift; written audit row per file. | ✓        |
| Strict selective (Phase 36 minimum) | Edit only system-context + data-flows + deployment.                    |          |
| Full audit and edit pass            | Rewrite-for-clarity every paragraph + diagram.                         |          |

**User's choice:** Targeted v1.5-drift sweep

### Q2: Mermaid diagrams — inline-edit, regenerate, or leave alone unless drift?

| Option                                    | Description                                                     | Selected |
| ----------------------------------------- | --------------------------------------------------------------- | -------- |
| Edit only diagrams with v1.5 drift        | Walk 22 blocks; inline-edit drifted ones; verify GitHub render. | ✓        |
| Full diagram regeneration                 | Re-author every diagram. High cost.                             |          |
| Audit, but don't edit diagrams this phase | Note drift in SUMMARY; defer.                                   |          |

**User's choice:** Edit only diagrams with v1.5 drift

### Q3: Architecture file count drift (planning says 10, reality is 12) — reconcile?

| Option                                | Description                                       | Selected |
| ------------------------------------- | ------------------------------------------------- | -------- |
| Note in SUMMARY.md only               | Planning-text policy consistency with cascade Q4. | ✓        |
| Update PROJECT.md "three tracks" line | Small edit to milestone goal line.                |          |
| Both PROJECT and ROADMAP updated      | Reconcile all mentions.                           |          |

**User's choice:** Note in SUMMARY.md only

### Q4: Audit-trail format for architecture sweep?

| Option                           | Description                                | Selected |
| -------------------------------- | ------------------------------------------ | -------- |
| Inline audit table in SUMMARY.md | 12 file rows + 22 diagram rows ≈ 34 total. | ✓        |
| Brief prose section in SUMMARY   | Less mechanical traceability.              |          |
| Separate AUDIT.md in phase dir   | Extra artifact to maintain.                |          |

**User's choice:** Inline audit table in SUMMARY.md

---

## Anything-else gap-fill

### Q1: Runbook v1.4/v1.5 incidents — standalone sections or fold?

| Option                                       | Description                                                         | Selected |
| -------------------------------------------- | ------------------------------------------------------------------- | -------- |
| 4 new standalone sections, full SRE template | Numbered 13-16 with Symptom/Detection/Cause/Remediation/Prevention. | ✓        |
| Fold into existing                           | NIM throttle → §10; cron → §9; force-trigger + audit retry → §11.   |          |
| Compressed — 1 new section covering all 4    | Single "v1.5 LLM-RELI track lessons" section.                       |          |

**User's choice:** 4 new standalone sections

### Q2: Hero GIF + screenshot regeneration policy?

| Option                          | Description                                 | Selected |
| ------------------------------- | ------------------------------------------- | -------- |
| Visual-staleness check only     | Regen only if URL bar / UI visibly drifted. | ✓        |
| Skip entirely — hold all assets | Defer to v1.6 REVEAL-01.                    |          |
| Full regen sweep                | Re-record everything.                       |          |

**User's choice:** Visual-staleness check only

### Q3: README structure — where does new v3 LLM pipeline description live?

| Option                                                      | Description                                                | Selected |
| ----------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| New "LLM Enrichment" subsection under Engineering Deep Dive | Single new ## section after Test Suite.                    | ✓        |
| Sprinkle across existing sections                           | Pipeline notes in Data Sources + Engineering + Rate limit. |          |
| Standalone top-level section near Data Sources              | Conceptual mismatch — pipeline isn't a data source.        |          |

**User's choice:** New "LLM Enrichment" subsection

### Q4: CHANGELOG.md v1.5 entry now or defer to Phase 37?

| Option                                   | Description                           | Selected |
| ---------------------------------------- | ------------------------------------- | -------- |
| Defer to Phase 37 milestone close        | Matches v1.4 close ritual.            | ✓        |
| Write provisional v1.5 entry now         | Two-writers-one-section pattern risk. |          |
| No CHANGELOG entry at all this milestone | Breaks v1.0..v1.4 pattern.            |          |

**User's choice:** Defer to Phase 37

### Additional follow-up areas (expansion round)

**Runbook section 6 stale '10-second limit'** — Rewrite-in-place: "Vercel function timeout (300s default / 800s configured ceiling)" with anchor shim for backwards links.

**ADR-0011 (v3 pipeline architecture, 2026-05-12) touch?** — Append Phase 30.1/34 sub-block cross-linking to ADR-0010.

**robots.txt + index.html meta tags audit?** — Quick verify-only; edit only if drift; full SEO sweep deferred to v1.6 REVEAL-01.

**docs/brainstorms + docs/superpowers archival?** — Leave as-is per Phase 35 D-09 historical-waymarker principle.

---

## Plan structure granularity

### Q1: How many plans should Phase 36 decompose into?

| Option                                      | Description                                                                   | Selected |
| ------------------------------------------- | ----------------------------------------------------------------------------- | -------- |
| 5 plans, one per requirement family + close | 01 README, 02 architecture, 03 runbook, 04 degradation, 05 OpenAPI, 06 close. | ✓        |
| 3 plans — public-docs / openapi / close     | Bigger commit batches; faster planner pass.                                   |          |
| 7+ plans — one per artifact + endpoint      | Plan-count overhead.                                                          |          |

**User's choice:** 5 plans + close

### Q2: Plan execution — sequential or parallel waves?

| Option                                                                    | Description                                              | Selected |
| ------------------------------------------------------------------------- | -------------------------------------------------------- | -------- |
| Two waves: arch+runbook+degradation+OpenAPI parallel, then README + close | Wave 1 parallel (02-05); Wave 2 (01); Wave 3 (06 close). | ✓        |
| Fully sequential                                                          | 01 → 02 → 03 → 04 → 05 → 06.                             |          |
| Everything parallel then close                                            | Risk of README cross-linking to mid-sweep state.         |          |

**User's choice:** Two waves

### Q3: Commit discipline — atomic-per-D vs atomic-per-file vs atomic-per-plan?

| Option                    | Description                          | Selected |
| ------------------------- | ------------------------------------ | -------- |
| Atomic per decision (D-N) | Matches Phase 30/33/34/35 invariant. | ✓        |
| Atomic per file           | One commit per touched file.         |          |
| Atomic per plan           | One commit per plan.                 |          |

**User's choice:** Atomic per decision

### Q4: Verification gate — what must be green before phase close?

| Option                                      | Description                  | Selected |
| ------------------------------------------- | ---------------------------- | -------- |
| vitest + redocly lint + markdown link check | 3 mechanical gates.          | ✓        |
| vitest + redocly lint only                  | No markdown link check.      |          |
| vitest only                                 | Minimal infra; no new gates. |          |

**User's choice:** vitest + redocly lint + markdown link check

---

## Claude's Discretion

- ADR-0011 sub-block lands in Plan 02 (architecture sweep) vs Plan 06 (close) — recommended Plan 02.
- `markdown-link-check` scope: `docs/` + README vs include `.planning/` — recommended docs/ + README only.
- OpenAPI `examples:` blocks alongside `schema:` — recommended yes for 200 responses (~1 example per endpoint).
- README "Engineering Deep Dive" subsection ordering — recommended LLM Enrichment after Test Suite, before next existing subsection.
- Runbook section 13 (NIM throttle) cross-link to `llm-pipeline-reliability.md` Path B framing vs paraphrase — recommended cross-link.
- New OpenAPI endpoint `tags:` — recommended split by purpose: `operator` (audit/operator/llm-pipeline/llm-replay), `cron` (refresh/health/warm).
- SUMMARY.md format — recommended closing-table per Phase 35 precedent.

---

## Deferred Ideas

- **Phase 37:** DOCS-PUB-04 (ADR-0010 milestone-close sub-block), LLM-RELI-07 (3× consecutive prod-audit greens), CHANGELOG[v1.5] entry.
- **v1.6 REVEAL-01:** Full hero/screenshot regeneration, SEO + social-share audit, landing-page polish.
- **Future ops phases:** OpenAPI full-spec audit (Zod/handler reconciliation), full Mermaid diagram modernization, docs/brainstorms+superpowers archival, ROADMAP/REQUIREMENTS retroactive rewording, per-phase CHANGELOG entries, `docs/api/openapi.yaml` relocation, quarterly architecture-doc audit cadence.

---

_Discussion conducted via /gsd:discuss-phase 36 on 2026-05-29._
