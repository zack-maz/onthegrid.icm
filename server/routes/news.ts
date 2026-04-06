import { Router } from 'express';
import { z } from 'zod';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { logger } from '../lib/logger.js';

const log = logger.child({ module: 'news' });
import { fetchGdeltArticles } from '../adapters/gdelt-doc.js';
import { fetchAllRssFeeds } from '../adapters/rss.js';
import { filterAndScoreArticles } from '../lib/newsFilter.js';
import { deduplicateAndCluster } from '../lib/newsClustering.js';
import {
  NEWS_CACHE_TTL,
  NEWS_REDIS_TTL_SEC,
  NEWS_SLIDING_WINDOW_MS,
} from '../config.js';
import { validateQuery } from '../middleware/validate.js';
import type { NewsArticle, NewsCluster } from '../types.js';

/** Zod schema for /api/news query params */
const newsQuerySchema = z.object({
  refresh: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
});

/** Redis key for the merged news feed */
const NEWS_FEED_KEY = 'news:feed';

export const newsRouter = Router();

newsRouter.get('/', validateQuery(newsQuerySchema), async (_req, res) => {
  const { refresh: forceRefresh } = res.locals.validatedQuery as z.infer<typeof newsQuerySchema>;

  // 1. Check cache first (skip on force refresh)
  const cached = forceRefresh
    ? null
    : await cacheGetSafe<NewsCluster[]>(NEWS_FEED_KEY, NEWS_CACHE_TTL);
  if (cached && !cached.stale) {
    return res.json(cached);
  }

  try {
    // 2. Fetch GDELT (required) + RSS (best-effort) concurrently
    const [gdeltArticles, rssArticles] = await Promise.all([
      fetchGdeltArticles(),
      fetchAllRssFeeds().catch((err) => {
        log.warn({ err }, 'RSS fetch failed (non-fatal)');
        return [] as NewsArticle[];
      }),
    ]);

    // 3. Combine all articles
    const allArticles = [...gdeltArticles, ...rssArticles];

    // 4. Apply NLP-scored keyword filter
    const filtered = filterAndScoreArticles(allArticles);

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
    await cacheSetSafe(NEWS_FEED_KEY, clusters, NEWS_REDIS_TTL_SEC);

    const gdeltCount = gdeltArticles.length;
    const rssCount = rssArticles.length;
    log.info({ gdeltCount, rssCount, clusterCount: clusters.length }, 'fetched and clustered news');

    // 9. Return response
    res.json({ data: clusters, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'upstream error');

    // Fall back to stale cache if available
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw err; // Express 5 catches and forwards to errorHandler
    }
  }
});
