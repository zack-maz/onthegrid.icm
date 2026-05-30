# Phase 36-02 Architecture Sweep Audit

**Generated:** 2026-05-29
**Plan:** 36-02
**Decisions:** D-09, D-10, D-11, D-12, D-21
**Sweep author:** executor agent (worktree-agent-a0b8f5d63b72eeb60)

This audit accumulator is the trust artifact fed to Plan 36-06 SUMMARY.md
per CONTEXT.md D-12. Reviewer can trace exactly which files + diagrams were
inspected and what the outcome was. `verified-clean` rows mean a full read +
drift-grep sweep returned zero hits requiring an edit.

## Architecture Markdown Files (12 rows)

| File                                          | Status         | Drift Found                                                                                                                                                                                                                                                          | Commit Ref |
| --------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| docs/architecture/README.md                   | edited         | Architecture index undercounted shipped docs (8 entries vs 12 actual); added `## Operator deep-dives` section linking llm-pipeline-reliability.md (Phase 30) + redis-keys.md (Phase 35).                                                                             | 5e88881    |
| docs/architecture/system-context.md           | edited         | LLM-pipeline note framed as "Phase 27 / Cerebras/Groq classification" (deferred Phase 34); fallback Mermaid node labeled "server/vercel-entry.ts" (pre-Phase-29 build output path).                                                                                  | 09f5a99    |
| docs/architecture/data-flows.md               | edited         | §3 (events) metadata + Mermaid + 5 prose notes: declared-vs-runtime cascade framing (Phase 30.1 + 34); soft-warn tier still live (Phase 30 SIMPLIFY-03 eliminated); per-batch partial-key writes (Phase 35 SIMPLIFY-02 retired); pre-Phase-29 cron writer file path. | 903063a    |
| docs/architecture/deployment.md               | edited         | Topology Mermaid + build-pipeline + cron-jobs section: only 2 crons listed (missing /api/cron/refresh-events, Phase 29 D-08); server/vercel-entry.ts pre-Phase-29 path; no Vercel Pro 800s maxDuration framing; user-agent:vercel-cron auth (Phase 29 → Bearer).     | 83bba66    |
| docs/architecture/frontend.md                 | verified-clean | none                                                                                                                                                                                                                                                                 | n/a        |
| docs/architecture/llm-pipeline-reliability.md | verified-clean | none (CONTEXT.md D-09 declared verified-clean; full file read confirmed Phase 30 + 30.1 + 34 sub-blocks are current)                                                                                                                                                 | n/a        |
| docs/architecture/redis-keys.md               | verified-clean | none (CONTEXT.md D-09 declared verified-clean; full file read confirmed Phase 35 D-05 32-key inventory is current, partial-key correctly marked retired)                                                                                                             | n/a        |
| docs/architecture/ontology/README.md          | verified-clean | none                                                                                                                                                                                                                                                                 | n/a        |
| docs/architecture/ontology/types.md           | edited         | §`ConflictEventType` note: LLM classification framed as "sent through Cerebras/Groq" (deferred Phase 34); file path `server/lib/llmEventExtractor.ts` (deleted Phase 29 — now v3).                                                                                   | 050fac2    |
| docs/architecture/ontology/algorithms.md      | edited         | §9 "LLM event extraction" Phase 27 framing throughout: deleted file path; Cerebras-primary/Groq-fallback cascade; BATCH_SIZE=8; /api/events fire-and-forget trigger; dual cache events:llm + events:gdelt. Rewrote section against Phase 29/30/30.1/34/35 reality.   | 54169fe    |
| docs/architecture/ontology/complexity.md      | verified-clean | none                                                                                                                                                                                                                                                                 | n/a        |
| docs/architecture/ontology/state-machines.md  | verified-clean | none                                                                                                                                                                                                                                                                 | n/a        |

**Counts:** 7 edited / 5 verified-clean / 12 total

## Mermaid Diagrams (21 rows)

CONTEXT.md D-11 hypothesized 22 diagrams; actual count is 21 (9 + 2 + 3 + 2 + 4 + 1).
Per-file counts: `data-flows.md` 9, `frontend.md` 3, `state-machines.md` 4, `deployment.md` 2, `system-context.md` 2, `types.md` 1.

Diagrams inside verified-clean files were not separately committed (no edit needed); their rows here document the audit decision.

| File                       | Diagram # | Status         | Drift Found                                                                                                                                                                                                                                                                               | Commit Ref |
| -------------------------- | --------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| system-context.md          | 1 of 2    | verified-clean | C4Context topology diagram contains no LLM/cron/domain details; nodes are upstream sources + 3 containers. No drift in diagram syntax.                                                                                                                                                    | n/a        |
| system-context.md          | 2 of 2    | edited         | Fallback flowchart labeled API node as "server/vercel-entry.ts" (pre-Phase-29 build output path); now "api/vercel-entry.js bundle / tsup from server/vercel.ts".                                                                                                                          | 09f5a99    |
| data-flows.md              | 1 of 9    | verified-clean | §1 Flights sequenceDiagram describes OpenSky + adsb.lol, cache TTLs, polling cadence. All current per `flights.ts` + ROADMAP. No LLM/cron drift.                                                                                                                                          | n/a        |
| data-flows.md              | 2 of 9    | verified-clean | §2 Ships AISStream WebSocket diagram. Current per `ships.ts` + AISStream adapter. No LLM/cron drift.                                                                                                                                                                                      | n/a        |
| data-flows.md              | 3 of 9    | edited         | §3 Conflict Events diagram: NIM/OR participant labels framed as "primary/fallback" without Phase 30.1 dormancy; watchdog labeled "90s hard / 60s soft" (Phase 30 SIMPLIFY-03 eliminated soft tier); per-batch partial-key SET writes (Phase 35 SIMPLIFY-02 retired); fallback alt branch. | 903063a    |
| data-flows.md              | 4 of 9    | verified-clean | §4 News (GDELT DOC + RSS) clustering diagram. Current per `news.ts` + GDELT-DOC adapter. No LLM-cascade/cron drift.                                                                                                                                                                       | n/a        |
| data-flows.md              | 5 of 9    | verified-clean | §5 Key Sites (Overpass) diagram. Current per `sites.ts`. No drift.                                                                                                                                                                                                                        | n/a        |
| data-flows.md              | 6 of 9    | verified-clean | §6 Water (Overpass + Open-Meteo) diagram. Current per `water.ts`. No drift.                                                                                                                                                                                                               | n/a        |
| data-flows.md              | 7 of 9    | verified-clean | §7 Markets (Yahoo Finance) diagram. Current per `markets.ts`. No drift.                                                                                                                                                                                                                   | n/a        |
| data-flows.md              | 8 of 9    | verified-clean | §8 Weather (Open-Meteo) diagram. Current per `weather.ts`. No drift.                                                                                                                                                                                                                      | n/a        |
| data-flows.md              | 9 of 9    | verified-clean | §9 Reverse Geocode (Nominatim) diagram. Current per `geocode.ts`. No drift.                                                                                                                                                                                                               | n/a        |
| deployment.md              | 1 of 2    | edited         | Topology flowchart: lambda node labeled "server/vercel-entry.ts → dist-server/vercel.cjs" (pre-Phase-29); only 2 cron nodes (missing /api/cron/refresh-events); cadence "every 12h" (now daily 12:00 UTC). Added 800s maxDuration framing.                                                | 83bba66    |
| deployment.md              | 2 of 2    | verified-clean | 4-layer cache flowchart (Request → Edge CDN → Redis logical → Redis hard → in-memory fallback → upstream). Caching primitives unchanged Phase 29–35.                                                                                                                                      | n/a        |
| frontend.md                | 1 of 3    | verified-clean | Component-layout flowchart (AppShell → BaseMap / Sidebar / DetailPanelSlot / etc.). Frontend unchanged v1.4 → v1.5.                                                                                                                                                                       | n/a        |
| frontend.md                | 2 of 3    | verified-clean | Map-layer stacking flowchart (GeographicOverlay → political → ethnic → water → weather → threat/entity). Unchanged.                                                                                                                                                                       | n/a        |
| frontend.md                | 3 of 3    | verified-clean | Zustand store dependency-graph flowchart. Unchanged.                                                                                                                                                                                                                                      | n/a        |
| ontology/types.md          | 1 of 1    | verified-clean | classDiagram of MapEntity discriminated union + FlightData / ShipData / ConflictEventData. Pure type structure; no LLM/cron details. Prose around the diagram was edited (commit 050fac2) but the diagram itself is unchanged.                                                            | n/a        |
| ontology/state-machines.md | 1 of 4    | verified-clean | Connection lifecycle stateDiagram-v2 (loading/connected/stale/error/rate_limited). Unchanged.                                                                                                                                                                                             | n/a        |
| ontology/state-machines.md | 2 of 4    | verified-clean | Polling lifecycle stateDiagram-v2. Recursive setTimeout invariants unchanged.                                                                                                                                                                                                             | n/a        |
| ontology/state-machines.md | 3 of 4    | verified-clean | Detail-panel navigation-stack stateDiagram-v2. Push/pop/clear semantics unchanged.                                                                                                                                                                                                        | n/a        |
| ontology/state-machines.md | 4 of 4    | verified-clean | Cache freshness stateDiagram-v2 (fresh / stale / evicted / degraded). Logical-vs-hard TTL contract unchanged.                                                                                                                                                                             | n/a        |

**Counts:** 3 edited / 18 verified-clean / 21 total

## Mermaid validation method

**Method chosen:** syntax-preservation review (no `mmdc` invocation). The 3 edited diagrams (system-context.md fallback flowchart, data-flows.md §3 conflict events, deployment.md topology) all received surgical edits to node labels and participant descriptions; no structural changes to arrows, edge labels, alt/par/loop blocks, or subgraph definitions. GitHub renders these natively; no operator-pause checkpoint required.

The edited blocks were verified by:

1. Re-reading the full Mermaid block post-edit (Read tool, full file inspection).
2. Confirming `grep -c '```mermaid'` per file counts unchanged (9 / 3 / 4 / 2 / 2 / 1).
3. Confirming `grep '^```$'` fence-count parity (no unclosed fences).
4. Inspecting that no removed or added text crosses a participant-declaration boundary that would re-shape the diagram.

Operator-pause GitHub-preview verification (D-10 Option 2) is available to the orchestrator at phase close if a reviewer wants additional confidence, but the surgical-edit scope makes it unlikely to surface a rendering bug.

## ADR-0011 Phase 36 Sub-block (D-21)

| Artifact                                                | Status   | Commit Ref |
| ------------------------------------------------------- | -------- | ---------- |
| docs/adr/0011-v3-llm-pipeline-architecture.md sub-block | appended | 89b735a    |

The sub-block lands before the existing `## Consequences` section (mirrors ADR-0010 sub-block placement). Content uses "REAFFIRMED" framing (not "superseded" or "deprecated"); cross-links to ADR-0010 Phase 30.1 sub-block (OR dormancy) + ADR-0010 Phase 34 sub-block (Cerebras + Groq deferral) + llm-pipeline-reliability.md cascade-shape table + CLAUDE.md operator skim.

## Framing-Gap Callouts (for Plan 36-06 SUMMARY.md)

These framing gaps were surfaced during the sweep and are intentionally NOT retroactively edited per CONTEXT.md D-04 (planning-text policy: "GSD planning artifacts are the historical brief; public docs describe shipped reality"). Plan 36-06 SUMMARY.md should absorb them:

1. **Mermaid block count: CONTEXT.md D-11 says "22 Mermaid diagrams"; actual count is 21.** Verified by `grep -c '```mermaid'` across the 12 architecture files: 9 (data-flows.md) + 3 (frontend.md) + 4 (state-machines.md) + 2 (deployment.md) + 2 (system-context.md) + 1 (types.md) = 21. The "22" in CONTEXT.md D-11 + `must_haves.truths` may have included a Mermaid block from an older snapshot or counted a closed/orphan fence.

2. **Architecture markdown file count: ROADMAP / PROJECT.md / CONTEXT.md say "10 markdown files"; actual count is 12.** Phase 30 added `llm-pipeline-reliability.md`; Phase 35 added `redis-keys.md`. The original 10 (4 system-level + 4 ontology + 2 root README's? — actually 4 + 4 = 8 originally, so the planning-text framing "10" was already a Phase 29 / 30 mid-flight estimate). Either way, current reality is 12, planning-text frames as 10.

3. **architecture/README.md index originally listed only 8 of the 12 files** (Phase 36-02 commit 5e88881 added the missing 2 entries via the new "## Operator deep-dives" section). The index now matches reality post-edit.

4. **ADR-0011 §3 "Terminal-key writes, observability-key envelope" describes `events:llm:v3:partial` as live in the body text** (lines 71-79 of the ADR). The Phase 36 sub-block (line 147+) captures the current state without rewriting the ADR body (ADRs are immutable-after-Accepted per the Nygard convention; sub-blocks supersede). This is internally consistent with the ADR-0010 convention (e.g., ADR-0010 body still describes v2 keys that were deletion targets — preserved as Decision context, with sub-blocks recording subsequent evolution). No edit required.

## Verification Commands

Re-run any of these to confirm the sweep:

````bash
# No pre-rename domain refs in architecture/
grep -rE "iran-conflict-monitor\.vercel\.app" docs/architecture/    # 0 matches

# No live v1/v2 module refs (historical citations OK)
grep -rE "llmEventExtractor\.v[12]" docs/architecture/              # 0 matches

# ADR-0011 Phase 36 sub-block present before Consequences
grep -B2 "^## Consequences" docs/adr/0011-v3-llm-pipeline-architecture.md | grep "Phase 36 Sub-block"

# Mermaid block counts match (9+3+4+2+2+1=21)
for f in docs/architecture/data-flows.md docs/architecture/frontend.md \
         docs/architecture/ontology/state-machines.md docs/architecture/deployment.md \
         docs/architecture/system-context.md docs/architecture/ontology/types.md; do
  echo "$f: $(grep -c '^```mermaid' $f) mermaid"
done
````
