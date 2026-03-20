import { createHash } from 'node:crypto';
import {
  NEWS_CLUSTER_WINDOW_MS,
  NEWS_JACCARD_THRESHOLD,
  NEWS_MIN_TOKENS_FOR_FUZZY,
} from '../constants.js';
import type { NewsArticle, NewsCluster } from '../types.js';

/**
 * Generate a deterministic 16-char hex ID from a URL.
 */
export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex').slice(0, 16);
}

/**
 * Tokenize text into a set of lowercase alphanumeric words.
 */
function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter((t) => t.length > 0),
  );
}

/**
 * Compute Jaccard similarity between two token sets.
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Deduplicate articles by URL hash, then cluster by Jaccard title similarity
 * within a 24h window.
 *
 * @returns Clusters sorted by lastUpdated descending
 */
export function deduplicateAndCluster(articles: NewsArticle[]): NewsCluster[] {
  // Pass 1: URL hash dedup -- keep first occurrence
  const dedupMap = new Map<string, NewsArticle>();
  for (const article of articles) {
    if (!dedupMap.has(article.id)) {
      dedupMap.set(article.id, article);
    }
  }
  const unique = Array.from(dedupMap.values());

  // Pass 2: Jaccard title clustering within 24h window
  const clustered = new Set<number>(); // indices of articles already assigned to a cluster
  const clusters: NewsCluster[] = [];

  for (let i = 0; i < unique.length; i++) {
    if (clustered.has(i)) continue;

    const group: NewsArticle[] = [unique[i]];
    clustered.add(i);

    const tokensI = tokenize(unique[i].title);
    const canFuzzyI = tokensI.size >= NEWS_MIN_TOKENS_FOR_FUZZY;

    if (canFuzzyI) {
      for (let j = i + 1; j < unique.length; j++) {
        if (clustered.has(j)) continue;

        const tokensJ = tokenize(unique[j].title);
        const canFuzzyJ = tokensJ.size >= NEWS_MIN_TOKENS_FOR_FUZZY;
        if (!canFuzzyJ) continue;

        // Check 24h window
        const timeDiff = Math.abs(unique[i].publishedAt - unique[j].publishedAt);
        if (timeDiff > NEWS_CLUSTER_WINDOW_MS) continue;

        const similarity = jaccardSimilarity(tokensI, tokensJ);
        if (similarity >= NEWS_JACCARD_THRESHOLD) {
          group.push(unique[j]);
          clustered.add(j);
        }
      }
    }

    // Primary = earliest publishedAt
    group.sort((a, b) => a.publishedAt - b.publishedAt);
    const primary = group[0];
    const firstSeen = primary.publishedAt;
    const lastUpdated = group[group.length - 1].publishedAt;

    clusters.push({
      id: primary.id,
      primaryArticle: primary,
      articles: group,
      firstSeen,
      lastUpdated,
    });
  }

  // Sort clusters by lastUpdated descending
  clusters.sort((a, b) => b.lastUpdated - a.lastUpdated);

  return clusters;
}
