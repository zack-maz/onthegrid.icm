import { Router } from 'express';
import { cacheGet, cacheSet } from '../cache/redis.js';
import { fetchGdeltArticles } from '../adapters/gdelt-doc.js';
import { fetchAllRssFeeds } from '../adapters/rss.js';
import { filterConflictArticles } from '../lib/newsFilter.js';
import { deduplicateAndCluster } from '../lib/newsClustering.js';
import {
  NEWS_CACHE_TTL,
  NEWS_REDIS_TTL_SEC,
  NEWS_SLIDING_WINDOW_MS,
} from '../constants.js';
import type { NewsArticle, NewsCluster } from '../types.js';

/** Redis key for the merged news feed */
const NEWS_FEED_KEY = 'news:feed';

export const newsRouter = Router();

newsRouter.get('/', async (_req, res) => {
  // 1. Check cache first
  const cached = await cacheGet<NewsCluster[]>(NEWS_FEED_KEY, NEWS_CACHE_TTL);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    // 2. Fetch GDELT (required) + RSS (best-effort) concurrently
    const [gdeltArticles, rssArticles] = await Promise.all([
      fetchGdeltArticles(),
      fetchAllRssFeeds().catch((err) => {
        console.warn('[news] RSS fetch failed (non-fatal):', (err as Error).message);
        return [] as NewsArticle[];
      }),
    ]);

    // 3. Combine all articles
    const allArticles = [...gdeltArticles, ...rssArticles];

    // 4. Apply keyword filter
    const filtered = filterConflictArticles(allArticles);

    // 5. Merge with any existing cached articles (by id, fresh overwrites)
    const articleMap = new Map<string, NewsArticle>();
    if (cached) {
      for (const cluster of cached.data) {
        for (const article of cluster.articles) {
          articleMap.set(article.id, article);
        }
      }
    }
    for (const article of filtered) {
      articleMap.set(article.id, article); // fresh overwrites
    }
    const mergedArticles = Array.from(articleMap.values());

    // 6. Deduplicate and cluster
    let clusters = deduplicateAndCluster(mergedArticles);

    // 7. Prune clusters beyond 7-day sliding window
    const cutoff = Date.now() - NEWS_SLIDING_WINDOW_MS;
    clusters = clusters.filter((c) => c.lastUpdated >= cutoff);

    // 8. Cache merged feed
    await cacheSet(NEWS_FEED_KEY, clusters, NEWS_REDIS_TTL_SEC);

    const gdeltCount = gdeltArticles.length;
    const rssCount = rssArticles.length;
    console.log(
      `[news] fetched: ${gdeltCount} GDELT + ${rssCount} RSS, ${clusters.length} clusters after filter/dedup`,
    );

    // 9. Return response
    res.json({ data: clusters, stale: false, lastFresh: Date.now() });
  } catch (err) {
    console.error('[news] upstream error:', (err as Error).message);

    // Fall back to stale cache if available
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
