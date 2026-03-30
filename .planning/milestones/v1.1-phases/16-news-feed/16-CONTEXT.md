# Phase 16: News Feed - Context

**Gathered:** 2026-03-20
**Status:** Ready for planning

<domain>
## Phase Boundary

System silently aggregates conflict-relevant news from multiple sources into a unified, deduplicated, clustered feed stored in Redis and exposed via `/api/news`. Sources: GDELT DOC API (primary) + 6 RSS feeds (BBC Middle East, Al Jazeera English, Tehran Times, Times of Israel, Reuters, Middle East Eye). Includes client-side newsStore + useNewsPolling hook for Phase 17 consumption. Does NOT include notification UI, severity scoring, or alert rendering (Phase 17).

</domain>

<decisions>
## Implementation Decisions

### Source fetching strategy
- **GDELT DOC API** is the backbone — broad query (region/country terms), server-side keyword filtering
- **6 RSS feeds** as enrichment sources: BBC Middle East, Al Jazeera English, Tehran Times, Times of Israel, Reuters, Middle East Eye
- GDELT is required (endpoint errors if GDELT fails); all RSS feeds are best-effort (silently skip on failure)
- Prioritize Middle Eastern news sources for regional perspective balance
- Article data model includes geolocation (lat/lng) when available from GDELT metadata; RSS articles won't have geo and that's fine

### Conflict filtering rules
- Broad geopolitical keyword whitelist — includes military terms (airstrike, missile, bomb, strike, troops, drone, casualties) AND diplomatic/political terms (sanctions, negotiations, ceasefire, escalation, tensions, IAEA, UN)
- Filter applied to both title AND description/summary text
- No separate geographic term filtering layer — keyword list already includes country names (Iran, Israel, etc.) and org names (IRGC, Hezbollah, Hamas)
- No tone score filtering — store GDELT tone for Phase 17 severity scoring but don't gate article inclusion on it
- All keyword-matched articles treated equally regardless of tone

### Deduplication & story clustering
- **Two-pass deduplication**: URL hash (exact match) first, then fuzzy title similarity (token overlap above ~80%) within a 24-hour window
- **Story clusters, not discards**: duplicate articles grouped as clusters with one primary article + linked alternates
- Cluster model: `NewsCluster { id, primaryArticle, articles[], firstSeen, lastUpdated }`
- Primary article = earliest published in the cluster
- Phase 17 can display "N sources reporting this" from cluster size

### Article data model
- Rich model for maximum Phase 17 flexibility:
  - `NewsArticle { id, title, url, source, publishedAt, summary?, imageUrl?, lat?, lng?, tone?, keywords[] }`
  - `NewsCluster { id, primaryArticle, articles[], firstSeen, lastUpdated }`
- `id` = hash of URL for uniqueness
- `source` = human-readable source name (e.g., "BBC", "Al Jazeera", "GDELT")

### Caching & refresh cadence
- **15-minute polling interval** — matches GDELT events cadence; RSS feeds update similarly
- **Per-source Redis keys** (`news:gdelt`, `news:bbc`, `news:aljazeera`, `news:tehrantimes`, `news:timesofisrael`, `news:reuters`, `news:middleeasteye`) for per-source health inspection
- **Merged feed key** (`news:feed`) storing the deduplicated, clustered feed for API reads
- **7-day sliding window** — prune articles older than 7 days on each refresh cycle (news has a shelf life; Phase 17's 24h default view is well within this)
- Cache-first route pattern matching existing events route (check cache → fresh fetch → merge → stale fallback)

### Client integration
- newsStore (Zustand) + useNewsPolling hook added now (not deferred to Phase 17)
- Follows existing polling patterns (recursive setTimeout, tab visibility awareness)
- 15-minute client polling interval matching server refresh

### Claude's Discretion
- Exact keyword whitelist terms (researcher should test against real GDELT DOC results and tune)
- Fuzzy title similarity algorithm choice (Levenshtein, Jaccard, token overlap)
- RSS feed URL discovery and validation for each source
- GDELT DOC API query parameter optimization
- Error retry logic for individual RSS feed failures
- newsStore shape and useNewsPolling implementation details

</decisions>

<specifics>
## Specific Ideas

- Source mix chosen for multi-perspective balance: Western wire (Reuters, BBC), Arab (Al Jazeera), Iranian (Tehran Times), Israeli (Times of Israel), independent regional (Middle East Eye)
- Story clustering enables Phase 17 to show "3 sources reporting this" on notification cards — more useful for intelligence than simple dedup
- Geo metadata from GDELT DOC enables Phase 17 proximity matching between news articles and map events
- Tone scores stored but not filtered on — available for Phase 17 severity weighting

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/cache/redis.ts`: `cacheGet`/`cacheSet` with `CacheEntry<T>` pattern — reuse for news cache keys
- `server/adapters/gdelt.ts`: Existing GDELT events adapter — DOC API adapter follows same module structure
- `server/routes/events.ts`: Cache-first route with accumulator merge — news route follows same pattern with sliding window prune
- `server/constants.ts`: `WAR_START`, `CACHE_TTL`, `IRAN_BBOX` — extend with news constants
- `src/hooks/useFlightPolling.ts`: Recursive setTimeout + tab visibility pattern — reuse for useNewsPolling
- `src/stores/eventStore.ts`: Zustand store with connection health — template for newsStore

### Established Patterns
- Zustand curried `create<T>()()` for new newsStore
- `CacheResponse<T>` contract (data, stale, lastFresh) for API response shape
- Adapter → Route → Cache flow (adapter fetches/normalizes, route handles cache logic)
- Express Router pattern for new `/api/news` route
- `ConnectionStatus` type for store health tracking

### Integration Points
- `server/types.ts`: New `NewsArticle` and `NewsCluster` types
- `server/adapters/`: New `gdelt-doc.ts` (GDELT DOC API) + `rss.ts` (generic RSS parser for 6 feeds)
- `server/routes/`: New `news.ts` route
- `server/constants.ts`: New `NEWS_CACHE_TTL`, `NEWS_SLIDING_WINDOW_DAYS` constants
- `src/stores/`: New `newsStore.ts`
- `src/hooks/`: New `useNewsPolling.ts`
- `src/components/layout/AppShell.tsx`: Wire `useNewsPolling()` alongside existing polling hooks

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 16-news-feed*
*Context gathered: 2026-03-20*
