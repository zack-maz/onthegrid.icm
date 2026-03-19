# Milestones

## v0.9 MVP (Shipped: 2026-03-19)

**Phases:** 13 (1-12 + 8.1) | **Plans:** 25/28 complete | **Commits:** 229
**Lines of code:** 12,262 TypeScript/CSS | **Timeline:** 6 days (2026-03-13 → 2026-03-18)
**Git range:** c4d3055..9238f98

**Key accomplishments:**
1. Interactive 2.5D dark map with 3D terrain, pan/zoom/rotate (Deck.gl + MapLibre + AWS Terrarium DEM)
2. Multi-source flight tracking (OpenSky, ADS-B Exchange, adsb.lol) with tab-aware recursive polling
3. Ship tracking (AIS) + GDELT v2 conflict event data with CAMEO classification and 11 event types
4. Entity rendering with zoom-responsive icons, hover tooltips, and click-to-inspect detail panel
5. Smart filters (country, speed, altitude, proximity, date range) with proximity circle visualization
6. Analytics counters dashboard with visibility-aware counts and delta animations

### Known Gaps

3 plans were not formally executed (features delivered through alternate phases):
- **06-03**: SourceSelector UI dropdown — superseded by StatusPanel HUD (Phase 8)
- **08-02**: HUD status panel — delivered as part of Phase 8 execution
- **09-02**: LayerTogglesSlot UI panel — delivered as part of Phase 9 execution

---

