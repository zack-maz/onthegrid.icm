/**
 * Title fetching utility for extracting article titles from GDELT SOURCEURL fields.
 * Regex-based HTML parsing (no DOM parser dependency), Redis caching, batch processing.
 *
 * @module titleFetcher
 */
import { createHash } from 'crypto';
import { cacheGet, cacheSet } from '../cache/redis.js';

// ─── Constants ──────────────────────────────────────────────────────────────

const CONCURRENCY = 5;
const FETCH_TIMEOUT_MS = 8000;
const MAX_BYTES = 10240; // 10KB — enough for <head> section
const CACHE_PREFIX = 'title:';
const LOGICAL_TTL_MS = 7 * 86_400_000;  // 7 days
const REDIS_TTL_SEC = 30 * 86_400;       // 30 days hard TTL

// ─── HTML Entity Decoding ───────────────────────────────────────────────────

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
};

const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|#39);/g;

function decodeEntities(text: string): string {
  return text.replace(ENTITY_RE, (match) => HTML_ENTITIES[match] ?? match);
}

// ─── Regex Patterns ─────────────────────────────────────────────────────────

// og:title with property before content: <meta property="og:title" content="..." />
const OG_TITLE_PROP_FIRST = /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["'][^>]*\/?>/i;

// og:title with content before property: <meta content="..." property="og:title" />
const OG_TITLE_CONTENT_FIRST = /<meta\s+content=["']([^"']+)["']\s+property=["']og:title["'][^>]*\/?>/i;

// Standard <title> tag
const TITLE_TAG = /<title[^>]*>([^<]+)<\/title>/i;

// ─── Title Extraction ───────────────────────────────────────────────────────

/** Extract article title from HTML string. Returns null if no title found. */
export function extractTitleFromHtml(html: string): string | null {
  if (!html) return null;

  // Try og:title first (two attribute orderings)
  const ogMatch = OG_TITLE_PROP_FIRST.exec(html) ?? OG_TITLE_CONTENT_FIRST.exec(html);
  if (ogMatch?.[1]) {
    return decodeEntities(ogMatch[1].trim());
  }

  // Fallback to <title> tag
  const titleMatch = TITLE_TAG.exec(html);
  if (titleMatch?.[1]) {
    return decodeEntities(titleMatch[1].trim());
  }

  return null;
}

// ─── URL Hashing ────────────────────────────────────────────────────────────

/** Create short SHA-256 hash for Redis cache key */
function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

// ─── Batch Title Fetching ───────────────────────────────────────────────────

/**
 * Fetch a single article title from URL with timeout and byte limit.
 * Returns extracted title or null on failure.
 */
async function fetchSingleTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'User-Agent': 'IranConflictMonitor/1.0' },
      redirect: 'follow',
    });

    if (!response.ok || !response.body) return null;

    // Read up to MAX_BYTES then abort
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.byteLength;
    }

    // Cancel remaining stream
    reader.cancel().catch(() => {});

    const decoder = new TextDecoder('utf-8', { fatal: false });
    const html = decoder.decode(Buffer.concat(chunks).slice(0, MAX_BYTES));

    return extractTitleFromHtml(html);
  } catch {
    return null;
  }
}

/**
 * Batch fetch article titles from URLs with Redis caching and concurrency limit.
 *
 * - Deduplicates input URLs
 * - Checks Redis cache first (skips HTTP for cached URLs)
 * - Fetches uncached URLs in batches of CONCURRENCY (10)
 * - Caches successful extractions (non-null) in Redis
 * - Failed fetches return null and are NOT cached
 *
 * @returns Map of URL to title (or null for failed fetches)
 */
export async function batchFetchTitles(
  urls: string[],
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  if (urls.length === 0) return results;

  // Deduplicate
  const uniqueUrls = Array.from(new Set(urls));

  // Phase 1: Check Redis cache
  const uncachedUrls: string[] = [];

  await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const cached = await cacheGet<string>(
          CACHE_PREFIX + hashUrl(url),
          LOGICAL_TTL_MS,
        );
        if (cached) {
          results.set(url, cached.data);
        } else {
          uncachedUrls.push(url);
        }
      } catch {
        uncachedUrls.push(url);
      }
    }),
  );

  // Phase 2: Fetch uncached in batches of CONCURRENCY
  for (let i = 0; i < uncachedUrls.length; i += CONCURRENCY) {
    const batch = uncachedUrls.slice(i, i + CONCURRENCY);

    const settled = await Promise.allSettled(
      batch.map(async (url) => {
        const title = await fetchSingleTitle(url);
        return { url, title };
      }),
    );

    // Process results and cache successes
    await Promise.all(
      settled.map(async (result) => {
        if (result.status === 'fulfilled') {
          const { url, title } = result.value;
          results.set(url, title);

          // Only cache non-null titles
          if (title !== null) {
            try {
              await cacheSet(
                CACHE_PREFIX + hashUrl(url),
                title,
                REDIS_TTL_SEC,
              );
            } catch {
              // Swallow cache write errors
            }
          }
        } else {
          // Promise.allSettled shouldn't reject for our usage, but be safe
        }
      }),
    );
  }

  return results;
}
