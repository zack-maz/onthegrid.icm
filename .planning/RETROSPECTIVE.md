# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v0.9 — MVP

**Shipped:** 2026-03-19
**Phases:** 13 | **Plans:** 25/28 | **Timeline:** 6 days

### What Was Built
- 2.5D intelligence map with 3D terrain covering Greater Middle East
- Multi-source flight tracking (OpenSky, ADS-B Exchange, adsb.lol)
- Ship tracking via AIS + GDELT v2 conflict events (11 CAMEO types)
- Zoom-responsive entity rendering with canvas icon atlas
- Layer toggles, hover tooltips, click-to-inspect detail panels
- Smart filters (country, speed, altitude, proximity, date range)
- Analytics counters dashboard with delta animations

### What Worked
- Recursive setTimeout polling pattern avoided race conditions across all data sources
- Adapter pattern for flight sources made adding adsb.lol trivial (shared V2 normalizer)
- Canvas icon atlas with mask mode enabled runtime color tinting without multiple PNGs
- Zustand curried store pattern provided excellent type inference
- Phase-per-feature branching kept changes isolated and reviewable
- Average plan execution of ~4.7 minutes kept momentum high

### What Was Inefficient
- 3 plans were superseded by later work (06-03, 08-02, 09-02) — features delivered through alternate phases but original plans never formally closed
- Roadmap plan checkboxes drifted from disk state (roadmap showed unchecked plans that had summaries on disk)
- ACLED was built in Phase 8 then immediately replaced by GDELT in Phase 8.1 — could have gone straight to GDELT
- Some phases had UAT gap closure plans that could have been caught earlier with stricter criteria

### Patterns Established
- Shared normalizer pattern for similar data sources (adsb-v2-normalize.ts)
- Tab visibility-aware polling (pause on hidden, immediate fetch on visible)
- Cache-first server routes to conserve API credits
- localStorage persistence with atomic key + try/catch guards
- Pure filter predicates: non-applicable filters include (not exclude)
- Lost contact tracking via useRef to survive store updates

### Key Lessons
1. Plan for data source pivots — building adapter abstractions early pays off when sources change (ACLED -> GDELT)
2. Keep roadmap state and disk state in sync — drifted checkboxes caused confusion during milestone completion
3. Free-tier APIs with no auth (adsb.lol, GDELT) provide better out-of-box experience than credentialed sources
4. Meter-based icon sizing with min/max pixel bounds is the right pattern for zoom-responsive maps

### Cost Observations
- 229 commits over 6 days
- ~2 hours total plan execution time
- Stable ~4-5min per plan throughout

---

## Cross-Milestone Trends

| Metric | v0.9 |
|--------|------|
| Phases | 13 |
| Plans | 25/28 |
| Days | 6 |
| LOC | 12,262 |
| Commits | 229 |
| Avg plan time | 4.7min |
