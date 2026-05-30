# Phase 36: Public Docs Sweep + OpenAPI Additions — Context

**Gathered:** 2026-05-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Bring the three public-facing documentation surfaces (README, `docs/architecture/` markdown + Mermaid diagrams, `docs/runbook.md`, `docs/degradation.md`) and the API contract (`server/openapi.yaml`) into v1.4 + v1.5 reality. Add the 5 missing v1.4-introduced endpoints to the OpenAPI spec; verify the 2 cron endpoints (`/api/cron/health`, `/api/cron/warm`) already in the spec for accuracy. Install a mechanical lint gate on the OpenAPI spec + a markdown-link check so doc drift fails CI.

**Requirements covered (this phase):** DOCS-PUB-01, DOCS-PUB-02, DOCS-PUB-03, DOCS-PUB-05, DOCS-API-01, DOCS-API-02, DOCS-API-03, DOCS-API-04, DOCS-API-05, DOCS-API-06, DOCS-API-07.

**Out of scope (deferred elsewhere):**

- **DOCS-PUB-04 ADR-0010.** Phase 37 territory. ADR-0010 already exists at `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` with Phase 29/30/30.1/34/35 sub-blocks; Phase 37 appends the milestone-close sub-block + acceptance-gate observation.
- **LLM-RELI-07 acceptance gate (3× consecutive prod-audit greens).** Phase 37 territory.
- **CHANGELOG[v1.5] entry.** Deferred to Phase 37 milestone-close ritual (mirrors how v1.4 CHANGELOG was written at v1.4 close). Avoids two-writers-one-section pattern.
- **REVEAL-01 polish (landing-page, demo flows, social-share assets).** v1.6 territory. Full hero/screenshot regen + SEO sweep deferred.
- **Internal docs (CLAUDE.md, JSDoc).** Phase 35 territory; already shipped.
- **TTL right-sizing, Redis registry, partial-key retirement.** Phase 35 territory; already shipped.
- **Cerebras + Groq adapter restoration.** Phase 34 closed as `cerebras-groq-deferred`; not relitigated.
- **ROADMAP.md / REQUIREMENTS.md wording updates.** Per cascade Q4: the planning-artifact wording ("NIM + OpenRouter narrowed cascade", "10 markdown files / 21 Mermaid diagrams", "v3 → v2 → v1 → raw GDELT") stays as-is; SUMMARY.md notes the framing gap. Docs the world reads are the surface of truth, not the planning text.
- **OpenAPI full-spec audit of the 14 existing entries.** Lightweight verification pass during additions; not a full audit. Drift fixes land as small inline edits, but no Zod/route-handler reconciliation sweep.
- **Full Mermaid diagram regeneration.** Edit only diagrams with v1.5 drift (v1/v2 module references, Cerebras/Groq nodes, pre-rename domain). Untouched diagrams stay.
- **`docs/brainstorms/` + `docs/superpowers/` archival.** Left as historical waymarkers per Phase 35 D-09 principle.

**Carrying forward (locked, not re-decided here):**

- **v1/v2 LLM extractors deleted entirely Phase 29 (Plans 04-06).** The shipped cascade is **v3 → raw GDELT** via the Pitfall 1 cache bridge in `server/routes/events.ts`. There is no v2 path; there is no v1 path. The ROADMAP wording "v3 → v2 → v1 → raw GDELT" predates the deletion.
- **NIM-only at runtime.** OpenRouter dormant (`skipOpenRouter: true` at `server/lib/llmEventExtractor.v3.ts:622, 929` per Phase 30.1; free-tier probe landed in not-viable bucket). Cerebras + Groq deferred (Phase 34; no probe, no adapter; operator chose to skip provisioning). `docs/architecture/llm-pipeline-reliability.md` Phase 30.1 + Phase 34 sub-blocks document this accurately.
- **Pitfall 1 cache bridge is invariant (ADR-0010).** When `events:llm:v3` is empty, `server/routes/events.ts` serves raw GDELT. The map never goes blank. Phase 36 documents this contract; never weakens it.
- **`events:llm:v3` is the only terminal cache key.** Per Phase 35 D-12, the `events:llm:v3:partial` observability key was retired. Docs reflect the single-terminal-key shape.
- **Cron-only writer discipline (anti-pattern #17).** Phase 36 ships zero new writers to production cache state. The OpenAPI additions document existing endpoints; they do not introduce new write paths.
- **Branch-per-phase from `main`** (`feature/36-public-docs-sweep-openapi-additions`). CONTEXT.md, DISCUSSION-LOG.md, and the discuss checkpoint may sit on the current branch as scaffold.
- **Atomic per-decision commits.** Each D-N that touches a file lands as a separate commit (Phase 30 D-08 / Phase 30.1 D-17 / Phase 32/33/34 D-25 / Phase 35 D-26 invariant). `docs(36):` / `feat(36):` / `chore(36):` / `test(36):` prefixes with body that names the decision number.
- **TypeScript ~5.9.3 pinned.** Any new test code uses `logger.child({ module: '...' })` — never `console.*`.
- **Vercel Pro 800s `maxDuration`.** Live since Phase 29 D-08. This justifies retiring the "10-second limit" framing from runbook section 6.
- **OpenAPI spec at `server/openapi.yaml`.** ROADMAP success criterion #5 mentions "`docs/api/openapi.yaml` (or equivalent path)" — the equivalent path is `server/openapi.yaml` (existing 1260-line spec). No spec relocation. Badge + README link already point here.
- **`docs/architecture/llm-pipeline-reliability.md` is current.** Phase 30 + Phase 30.1 + Phase 34 sub-blocks document the shipped NIM-only state. Phase 36 cross-links from README to this doc; doesn't rewrite it.
- **`docs/architecture/redis-keys.md` is current.** Phase 35 D-05 shipped the deep-dive table. Phase 36 cross-links from README/runbook; doesn't rewrite it.
- **Schema-pinning contract test pattern.** Phase 36's OpenAPI lint gate mirrors Phase 32 D-22 (`urlLiveness.schema.test.ts`), Phase 33 D-07 (`actorCatalog.test.ts`), Phase 35 D-01 (`redis-registry.test.ts`), `colorBridge.test.ts` byte-identity sentinel.

</domain>

<decisions>
## Implementation Decisions

### Cascade language across all public surfaces

- **D-01: Honest shipped reality across README + architecture body + runbook.** Public-facing docs describe the LLM pipeline as **"v3 cron-driven extraction; NIM-only at runtime (OpenRouter dormant; Cerebras + Groq deferred)."** This matches the live `routingTrace` and the existing `docs/architecture/llm-pipeline-reliability.md` Phase 30.1 + Phase 34 sub-blocks. The ROADMAP success-criterion wording "NIM + OpenRouter narrowed cascade" is honored conceptually (the cascade construction in `server/lib/freeClaudeRouter.ts:341-363` is unchanged and ready to fall through) but the README and runbook describe **runtime state**, not declared chain.

- **D-02: Cite phase number + ADR-0010 inline for each provider state.** Public docs say: "OpenRouter dormant per Phase 30.1 (free-tier probe landed in not-viable bucket; see [ADR-0010](docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md) Phase 30.1 sub-block). Cerebras + Groq deferred Phase 34 (operator chose to skip provisioning; see ADR-0010 Phase 34 sub-block)." Reader navigates to ADR-0010 for full rationale; phase numbers are the breadcrumb.

- **D-03: Rewrite runbook + degradation chain to "v3 → raw GDELT".** Both `docs/runbook.md` and `docs/degradation.md` describe the Pitfall 1 fallback chain as **"v3 → raw GDELT (Pitfall 1 terminal fallback)"** — no v1, no v2. The ROADMAP wording "v3 → v2 → v1 → raw GDELT" is acknowledged in SUMMARY.md as stale (predates Phase 29 v1/v2 deletion). The docs the world reads describe shipped code; not aspirational chain.

- **D-04: Leave ROADMAP/REQUIREMENTS wording untouched.** Phase 36 deliverable is public-doc + OpenAPI accuracy. The planning-text policy: GSD planning artifacts ("NIM + OpenRouter narrowed cascade", "10 markdown files / 21 Mermaid diagrams", "v3 → v2 → v1 → raw GDELT") are the historical brief. SUMMARY.md records all three framing gaps as "known stale wording in planning artifacts; intentionally not retroactively edited."

### OpenAPI scope (DOCS-API-01..07)

- **D-05: Additions + lightweight verification, no full audit.** Add the 5 missing endpoints: `/api/audit-status` (DOCS-API-01), `/api/operator-status` (DOCS-API-02), `/api/events/llm-pipeline` GET + POST (DOCS-API-03), `/api/events/llm-replay/:groupKey` (DOCS-API-04), `/api/cron/refresh-events` (DOCS-API-05). Verify the 2 already-present cron endpoints (`/api/cron/health` DOCS-API-06, `/api/cron/warm` DOCS-API-07) against current handlers — fix drift inline if found, otherwise note "verified accurate as of Phase 36" in SUMMARY. The 12 other existing entries (flights / ships / events / news / markets / weather / sites / water / water/precip / geocode / sources / health) get a single-pass eyeball pass; drift fixes land as small inline edits in the same plan if surfaced; no Zod/route-handler reconciliation sweep.

- **D-06: Split security schemes — `cronSecret` + `operatorBearer`.** `components.securitySchemes` declares two Bearer schemes: `cronSecret` (CRON_SECRET, used by the 3 cron paths) and `operatorBearer` (DASHBOARD_PASSWORD, used by `/api/operator-status` + `/api/events/llm-pipeline` POST + `/api/events/llm-replay`). `/api/cron/refresh-events` declares **both** via `security: [{cronSecret: []}, {operatorBearer: []}]` (oneOf) since it accepts CRON_SECRET in cron runs AND DASHBOARD_PASSWORD for operator force-trigger. The README's existing "Bearer-gated" prose stays high-level; the OpenAPI spec carries the machine-readable distinction.

- **D-07: Hybrid response-shape strategy — reusable to `components`, one-off inline.** Shapes that repeat go to `components/schemas`: `AuditTierStatus`, `ByBearerMap`, `LlmPipelineState`, `LlmReplayDiff`. Endpoint-unique shapes stay inline (e.g., the llm-replay 404 envelope; the refresh-events `?force=true` skipped-vs-ran response variants). Matches the existing spec's $ref pattern (flights/ships/events all use `CacheResponse<T>` $ref).

- **D-08: Mechanical lint gate via `@redocly/cli`.** Add a vitest at `server/__tests__/openapi/openapi-lint.test.ts` that shells out to `npx @redocly/cli lint server/openapi.yaml --format=stylish` and asserts exit code 0. Add `openapi:lint` script in `package.json`. Drift in spec syntax, $refs, required fields fails CI on the next `vitest run`. Same precedent shape as the redis-registry / urlLiveness / actorCatalog / colorBridge contract tests.

### Architecture docs sweep (DOCS-PUB-02)

- **D-09: Targeted v1.5-drift sweep across all 12 files.** Audit each of the 12 markdown files in `docs/architecture/` + `docs/architecture/ontology/` against shipped v1.5 reality; EDIT only files where drift is found. Phase 35 already shipped `llm-pipeline-reliability.md` + `redis-keys.md` current — both verified-clean during sweep. Files most likely to need edits: `system-context.md`, `data-flows.md`, `deployment.md`, `frontend.md`, `ontology/state-machines.md`. Files likely verified-clean: `README.md` (architecture index), `ontology/README.md`, `ontology/types.md`, `ontology/algorithms.md`, `ontology/complexity.md`. Every file gets a row in the SUMMARY.md audit table (D-12) regardless of outcome.

- **D-10: Mermaid diagrams — edit only where v1.5 drift exists.** Walk through all 22 Mermaid blocks (`grep -c mermaid` count: 2+3+9+2+1+0+0+0+0+4+1+0 = 22). Diagrams that name v1/v2 modules, Cerebras/Groq nodes, or pre-rename domain (`iran-conflict-monitor.vercel.app` if present) get inline-edited. Each touched diagram gets a manual GitHub-preview verification step in the plan to confirm native rendering. Diagrams that are still accurate are left untouched and noted in the SUMMARY audit table as "verified clean".

- **D-11: File-count + diagram-count drift noted in SUMMARY only.** ROADMAP / PROJECT.md say "10 markdown files (21 Mermaid diagrams)"; reality is 12 markdown files (22 Mermaid diagrams) post Phase 30 (`llm-pipeline-reliability.md`) + Phase 35 (`redis-keys.md`). Per D-04 planning-text policy: not retroactively edited. SUMMARY notes the gap.

- **D-12: Inline audit table in SUMMARY.md.** Single `## Architecture Doc Audit` section. Columns: `File | Status (touched/verified-clean) | Drift Found | Commit Ref`. ~12 rows for markdown files + ~22 rows for Mermaid diagrams = ~34 rows. Reviewer and future-self can trace exactly what was looked at.

### Runbook update (DOCS-PUB-03)

- **D-13: Four new standalone SRE-template sections, numbered 13-16.** Each new incident gets `## N. Title` with Symptom / Detection / Cause / Remediation / Prevention. Section 13: NIM throttle handling (429 burst, circuit-breaker trip, OpenRouter-dormant degradation path). Section 14: Cron architecture lessons (28.2.6 fire-and-forget IIFE diagnosis — why the cron-only-writer invariant is load-bearing; how to detect a regression). Section 15: Force-trigger runbook (`/api/cron/refresh-events?force=true` with Bearer; quota; cooldown bypass). Section 16: `prod-connectivity-audit.yml` retry path (workflow_dispatch, manual trigger, expected `audit:connectivity:last-result.allTiersGreen` shape). Sections 13-16 land between current section 12 (Quarterly LLM Health Probes) and the "See also" footer. Table of contents updated.

- **D-14: Rewrite-in-place for stale section 6.** Current section 6 is titled "Vercel function timeout (10-second limit)" and describes a pre-Phase-27 reality. Retitle to **"Vercel function timeout (300s default / 800s configured ceiling)"** and rewrite body against `vercel.json functions."api/vercel-entry.js".maxDuration: 800` (Phase 29 D-08). Cross-link from new section 13 (NIM throttle) since the 800s ceiling is what gives the NIM-throttle path room to settle. Old "10-second" anchor preserved via a `<a id="6-vercel-function-timeout-10-second-limit"></a>` shim so external links don't break.

### Degradation contract update (DOCS-PUB-05)

- **D-15: Explicit "map never goes blank" Pitfall 1 contract.** `docs/degradation.md` gains (if not already present) a top-of-file explicit statement: "The v3 LLM pipeline is optional. When `events:llm:v3` is empty or stale, `/api/events` serves raw GDELT via the Pitfall 1 cache bridge in `server/routes/events.ts`. The map never goes blank — only enrichment quality degrades from v3 (CAMEO + LLM resolver) to raw GDELT (CAMEO classification only). This contract is invariant and proven by `server/__tests__/resilience/redis-death.test.ts`."

- **D-16: Document the v3 → raw GDELT chain.** Per D-03: chain is **v3 → raw GDELT** (no v1, no v2). Pitfall 1 is the terminal contract. The degradation contract acknowledges Phase 29 deletion: "v1 and v2 extractors were deleted Phase 29; no fallback to a prior pipeline version exists. The terminal fallback is raw GDELT — the same data source the LLM enriches when healthy."

### README update (DOCS-PUB-01)

- **D-17: New "LLM Enrichment" subsection under "Engineering Deep Dive".** Single new `## LLM Enrichment` section after `## Test Suite` describes: v3 cron-driven extraction (4am UTC daily); NIM as the active provider (qwen-235b instruct); OpenRouter dormant per Phase 30.1 with ADR-0010 cross-link; Cerebras + Groq deferred per Phase 34 with ADR-0010 cross-link; the 6-path resolver (own-site-snapshot, poi-amenity-nominatim, nominatim-direct, nominatim-verified-2pass, gdelt-actiongeo-fallback, bellingcat-coord-passthrough); Pitfall 1 cache bridge contract (link to `docs/degradation.md`); `prod-connectivity-audit.yml` acceptance gate. ~80-120 lines.

- **D-18: Fix rate-limit drift.** README line 21 says "60 req/min per-IP global rate-limit tier"; line 206 contradicts with "rateLimiters.public (6 req/min baseline)". Truth is 60/min global + per-endpoint tiers (CLAUDE.md). Edit line 206 to "60 req/min global tier" + ensure the surrounding rate-limit prose is consistent. The Bearer-bypass mention at line 24 stays accurate.

- **D-19: Add manual-trigger `prod-connectivity-audit.yml` mention.** README gains a short paragraph in the new LLM Enrichment section: "Production health is verified by `.github/workflows/prod-connectivity-audit.yml` — a manually-triggered workflow that runs the tier audit and writes `audit:connectivity:last-result` to Redis. The v1.5 acceptance gate (3× consecutive `allTiersGreen=true`) is what unblocks v1.6 milestone close."

- **D-20: Add API Health dashboard merge mention.** README's DevApiStatus references updated to reflect the v1.4 merge: "The DevApiStatus dashboard's separate tabs were merged into a single API Health tab (Phase 28.2 W5) which aggregates audit, operator-status, byBearer quota, advEval drift, and pinTtl into one operator surface; Bearer-gated."

### ADR-0011 sub-block append

- **D-21: Append Phase 30.1/34 sub-block to ADR-0011.** ADR-0011 ("v3 LLM pipeline architecture", dated 2026-05-12 / Phase 29 era) currently describes the v3 architecture as it existed when v1/v2 were deleted. Append a short sub-block: `## Updated 2026-MM-DD (Phase 36 sub-block)` documenting that the v3 cascade as shipped is NIM-only at runtime; cross-links to ADR-0010 Phase 30.1 + Phase 34 sub-blocks for OR-dormant + Cerebras/Groq-deferred rationale. Mirrors ADR-0010's sub-block-per-phase convention.

### robots.txt + meta tags audit

- **D-22: Quick verify-only — edit only if drift.** Read `public/robots.txt` and `index.html` `<meta>` block. Confirm robots.txt still disallows `/api/*` + `/health` (the README claim at line 372). Confirm meta tags (title, description, og:title, og:description) still describe Iran Monitor accurately. Edit only if drift. SUMMARY records "verified clean" or the edit. ~5 min. Full SEO + social-share audit deferred to v1.6 REVEAL-01.

### docs/ tidiness

- **D-23: Leave `docs/brainstorms/` + `docs/superpowers/` as-is.** Both folders are unlinked from README. Historical waymarkers per Phase 35 D-09 principle. SUMMARY notes "identified but intentionally not touched."

### Verification gate

- **D-24: Three mechanical gates before phase close.** (a) `npx vitest run` — no regressions, includes the new `openapi-lint.test.ts`. (b) `npx @redocly/cli lint server/openapi.yaml` — no spec errors (also enforced by the vitest in D-08). (c) `npx markdown-link-check` across README + `docs/architecture/` + `docs/runbook.md` + `docs/degradation.md` + `docs/adr/` — catches broken cross-references created by the sweep. Wired as `docs:lint` + `openapi:lint` scripts in `package.json`. SUMMARY records the all-green observation at close.

### Plan decomposition + commit discipline

- **D-25: 5 plans + close = 6 total.**
  1. **36-01-PLAN.md** — README sweep (DOCS-PUB-01). Decisions D-17, D-18, D-19, D-20. New "LLM Enrichment" section; rate-limit drift fix; manual-trigger workflow mention; API Health merge mention. Lands AFTER Wave 1 closes so it can cross-link to finalized docs.
  2. **36-02-PLAN.md** — Architecture sweep (DOCS-PUB-02). Decisions D-09, D-10, D-11, D-12. Targeted file + diagram audit; inline audit table written to SUMMARY accumulator. Includes ADR-0011 sub-block per D-21 (small ADR edit; co-located with architecture sweep).
  3. **36-03-PLAN.md** — Runbook update (DOCS-PUB-03). Decisions D-13, D-14. Four new SRE sections (13-16) + rewrite section 6.
  4. **36-04-PLAN.md** — Degradation contract update (DOCS-PUB-05). Decisions D-15, D-16. v3 → raw GDELT chain + Pitfall 1 contract statement.
  5. **36-05-PLAN.md** — OpenAPI additions + lint gate (DOCS-API-01..07). Decisions D-05, D-06, D-07, D-08. 5 new endpoints + 2 verified-clean entries + Redocly lint vitest + dev dependency add.
  6. **36-06-PLAN.md** — Phase close. Decisions D-22 (robots.txt verify), D-23 (docs/ tidiness note), D-24 (3-gate verification run), SUMMARY.md (incl. all D-04 framing-gap callouts + D-12 audit table), ROADMAP / REQUIREMENTS / STATE flips. Commit `docs(36): phase close — SUMMARY + framing-gap callouts + tracking flips`.

- **D-26: Two waves of execution.** **Wave 1** (parallel): Plans 02, 03, 04, 05 run in parallel — no shared file conflicts. **Wave 2** (sequential): Plan 01 (README) lands AFTER Wave 1 so it can cross-link to the just-finalized docs + spec. **Wave 3**: Plan 06 close. Matches the parallelization-true precedent from Phase 30 / Phase 33 / Phase 35.

- **D-27: Atomic per-decision commits within plans.** Each D-N that touches a file lands as a separate commit (Phase 30/30.1/33/34/35 invariant). `docs(36):` / `feat(36):` / `chore(36):` / `test(36):` prefixes with body that names the decision number. Plan-level rollup commit at plan close updates `.planning/phases/36-*/36-NN-SUMMARY.md` if used.

- **D-28: Branch discipline.** Planner / executor cuts `feature/36-public-docs-sweep-openapi-additions` from `main` after the Phase 35 merge commit. CONTEXT.md, DISCUSSION-LOG.md, and the discuss checkpoint may sit on the current branch as scaffold work. Branch cut happens at the start of Plan 36-02 execution (Wave 1 entry).

### Claude's Discretion

- Whether ADR-0011's Phase 36 sub-block lands in Plan 02 (architecture sweep — Phase 36's "ADR touch" is conceptually architecture-adjacent) or in Plan 06 (close — Phase 36's "ADR touch" is conceptually close-bookkeeping). Recommended: Plan 02 (architecture-adjacent; gets the touch out of the way during the sweep).
- Whether `markdown-link-check` runs against `.planning/` or stays limited to `docs/` + README. Recommended: limit to `docs/` + README — `.planning/` has thousands of cross-references and many are intentionally point-in-time waymarkers.
- Whether the OpenAPI spec gains `examples:` blocks alongside `schema:` for each new endpoint. Recommended: yes for 200 responses (1 example per endpoint, ~10-20 lines each) — examples make the spec self-documenting; aligns with existing spec entries that have examples on `/api/flights` and `/api/events`.
- Whether the README "Engineering Deep Dive" section ordering is preserved (Test Suite → Engineering → Architecture → ...) or whether the new LLM Enrichment subsection bumps something below. Recommended: LLM Enrichment lands AFTER Test Suite, BEFORE the next existing subsection — minimal structural change.
- Whether section 13 (NIM throttle) cross-links to `docs/architecture/llm-pipeline-reliability.md` Path B framing or paraphrases it. Recommended: cross-link — avoid duplicating the Path B explanation; the runbook says "see llm-pipeline-reliability.md for measured throttle behavior; remediation steps below."
- Whether the 5 new OpenAPI endpoints share a single `tags:` value ("operator", "cron", "internal") or get distinct tags per endpoint. Recommended: tag by purpose — `operator` (audit-status, operator-status, llm-pipeline, llm-replay), `cron` (refresh-events, health, warm); existing `health` endpoint stays `monitoring`.
- Whether SUMMARY.md cites every D-N inline or uses a closing-table format. Recommended: closing-table (Phase 35 SUMMARY precedent) — 28 D-N rows + audit-table rows + framing-gap callout rows.

</decisions>

<canonical_refs>

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 36 source material

- `.planning/ROADMAP.md` §"Phase 36: Public Docs Sweep + OpenAPI Additions" (lines 282-294) — Goal, depends-on, 5 success criteria. Note: success-criterion #2 mentions "10 markdown files / 21 Mermaid diagrams" — reality is 12 / 22 (per D-11).
- `.planning/REQUIREMENTS.md` DOCS-PUB-01, DOCS-PUB-02, DOCS-PUB-03, DOCS-PUB-05, DOCS-API-01..07 — normative per-requirement acceptance text. DOCS-PUB-04 (ADR-0010) is Phase 37 territory.
- `.planning/PROJECT.md` — Milestone goal, three tracks, v1.4 baseline.
- `.planning/STATE.md` — Current milestone progress (Phase 35 in progress as of context-gather; Phase 36 unblocks once 35 closes).

### Cascade-language source of truth (D-01, D-02)

- `docs/architecture/llm-pipeline-reliability.md` — **The canonical doc for the shipped LLM pipeline state.** Phase 30 + Phase 30.1 + Phase 34 sub-blocks document the NIM-only-at-runtime reality. README + runbook + degradation language MUST be consistent with this doc's framing.
- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — ADR-0010 with Phase 29/30/30.1/34/35 sub-blocks. README + runbook cross-link to this for "why dormant / why deferred."
- `server/lib/llmEventExtractor.v3.ts:622, 929` — `skipOpenRouter: true` callsites. Source of truth for "OR dormant at runtime."
- `server/lib/freeClaudeRouter.ts:341-363` — Cascade construction. Source of truth for "declared chain shape" (NIM → OR → ...) vs runtime behavior.
- `CLAUDE.md` §"LLM Event Pipeline" — Operator-skim of the shipped state.

### v3 → raw GDELT chain source of truth (D-03, D-15, D-16)

- `server/routes/events.ts` — Pitfall 1 cache bridge. The terminal fallback when `events:llm:v3` is empty.
- `server/__tests__/resilience/redis-death.test.ts` — Proves the chain works under Redis death. Phase 36's degradation.md cites this test.
- ADR-0010 — Documents Phase 29 deletion of v1/v2 modules. README + runbook + degradation cite this for "why the chain is v3 → raw GDELT and not v3 → v2 → v1 → raw GDELT."

### OpenAPI additions source-of-truth handlers (D-05)

- `server/routes/audit-status.ts` — `/api/audit-status` handler. Response shape `{status, runId, timestamp, endpoints, durationMs, allTiersGreen?, tierStatus?}` per Phase 28.2 W6.
- `server/routes/operator-status.ts` — `/api/operator-status` handler. Response shape covers `audit24h` + `byBearer` + `pinTtl` + `advEval` per Phase 28.2 W5.
- `server/routes/events.ts` (or `server/routes/llm-pipeline.ts` — researcher confirms path) — `/api/events/llm-pipeline` GET + POST. Body shape `{version: 'v1'|'v2'|'v3'|null}` per Phase 27.4.
- `server/routes/events.ts` (or `server/routes/llm-replay.ts`) — `/api/events/llm-replay/:groupKey` dev-only handler. Returns `{old, new}` diff WITHOUT writing to cache per Phase 27.4.
- `server/routes/cron/refresh-events.ts` (or equivalent) — `/api/cron/refresh-events` handler. Bearer-required (CRON_SECRET in cron, DASHBOARD_PASSWORD operator force-trigger). `?force=true` query param.
- `server/routes/cron/health.ts` — DOCS-API-06 verification target. Already in spec; verify current handler shape.
- `server/routes/cron/warm.ts` — DOCS-API-07 verification target. Already in spec; verify current handler shape.

### OpenAPI spec + existing patterns

- `server/openapi.yaml` — Current 1260-line spec; 14 documented endpoints. Hand-written; the contract being augmented. Existing `CacheResponse<T>` $ref pattern is the template for new shapes per D-07.
- `server/__tests__/cache/redis-prefix.test.ts` — Existing schema-pinning test pattern; precedent for `openapi-lint.test.ts` shape.
- `package.json scripts.test` — Where the new `openapi:lint` + `docs:lint` scripts get wired.

### Architecture docs touched by D-09 sweep

- `docs/architecture/README.md` — Architecture index. Verify file count + diagram count + cross-links.
- `docs/architecture/system-context.md` — Likely needs domain rename + v3 cascade update.
- `docs/architecture/data-flows.md` — 9 Mermaid blocks. Likely needs v3 cron-driven extraction + Pitfall 1 bridge update.
- `docs/architecture/deployment.md` — 2 Mermaid blocks. Likely needs `maxDuration: 800` + Pro plan update.
- `docs/architecture/frontend.md` — 3 Mermaid blocks. May be verified-clean (frontend hasn't changed v1.4 → v1.5).
- `docs/architecture/llm-pipeline-reliability.md` — Already current (Phase 30 + 30.1 + 34 sub-blocks). Verify and cross-link from README.
- `docs/architecture/redis-keys.md` — Already current (Phase 35). Verify and cross-link from README + runbook.
- `docs/architecture/ontology/README.md`, `algorithms.md`, `complexity.md`, `state-machines.md`, `types.md` — Verify against current entity/event types. May be verified-clean.

### Runbook update touchpoints (D-13, D-14)

- `docs/runbook.md:351` — Section 6 ("Vercel function timeout (10-second limit)") — D-14 rewrite target.
- `docs/runbook.md` (after line ~880, before "See also") — D-13 insertion point for sections 13-16.
- `docs/runbook.md:10` — Table of contents anchor list. Updated to include new sections.

### README update touchpoints (D-17, D-18, D-19, D-20)

- `README.md:21` and `README.md:206` — Rate-limit drift (6 vs 60). D-18 fix.
- `README.md` after "Engineering Deep Dive" `## Test Suite` section — D-17 insertion point for "LLM Enrichment".
- `README.md:368-379` — Existing rate-limiter prose. D-18 + D-19 surround edits.

### Existing schema-pinning test patterns (D-08 template)

- `src/__tests__/lib/colorBridge.test.ts` — Byte-identity sentinel pattern.
- `src/__tests__/lib/actorCatalog.test.ts` (Phase 33 D-07) — Catalog-invariant pattern.
- `server/__tests__/lib/urlLiveness.schema.test.ts` (Phase 32 D-22) — Schema-pinning contract test.
- `src/__tests__/lib/redis-registry.test.ts` (Phase 35 D-01) — Registry-parity vitest. D-08's openapi-lint test mirrors this shape (shell out to external tool + assert exit code 0).

### Carryover context

- `.planning/phases/29-llm-provider-chain-narrowing-llm-optional-architecture-verce/29-CONTEXT.md` — v1/v2 deletion + CLAUDE.md trim discipline.
- `.planning/phases/30-nim-throttle-characterization-cascade-tuning-pro-enabled-sim/30-CONTEXT.md` — Tuned defaults; atomic-per-decision commit discipline.
- `.planning/phases/30.1-cascade-fallback-fix-re-enable-openrouter-or-document-single/` — Phase 30.1 close: NIM-only declared honest. Source of "OR dormant per Phase 30.1" phrasing.
- `.planning/phases/34-llm-router-fallback-re-integration-cerebras-groq-per-provide/34-CONTEXT.md` — Cerebras + Groq deferred close.
- `.planning/phases/35-internal-docs-jsdoc-redis-registry-redis-optimization-cleanu/35-CONTEXT.md` — Redis registry + bundle measurement. Phase 36 inherits the "describe shipped not aspirational" + commit-discipline patterns.

### ADRs in scope (read-only or sub-block append)

- `docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md` — Read-only by Phase 36 (Phase 37 appends close sub-block).
- `docs/adr/0011-v3-llm-pipeline-architecture.md` — D-21 sub-block append target.

### Verification harness references (D-24)

- `package.json` — `openapi:lint` + `docs:lint` scripts added here.
- `@redocly/cli` — New dev dependency for D-08 + D-24.
- `markdown-link-check` — New dev dependency for D-24 link-check gate.

</canonical_refs>

<code_context>

## Existing Code Insights

### Reusable Assets

- **`server/openapi.yaml` existing `CacheResponse<T>` $ref pattern** — Template for D-07's hybrid response-shape strategy. Existing endpoints (/api/flights, /api/events, etc.) already declare `responses: 200: content: application/json: schema: $ref: '#/components/schemas/CacheResponse'` with the inner data parameterized. New endpoints follow the same pattern where applicable.
- **`server/__tests__/lib/urlLiveness.schema.test.ts` (Phase 32 D-22)** — Direct template for D-08's `openapi-lint.test.ts`. Same philosophy: shell out to a verifier, assert exit code 0 / clean output, fail loudly on drift.
- **`docs/architecture/llm-pipeline-reliability.md` Phase 30.1 / 34 sub-block format** — Direct template for D-21's ADR-0011 sub-block. Markdown heading + dated paragraph + cross-link to ADR-0010.
- **`docs/runbook.md` SRE template (sections 1-12)** — Direct template for D-13's 4 new sections (13-16). Symptom / Detection / Cause / Remediation / Prevention structure already established and battle-tested.
- **Phase 35 SUMMARY.md closing-table format** — Template for D-12's audit table + closing SUMMARY structure.
- **Existing `package.json scripts.test` shape** — `npm test` already invokes vitest; D-08 adds the openapi-lint test inside the same test run, no separate CI step needed.

### Established Patterns

- **Atomic per-decision commits** (Phase 30 D-08 → Phase 31 → 32 → 33 → 34 → 35 D-26). Each D-N is a commit. `docs(36):` / `feat(36):` / `chore(36):` / `test(36):` prefixes with body that names the decision number.
- **Branch-per-phase from `main`** (`feature/36-public-docs-sweep-openapi-additions`).
- **Schema-pinning contract tests** (`colorBridge.test.ts` / `urlLiveness.schema.test.ts` / `actorCatalog.test.ts` / `redis-registry.test.ts`). D-08 extends the pattern from per-schema pinning to per-spec linting.
- **"Describe shipped not aspirational"** (Phase 30.1 framing, Phase 34 deferred close, Phase 35 D-09 historical-waymarker principle). D-01..D-04 + D-13..D-16 + D-17..D-20 all align with this.
- **Smallest-blast-radius principle** (Phase 32 D-13, Phase 33 D-13, Phase 35 D-12). D-22 (robots.txt verify) + D-23 (docs/ tidiness leave-as-is) + D-14 (rewrite-in-place with anchor shim) all express this.
- **Cron-only writer discipline (anti-pattern #17).** Phase 36 ships zero new production cache writers; all changes are docs + spec + lint.
- **Two-wave parallelization** (Phase 30 W1-W3, Phase 33 W1-W3, Phase 35 W1-W4). D-26 wave shape mirrors.

### Integration Points

- **`README.md`** — Surgical edits per D-17 (new section), D-18 (rate-limit drift fix), D-19 (workflow mention), D-20 (API Health merge mention).
- **`docs/architecture/*.md` + `docs/architecture/ontology/*.md`** — Touched-or-verified-clean per D-09. Mermaid blocks touched-or-verified-clean per D-10.
- **`docs/runbook.md`** — Section 6 rewritten per D-14; new sections 13-16 inserted per D-13; ToC updated.
- **`docs/degradation.md`** — Top-of-file Pitfall 1 contract statement per D-15; chain rewritten to v3 → raw GDELT per D-16.
- **`docs/adr/0011-v3-llm-pipeline-architecture.md`** — Phase 36 sub-block appended per D-21.
- **`server/openapi.yaml`** — 5 new path entries; 2 verified-clean entries; `components.securitySchemes` split per D-06; new `components.schemas` entries per D-07.
- **`server/__tests__/openapi/openapi-lint.test.ts` (NEW)** — D-08 lint vitest.
- **`package.json`** — `openapi:lint` + `docs:lint` scripts added; `@redocly/cli` + `markdown-link-check` added as dev dependencies.
- **`public/robots.txt` + `index.html`** — Read-only verify per D-22; edited only if drift.
- **`docs/brainstorms/` + `docs/superpowers/`** — Untouched per D-23.

</code_context>

<specifics>

## Specific Ideas

- **"The docs the world reads describe shipped code; the planning text is historical."** D-04 is the load-bearing framing for the whole phase. ROADMAP says "v3 → v2 → v1 → raw GDELT" and "NIM + OpenRouter narrowed cascade" — both predate Phase 29 deletion + Phase 30.1 OR-dormant + Phase 34 Cerebras/Groq-deferred. Public docs say what's true today. SUMMARY notes the gap. Planning text stays.
- **"NIM-only at runtime is the truth that survives the next 6 months."** D-01 / D-02 lock the cascade language. ADR-0010 cross-link is the breadcrumb back to "why" for any future operator who wonders.
- **"Mechanical drift gates are the only thing that prevents the next public-docs sweep from being necessary."** D-08 (Redocly lint) + D-24 (markdown-link-check) are Phase 36's load-bearing primitives. The docs themselves are surface; the gates are the structural mechanism that keeps the surface honest.
- **"4 standalone runbook sections, not folded into existing."** D-13 honors the SRE-per-failure-mode pattern that makes runbook section-grepping useful during incidents. Folding NIM throttle into section 10 saves runbook length but loses the "grep for NIM" navigability.
- **"5 plans, two waves."** D-25 + D-26 — README is intentionally last because it cross-links to docs that don't exist yet (until Wave 1 closes). Plan 02/03/04/05 parallel because they own non-overlapping file sets. Plan 06 is the close ritual.
- **"Phase 35 set the pattern; Phase 36 inherits it."** Audit table format, atomic per-decision commits, branch discipline, framing-gap-in-SUMMARY policy, mechanical gate per-phase — all Phase 35 inheritances.

</specifics>

<deferred>

## Deferred Ideas

### Phase 37 prep (acceptance gate + ADR-0010 close)

- **DOCS-PUB-04 — ADR-0010 milestone-close sub-block.** Phase 37 appends the milestone-close sub-block + acceptance-gate observation. Phase 36's edits to ADR-0011 (D-21) DO NOT touch ADR-0010.
- **LLM-RELI-07 — 3× consecutive `prod-connectivity-audit.yml` greens.** Phase 37 territory. Phase 36 documents the workflow + audit shape but does not run the acceptance observation.
- **CHANGELOG[v1.5] entry.** Phase 37 milestone-close ritual writes the entry. Phase 36 does not.

### v1.6 prep (REVEAL-01 polish)

- **Hero GIF + screenshot regeneration sweep.** D-22 limits Phase 36 to a visual-staleness check (drift-only regen). Full polish lives in REVEAL-01.
- **SEO + social-share audit.** robots.txt + meta tags get a quick verify-only pass per D-22; full Open Graph / Twitter Cards / sitemap audit lives in REVEAL-01.
- **Landing-page polish, demo flows.** Out of scope.

### Future phases (post-v1.5 or follow-on)

- **OpenAPI full-spec audit + Zod/route-handler reconciliation.** D-05 caps Phase 36 at additions + lightweight verify. A future "API hardening" phase could mechanically reconcile every spec entry against its handler's actual response shape (e.g., via runtime response validation in tests).
- **Full Mermaid diagram modernization.** D-10 limits Phase 36 to drift-only diagram edits. A future "architecture diagrams refresh" phase could re-author every diagram for clarity.
- **`docs/brainstorms/` + `docs/superpowers/` archival.** D-23 leaves them as-is. A future "docs cleanup" phase could move them under `.planning/archive/` if clutter becomes an issue.
- **ROADMAP / REQUIREMENTS retroactive rewording.** D-04 leaves them untouched. A future "planning artifact refresh" phase could reconcile them with shipped reality if the framing-gap accrual becomes confusing.
- **CHANGELOG.md per-phase entries.** Current pattern is per-milestone entries (v1.0..v1.4). A future operations phase could move to per-phase entries.
- **`docs/api/openapi.yaml` relocation.** ROADMAP success-criterion #5 mentions "`docs/api/openapi.yaml` (or equivalent path)". Phase 36 holds at `server/openapi.yaml`. A future "spec ownership" phase could move it under `docs/` if the spec gains a public-doc role.
- **Quarterly architecture-doc audit cadence.** Phase 36 establishes the audit-table format; a future operations phase could schedule a quarterly sweep against the established gates.

### Reviewed Todos (not folded)

None — `gsd-sdk query todo.match-phase 36` was not invoked during this discussion; no pending todos crossed scope. If the planner discovers them during research, they're folded or deferred per the planner's discretion.

</deferred>

---

_Phase: 36-public-docs-sweep-openapi-additions_
_Context gathered: 2026-05-29_
