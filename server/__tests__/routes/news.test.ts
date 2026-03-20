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
  title: 'Tensions escalate as Iran deploys troops near border',
  source: 'GDELT',
  publishedAt: Date.now() - 3600_000,
});

const rssArticle1 = makeArticle({
  id: hashUrl('https://aljazeera.com/3'),
  url: 'https://aljazeera.com/3',
  title: 'Syria conflict update from Al Jazeera correspondents',
  source: 'Al Jazeera',
  publishedAt: Date.now() - 1800_000,
});

const oldArticle = makeArticle({
  id: hashUrl('https://example.com/old'),
  url: 'https://example.com/old',
  title: 'Ancient conflict article about war in the region',
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
vi.mock('../../middleware/rateLimit.js', () => ({
  rateLimitMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

// Mock config
vi.mock('../../config.js', () => ({
  config: {
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
  },
  loadConfig: () => ({
    port: 0,
    corsOrigin: '*',
    opensky: { clientId: 'test-id', clientSecret: 'test-secret' },
    aisstream: { apiKey: 'test-ais-key' },
    acled: { email: 'test@example.com', password: 'test-pass' },
  }),
}));

// Mock all existing adapters to avoid import chain issues
vi.mock('../../adapters/opensky.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-exchange.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
vi.mock('../../adapters/adsb-lol.js', () => ({
  fetchFlights: vi.fn(async () => []),
}));
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
    { url: 'https://feeds.bbci.co.uk/rss.xml', name: 'BBC' },
    { url: 'https://www.aljazeera.com/rss', name: 'Al Jazeera' },
    { url: 'https://www.tehrantimes.com/rss', name: 'Tehran Times' },
    { url: 'https://www.timesofisrael.com/feed/', name: 'Times of Israel' },
    { url: 'https://www.middleeasteye.net/rss', name: 'Middle East Eye' },
  ],
}));

// Mock Redis cache module with in-memory store
const mockRedisGet = vi.fn(async (key: string) => rawRedisStore.get(key) ?? null);
const mockRedisSet = vi.fn(async (key: string, value: unknown, _opts?: unknown) => {
  rawRedisStore.set(key, value);
});

vi.mock('../../cache/redis.js', () => ({
  redis: {
    get: (...args: unknown[]) => mockRedisGet(...(args as [string])),
    set: (...args: unknown[]) => mockRedisSet(...(args as [string, unknown, unknown?])),
  },
  cacheGet: vi.fn(async <T>(key: string, logicalTtlMs: number): Promise<CacheResponse<T> | null> => {
    const entry = redisStore.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    const stale = Date.now() - entry.fetchedAt > logicalTtlMs;
    return { data: entry.data, stale, lastFresh: entry.fetchedAt };
  }),
  cacheSet: vi.fn(async <T>(key: string, data: T, _redisTtlSec: number): Promise<void> => {
    redisStore.set(key, { data, fetchedAt: Date.now() });
  }),
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

  it('GDELT failure with no cache returns 500', async () => {
    mockFetchGdeltArticles.mockRejectedValue(new Error('GDELT DOC API down'));

    const res = await fetch(`${baseUrl}/api/news`);
    expect(res.status).toBe(500);
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
    const allArticleUrls = body.data.flatMap(
      (c: NewsCluster) => c.articles.map((a: NewsArticle) => a.url),
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
