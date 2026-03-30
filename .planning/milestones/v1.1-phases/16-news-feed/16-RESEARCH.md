# Phase 16: News Feed - Research

**Researched:** 2026-03-20
**Domain:** Server-side news aggregation (GDELT DOC API + RSS feeds), Redis caching, Zustand client store
**Confidence:** HIGH

## Summary

Phase 16 builds a server-side news aggregation pipeline that fetches conflict news from the GDELT DOC 2.0 API and 6 RSS feeds, filters by keyword relevance, deduplicates by URL hash and fuzzy title similarity, clusters related articles, and stores the unified feed in Redis. A new `/api/news` endpoint serves the feed, and client-side infrastructure (newsStore + useNewsPolling) prepares for Phase 17 consumption.

The project already has well-established patterns for every aspect of this phase: adapter modules for upstream data sources, cache-first Express routes with Redis, Zustand stores with connection health tracking, and recursive setTimeout polling hooks. The GDELT DOC API is a different GDELT endpoint from the existing events adapter (DOC searches article text vs. events CSV data), but the adapter structure is identical. RSS parsing requires a new dependency -- `fast-xml-parser` is recommended over `rss-parser` because it has native ESM support matching the project's `verbatimModuleSyntax: true` constraint.

**Primary recommendation:** Follow existing adapter-route-cache-store patterns exactly. Use `fast-xml-parser` (zero-dependency, ESM-native) to build a minimal RSS normalizer rather than adopting `rss-parser` (CommonJS-only). Hand-roll Jaccard token overlap for fuzzy title matching (~15 lines) instead of adding a fuzzy matching library.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **GDELT DOC API** is the backbone -- broad query (region/country terms), server-side keyword filtering
- **6 RSS feeds** as enrichment sources: BBC Middle East, Al Jazeera English, Tehran Times, Times of Israel, Reuters, Middle East Eye
- GDELT is required (endpoint errors if GDELT fails); all RSS feeds are best-effort (silently skip on failure)
- Prioritize Middle Eastern news sources for regional perspective balance
- Article data model includes geolocation (lat/lng) when available from GDELT metadata; RSS articles won't have geo and that's fine
- Broad geopolitical keyword whitelist -- includes military terms AND diplomatic/political terms
- Filter applied to both title AND description/summary text
- No separate geographic term filtering layer -- keyword list already includes country names and org names
- No tone score filtering -- store GDELT tone for Phase 17 severity scoring but don't gate article inclusion on it
- All keyword-matched articles treated equally regardless of tone
- **Two-pass deduplication**: URL hash (exact match) first, then fuzzy title similarity (token overlap above ~80%) within a 24-hour window
- **Story clusters, not discards**: duplicate articles grouped as clusters with one primary article + linked alternates
- Cluster model: `NewsCluster { id, primaryArticle, articles[], firstSeen, lastUpdated }`
- Primary article = earliest published in the cluster
- Rich article model: `NewsArticle { id, title, url, source, publishedAt, summary?, imageUrl?, lat?, lng?, tone?, keywords[] }`
- `id` = hash of URL for uniqueness
- **15-minute polling interval** matching GDELT events cadence
- **Per-source Redis keys** for per-source health inspection
- **Merged feed key** (`news:feed`) storing the deduplicated, clustered feed for API reads
- **7-day sliding window** -- prune articles older than 7 days on each refresh cycle
- Cache-first route pattern matching existing events route
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

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NEWS-01 | System aggregates conflict news from GDELT DOC API, BBC RSS, and Al Jazeera RSS into a unified feed | GDELT DOC API ArtList mode documented; BBC and Al Jazeera RSS feed URLs verified; adapter pattern established; note that CONTEXT.md expanded to 6 RSS feeds beyond the requirements minimum |
| NEWS-02 | System filters non-conflict articles using keyword whitelist (Iran, Israel, airstrike, military, etc.) | Keyword filtering approach documented; applied to title + description; GDELT DOC API handles initial relevance via query terms, server-side whitelist does secondary filtering |
| NEWS-03 | System deduplicates articles by URL hash across sources | URL hash via `crypto.createHash('sha256')` (Node.js built-in); two-pass dedup with fuzzy title clustering documented |

</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| fast-xml-parser | ^5.5 | Parse RSS XML feeds to JavaScript objects | Zero dependencies, native ESM, 104K, actively maintained; avoids `rss-parser` CJS compatibility issues with project's `verbatimModuleSyntax: true` |
| @upstash/redis | ^1.37.0 | Redis caching for news feed data | Already in project; REST-based, serverless-safe |
| zustand | ^5.0.11 | Client-side newsStore | Already in project; curried `create<T>()()` pattern |
| Node.js crypto | built-in | SHA-256 hash of URLs for article IDs | No dependency needed; `crypto.createHash('sha256')` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| express | ^5.2.1 | `/api/news` route | Already in project |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| fast-xml-parser | rss-parser (^3.13) | rss-parser has built-in URL fetching and field normalization, BUT is CommonJS-only -- incompatible with project's `verbatimModuleSyntax: true` and pure ESM server code. Would require `import * as Parser from 'rss-parser'` hacks or CJS shims. |
| fast-xml-parser | feedsmith | Newer, includes RSS/Atom/JSON Feed parsing, uses fast-xml-parser internally. But adds another dependency layer; raw fast-xml-parser is sufficient for our 6 known feeds. |
| Hand-rolled Jaccard | string-similarity npm | Adds dependency for ~15 lines of Jaccard token overlap code. Over-engineering. |

**Installation:**
```bash
npm install fast-xml-parser
npm install -D @types/node  # already present, but types for crypto
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  adapters/
    gdelt-doc.ts          # GDELT DOC API adapter (new)
    rss.ts                # Generic RSS feed fetcher/normalizer (new)
  routes/
    news.ts               # /api/news Express route (new)
  constants.ts            # NEWS_CACHE_TTL, NEWS_SLIDING_WINDOW_DAYS (extend)
  types.ts                # NewsArticle, NewsCluster types (extend)
src/
  stores/
    newsStore.ts           # Zustand store for news data (new)
  hooks/
    useNewsPolling.ts      # Recursive setTimeout polling hook (new)
  components/layout/
    AppShell.tsx           # Wire useNewsPolling() (modify)
```

### Pattern 1: GDELT DOC API Adapter
**What:** Fetches articles from GDELT DOC 2.0 API using ArtList mode with JSON format
**When to use:** Every 15-minute refresh cycle
**Details:**

GDELT DOC API endpoint:
```
https://api.gdeltproject.org/api/v2/doc/doc?query=QUERY&mode=artlist&format=json&maxrecords=250&timespan=TIMESPAN&sort=DateDesc
```

Response format (verified by fetching live API):
```json
{
  "articles": [
    {
      "url": "https://...",
      "url_mobile": "",
      "title": "Article headline",
      "seendate": "20260320T180000Z",
      "socialimage": "https://...",
      "domain": "bbc.co.uk",
      "language": "English",
      "sourcecountry": "United Kingdom"
    }
  ]
}
```

**CRITICAL FINDING:** The GDELT DOC API ArtList mode does NOT include a `tone` field in article responses. The 8 fields are: `url`, `url_mobile`, `title`, `seendate`, `socialimage`, `domain`, `language`, `sourcecountry`. Tone is only available via the separate `timelinetone` mode or by using `tone<N`/`tone>N` query filters. Since the CONTEXT.md says "store GDELT tone for Phase 17", we have two options:
1. Make a second API call using `mode=timelinetone` (adds complexity)
2. Set tone to `null` for all articles and note this limitation for Phase 17

**Recommendation:** Set tone to `null/undefined`. The CONTEXT.md says "store GDELT tone for Phase 17 severity scoring but don't gate article inclusion on it" -- Phase 17 can derive severity from other signals (event type, mentions, recency). This avoids doubling API calls.

**seendate parsing:** Format is `YYYYMMDDTHHmmssZ` -- parse with:
```typescript
function parseGdeltDate(seendate: string): number {
  // "20260320T180000Z" -> Date
  const y = seendate.slice(0, 4);
  const m = seendate.slice(4, 6);
  const d = seendate.slice(6, 8);
  const h = seendate.slice(9, 11);
  const min = seendate.slice(11, 13);
  const sec = seendate.slice(13, 15);
  return Date.UTC(+y, +m - 1, +d, +h, +min, +sec);
}
```

**Query strategy:** Use broad region/country terms in the GDELT query to cast a wide net, then apply keyword whitelist server-side:
```
query: "Iran OR Israel OR Iraq OR Syria OR Yemen OR Lebanon OR Hezbollah OR Hamas OR IRGC"
timespan: "24h"
maxrecords: 250
sort: DateDesc
```

### Pattern 2: Generic RSS Adapter
**What:** Fetches and normalizes RSS feeds from 6 sources to NewsArticle format
**When to use:** Every 15-minute refresh cycle, best-effort per feed

**Verified RSS Feed URLs:**

| Source | URL | Status | Items |
|--------|-----|--------|-------|
| BBC Middle East | `https://feeds.bbci.co.uk/news/world/middle_east/rss.xml` | Verified, valid RSS 2.0 | ~30 |
| Al Jazeera English | `https://www.aljazeera.com/xml/rss/all.xml` | Verified, valid RSS 2.0 | ~25 |
| Tehran Times | `https://www.tehrantimes.com/rss` | URL found but timed out on validation; treat as best-effort | Unknown |
| Times of Israel | `https://www.timesofisrael.com/feed/` | Verified, valid RSS 2.0 | ~15 |
| Reuters | N/A -- discontinued June 2020 | **BLOCKED: No official RSS feed** | N/A |
| Middle East Eye | `https://www.middleeasteye.net/rss` | Verified, valid RSS 2.0 | ~16 |

**CRITICAL FINDING: Reuters has no RSS feed.** Reuters officially discontinued all RSS feeds in June 2020. Options:
1. **Drop Reuters** and use 5 RSS feeds (recommended -- simplest, no fragile workarounds)
2. **Substitute** with another wire service: Associated Press (`https://rsshub.app/apnews/topics/world-news`) or France24 (`https://www.france24.com/en/middle-east/rss`)
3. **Use Google News RSS** as a proxy: `https://news.google.com/rss/search?q=Reuters+Iran+conflict`

**Recommendation:** Drop Reuters, keep 5 verified feeds. The CONTEXT.md marks all RSS feeds as "best-effort" enrichment, and 5 feeds already provide excellent multi-perspective coverage (Western: BBC; Arab: Al Jazeera; Iranian: Tehran Times; Israeli: Times of Israel; Independent: Middle East Eye).

**Common RSS item fields** (used across verified feeds):
- `title` -- headline
- `link` -- article URL
- `description` -- summary/snippet (may contain HTML)
- `pubDate` -- RFC 822 date string
- `guid` -- unique identifier (not always a URL)

**RSS parsing with fast-xml-parser:**
```typescript
import { XMLParser } from 'fast-xml-parser';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

async function fetchRssFeed(url: string, sourceName: string): Promise<NewsArticle[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);
  const xml = await res.text();
  const parsed = parser.parse(xml);

  const items = parsed?.rss?.channel?.item ?? [];
  const itemArray = Array.isArray(items) ? items : [items];

  return itemArray.map(item => ({
    id: hashUrl(item.link),
    title: item.title ?? '',
    url: item.link ?? '',
    source: sourceName,
    publishedAt: new Date(item.pubDate).getTime(),
    summary: stripHtml(item.description ?? ''),
    imageUrl: item['media:thumbnail']?.['@_url'] ?? undefined,
    keywords: [],
  }));
}
```

### Pattern 3: Cache-First News Route (follows events route pattern)
**What:** `/api/news` route with cache-first strategy, merge, sliding window prune
**When to use:** Serves all client requests for news data
```
1. Check cache (news:feed) -- return if fresh
2. If stale/miss:
   a. Fetch GDELT DOC API (required -- throw on fail)
   b. Fetch all RSS feeds (best-effort -- Promise.allSettled)
   c. Apply keyword filter to all articles
   d. Merge with cached articles by URL hash
   e. Deduplicate + cluster
   f. Prune articles older than 7 days
   g. Write to per-source + merged cache keys
   h. Return merged feed
3. On GDELT error: fall back to stale cache if available
```

### Pattern 4: Two-Pass Deduplication + Clustering
**What:** URL hash dedup first, then fuzzy title clustering
**When to use:** After merging all sources

```typescript
// Pass 1: URL hash dedup
const seen = new Map<string, NewsArticle>(); // id (hash of URL) -> article
for (const article of allArticles) {
  if (!seen.has(article.id)) {
    seen.set(article.id, article);
  }
}

// Pass 2: Fuzzy title clustering (Jaccard token overlap)
function tokenize(text: string): Set<string> {
  return new Set(text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean));
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

// Within 24h window, group articles with Jaccard > 0.8
```

### Pattern 5: Zustand newsStore (follows eventStore pattern)
**What:** Client-side store for news feed with connection health tracking
```typescript
import { create } from 'zustand';
import type { CacheResponse } from '@/types/entities';

export type NewsConnectionStatus = 'connected' | 'stale' | 'error' | 'loading';

interface NewsState {
  clusters: NewsCluster[];
  connectionStatus: NewsConnectionStatus;
  lastFetchAt: number | null;
  articleCount: number;
  setNewsData: (response: CacheResponse<NewsCluster[]>) => void;
  setError: () => void;
  setLoading: () => void;
}
```

### Anti-Patterns to Avoid
- **Do NOT use `rss-parser`:** CJS-only, will break ESM imports with `verbatimModuleSyntax: true`
- **Do NOT make dual GDELT API calls** for tone data: ArtList mode has no tone field; separate timeline call would double API usage
- **Do NOT use `setInterval` for polling:** Project standard is recursive `setTimeout` with tab visibility awareness
- **Do NOT store raw RSS XML in Redis:** Normalize to `NewsArticle` before caching
- **Do NOT retry failed RSS feeds:** They are best-effort. Log warning and move on.
- **Do NOT filter GDELT results by tone:** Store tone as null; Phase 17 handles severity scoring

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XML parsing | Custom regex/string parsing | `fast-xml-parser` XMLParser | RSS feeds have edge cases (CDATA, namespaces, HTML entities) |
| URL hashing | Custom hash function | `crypto.createHash('sha256')` | Built-in Node.js, cryptographically sound, deterministic |
| HTML stripping from descriptions | Custom regex | Simple regex `/<[^>]*>/g` replacement | RSS descriptions often contain HTML; a 1-line regex is sufficient for summaries (not rendering) |
| Date parsing for RSS pubDate | Custom parser | `new Date(pubDate).getTime()` | RFC 822 dates are natively parsed by JavaScript Date constructor |
| Redis caching | Custom Redis wrapper | Existing `cacheGet`/`cacheSet` from `server/cache/redis.ts` | Already proven in 5 other data routes |

**Key insight:** The project already has a mature adapter-route-cache pattern used by flights, ships, events, and sites. News is just another data source following the same structure. The only genuinely new code is the RSS XML parsing, keyword filtering, and story clustering logic.

## Common Pitfalls

### Pitfall 1: RSS Feed URL Instability
**What goes wrong:** RSS feed URLs change without notice; feeds may serve HTML instead of XML; feeds may rate-limit aggressive polling
**Why it happens:** RSS is not a contractual API; publishers change URL structures
**How to avoid:** Wrap each RSS fetch in try/catch, use `AbortSignal.timeout(10_000)` to prevent hangs, validate response Content-Type before parsing, log warnings but never let a single feed failure block the entire news route
**Warning signs:** Persistent 403/404 errors from a feed, HTML content-type responses

### Pitfall 2: GDELT DOC API Rate Limiting
**What goes wrong:** GDELT DOC API returns 429 or empty results when queried too frequently
**Why it happens:** No documented rate limits, but undocumented throttling exists at high request volumes
**How to avoid:** 15-minute polling interval (same as GDELT events) provides generous spacing; use cache-first pattern to minimize unnecessary API calls; store 250 results per call to maximize data per request
**Warning signs:** Empty `articles` array in response, HTTP 429 status

### Pitfall 3: CDATA and HTML in RSS Descriptions
**What goes wrong:** fast-xml-parser returns raw CDATA content with HTML tags embedded in description fields
**Why it happens:** RSS feeds commonly wrap descriptions in CDATA sections containing HTML
**How to avoid:** Configure fast-xml-parser with CDATA handling, strip HTML tags from descriptions before storing
**Warning signs:** `<![CDATA[...]]>` wrappers or `<p>`, `<br>` tags in stored descriptions

### Pitfall 4: Fuzzy Title Matching False Positives
**What goes wrong:** Short, generic titles (e.g., "Iran latest") cluster unrelated articles together
**Why it happens:** Jaccard similarity on short strings is unreliable -- 3-word titles with 2 common words exceed 80% threshold
**How to avoid:** Require minimum title length (e.g., 5 tokens) before fuzzy matching; only cluster within 24-hour window to prevent temporal drift
**Warning signs:** Clusters with unrelated articles sharing generic keywords

### Pitfall 5: Redis Key Proliferation
**What goes wrong:** 7+ new Redis keys (6 per-source + 1 merged feed) added to an already ~92% capacity budget
**Why it happens:** STATE.md flags Redis command budget concern
**How to avoid:** Per-source keys use shorter TTLs (15min logical, 1h hard); merged feed uses longer TTL (15min logical, 2.5h hard); monitor with Redis INFO command; per-source keys are small (metadata only), merged feed is the primary storage cost
**Warning signs:** Upstash dashboard showing command usage spikes

### Pitfall 6: GDELT seendate Timezone Handling
**What goes wrong:** Incorrect date parsing causes articles to appear from the future or be incorrectly pruned
**Why it happens:** GDELT seendate format `YYYYMMDDTHHmmssZ` is non-standard ISO 8601 (no separators)
**How to avoid:** Use explicit UTC parsing (slice + Date.UTC), never `new Date(seendate)` which may fail on this format
**Warning signs:** Articles with timestamps in the future or articles missing from the feed

## Code Examples

### NewsArticle and NewsCluster Types
```typescript
// Source: project convention (server/types.ts extension)
export interface NewsArticle {
  id: string;          // SHA-256 hash of URL (hex, truncated to 16 chars)
  title: string;
  url: string;
  source: string;      // "GDELT", "BBC", "Al Jazeera", "Tehran Times", "Times of Israel", "Middle East Eye"
  publishedAt: number; // Unix ms
  summary?: string;
  imageUrl?: string;
  lat?: number;        // GDELT articles may have geo from source country
  lng?: number;
  tone?: number;       // Reserved for Phase 17 (always null in Phase 16)
  keywords: string[];  // Matched whitelist keywords
}

export interface NewsCluster {
  id: string;                // Same as primaryArticle.id
  primaryArticle: NewsArticle; // Earliest published
  articles: NewsArticle[];    // All articles in cluster (including primary)
  firstSeen: number;         // Earliest publishedAt
  lastUpdated: number;       // Latest publishedAt in cluster
}
```

### URL Hashing
```typescript
// Source: Node.js crypto built-in
import { createHash } from 'node:crypto';

function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}
```

### Keyword Whitelist Filter
```typescript
// Source: project convention (Claude's discretion)
const CONFLICT_KEYWORDS = new Set([
  // Military
  'airstrike', 'missile', 'bomb', 'bombing', 'strike', 'troops', 'drone',
  'casualties', 'military', 'attack', 'combat', 'offensive', 'artillery',
  'warship', 'navy', 'airforce', 'defense', 'weapon', 'nuclear', 'raid',
  'shelling', 'rocket', 'interceptor', 'air defense', 'fighter jet',
  // Diplomatic/Political
  'sanctions', 'negotiations', 'ceasefire', 'escalation', 'tensions',
  'iaea', 'un security council', 'diplomacy', 'withdrawal', 'deployment',
  // Organizations
  'irgc', 'hezbollah', 'hamas', 'houthi', 'pentagon', 'centcom', 'nato',
  'idf', 'mossad', 'quds force',
  // Countries/Regions
  'iran', 'israel', 'iraq', 'syria', 'yemen', 'lebanon', 'gaza',
  'tehran', 'tel aviv', 'jerusalem', 'beirut', 'baghdad', 'damascus',
  'strait of hormuz', 'persian gulf', 'red sea',
  // Conflict terms
  'war', 'conflict', 'invasion', 'blockade', 'siege', 'occupation',
  'refugee', 'humanitarian', 'civilian', 'killed', 'wounded', 'destroyed',
]);

function matchesKeywords(article: { title: string; summary?: string }): string[] {
  const text = `${article.title} ${article.summary ?? ''}`.toLowerCase();
  const matched: string[] = [];
  for (const keyword of CONFLICT_KEYWORDS) {
    if (text.includes(keyword)) matched.push(keyword);
  }
  return matched;
}
```

### RSS Feed Configuration
```typescript
// Source: verified feed URLs (research)
export const RSS_FEEDS = [
  { name: 'BBC', url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml' },
  { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
  { name: 'Tehran Times', url: 'https://www.tehrantimes.com/rss' },
  { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/' },
  { name: 'Middle East Eye', url: 'https://www.middleeasteye.net/rss' },
] as const;
// Note: Reuters dropped -- no official RSS feed since June 2020
```

### GDELT DOC API Query Construction
```typescript
// Source: verified GDELT DOC 2.0 API (api.gdeltproject.org)
const GDELT_DOC_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

function buildGdeltDocUrl(): string {
  const query = encodeURIComponent(
    'Iran OR Israel OR Iraq OR Syria OR Yemen OR Lebanon OR Hezbollah OR Hamas OR IRGC OR "Middle East" OR "Persian Gulf"'
  );
  return `${GDELT_DOC_BASE}?query=${query}&mode=artlist&format=json&maxrecords=250&timespan=24h&sort=DateDesc`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| rss-parser (CJS) | fast-xml-parser (ESM) | 2024+ | rss-parser hasn't kept up with ESM ecosystem; fast-xml-parser v5+ has full ESM support |
| Reuters RSS feeds | No Reuters RSS | June 2020 | Reuters discontinued all RSS; alternative wire sources needed |
| GDELT v1 API | GDELT DOC 2.0 API | 2017+ | 3-month rolling window, 250 max records, JSON output, no API key needed |
| fuse.js fuzzy search | Simple Jaccard token overlap | N/A | For title similarity, Jaccard on word tokens is more predictable and lightweight than full fuzzy search |

**Deprecated/outdated:**
- Reuters RSS feeds: Discontinued June 2020, no official replacement
- rss-parser npm: Still functional but CJS-only, problematic with modern ESM TypeScript projects

## Open Questions

1. **Tehran Times RSS feed reliability**
   - What we know: URL `https://www.tehrantimes.com/rss` exists but timed out during validation
   - What's unclear: Whether the feed is consistently available or frequently down
   - Recommendation: Include it as best-effort; the RSS adapter already handles failures gracefully via Promise.allSettled

2. **GDELT DOC API geo data**
   - What we know: ArtList mode returns `sourcecountry` but no lat/lng coordinates per article
   - What's unclear: Whether the GDELT GEO API could supplement with article-level geo data
   - Recommendation: Map `sourcecountry` to approximate region centroid for rough geo (optional); defer precise geo to Phase 17 if needed

3. **Reuters replacement**
   - What we know: Reuters has no RSS since 2020; alternatives exist (AP, France24)
   - What's unclear: Whether user specifically wants Reuters content or just a Western wire service
   - Recommendation: Drop Reuters from initial implementation; add a substitute feed in a follow-up if needed. The CONTEXT.md lists all RSS feeds as "best-effort enrichment."

4. **GDELT DOC API tone data**
   - What we know: ArtList mode JSON response has 8 fields, tone is NOT one of them
   - What's unclear: Whether a separate `mode=timelinetone` call could provide per-article tone
   - Recommendation: Set `tone` to `null` in NewsArticle; document limitation for Phase 17 planner

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.0 |
| Config file | `vite.config.ts` (test section) |
| Quick run command | `npx vitest run server/__tests__/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NEWS-01 | GDELT DOC adapter fetches and normalizes articles | unit | `npx vitest run server/__tests__/adapters/gdelt-doc.test.ts -x` | No -- Wave 0 |
| NEWS-01 | RSS adapter fetches and normalizes feed items | unit | `npx vitest run server/__tests__/adapters/rss.test.ts -x` | No -- Wave 0 |
| NEWS-01 | News route merges GDELT + RSS into unified response | integration | `npx vitest run server/__tests__/routes/news.test.ts -x` | No -- Wave 0 |
| NEWS-02 | Keyword filter matches conflict terms in title/summary | unit | `npx vitest run server/__tests__/adapters/gdelt-doc.test.ts -x` | No -- Wave 0 |
| NEWS-02 | Non-conflict articles excluded from feed | unit | `npx vitest run server/__tests__/routes/news.test.ts -x` | No -- Wave 0 |
| NEWS-03 | URL hash dedup prevents same-URL articles from appearing twice | unit | `npx vitest run server/__tests__/routes/news.test.ts -x` | No -- Wave 0 |
| NEWS-03 | Fuzzy title clustering groups similar articles | unit | `npx vitest run server/__tests__/routes/news.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run server/__tests__/`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `server/__tests__/adapters/gdelt-doc.test.ts` -- covers NEWS-01, NEWS-02 (GDELT DOC API adapter)
- [ ] `server/__tests__/adapters/rss.test.ts` -- covers NEWS-01 (RSS feed adapter)
- [ ] `server/__tests__/routes/news.test.ts` -- covers NEWS-01, NEWS-02, NEWS-03 (route integration)
- [ ] Framework install: `npm install fast-xml-parser` -- new dependency

## Sources

### Primary (HIGH confidence)
- GDELT DOC 2.0 API live response -- fetched `api.gdeltproject.org/api/v2/doc/doc?query=Iran+airstrike&mode=artlist&format=json` to verify exact JSON field names (8 fields: url, url_mobile, title, seendate, socialimage, domain, language, sourcecountry)
- BBC RSS feed (`feeds.bbci.co.uk/news/world/middle_east/rss.xml`) -- live fetched, valid RSS 2.0, ~30 items
- Al Jazeera RSS feed (`aljazeera.com/xml/rss/all.xml`) -- live fetched, valid RSS 2.0, ~25 items
- Times of Israel feed (`timesofisrael.com/feed/`) -- live fetched, valid RSS 2.0, ~15 items
- Middle East Eye feed (`middleeasteye.net/rss`) -- live fetched, valid RSS 2.0, ~16 items
- Node.js crypto docs -- `createHash('sha256')` for URL hashing
- Existing project code -- `server/adapters/gdelt.ts`, `server/routes/events.ts`, `server/cache/redis.ts`, `src/stores/eventStore.ts`, `src/hooks/useEventPolling.ts`

### Secondary (MEDIUM confidence)
- [GDELT DOC 2.0 API documentation](https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/) -- query parameters, timespan formats, maxrecords limit (250)
- [fast-xml-parser npm](https://www.npmjs.com/package/fast-xml-parser) -- ESM support, v5.5, zero dependencies
- [rss-parser GitHub](https://github.com/rbren/rss-parser) -- TypeScript types, CJS-only limitation confirmed via PRs
- [Reuters RSS discontinuation](https://www.fivefilters.org/2021/reuters-rss-feeds/) -- confirmed feeds killed June 2020

### Tertiary (LOW confidence)
- Tehran Times RSS (`tehrantimes.com/rss`) -- URL found via directory listings but timed out during validation; treat as best-effort
- GDELT DOC API rate limits -- no official documentation found; assumed reasonable at 15-minute intervals

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- fast-xml-parser verified for ESM, existing project patterns well-documented
- Architecture: HIGH -- follows exact same adapter-route-cache-store pattern used by 4 other data sources
- Pitfalls: HIGH -- RSS feed URLs verified live, GDELT API fields verified live, Reuters discontinuation confirmed
- GDELT tone availability: HIGH -- verified tone NOT in ArtList response by fetching live API
- RSS feed URLs: MEDIUM -- 4 of 5 verified live; Tehran Times timed out

**Research date:** 2026-03-20
**Valid until:** 2026-04-20 (30 days -- stable APIs, RSS feeds may change URLs)
