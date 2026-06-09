/**
 * Relevance scoring for news articles.
 * Computes a 0-1 confidence score from three factors:
 *   1. NLP triple completeness (0-0.45)
 *   2. Negativity/conflict verb signal (0-0.35)
 *   3. Source reliability (0-0.20)
 *
 * Articles matching exclusion patterns receive score 0.
 *
 * @module relevanceScorer
 */
import nlp from 'compromise';

import type { ArticleTriple } from './nlpExtractor.js';

export interface ScoringInput {
  triple: ArticleTriple;
  source: string; // "BBC", "GDELT", "Al Jazeera", etc.
  domain?: string; // GDELT domain for reliability lookup
  title: string;
  summary?: string;
}

/**
 * Source reliability tiers.
 * Tier 1 (1.0): Major international outlets
 * Tier 2 (0.9-0.95): Regional quality outlets
 * Tier 3 (0.8): State-affiliated/partisan outlets
 * Tier 4 (0.6): Unknown GDELT sources (default)
 */
export const SOURCE_RELIABILITY: Record<string, number> = {
  // Tier 1 — major international (1.0)
  'bbc.co.uk': 1.0,
  'bbc.com': 1.0,
  'reuters.com': 1.0,
  'apnews.com': 1.0,
  'afp.com': 1.0,
  // By source name (RSS feeds)
  BBC: 1.0,
  Reuters: 1.0,
  'Associated Press': 1.0,

  // Tier 2 — regional quality (0.9-0.95)
  'aljazeera.com': 0.95,
  'timesofisrael.com': 0.9,
  'middleeasteye.net': 0.9,
  'haaretz.com': 0.9,
  // By source name (RSS feeds)
  'Al Jazeera': 0.95,
  'Times of Israel': 0.9,
  'Middle East Eye': 0.9,

  // Tier 3 — state-affiliated/partisan (0.8)
  'tehrantimes.com': 0.8,
  'irna.ir': 0.8,
  'presstv.ir': 0.8,
  // By source name (RSS feeds)
  'Tehran Times': 0.8,
};

/** Conflict-action verbs for negativity detection */
export const CONFLICT_VERBS = new Set([
  'strike',
  'kill',
  'bomb',
  'destroy',
  'attack',
  'shell',
  'invade',
  'launch',
  'fire',
  'shoot',
  'target',
  'hit',
  'blast',
  'detonate',
  'intercept',
  'deploy',
  'seize',
  'capture',
  'raid',
  'assassinate',
  'wound',
  'shatter',
  'demolish',
  'obliterate',
]);

/**
 * Exclusion patterns -- if any match in title+summary, article scores 0.
 * Expanded set covering entertainment, historical, sports, education, tech, weather.
 */
export const EXCLUSION_PATTERNS: string[] = [
  // Existing (kept from newsFilter.ts)
  'new year',
  'firework',
  'fireworks',
  'celebration',
  'celebrate',
  'festival',
  'holiday',
  'parade',
  'super bowl',
  'world cup',
  'box office',
  'movie premiere',
  'concert',
  'cricket',
  'basketball',
  'football match',
  'stock market',
  'ipo',
  'earnings report',
  'fashion week',
  // Historical/documentary
  'world war ii',
  'world war i',
  'cold war era',
  'documentary',
  'museum',
  'exhibition',
  'anniversary of',
  'memoir',
  'autobiography',
  // Entertainment
  'video game',
  'tv series',
  'netflix',
  'movie review',
  'book review',
  'album release',
  'music video',
  'award show',
  'grammy',
  'oscar',
  'emmy',
  'golden globe',
  // Sports expanded
  'olympics',
  'soccer',
  'tennis',
  'rugby',
  'baseball',
  'hockey',
  'wrestling',
  'boxing match',
  'marathon',
  'tournament',
  // Education/academic
  'university study',
  'research paper',
  'academic',
  'thesis',
  'classroom',
  'curriculum',
  // Technology
  'product launch',
  'tech review',
  'startup funding',
  'app update',
  'software release',
  // Weather/natural
  'weather forecast',
  'earthquake',
  'tornado',
  'hurricane',
  'flood warning',
  'wildfire',
];

/**
 * Look up source reliability by source name first, then by domain.
 * Falls back to 0.6 for unknown sources.
 */
function getSourceReliability(source: string, domain?: string): number {
  // Check by source name first (RSS feeds use friendly names)
  if (SOURCE_RELIABILITY[source] !== undefined) {
    return SOURCE_RELIABILITY[source];
  }
  // Check by domain (GDELT articles have domain)
  if (domain && SOURCE_RELIABILITY[domain] !== undefined) {
    return SOURCE_RELIABILITY[domain];
  }
  // Default: unknown source
  return 0.6;
}

/**
 * Compute a 0-1 relevance score for a news article.
 *
 * Factors:
 *   1. NLP Triple Completeness (0-0.45) -- actor +0.12, action +0.20, target +0.13
 *   2. Negativity/Conflict Signal (0-0.35) -- ratio of conflict verbs to total verbs
 *   3. Source Reliability (0-0.20) -- tier-based source weight
 *
 * Returns 0 immediately if an exclusion pattern matches.
 */
export function computeRelevanceScore(input: ScoringInput): number {
  const text = `${input.title} ${input.summary ?? ''}`.toLowerCase();

  // Pre-check: exclusion patterns hard-reject
  for (const pattern of EXCLUSION_PATTERNS) {
    if (text.includes(pattern)) {
      return 0;
    }
  }

  // Factor 1: NLP Triple Completeness (0-0.45)
  let tripleScore = 0;
  if (input.triple.actor) tripleScore += 0.12;
  if (input.triple.action) tripleScore += 0.2;
  if (input.triple.target) tripleScore += 0.13;

  // Factor 2: Negativity/Conflict Signal (0-0.35)
  const doc = nlp(`${input.title} ${input.summary ?? ''}`);
  const allVerbs = doc.verbs().out('array') as string[];
  let conflictVerbCount = 0;
  for (const verb of allVerbs) {
    // Check root form of each verb against conflict set
    const root = nlp(verb).verbs().toInfinitive().out('text').toLowerCase();
    if (CONFLICT_VERBS.has(root)) {
      conflictVerbCount++;
    } else {
      // Also check original text tokens against set (handles cases where toInfinitive fails)
      const words = verb.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (CONFLICT_VERBS.has(word)) {
          conflictVerbCount++;
          break;
        }
      }
    }
  }
  const conflictVerbRatio = conflictVerbCount / Math.max(allVerbs.length, 1);
  const negativityScore = conflictVerbRatio * 0.35;

  // Factor 3: Source Reliability (0-0.20)
  const reliability = getSourceReliability(input.source, input.domain);
  const sourceScore = reliability * 0.2;

  return Math.min(1, tripleScore + negativityScore + sourceScore);
}

// ---------------------------------------------------------------------------
// GDELT-MATCH-04 — additive composite rescore (tier × corroboration ×
// specificity).
//
// This is the per-event dashboard top-of-list ranking signal. It is ADDITIVE
// and OPTIONAL: callers compute it as a NEW `compositeScore` field on a COPY,
// then sort the dashboard view by it. The raw `events:llm:v3` corpus is NEVER
// mutated or dropped (D-07). Old cached events without the field self-heal on
// the next 24h–90d cron overwrite.
//
// The three inputs and their weights:
//   - tier (from sourceTiers): gold(1) > silver(2) > bronze(3) > unknown(null).
//     The strongest single ranking lever — high-tier sourcing is the best
//     proxy for "this really happened".
//   - corroborationBoost (from corroboration.checkCorroboration): an additive
//     0–0.25 boost granted only on a genuine strict three-gate OSINT match.
//   - precision (from llmSchema.derivePrecision): exact > neighborhood > city >
//     region. Finer geography ranks higher.
//
// Sizing caveat (38-03-SUMMARY.md GDELT-MATCH-04): the raw corpus was 99.7%
// unknown-tier at audit time, so the composite MUST NOT collapse to "tier
// dominates" — unknown-tier events still get a meaningful base from precision
// + corroboration. Re-validate the weights once `events:llm:v3` is warm.
// ---------------------------------------------------------------------------

export type Precision = 'exact' | 'neighborhood' | 'city' | 'region';

export interface CompositeScoreInput {
  /** Best source tier (1=gold, 2=silver, 3=bronze) or null (unknown). */
  tier: 1 | 2 | 3 | null;
  /** Additive corroboration boost (0–0.25) from corroboration.ts. */
  corroborationBoost: number;
  /** Resolved location precision from llmSchema.derivePrecision. */
  precision: Precision;
}

/** Tier → base ranking weight. Unknown-tier keeps a non-zero floor (D: audit
 *  showed 99.7% unknown, so unknown must still be rankable). */
const TIER_WEIGHT: Record<'1' | '2' | '3' | 'unknown', number> = {
  '1': 0.45,
  '2': 0.35,
  '3': 0.22,
  unknown: 0.15,
};

/** Precision → specificity weight. Finer geography ranks higher. */
const PRECISION_WEIGHT: Record<Precision, number> = {
  exact: 0.3,
  neighborhood: 0.22,
  city: 0.15,
  region: 0.05,
};

/**
 * Compute the additive composite ranking score for one event.
 * Bounded to [0, 1]. Higher = surfaces nearer the dashboard top-of-list.
 *
 * @returns compositeScore in [0, 1]
 */
export function computeCompositeScore(input: CompositeScoreInput): number {
  const tierWeight =
    input.tier === null ? TIER_WEIGHT.unknown : TIER_WEIGHT[String(input.tier) as '1' | '2' | '3'];
  const precisionWeight = PRECISION_WEIGHT[input.precision];
  const boost = Math.max(0, input.corroborationBoost);

  return Math.min(1, tierWeight + precisionWeight + boost);
}
