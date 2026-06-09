---
phase: 41-public-reveal-polish
plan: 03
subsystem: docs
tags: [portfolio-docs, glossary, cost-transparency, operator-guide, docs-drift, openapi]
requires: [41-01, 41-02]
provides:
  - docs/concepts.md (38-term proprietary glossary)
  - docs/COSTS.md (cost transparency, you-can-do-this-too)
  - docs/operator-guide.md (visitor how-to, distinct from runbook)
  - OpenAPI path operations for /api/events/prune-dead-urls + /api/events/llm-history
  - ADR-layer + .env.example + reliability-doc currency fixes
affects:
  - docs/adr/* (currency amendments)
  - .env.example (retired-flag removal, ACLED historical note)
  - server/openapi.yaml (two new operator paths)
tech-stack:
  added: []
  patterns: [immutability-safe-ADR-amendment, repo-relative-cross-links, drift-gate-preserving-edit]
key-files:
  created:
    - docs/concepts.md
    - docs/COSTS.md
    - docs/operator-guide.md
  modified:
    - docs/adr/0009-two-key-split-for-llm-partial-progress-vs-terminal-reads.md
    - docs/adr/0010-v1-5-llm-pipeline-narrowing-and-deletion.md
    - docs/adr/0011-v3-llm-pipeline-architecture.md
    - docs/adr/README.md
    - docs/architecture/llm-pipeline-reliability.md
    - .env.example
    - server/openapi.yaml
decisions:
  - 'ACLED env vars kept as blank assignments (not deleted) so the check:env drift gate stays satisfied — they remain defaulted-empty fields in server/config.ts Zod schema'
  - 'ADR-0011 §3 amended with an immutability-safe note block (body preserved verbatim) per the ADR immutability rule'
metrics:
  duration: ~21 min
  completed: 2026-06-06
---

# Phase 41 Plan 03: Round-out Portfolio Docs Summary

JWT-of-the-portfolio: authored the three "go deeper" docs (concepts glossary,
cost transparency, visitor operator-guide) cross-linked to SHOWCASE, and applied
the audit-carried ADR/.env/OpenAPI/reliability docs-drift sweep routed to Wave 2.

## What Was Built

**Task 1 — `docs/concepts.md`** (commit `05555cd`): a 38-heading proprietary-term
glossary sourced from CLAUDE.md, organized into Architecture/resilience, LLM
pipeline, Map/color/domain, Tunable thresholds, and Build meta. All 12 named seed
terms present and defined (Pitfall 1 cache bridge, LLM-optional architecture,
tier-green gate, polite-citizen contracts, ghost event, canonical actor catalog,
mechanical drift gate, degrade-open, 6-path resolver, honest deferral,
probe-before-commit, flight recorder) plus 26 more rounded out from CLAUDE.md
(circuit breaker, token budget soft/hard, DLQ, watchdog generation counter,
lineage record, cold-cache self-heal, colorBridge byte-identity sentinel,
domain.ts mirror, CacheEntry staleness, capture:layers, Latin-label admission
gate, severity half-life, attack radius, proximity alert, stale-clear, cron-only
writer, etc.). Repo-relative cross-links to ADRs/architecture; links back to
SHOWCASE.

**Task 2 — `docs/COSTS.md`** (commit `9d3d6b5`): cost transparency in the
"you-can-do-this-too" voice. Table 1 (infra) lists Vercel Pro $20/mo as the sole
paid line + a free-tier row per data feed (NIM, Upstash, GDELT, OpenSky,
adsb.lol, Open-Meteo, Yahoo, AISStream, Overpass, WRI, Natural Earth, GeoEPR,
Nominatim). Table 2 (dev cost) cites v0.9 (229 commits / 6 days, RETROSPECTIVE.md:54)
and v1.5 (209 commits / 24 days, RETROSPECTIVE.md:254) figures — no invented
numbers. D-09 stay-on-`vercel.app` = $0 domain / $0 DNS rationale recorded.
Cross-links to SHOWCASE.

**Task 3 — `docs/operator-guide.md`** (commit `1339a6b`): a visitor how-to
covering all six workflows — clone+run (`npm install`), force-trigger the events
cron (`?force=true` + Bearer), prune dead URLs (`POST /api/events/prune-dead-urls`),
read `/api/operator-status`, run the eval harness (`npm run eval:replay`), capture
a hero GIF (`npm run capture:hero`). Explicitly framed as the visitor how-to with
a comparison table distinguishing it from the incident-response runbook, which it
cross-links. T-41-DOCS-03 mitigation: only the `<your-bearer>` placeholder is
used — no real secret. Cross-links to SHOWCASE + concepts.

**Audit-carried docs-drift sweep** (commit `f744219`): applied the Section-D
Wave-2 fixes:

- ADR: #1 (ADR-0011 §3 immutability-safe Phase 35 SIMPLIFY-02 amendment), #2
  (ADR README ADR-0010 "Stub Phase 37" → milestone-final), #3 ("NIM + OpenRouter"
  → "NIM-only at runtime; OpenRouter dormant"), #4 (deleted duplicate bare
  `**Status:** Accepted` line in ADR-0010), #21 (ADR README footer "13 through
  26.4" → "13 through 41"), #23 (ADR-0009 status amendment).
- `.env.example`: #6 (removed retired `LLM_PIPELINE_V2`/`LLM_PIPELINE_V3` flag
  blocks), #7-ACLED (marked `ACLED_EMAIL`/`PASSWORD` historical).
- OpenAPI: #16 (`POST /api/events/prune-dead-urls` path) + NN-3
  (`GET /api/events/llm-history` path), both `operatorBearer`-gated with accurate
  200/401/429/503 responses verified against `server/routes/events.ts`.
- Architecture: NN-4 (reliability doc title `(v1.5)` → `(v1.5–v1.6)`).
- Docs #17 cross-link: operator-guide links the runbook's operator-surface
  playbooks (prune/force-trigger/eval) where relevant to a visitor.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed dead repo-relative link in concepts.md**

- **Found during:** Task 1 verification (`markdown-link-check`)
- **Issue:** CLAUDE.md names the rate-limiter middleware `rateLimiter.ts`, but the
  actual file is `server/middleware/rateLimit.ts`. The concepts.md link inherited
  the wrong name and 404'd.
- **Fix:** corrected the link target to `rateLimit.ts`.
- **Files modified:** docs/concepts.md
- **Commit:** f744219 (folded into the sweep commit)

**2. [Rule 3 - Blocking] ACLED env vars kept as blank assignments**

- **Found during:** audit-carried sweep (`npm run check:env`)
- **Issue:** The audit instruction was "remove OR mark historical" for ACLED. A
  full removal of the `ACLED_EMAIL`/`ACLED_PASSWORD` assignment lines broke the
  `.env.example` drift gate, because both vars are still declared (defaulted-empty)
  in the `server/config.ts` Zod schema, and the drift checker requires every
  schema var to be declared in `.env.example`.
- **Fix:** took the "mark historical" path — kept blank `ACLED_EMAIL=` /
  `ACLED_PASSWORD=` assignments under a HISTORICAL/RETIRED note explaining they
  are no longer read at runtime, satisfying both the audit intent and the gate.
- **Files modified:** .env.example
- **Commit:** f744219

## Verification

- `docs/concepts.md`: 38 term headings (≥30 required); all 12 seed terms present
  (`Pitfall 1`, `6-path resolver`, `flight recorder`, `degrade-open`, `tier-green`
  asserted via grep).
- `docs/COSTS.md`: `Vercel Pro`, `20`, `free`, `NIM`, `Upstash`, `vercel.app`,
  `SHOWCASE` all present.
- `docs/operator-guide.md`: `npm install`, `eval:replay`, `capture:hero`,
  `operator-status`, `force=true`, `runbook`, `SHOWCASE` all present; no real
  Bearer (only `<your-bearer>` placeholder).
- `npx redocly lint server/openapi.yaml` → **valid** (37 pre-existing advisory
  warnings only; both new paths parse).
- `markdown-link-check` on all three new docs → **clean** (after the rateLimit.ts
  fix).
- `npm run check:env` → exits 1 due to **pre-existing** VITE\_\* EXTRA drift present
  at HEAD baseline (out of scope per SCOPE BOUNDARY); my ACLED change adds **no**
  new MISSING entry.

## Out-of-Scope Discoveries (not fixed)

- `npm run check:env` already exits 1 at HEAD baseline because the VITE*\* client
  env vars (`VITE_POLL*\*`, `VITE_ATTACK_RADIUS_KM`, etc.) are not in the server
  Zod schema. This is a pre-existing condition unrelated to this plan's edits and
  was left untouched per the scope boundary.

## Human Verification Needed

None for this plan — it is docs-only and all verification is automated
(grep assertions + redocly lint + markdown-link-check). The wave-merge
`npm run docs:lint` (full repo link resolution including the README/SHOWCASE
back-links) runs at phase close per the plan's `<verification>` block.

## Self-Check: PASSED

- docs/concepts.md — FOUND
- docs/COSTS.md — FOUND
- docs/operator-guide.md — FOUND
- Commit 05555cd — FOUND
- Commit 9d3d6b5 — FOUND
- Commit 1339a6b — FOUND
- Commit f744219 — FOUND
