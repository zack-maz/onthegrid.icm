// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Server } from 'http';
import type { NewsArticle, NewsCluster, CacheResponse } from '../../types.js';
import { hashUrl } from '../../lib/newsClustering.js';

// Sample article fixtures
const makeArticle = (overrides: Partial<NewsArticle> = {}): NewsArticle => ({
  id: hashUrl('https://example.com/default'),
  title: 'Iran launches missile strike on military targets',
  url: 'https://example.com/default',
  source: 'GDELT',
  sourceCountry: 'United Kingdom',
  publishedAt: Date.now(),
  keywords: ['iran', 'missile', 'military'],
  ...overrides,
});

const gdeltArticle1 = makeArticle({
  id: hashUrl('https://bbc.co.uk/news/1'),
  url: 'https://bbc.co.uk/news/1',
  title: 'Iran airstrike targets military base in northern region',
  source: 'GDELT',
  publishedAt: Date.now(),
});

const gdeltArticle2 = makeArticle({
  id: hashUrl('https://reuters.com/2'),
  url: 'https://reuters.com/2',
  title: 'Iran launches drone strike near border military installations',
  source: 'GDELT',
  publishedAt: Date.now() - 3600_000,
});

const rssArticle1 = makeArticle({
  id: hashUrl('https://aljazeera.com/3'),
  url: 'https://aljazeera.com/3',
  title: 'Syria bombing kills dozens in Damascus airstrike campaign',
  source: 'Al Jazeera',
  publishedAt: Date.now() - 1800_000,
});

const oldArticle = makeArticle({
  id: hashUrl('https://example.com/old'),
  url: 'https://example.com/old',
  title: 'Airstrike casualties reported in war zone conflict region',
  source: 'GDELT',
  publishedAt: Date.now() - 8 * 86_400_000, // 8 days ago (beyond 7-day window)
});

// In-memory store backing the Redis mock
interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}
const redisStore = new Map<string, CacheEntry<unknown>>();
const rawRedisStore = new Map<string, unknown>();

// Module-level mock functions
const mockFetchGdeltArticles = vi.fn(async (): Promise<NewsArticle[]> => []);
const mockFetchAllRssFeeds = vi.fn(async (): Promise<NewsArticle[]> => []);

// Mock rate limiter
const _passThrough = (_req: unknown, _res: unknown, next: () => void) => next();
vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimiters: {
    flights: _passThrough,
    ships: _passThrough,
    events: _passThrough,
    news: _passThrough,
    markets: _passThrough,
    weather: _passThrough,
    sites: _passThrough,
    sources: _passThrough,
    geocode: _passThrough,
    water: _passThrough,
    public: _passThrough,
  },
}));

// Mock config (spread actual to preserve constants)
vi.mock('../../config.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../config.js')>();
  const mockCfg = {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
    newsRelevanceThreshold: 0.7,
    eventConfidenceThreshold: 0.35,
    eventMinSources: 2,
    eventCentroidPenalty: 0.7,
    eventExcludedCameo: ['180', '192'],
    bellingcatCorroborationBoost: 0.2,
  };
  return { ...actual, config: mockCfg, loadConfig: () => mockCfg, getConfig: () => mockCfg };
});

// Mock all existing adapters to avoid import chain issues
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-lol.js', () => ({ fetchFlights: vi.fn(async () => []) }));
vi.mock('../../adapters/aisstream.js', () => ({
  getShips: vi.fn(() => []),
  getLastMessageTime: vi.fn(() => 0),
  connectAISStream: vi.fn(),
}));
vi.mock('../../adapters/acled.js', () => ({
  fetchEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/gdelt.js', () => ({
  fetchEvents: vi.fn(async () => []),
  backfillEvents: vi.fn(async () => []),
}));
vi.mock('../../adapters/overpass.js', () => ({
  fetchSites: vi.fn(async () => []),
}));

// Mock GDELT DOC adapter
vi.mock('../../adapters/gdelt-doc.js', () => ({
  fetchGdeltArticles: (...args: unknown[]) => mockFetchGdeltArticles(...args),
}));

// Mock RSS adapter
vi.mock('../../adapters/rss.js', () => ({
  fetchAllRssFeeds: (...args: unknown[]) => mockFetchAllRssFeeds(...args),
  RSS_FEEDS: [
    { url: 'https://feeds.bbci.co.uk/rss.xml', name: 'BBC', country: 'United Kingdom' },
    { url: 'https://www.aljazeera.com/rss', name: 'Al Jazeera', country: 'Qatar' },
    { url: 'https://www.tehrantimes.com/rss', name: 'Tehran Times', country: 'Iran' },
    { url: 'https://www.timesofisrael.com/feed/', name: 'Times of Israel', country: 'Israel' },
    {
      url: 'https://www.middleeasteye.net/rss',
      name: 'Middle East Eye',
      country: 'United Kingdom',
    },
  ],
}));

vi.mock('../../adapters/yahoo-finance.js', () => ({
  fetchMarkets: vi.fn(async () => []),
  isValidRange: vi.fn(() => true),
}));
vi.mock('../../adapters/nominatim.js', () => ({
  reverseGeocode: vi.fn(async () => ({ display: 'Unknown location' })),
}));
vi.mock('../../adapters/overpass-water.js', () => ({
  fetchWaterFacilities: vi.fn(async () => []),
}));
vi.mock('../../adapters/open-meteo-precip.js', () => ({
  fetchPrecipitation: vi.fn(async () => []),
}));

// Mock Redis cache module with in-memory store
const mockRedisGet = vi.fn(async (key: string) => rawRedisStore.get(key) ?? null);
const mockRedisSet = vi.fn(async (key: string, value: unknown, _opts?: unknown) => {
  rawRedisStore.set(key, value);
});

const _mockCacheGet = vi.fn(
  async <T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> => {
    const entry = redisStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
    return { data: entry.data, stale, lastFresh: entry.fetchedAt };
  },
);
const _mockCacheSet = vi.fn(
  async <T>(key: string, data: T, _redisTtlSec: number): Promise<void> => {
    redisStore.set(key, { data, fetchedAt: Date.now() });
  },
);
vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...(args as [string])),
    set: (...args: unknown[]) => mockRedisSet(...(args as [string, unknown, unknown?])),
    ping: vi.fn(async () => 'PONG'),
  },
  cacheGet: _mockCacheGet,
  cacheSet: _mockCacheSet,
  cacheGetSafe: _mockCacheGet,
  cacheSetSafe: _mockCacheSet,
}));

describe('News Route (/api/news)', () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    redisStore.clear();
    rawRedisStore.clear();
    mockFetchGdeltArticles.mockClear();
    mockFetchGdeltArticles.mockResolvedValue([]);
    mockFetchAllRssFeeds.mockClear();
    mockFetchAllRssFeeds.mockResolvedValue([]);
    mockRedisGet.mockClear();
    mockRedisSet.mockClear();
    mockRedisGet.mockImplementation(async (key: string) => rawRedisStore.get(key) ?? null);

    const { createApp } = await import('../../index.js');
    const app = createApp();

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (addr && typeof addr !== 'string') {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterEach(() => {
    server?.close();
  });

  it('returns fresh cached data without calling adapters when cache is fresh', async () => {
    const cachedClusters: NewsCluster[] = [
      {
        id: gdeltArticle1.id,
        primaryArticle: gdeltArticle1,
        articles: [gdeltArticle1],
        firstSeen: gdeltArticle1.publishedAt,
        lastUpdated: gdeltArticle1.publishedAt,
      },
    ];

    redisStore.set('news:feed', {
      data: cachedClusters,
      fetchedAt: Date.now(), // fresh
    });

    const res = await fetch(`${baseUrl}/api/news`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(body.data).toHaveLength(1);
    expect(mockFetchGdeltArticles).not.toHaveBeenCalled();
    expect(mockFetchAllRssFeeds).not.toHaveBeenCalled();
  });

  it('fetches fresh data when cache is stale, merges, filters, clusters, and caches', async () => {
    mockFetchGdeltArticles.mockResolvedValue([gdeltArticle1, gdeltArticle2]);
    mockFetchAllRssFeeds.mockResolvedValue([rssArticle1]);

    const res = await fetch(`${baseUrl}/api/news`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    expect(mockFetchGdeltArticles).toHaveBeenCalledTimes(1);
    expect(mockFetchAllRssFeeds).toHaveBeenCalledTimes(1);
    // All 3 articles should be conflict-relevant and produce clusters
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('GDELT failure with stale cache returns stale data', async () => {
    const staleClusters: NewsCluster[] = [
      {
        id: gdeltArticle1.id,
        primaryArticle: gdeltArticle1,
        articles: [gdeltArticle1],
        firstSeen: gdeltArticle1.publishedAt,
        lastUpdated: gdeltArticle1.publishedAt,
      },
    ];

    redisStore.set('news:feed', {
      data: staleClusters,
      fetchedAt: Date.now() - 901_000, // stale
    });

    mockFetchGdeltArticles.mockRejectedValue(new Error('GDELT DOC API down'));

    const res = await fetch(`${baseUrl}/api/news`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(true);
    expect(body.data).toHaveLength(1);
  });

  it('GDELT failure with no cache returns 502 UPSTREAM_FAIL', async () => {
    mockFetchGdeltArticles.mockRejectedValue(new Error('GDELT DOC API down'));

    const res = await fetch(`${baseUrl}/api/news`);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe('UPSTREAM_FAIL');
  });

  it('RSS failure does not block response (best-effort)', async () => {
    mockFetchGdeltArticles.mockResolvedValue([gdeltArticle1]);
    mockFetchAllRssFeeds.mockResolvedValue([]); // RSS returns empty (simulating all-fail)

    const res = await fetch(`${baseUrl}/api/news`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body.stale).toBe(false);
    // Should still have GDELT articles
    expect(body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('prunes clusters beyond 7-day sliding window', async () => {
    mockFetchGdeltArticles.mockResolvedValue([gdeltArticle1, oldArticle]);
    mockFetchAllRssFeeds.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/api/news`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    // Old article (8 days) should be pruned, only recent article remains
    const allArticleUrls = body.data.flatMap((c: NewsCluster) =>
      c.articles.map((a: NewsArticle) => a.url),
    );
    expect(allArticleUrls).not.toContain('https://example.com/old');
  });

  it('response shape is CacheResponse<NewsCluster[]>', async () => {
    mockFetchGdeltArticles.mockResolvedValue([gdeltArticle1]);
    mockFetchAllRssFeeds.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/api/news`);
    const body = await res.json();

    expect(res.ok).toBe(true);
    expect(body).toHaveProperty('data');
    expect(body).toHaveProperty('stale');
    expect(body).toHaveProperty('lastFresh');
    expect(typeof body.stale).toBe('boolean');
    expect(typeof body.lastFresh).toBe('number');
    expect(Array.isArray(body.data)).toBe(true);

    if (body.data.length > 0) {
      const cluster = body.data[0];
      expect(cluster).toHaveProperty('id');
      expect(cluster).toHaveProperty('primaryArticle');
      expect(cluster).toHaveProperty('articles');
      expect(cluster).toHaveProperty('firstSeen');
      expect(cluster).toHaveProperty('lastUpdated');
      expect(cluster.primaryArticle).toHaveProperty('sourceCountry');

      // Enriched fields from NLP scoring pipeline
      expect(typeof cluster.primaryArticle.relevanceScore).toBe('number');
      expect(cluster.primaryArticle.relevanceScore).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('server wires newsRouter at /api/news path', async () => {
    // This test verifies the route is accessible (not 404)
    mockFetchGdeltArticles.mockResolvedValue([]);
    mockFetchAllRssFeeds.mockResolvedValue([]);

    const res = await fetch(`${baseUrl}/api/news`);
    // Should not be 404 (route exists)
    expect(res.status).not.toBe(404);
  });
});
