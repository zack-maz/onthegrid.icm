# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-13)

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.
**Current focus:** Phase 1: Project Scaffolding & Theme

## Current Position

Phase: 1 of 10 (Project Scaffolding & Theme)
Plan: 0 of ? in current phase
Status: Ready to plan
Last activity: 2026-03-13 -- Roadmap created

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: -
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: -
- Trend: -

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Deck.gl + MapLibre for 2.5D map (GPU-accelerated, free)
- React 19 + Vite 6 + TypeScript 5 + Tailwind CSS 4 (from research)
- Zustand 5 for state management
- Express 5 as API proxy
- Common MapEntity interface to normalize all data sources

### Pending Todos

None yet.

### Blockers/Concerns

- API rate limits on free tiers (OpenSky, AIS) may constrain refresh rates
- ACLED data has inherent delay (hours/days) -- set user expectations in UI
- 5K+ simultaneous entities may impact frame rate -- plan for viewport culling

## Session Continuity

Last session: 2026-03-13
Stopped at: Roadmap created, ready to plan Phase 1
Resume file: None
