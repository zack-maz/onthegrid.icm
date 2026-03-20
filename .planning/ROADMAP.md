# Roadmap: Iran Conflict Monitor

## Milestones

- ✅ **v0.9 MVP** — Phases 1-12 (shipped 2026-03-19)

## Phases

<details>
<summary>✅ v0.9 MVP (Phases 1-12) — SHIPPED 2026-03-19</summary>

- [x] Phase 1: Project Scaffolding & Theme (1/1 plans) — completed 2026-03-14
- [x] Phase 2: Base Map (3/3 plans) — completed 2026-03-14
- [x] Phase 3: API Proxy (3/3 plans) — completed 2026-03-15
- [x] Phase 4: Flight Data Feed (2/2 plans) — completed 2026-03-15
- [x] Phase 5: Entity Rendering (2/2 plans) — completed 2026-03-16
- [x] Phase 6: ADS-B Exchange Data Source (2/3 plans) — completed 2026-03-16
- [x] Phase 7: adsb.lol Data Source (2/2 plans) — completed 2026-03-16
- [x] Phase 8: Ship & Conflict Data Feeds (1/2 plans) — completed 2026-03-17
- [x] Phase 8.1: GDELT Event Source (2/2 plans) — completed 2026-03-17
- [x] Phase 9: Layer Controls & News Toggle (1/2 plans) — completed 2026-03-17
- [x] Phase 10: Detail Panel (2/2 plans) — completed 2026-03-18
- [x] Phase 11: Smart Filters (3/3 plans) — completed 2026-03-18
- [x] Phase 12: Analytics Dashboard (1/1 plans) — completed 2026-03-19

</details>

### v1.0 Deployment (Phases 13-14)

- [x] **Phase 13: Serverless Cache Migration** — Replace in-memory caches with Upstash Redis for stateless serverless compatibility (gap closure in progress) (completed 2026-03-20)
- [ ] **Phase 14: Vercel Deployment** — Add Vercel entry points, vercel.json, and deploy

### Phase 13: Serverless Cache Migration
**Goal**: Replace all in-memory server-side caches with Upstash Redis so cached data persists across stateless serverless function invocations
**Depends on**: Phase 12
**Success Criteria** (what must be TRUE):
  1. All three data routes (flights, ships, events) read/write from Redis instead of in-memory caches
  2. EntityCache class is deleted and replaced with Redis get/set operations
  3. AISStream connection is on-demand (connect-collect-close per request) instead of persistent
  4. Server still runs locally with `app.listen()` for development
  5. Existing API response shapes (CacheResponse<T>) are preserved
**Plans:** 4/4 plans complete

Plans:
- [x] 13-01-PLAN.md — Redis cache module + flights route migration
- [x] 13-02-PLAN.md — AISStream on-demand rewrite + ships route migration
- [x] 13-03-PLAN.md — Events route Redis accumulator + server cleanup
- [ ] 13-04-PLAN.md — Gap closure: re-introduce GDELT backfill for historical event data

### Phase 14: Vercel Deployment
**Goal**: Deploy the application to Vercel as a serverless function + CDN-served SPA with rate limiting and graceful degradation for missing API keys
**Depends on**: Phase 13
**Success Criteria** (what must be TRUE):
  1. Application deploys to Vercel successfully
  2. All API routes work as serverless functions
  3. Frontend is served from Vercel CDN
  4. Rate limiting protects upstream API credits
  5. Server boots without crashing when optional API keys are absent
**Plans:** 2 plans

Plans:
- [ ] 14-01-PLAN.md — Server hardening: graceful config, rate limiting, CORS wildcard
- [ ] 14-02-PLAN.md — Vercel entry point, vercel.json, deployment verification

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Project Scaffolding & Theme | v0.9 | 1/1 | Complete | 2026-03-14 |
| 2. Base Map | v0.9 | 3/3 | Complete | 2026-03-14 |
| 3. API Proxy | v0.9 | 3/3 | Complete | 2026-03-15 |
| 4. Flight Data Feed | v0.9 | 2/2 | Complete | 2026-03-15 |
| 5. Entity Rendering | v0.9 | 2/2 | Complete | 2026-03-16 |
| 6. ADS-B Exchange Data Source | v0.9 | 2/3 | Complete | 2026-03-16 |
| 7. adsb.lol Data Source | v0.9 | 2/2 | Complete | 2026-03-16 |
| 8. Ship & Conflict Data Feeds | v0.9 | 1/2 | Complete | 2026-03-17 |
| 8.1. GDELT Event Source | v0.9 | 2/2 | Complete | 2026-03-17 |
| 9. Layer Controls & News Toggle | v0.9 | 1/2 | Complete | 2026-03-17 |
| 10. Detail Panel | v0.9 | 2/2 | Complete | 2026-03-18 |
| 11. Smart Filters | v0.9 | 3/3 | Complete | 2026-03-18 |
| 12. Analytics Dashboard | v0.9 | 1/1 | Complete | 2026-03-19 |
| 13. Serverless Cache Migration | 4/4 | Complete   | 2026-03-20 | 2026-03-20 |
| 14. Vercel Deployment | v1.0 | 0/2 | Planning | - |
