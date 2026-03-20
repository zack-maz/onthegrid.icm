// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { NewsArticle } from '../../types.js';

// Sample GDELT DOC API response fixture
const GDELT_FIXTURE = {
  articles: [
    {
      url: 'https://www.bbc.co.uk/news/world-middle-east-12345',
      title: 'Iran launches missile strikes on Israeli bases',
      seendate: '20260320T180000Z',
      socialimage: 'https://ichef.bbci.co.uk/image.jpg',
      domain: 'bbc.co.uk',
      language: 'English',
      sourcecountry: 'United Kingdom',
    },
    {
      url: 'https://aljazeera.com/news/2026/03/20/conflict-update',
      title: 'Middle East conflict intensifies as tensions rise',
      seendate: '20260320T170000Z',
      socialimage: '',
      domain: 'aljazeera.com',
      language: 'English',
      sourcecountry: 'Qatar',
    },
  ],
};

const GDELT_EMPTY = { articles: [] };

describe('GDELT DOC Adapter', () => {
  let fetchGdeltArticles: () => Promise<NewsArticle[]>;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.stubGlobal('fetch', vi.fn());
    // Re-import to get fresh module with mocked fetch
    const mod = await import('../../adapters/gdelt-doc.js');
    fetchGdeltArticles = mod.fetchGdeltArticles;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns NewsArticle[] normalized from GDELT DOC API ArtList JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(GDELT_FIXTURE), { status: 200 }),
    );

    const articles = await fetchGdeltArticles();
    expect(articles).toHaveLength(2);
    expect(articles[0]).toMatchObject({
      title: 'Iran launches missile strikes on Israeli bases',
      url: 'https://www.bbc.co.uk/news/world-middle-east-12345',
      source: 'GDELT',
      keywords: [],
    });
    expect(articles[0].sourceCountry).toBe('United Kingdom');
    expect(articles[1].sourceCountry).toBe('Qatar');
  });

  it('parses seendate "YYYYMMDDTHHmmssZ" format correctly using Date.UTC', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(GDELT_FIXTURE), { status: 200 }),
    );

    const articles = await fetchGdeltArticles();
    // "20260320T180000Z" -> 2026-03-20 18:00:00 UTC
    const expected = Date.UTC(2026, 2, 20, 18, 0, 0); // month is 0-indexed
    expect(articles[0].publishedAt).toBe(expected);
  });

  it('sets id to hashUrl(url), source to "GDELT", tone to undefined', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(GDELT_FIXTURE), { status: 200 }),
    );

    const articles = await fetchGdeltArticles();
    // id should be 16-char hex hash
    expect(articles[0].id).toMatch(/^[0-9a-f]{16}$/);
    expect(articles[0].source).toBe('GDELT');
    expect(articles[0].tone).toBeUndefined();
  });

  it('throws on non-200 response (GDELT is required source)', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response('Service Unavailable', { status: 503 }),
    );

    await expect(fetchGdeltArticles()).rejects.toThrow();
  });

  it('handles empty articles array gracefully (returns [])', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(GDELT_EMPTY), { status: 200 }),
    );

    const articles = await fetchGdeltArticles();
    expect(articles).toEqual([]);
  });

  it('uses 24h timespan and 250 maxrecords in the URL', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(GDELT_EMPTY), { status: 200 }),
    );

    await fetchGdeltArticles();

    const calledUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(calledUrl).toContain('timespan=24h');
    expect(calledUrl).toContain('maxrecords=250');
    expect(calledUrl).toContain('mode=artlist');
    expect(calledUrl).toContain('format=json');
    expect(calledUrl).toContain('sourcelang');
  });

  it('sets sourceCountry to undefined when sourcecountry field is missing', async () => {
    const fixture = {
      articles: [
        {
          url: 'https://example.com/no-country',
          title: 'Article without country metadata',
          seendate: '20260320T120000Z',
        },
      ],
    };
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fixture), { status: 200 }),
    );

    const articles = await fetchGdeltArticles();
    expect(articles).toHaveLength(1);
    expect(articles[0].sourceCountry).toBeUndefined();
  });

  it('sets imageUrl to undefined when socialimage is empty string', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(GDELT_FIXTURE), { status: 200 }),
    );

    const articles = await fetchGdeltArticles();
    // Second article has empty socialimage
    expect(articles[1].imageUrl).toBeUndefined();
    // First article has valid socialimage
    expect(articles[0].imageUrl).toBe('https://ichef.bbci.co.uk/image.jpg');
  });
});
