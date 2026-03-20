import { XMLParser } from 'fast-xml-parser';
import type { NewsArticle } from '../types.js';
import { hashUrl } from '../lib/newsClustering.js';

/** Strip HTML tags and trim whitespace */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').trim();
}

/** XML parser configured for RSS with attribute support */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
});

/** RSS feed configurations */
export const RSS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml', name: 'BBC', country: 'United Kingdom' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', name: 'Al Jazeera', country: 'Qatar' },
  { url: 'https://www.tehrantimes.com/rss', name: 'Tehran Times', country: 'Iran' },
  { url: 'https://www.timesofisrael.com/feed/', name: 'Times of Israel', country: 'Israel' },
  { url: 'https://www.middleeasteye.net/rss', name: 'Middle East Eye', country: 'United Kingdom' },
] as const;

interface RssItem {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
  'media:thumbnail'?: { '@_url'?: string } | string;
}

/**
 * Fetch and parse a single RSS feed into NewsArticle[].
 */
export async function fetchRssFeed(
  url: string,
  sourceName: string,
  sourceCountry: string,
): Promise<NewsArticle[]> {
  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  const xml = await res.text();
  const parsed = parser.parse(xml);

  const rawItems = parsed?.rss?.channel?.item;
  if (!rawItems) return [];

  // Handle single item (object) vs array
  const items: RssItem[] = Array.isArray(rawItems) ? rawItems : [rawItems];

  return items
    .filter((item): item is RssItem & { title: string; link: string } =>
      Boolean(item.title && item.link),
    )
    .map((item): NewsArticle => {
      const description = item.description;
      const summary =
        typeof description === 'string' && description.length > 0
          ? stripHtml(description)
          : undefined;

      // Extract media:thumbnail URL
      let imageUrl: string | undefined;
      const thumbnail = item['media:thumbnail'];
      if (thumbnail && typeof thumbnail === 'object' && '@_url' in thumbnail) {
        imageUrl = thumbnail['@_url'] || undefined;
      }

      return {
        id: hashUrl(item.link),
        title: item.title,
        url: item.link,
        source: sourceName,
        sourceCountry,
        publishedAt: item.pubDate ? new Date(item.pubDate).getTime() : Date.now(),
        summary: summary || undefined,
        imageUrl,
        tone: undefined,
        keywords: [],
      };
    });
}

/**
 * Fetch all RSS feeds concurrently using Promise.allSettled.
 * Individual failures are logged but do not block other feeds.
 */
export async function fetchAllRssFeeds(): Promise<NewsArticle[]> {
  const results = await Promise.allSettled(
    RSS_FEEDS.map((feed) => fetchRssFeed(feed.url, feed.name, feed.country)),
  );

  const articles: NewsArticle[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      articles.push(...result.value);
    } else {
      console.warn(`[rss] feed fetch failed: ${result.reason}`);
    }
  }

  return articles;
}
