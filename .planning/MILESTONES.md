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

## v1.0 Deployment (Shipped: 2026-03-20)

**Phases:** 2 (13-14) | **Plans:** 6/6 complete | **Commits:** 35
**Lines of code:** 13,637 TypeScript/CSS | **Timeline:** 2 days (2026-03-19 → 2026-03-20)
**Git range:** 266d6cb..b5e37dd

**Key accomplishments:**
1. Upstash Redis cache replacing all in-memory caches for serverless compatibility
2. AISStream on-demand connection model (connect-collect-close per request)
3. GDELT backfill with lazy on-demand historical data loading
4. Vercel deployment with serverless functions + CDN-served SPA
5. Rate limiting and graceful degradation for missing API keys

---

## v1.1 Intelligence Layer (Shipped: 2026-03-22)

**Phases:** 8 (15-19.2) | **Tests:** 851 passing | **Commits:** 146
**Lines of code:** 25,842 TypeScript/CSS | **Timeline:** 3 days (2026-03-20 → 2026-03-22)
**Git range:** b97baf3..932358a

**Key accomplishments:**
1. Key infrastructure sites overlay (nuclear, naval, oil, airbase, desalination, port) from Overpass/OSM with attack status detection
2. News feed aggregation (GDELT DOC + 5 RSS feeds) with Jaccard dedup/clustering
3. Severity-scored notification center with proximity alerts (50km) and news headline matching
4. Oil markets tracker (Brent, WTI, XLE, USO, XOM) with sparkline charts and delta animations
5. Tag-based search language (~25 prefixes) with bidirectional filter sync and autocomplete
6. Counter entity dropdowns with fly-to and proximity sorting
7. All 29 v1.1 requirements complete

---

## v1.2 Visualization & Hardening (Shipped: 2026-03-29)

**Phases:** 7 (20-21.3) | **Tests:** 958 passing | **Commits:** 129
**Lines of code:** ~30,000 TypeScript/CSS | **Timeline:** 7 days (2026-03-23 → 2026-03-29)
**Git range:** b5c0df9..0bd040e

**Key accomplishments:**
1. Visualization layer architecture (geographic elevation/contour, weather heatmap/wind barbs, threat density heatmap)
2. GDELT news relevance filtering with NLP-based scoring (replacing keyword whitelist)
3. GDELT event quality pipeline (geo-validation, composite confidence scoring, CAMEO 180/192 exclusion)
4. Production hardening (Helmet CSP, per-endpoint rate limiting, structured logging, Redis fallback)
5. Multi-user load testing (k6 501 VUs + Playwright 3 workers, 100% pass rate, p95 153ms)

---

