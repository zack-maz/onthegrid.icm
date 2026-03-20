// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NewsArticle } from '../../types.js';

const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>BBC News - Middle East</title>
    <item>
      <title>Iran conflict update: latest developments</title>
      <link>https://www.bbc.co.uk/news/article-1</link>
      <description>&lt;p&gt;The latest developments in the &lt;b&gt;Iran&lt;/b&gt; conflict region.&lt;/p&gt;</description>
      <pubDate>Fri, 20 Mar 2026 18:00:00 GMT</pubDate>
      <media:thumbnail url="https://ichef.bbci.co.uk/thumb.jpg" />
    </item>
    <item>
      <title>Diplomatic talks resume in Geneva</title>
      <link>https://www.bbc.co.uk/news/article-2</link>
      <pubDate>Fri, 20 Mar 2026 17:30:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const RSS_SINGLE_ITEM = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Single item feed</title>
      <link>https://example.com/single</link>
      <pubDate>Fri, 20 Mar 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('RSS Adapter', () => {
  let fetchRssFeed: (url: string, sourceName: string, sourceCountry: string) => Promise<NewsArticle[]>;
  let fetchAllRssFeeds: () => Promise<NewsArticle[]>;
  let RSS_FEEDS: Array<{ url: string; name: string; country: string }>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    const mod = await import('../../adapters/rss.js');
    fetchRssFeed = mod.fetchRssFeed;
    fetchAllRssFeeds = mod.fetchAllRssFeeds;
    RSS_FEEDS = mod.RSS_FEEDS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('RSS_FEEDS', () => {
    it('contains 5 feed configurations', () => {
      expect(RSS_FEEDS).toHaveLength(5);
      const names = RSS_FEEDS.map((f) => f.name);
      expect(names).toContain('BBC');
      expect(names).toContain('Al Jazeera');
      expect(names).toContain('Tehran Times');
      expect(names).toContain('Times of Israel');
      expect(names).toContain('Middle East Eye');
      expect(RSS_FEEDS.every((f) => 'country' in f)).toBe(true);
    });
  });

  describe('fetchRssFeed', () => {
    it('parses RSS 2.0 XML and returns NewsArticle[] with correct source name', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(RSS_FIXTURE, { status: 200 }),
      );

      const articles = await fetchRssFeed('https://feeds.bbci.co.uk/rss.xml', 'BBC', 'United Kingdom');
      expect(articles).toHaveLength(2);
      expect(articles[0].source).toBe('BBC');
      expect(articles[0].sourceCountry).toBe('United Kingdom');
      expect(articles[0].title).toBe('Iran conflict update: latest developments');
      expect(articles[0].url).toBe('https://www.bbc.co.uk/news/article-1');
    });

    it('strips HTML tags from description for summary field', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(RSS_FIXTURE, { status: 200 }),
      );

      const articles = await fetchRssFeed('https://example.com/rss', 'Test', 'United Kingdom');
      expect(articles[0].summary).toBe(
        'The latest developments in the Iran conflict region.',
      );
      // No HTML tags
      expect(articles[0].summary).not.toContain('<');
      expect(articles[0].summary).not.toContain('>');
    });

    it('handles missing optional fields (description, media:thumbnail) gracefully', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(RSS_FIXTURE, { status: 200 }),
      );

      const articles = await fetchRssFeed('https://example.com/rss', 'Test', 'United Kingdom');
      // Second item has no description or thumbnail
      expect(articles[1].summary).toBeUndefined();
      expect(articles[1].imageUrl).toBeUndefined();
    });

    it('extracts media:thumbnail @_url when present', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(RSS_FIXTURE, { status: 200 }),
      );

      const articles = await fetchRssFeed('https://example.com/rss', 'Test', 'United Kingdom');
      expect(articles[0].imageUrl).toBe('https://ichef.bbci.co.uk/thumb.jpg');
    });

    it('handles single item (not array) in channel', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(RSS_SINGLE_ITEM, { status: 200 }),
      );

      const articles = await fetchRssFeed('https://example.com/rss', 'Test', 'United Kingdom');
      expect(articles).toHaveLength(1);
      expect(articles[0].title).toBe('Single item feed');
    });

    it('sets id to hashUrl(link), tone to undefined, keywords to []', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response(RSS_FIXTURE, { status: 200 }),
      );

      const articles = await fetchRssFeed('https://example.com/rss', 'Test', 'United Kingdom');
      expect(articles[0].id).toMatch(/^[0-9a-f]{16}$/);
      expect(articles[0].tone).toBeUndefined();
      expect(articles[0].keywords).toEqual([]);
    });
  });

  describe('fetchAllRssFeeds', () => {
    it('uses Promise.allSettled -- returns only fulfilled results', async () => {
      // Each call must return a new Response (body can only be read once)
      vi.mocked(globalThis.fetch).mockImplementation(async () => {
        return new Response(RSS_SINGLE_ITEM, { status: 200 });
      });

      const articles = await fetchAllRssFeeds();
      // 5 feeds * 1 item each = 5 articles
      expect(articles).toHaveLength(5);
      expect(articles.every((a) => a.sourceCountry)).toBe(true);
    });

    it('individual feed failure does not block other feeds (best-effort)', async () => {
      let callCount = 0;
      vi.mocked(globalThis.fetch).mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error('Network error');
        return new Response(RSS_SINGLE_ITEM, { status: 200 });
      });

      const articles = await fetchAllRssFeeds();
      // 1 failure + 4 successes = 4 articles
      expect(articles).toHaveLength(4);
    });
  });
});
