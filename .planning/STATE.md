---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Data Quality & Layers
status: unknown
last_updated: "2026-04-02T02:07:48.349Z"
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 5
  completed_plans: 5
---

# Project State

## Project Reference

See: .planning/PROJECT.md

**Core value:** Surface actionable, data-backed intelligence on the Iran conflict in real-time on an interactive 2.5D map -- numbers over narratives.

## Current Position

Milestone: v1.3 Data Quality & Layers — IN PROGRESS
Phase 22.1 COMPLETE (2 of 2 plans done)
Phase 22 COMPLETE (3 of 3 plans done)
Previous: v0.9-v1.2 all shipped (958 tests, p95 153ms)

## v1.3 Phases

| Phase | Name | Status |
|-------|------|--------|
| 22 | GDELT Event Quality & OSINT Integration | COMPLETE (3/3 plans) |
| 22.1 | Fixing Dispersion | COMPLETE (2/2 plans) |
| 23 | Threat Density Improvements | Planned |
| 24 | Political Boundaries Layer | Planned |
| 25 | Ethnic Distribution Layer | Planned |
| 26 | Water Stress Layer | Planned |
| 27 | Performance & Load Testing | Planned |

## Key Decisions

- GDELT stays on CSV export (no BigQuery) — tune existing pipeline instead
- Bellingcat RSS as sole OSINT gap-filter (no Telegram/GramJS)
- Ethnic layer: hatched overlay regions (Option C) — not solid fills
- Load target: 250 VUs (up from 100 in v1.2)
- Satellite imagery deferred to v1.4
- Dispersion only for ActionGeo_Type 3/4; centroid penalty 0.7x on confidence (multiplicative, not exclusion)
- Bellingcat corroboration uses three-gate matching (temporal AND geographic AND keyword) to prevent false boosts
- RSS_FEEDS changed from const assertion to typed array for extensibility
- parseAndFilterWithTrace kept separate from parseAndFilter to preserve production performance
- Fly-to dedup uses simple lat/lng !== equality (coordinates from lookup table, exact match correct)
- Added else-if branch to reset lastFlownPinRef when near: tag absent from query (deriveFiltersFromAST returns undefined, not null)
- disperseEvents relocated from parseAndFilter to events route for single-pass slot assignment post-merge
- CENTROID_TOLERANCE=0.01 extracted as shared constant between geoValidation.ts and dispersion.ts

## Pending Todos

None.

## Blockers/Concerns

- Ethnic distribution GeoJSON data needs manual curation from published maps
- WRI Aqueduct data format/licensing needs verification
- Redis command budget at ~92% — monitor with Bellingcat RSS adding another polling source

## Accumulated Context

### Roadmap Evolution

- Phase 22.1 inserted after Phase 22: fixing dispersion (URGENT)
- Phase 23.1 inserted after Phase 23: detail panel navigation stack (deferred from Phase 23 discussion)
