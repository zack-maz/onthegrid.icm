import { getConfig } from '../config.js';

import { extractTriple } from './nlpExtractor.js';
import { computeRelevanceScore, EXCLUSION_PATTERNS } from './relevanceScorer.js';
import { getSourceTier, extractDomain } from './sourceTiers.js';

import type { NewsArticle } from '../types.js';

/**
 * Strict non-ambiguous keywords -- pass on their own.
 * Per locked decision: only 7 terms remain non-ambiguous.
 */
export const NON_AMBIGUOUS_KEYWORDS = new Set([
  'airstrike',
  'missile',
  'bombing',
  'shelling',
  'casualties',
  'invasion',
  'drone',
]);

/**
 * Ambiguous keywords -- require a co-occurring non-ambiguous term.
 * Includes all geographic, diplomatic, organizational, military, and conflict terms.
 */
export const AMBIGUOUS_KEYWORDS = new Set([
  // Geographic (previously non-ambiguous)
  'iran',
  'israel',
  'iraq',
  'syria',
  'yemen',
  'lebanon',
  'gaza',
  'tehran',
  'baghdad',
  'damascus',
  'beirut',
  'tel aviv',
  'jerusalem',
  'hormuz',
  'persian gulf',
  'red sea',
  // Diplomatic
  'sanctions',
  'negotiations',
  'ceasefire',
  'escalation',
  'tensions',
  'iaea',
  'diplomacy',
  'withdrawal',
  'deployment',
  // Organizations
  'irgc',
  'hezbollah',
  'hamas',
  'houthi',
  'pentagon',
  'centcom',
  'nato',
  'idf',
  'mossad',
  // Military (previously non-ambiguous)
  'strike',
  'troops',
  'military',
  'combat',
  'offensive',
  'artillery',
  'warship',
  'navy',
  'airforce',
  'defense',
  'weapon',
  'nuclear',
  'rocket',
  'interceptor',
  'militia',
  'ammunition',
  'warplane',
  'airstrikes',
  // Conflict terms
  'attack',
  'bomb',
  'killed',
  'raid',
  'war',
  'warfare',
  'conflict',
  'blockade',
  'siege',
  'occupation',
  'refugee',
  'humanitarian',
  'civilian',
  'wounded',
  'destroyed',
]);

/**
 * Backward-compatible union of all keywords.
 * @deprecated Prefer NON_AMBIGUOUS_KEYWORDS + AMBIGUOUS_KEYWORDS
 */
export const CONFLICT_KEYWORDS = new Set([...NON_AMBIGUOUS_KEYWORDS, ...AMBIGUOUS_KEYWORDS]);

/** Pre-compiled word-boundary regex cache */
const keywordRegexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  let re = keywordRegexCache.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'i');
    keywordRegexCache.set(keyword, re);
  }
  return re;
}

/**
 * Check article text against the conflict keyword whitelist using
 * word-boundary matching. Non-ambiguous keywords pass alone.
 * Ambiguous keywords only count when accompanied by at least one non-ambiguous keyword.
 *
 * @returns Array of matched keywords (empty = not conflict-relevant)
 */
export function matchesKeywords(article: { title: string; summary?: string }): string[] {
  const text = `${article.title} ${article.summary ?? ''}`.toLowerCase();

  // Reject if any exclusion pattern matches
  for (const pattern of EXCLUSION_PATTERNS) {
    if (text.includes(pattern)) {
      return [];
    }
  }

  const nonAmbiguousHits: string[] = [];
  const ambiguousHits: string[] = [];

  // Check non-ambiguous keywords
  for (const keyword of NON_AMBIGUOUS_KEYWORDS) {
    if (getKeywordRegex(keyword).test(text)) {
      nonAmbiguousHits.push(keyword);
    }
  }

  // Check ambiguous keywords
  for (const keyword of AMBIGUOUS_KEYWORDS) {
    if (getKeywordRegex(keyword).test(text)) {
      ambiguousHits.push(keyword);
    }
  }

  // Ambiguous keywords only included when a non-ambiguous keyword also matched
  if (nonAmbiguousHits.length > 0) {
    return [...nonAmbiguousHits, ...ambiguousHits];
  }

  return [];
}

/**
 * Filter and score articles using NLP triple extraction and relevance scoring.
 * Replaces the binary keyword filter with a scored pipeline.
 *
 * Pipeline per article:
 *   1. Extract actor-action-target triple via NLP
 *   2. Compute 0-1 relevance score
 *   3. Match keywords (reclassified)
 *   4. Include if score >= threshold AND keywords.length > 0
 *   5. Enrich with actor/action/target/relevanceScore
 */
export function filterAndScoreArticles(articles: NewsArticle[]): NewsArticle[] {
  const threshold = getConfig().newsRelevanceThreshold;
  const result: NewsArticle[] = [];

  for (const article of articles) {
    // Tier pre-filter: exclude unknown-source articles from news feed
    // Per D-01: "Everything else filtered out entirely from news feed.
    // Still counts toward event numSources for corroboration."
    const tier = getSourceTier(article.source, article.domain ?? extractDomain(article.url));
    if (tier === null) continue;

    const matched = matchesKeywords(article);
    if (matched.length === 0) continue;

    const triple = extractTriple(article.title, article.summary);
    const relevanceScore = computeRelevanceScore({
      triple,
      source: article.source,
      title: article.title,
      summary: article.summary,
    });

    if (relevanceScore >= threshold) {
      result.push({
        ...article,
        actor: triple.actor ?? undefined,
        action: triple.action ?? undefined,
        target: triple.target ?? undefined,
        relevanceScore,
        keywords: matched,
      });
    }
  }

  return result;
}

/**
 * Filter articles to only those matching at least one conflict keyword.
 * @deprecated Use filterAndScoreArticles for NLP-enriched filtering.
 */
export function filterConflictArticles(articles: NewsArticle[]): NewsArticle[] {
  return filterAndScoreArticles(articles);
}
