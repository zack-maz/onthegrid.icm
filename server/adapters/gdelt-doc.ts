import type { NewsArticle } from '../types.js';
import { hashUrl } from '../lib/newsClustering.js';

/** GDELT DOC 2.0 API base URL */
const GDELT_DOC_BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

/** Search query covering key Middle East conflict terms (parentheses required by GDELT for OR'd terms) */
const GDELT_QUERY =
  '(Iran OR Israel OR Iraq OR Syria OR Yemen OR Lebanon OR Hezbollah OR Hamas OR IRGC OR "Middle East" OR "Persian Gulf") sourcelang:english';

/**
 * Build the GDELT DOC API URL with ArtList mode.
 */
function buildGdeltDocUrl(): string {
  const params = new URLSearchParams({
    query: GDELT_QUERY,
    mode: 'artlist',
    format: 'json',
    maxrecords: '250',
    timespan: '24h',
    sort: 'DateDesc',
  });
  return `${GDELT_DOC_BASE}?${params.toString()}`;
}

/**
 * Parse GDELT seendate format "YYYYMMDDTHHmmssZ" into Unix ms.
 * Uses Date.UTC to avoid timezone issues.
 */
function parseGdeltDate(seendate: string): number {
  const year = parseInt(seendate.slice(0, 4), 10);
  const month = parseInt(seendate.slice(4, 6), 10) - 1; // 0-indexed
  const day = parseInt(seendate.slice(6, 8), 10);
  const hour = parseInt(seendate.slice(9, 11), 10);
  const minute = parseInt(seendate.slice(11, 13), 10);
  const second = parseInt(seendate.slice(13, 15), 10);
  return Date.UTC(year, month, day, hour, minute, second);
}

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

interface GdeltDocResponse {
  articles?: GdeltArticle[];
}

/**
 * Fetch articles from the GDELT DOC 2.0 API in ArtList mode.
 * This is a required data source -- throws on failure.
 */
export async function fetchGdeltArticles(): Promise<NewsArticle[]> {
  const url = buildGdeltDocUrl();
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`GDELT DOC API returned ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as GdeltDocResponse;
  const articles = json.articles;

  if (!articles || !Array.isArray(articles)) {
    return [];
  }

  return articles.map((a): NewsArticle => ({
    id: hashUrl(a.url),
    title: a.title,
    url: a.url,
    source: 'GDELT',
    sourceCountry: a.sourcecountry || undefined,
    publishedAt: parseGdeltDate(a.seendate),
    imageUrl: a.socialimage || undefined,
    summary: undefined,
    tone: undefined,
    keywords: [],
  }));
}
