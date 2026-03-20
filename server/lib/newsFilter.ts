import type { NewsArticle } from '../types.js';

/**
 * Broad geopolitical keyword whitelist for conflict relevance filtering.
 * Articles must match at least one keyword in title or summary to pass.
 */
export const CONFLICT_KEYWORDS = new Set([
  // Military terms
  'airstrike',
  'missile',
  'bomb',
  'strike',
  'troops',
  'drone',
  'casualties',
  'military',
  'attack',
  'combat',
  'offensive',
  'artillery',
  'warship',
  'navy',
  'airforce',
  'defense',
  'weapon',
  'nuclear',
  'raid',
  'shelling',
  'rocket',
  'interceptor',
  // Diplomatic terms
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
  // Countries / regions
  'iran',
  'israel',
  'iraq',
  'syria',
  'yemen',
  'lebanon',
  'gaza',
  'tehran',
  'tel aviv',
  'jerusalem',
  'beirut',
  'baghdad',
  'damascus',
  'hormuz',
  'persian gulf',
  'red sea',
  // Conflict terms
  'war',
  'conflict',
  'invasion',
  'blockade',
  'siege',
  'occupation',
  'refugee',
  'humanitarian',
  'civilian',
  'killed',
  'wounded',
  'destroyed',
]);

/**
 * Check article text against the conflict keyword whitelist.
 * @returns Array of matched keywords (empty = not conflict-relevant)
 */
export function matchesKeywords(article: {
  title: string;
  summary?: string;
}): string[] {
  const text = `${article.title} ${article.summary ?? ''}`.toLowerCase();
  const matched: string[] = [];

  for (const keyword of CONFLICT_KEYWORDS) {
    if (text.includes(keyword)) {
      matched.push(keyword);
    }
  }

  return matched;
}

/**
 * Filter articles to only those matching at least one conflict keyword.
 * Populates the `keywords` field on each matched article.
 */
export function filterConflictArticles(articles: NewsArticle[]): NewsArticle[] {
  const result: NewsArticle[] = [];

  for (const article of articles) {
    const matched = matchesKeywords(article);
    if (matched.length > 0) {
      result.push({ ...article, keywords: matched });
    }
  }

  return result;
}
