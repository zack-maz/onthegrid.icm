import { Router } from 'express';
import { z } from 'zod';

import { fetchGdeltArticles } from '../adapters/gdelt-doc.js';
import { fetchAllRssFeeds } from '../adapters/rss.js';
import { cacheGetSafe, cacheSetSafe } from '../cache/redis.js';
import { NEWS_CACHE_TTL, NEWS_REDIS_TTL_SEC, NEWS_SLIDING_WINDOW_MS } from '../config.js';
import { logger } from '../lib/logger.js';
import { deduplicateAndCluster } from '../lib/newsClustering.js';
import { filterAndScoreArticles } from '../lib/newsFilter.js';
import { AppError } from '../middleware/errorHandler.js';
import { validateQuery } from '../middleware/validate.js';

import type { NewsArticle, NewsCluster } from '../types.js';

/** Zod schema for /api/news query params */

const log = logger.child({ module: 'news' });

const newsQuerySchema = z.object({
  refresh: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

/** Redis key for the merged news feed */
const NEWS_FEED_KEY = 'news:feed';

/**
 * Phase 37 fix/news-feed-rss-fallback — sidecar freshness witness for the
 * RSS-only fallback path. Mirrors the Phase 37 PR #32 pattern (where
 * `events:gdelt` is the documented fallback signal for `events:llm:v3`).
 *
 * Written by this route ONLY when GDELT fetch failed AND RSS yielded ≥1
 * article — i.e., the user-facing surface is gracefully degraded but not
 * broken. The `/api/health` `news` probe reads this key as
 * `fallbackHealthyKey` so the audit's D-03 rule sees `degraded` (intentional
 * graceful degradation) instead of `unknown` (broken) when GDELT is
 * IP-throttled but RSS is still flowing.
 *
 * The payload is a single timestamp (number) — only the cache envelope's
 * `lastFresh` field matters; no consumer reads the value.
 */
const NEWS_RSS_ONLY_KEY = 'news:feed:rss-only';

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
    // 2. Fetch GDELT + RSS concurrently. Both are best-effort per the Phase
    //    37 fix/news-feed-rss-fallback contract — GDELT's IP-based 429
    //    throttle is sticky for hours on Vercel function pool IPs, and the
    //    six-source RSS feed yields ~50-200 articles in steady state, so
    //    degrading to RSS-only is a usefully-graceful fallback that the
    //    prior "GDELT required" design discarded.
    let gdeltFailed = false;
    const [gdeltArticles, rssArticles] = await Promise.all([
      fetchGdeltArticles().catch((err) => {
        gdeltFailed = true;
        log.warn({ err }, 'GDELT fetch failed (non-fatal, falling back to RSS-only)');
        return [] as NewsArticle[];
      }),
      fetchAllRssFeeds().catch((err) => {
        log.warn({ err }, 'RSS fetch failed (non-fatal)');
        return [] as NewsArticle[];
      }),
    ]);

    // 2b. Total upstream outage — preserve the honest-failure semantics so
    //     the /api/health news probe surfaces `unknown` (no fresh cache) +
    //     the route returns 502 (no fresh OR stale data to serve). Mirrors
    //     the Phase 37 PR #32 contract: "documented graceful degradation
    //     reports degraded; true total outage reports unknown."
    if (gdeltArticles.length === 0 && rssArticles.length === 0) {
      throw new Error('both upstreams returned no articles');
    }

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

    // 8b. RSS-only sidecar signal (Phase 37 fix/news-feed-rss-fallback).
    //     Write the sidecar ONLY when GDELT failed but RSS produced data —
    //     this is the precise "graceful degradation engaged" condition the
    //     /api/health news probe needs to surface as `degraded` (not
    //     `healthy`, which would hide the throttle, and not `unknown`,
    //     which would fail the D-03 non-critical tier rule).
    if (gdeltFailed && rssArticles.length > 0) {
      await cacheSetSafe(NEWS_RSS_ONLY_KEY, Date.now(), NEWS_REDIS_TTL_SEC);
    }

    const gdeltCount = gdeltArticles.length;
    const rssCount = rssArticles.length;
    log.info(
      { gdeltCount, rssCount, clusterCount: clusters.length, gdeltFailed },
      'fetched and clustered news',
    );

    // 9. Return response
    res.json({ data: clusters, stale: false, lastFresh: Date.now() });
  } catch (err) {
    log.error({ err }, 'upstream error');

    // Fall back to stale cache if available
    if (cached) {
      res.json({ data: cached.data, stale: true, lastFresh: cached.lastFresh });
    } else {
      throw new AppError(502, 'UPSTREAM_FAIL', `news fetch failed: ${(err as Error).message}`);
    }
  }
});
