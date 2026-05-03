import { haversineKm } from './geo';

import type { ConflictEventEntity, NewsCluster } from '../../server/types';

/** A matched headline to display alongside a conflict event. */
export interface MatchedHeadline {
  source: string;
  title: string;
  url: string;
}

/** Maximum temporal distance (ms) for a news article to be considered relevant. */
const TEMPORAL_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Maximum geographic distance (km) for a news article to receive geo boost. */
const GEO_PROXIMITY_KM = 100;

/** Weight multiplier for geographic proximity score. */
const GEO_WEIGHT = 2;

/** Score per keyword overlap between locationName and article title. */
const KEYWORD_SCORE = 0.5;

/** Maximum number of matched headlines to return. */
const MAX_RESULTS = 3;

/** Minimum word length to consider for keyword matching. */
const MIN_KEYWORD_LENGTH = 3;

/**
 * Extract meaningful words from a location name string.
 * Filters out short words (articles, prepositions) and normalizes to lowercase.
 */
function extractKeywords(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .map((w) => w.toLowerCase().trim())
    .filter((w) => w.length >= MIN_KEYWORD_LENGTH);
}

/**
 * Match news clusters to a conflict event, returning the top 0-3 most relevant headlines.
 *
 * Relevance scoring:
 * - Temporal: must be within 24h window (absolute value), else score is 0
 * - Geographic: within 100km using haversine, weighted 2x
 * - Keyword: event locationName words overlapping with article title, 0.5 per match
 *
 * Returns an array of MatchedHeadline, sorted by relevance descending, max 3 items.
 */
export function matchNewsToEvent(
  event: ConflictEventEntity,
  clusters: NewsCluster[],
): MatchedHeadline[] {
  const locationKeywords = extractKeywords(event.data.locationName);

  const scored: { headline: MatchedHeadline; score: number }[] = [];

  for (const cluster of clusters) {
    const article = cluster.primaryArticle;

    // Temporal check: article must be within 24h of event
    const timeDiffMs = Math.abs(event.timestamp - article.publishedAt);
    if (timeDiffMs > TEMPORAL_WINDOW_MS) continue;

    // Temporal score: closer in time = higher score (0-1)
    const temporalScore = 1 - timeDiffMs / TEMPORAL_WINDOW_MS;

    // Geographic score: proximity boost if both have coordinates
    let geoScore = 0;
    if (article.lat != null && article.lng != null && !isNaN(article.lat) && !isNaN(article.lng)) {
      const distKm = haversineKm(event.lat, event.lng, article.lat, article.lng);
      if (distKm <= GEO_PROXIMITY_KM) {
        geoScore = GEO_WEIGHT * (1 - distKm / GEO_PROXIMITY_KM);
      }
    }

    // Keyword score: overlap between event location and article title
    let keywordScore = 0;
    if (locationKeywords.length > 0) {
      const titleLower = article.title.toLowerCase();
      for (const keyword of locationKeywords) {
        if (titleLower.includes(keyword)) {
          keywordScore += KEYWORD_SCORE;
        }
      }
    }

    const totalScore = temporalScore + geoScore + keywordScore;

    if (totalScore > 0) {
      scored.push({
        headline: {
          source: article.source,
          title: article.title,
          url: article.url,
        },
        score: totalScore,
      });
    }
  }

  // Sort by score descending and take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, MAX_RESULTS).map((s) => s.headline);
}
