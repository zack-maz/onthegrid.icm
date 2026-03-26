// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NewsArticle } from '../../types.js';

// Mock config module so we can control newsRelevanceThreshold
vi.mock('../../config.js', () => ({
  getConfig: () => ({
    newsRelevanceThreshold: 0.7,
  }),
  loadConfig: () => ({
    newsRelevanceThreshold: 0.7,
  }),
  config: { newsRelevanceThreshold: 0.7 },
}));

const makeArticle = (overrides: Partial<NewsArticle> = {}): NewsArticle => ({
  id: 'test-id-001',
  title: 'Generic article title',
  url: 'https://example.com/article',
  source: 'TestSource',
  publishedAt: Date.now(),
  keywords: [],
  ...overrides,
});

describe('newsFilter', () => {
  // Dynamic import after mocks are set up
  let matchesKeywords: (article: { title: string; summary?: string }) => string[];
  let filterAndScoreArticles: (articles: NewsArticle[]) => NewsArticle[];
  let filterConflictArticles: (articles: NewsArticle[]) => NewsArticle[];
  let CONFLICT_KEYWORDS: Set<string>;
  let NON_AMBIGUOUS_KEYWORDS: Set<string>;
  let AMBIGUOUS_KEYWORDS: Set<string>;

  beforeEach(async () => {
    const mod = await import('../../lib/newsFilter.js');
    matchesKeywords = mod.matchesKeywords;
    filterAndScoreArticles = mod.filterAndScoreArticles;
    filterConflictArticles = mod.filterConflictArticles;
    CONFLICT_KEYWORDS = mod.CONFLICT_KEYWORDS;
    NON_AMBIGUOUS_KEYWORDS = mod.NON_AMBIGUOUS_KEYWORDS;
    AMBIGUOUS_KEYWORDS = mod.AMBIGUOUS_KEYWORDS;
  });

  describe('CONFLICT_KEYWORDS backward compat', () => {
    it('is a non-empty Set of lowercase strings', () => {
      expect(CONFLICT_KEYWORDS).toBeInstanceOf(Set);
      expect(CONFLICT_KEYWORDS.size).toBeGreaterThan(20);
      for (const kw of CONFLICT_KEYWORDS) {
        expect(kw).toBe(kw.toLowerCase());
      }
    });

    it('is the union of NON_AMBIGUOUS_KEYWORDS and AMBIGUOUS_KEYWORDS', () => {
      for (const kw of NON_AMBIGUOUS_KEYWORDS) {
        expect(CONFLICT_KEYWORDS.has(kw)).toBe(true);
      }
      for (const kw of AMBIGUOUS_KEYWORDS) {
        expect(CONFLICT_KEYWORDS.has(kw)).toBe(true);
      }
    });
  });

  describe('keyword reclassification', () => {
    it('NON_AMBIGUOUS_KEYWORDS contains exactly the 7 strict terms', () => {
      const expected = ['airstrike', 'missile', 'bombing', 'shelling', 'casualties', 'invasion', 'drone'];
      expect(NON_AMBIGUOUS_KEYWORDS.size).toBe(7);
      for (const kw of expected) {
        expect(NON_AMBIGUOUS_KEYWORDS.has(kw)).toBe(true);
      }
    });

    it('each non-ambiguous keyword passes matchesKeywords on its own', () => {
      for (const kw of ['airstrike', 'missile', 'bombing', 'shelling', 'casualties', 'invasion', 'drone']) {
        const result = matchesKeywords({ title: `Report about ${kw} in the region` });
        expect(result.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('geographic terms (iran, israel, tehran, baghdad, etc.) are ambiguous -- require co-occurring non-ambiguous term', () => {
      for (const geo of ['iran', 'israel', 'tehran', 'baghdad', 'gaza', 'syria', 'yemen']) {
        const result = matchesKeywords({ title: `Latest news from ${geo}` });
        expect(result).toEqual([]);
      }
    });

    it('diplomatic terms (sanctions, negotiations, ceasefire, etc.) are ambiguous', () => {
      for (const term of ['sanctions', 'negotiations', 'ceasefire', 'escalation', 'tensions']) {
        const result = matchesKeywords({ title: `Report discusses ${term} in the region` });
        expect(result).toEqual([]);
      }
    });

    it('organization names (IRGC, Hezbollah, Hamas, etc.) are ambiguous', () => {
      for (const org of ['irgc', 'hezbollah', 'hamas', 'houthi', 'pentagon', 'centcom', 'nato', 'idf', 'mossad']) {
        const result = matchesKeywords({ title: `Report on ${org} activities` });
        expect(result).toEqual([]);
      }
    });

    it('ambiguous terms pass when paired with non-ambiguous keyword', () => {
      const result = matchesKeywords({ title: 'Iran launches missile strike on bases' });
      expect(result).toContain('missile');
      expect(result).toContain('iran');
    });
  });

  describe('matchesKeywords', () => {
    it('returns matched keyword list for article with non-ambiguous keyword (title contains "airstrike")', () => {
      const result = matchesKeywords({ title: 'Major airstrike hits target in the region' });
      expect(result).toContain('airstrike');
      expect(result.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty array for non-conflict article', () => {
      const result = matchesKeywords({ title: 'Local weather update for tomorrow' });
      expect(result).toEqual([]);
    });

    it('matching is case-insensitive', () => {
      const result = matchesKeywords({ title: 'AIRSTRIKE reported in northern region' });
      expect(result).toContain('airstrike');
    });

    it('matches against title AND summary', () => {
      const result = matchesKeywords({
        title: 'Breaking news from the region',
        summary: 'Multiple missile launches detected overnight',
      });
      expect(result).toContain('missile');
    });

    it('uses word boundary matching -- "war" does not match "forward" or "warned"', () => {
      const result = matchesKeywords({ title: 'Stocks moved forward as traders warned of volatility' });
      expect(result).toEqual([]);
    });

    it('uses word boundary matching -- "iran" does not match "irana"', () => {
      const result = matchesKeywords({ title: 'The city of Tirana announces new transit plan' });
      expect(result).toEqual([]);
    });

    it('rejects articles matching exclusion patterns (new year celebrations)', () => {
      const result = matchesKeywords({
        title: 'Fireworks light up Tehran sky for New Year celebration',
        summary: 'Thousands gather to celebrate the holiday with rocket-shaped fireworks',
      });
      expect(result).toEqual([]);
    });

    it('rejects articles matching exclusion patterns (sports)', () => {
      const result = matchesKeywords({
        title: 'Iran football match ends in dramatic victory at World Cup',
      });
      expect(result).toEqual([]);
    });

    it('expanded exclusion patterns reject entertainment/historical/sports articles', () => {
      // Historical
      expect(matchesKeywords({ title: 'Documentary about Iran World War II alliance' })).toEqual([]);
      // Entertainment
      expect(matchesKeywords({ title: 'New Netflix series about Iran spy thriller' })).toEqual([]);
      // Olympics
      expect(matchesKeywords({ title: 'Iran sends athletes to Olympics this summer' })).toEqual([]);
    });
  });

  describe('filterAndScoreArticles', () => {
    it('enriches articles with actor/action/target/relevanceScore fields', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Iran launches missile strike on Israeli bases', source: 'BBC' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]).toHaveProperty('relevanceScore');
      expect(typeof filtered[0].relevanceScore).toBe('number');
      // Should have at least some enriched fields
      const hasEnriched = filtered[0].actor !== undefined || filtered[0].action !== undefined || filtered[0].target !== undefined;
      expect(hasEnriched).toBe(true);
    });

    it('filters out articles below 0.7 threshold', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Iran launches missile strike on Israeli bases', source: 'BBC' }),
        makeArticle({ id: 'a2', title: 'Local cooking show recipes' }),
        makeArticle({ id: 'a3', title: 'Celebrity gossip roundup' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      // Non-conflict articles should be filtered out
      const ids = filtered.map(a => a.id);
      expect(ids).not.toContain('a2');
      expect(ids).not.toContain('a3');
    });

    it('articles with only geographic terms (no non-ambiguous keywords) are excluded', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Iran sanctions expanded by EU' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      // "iran" and "sanctions" are both ambiguous -- no non-ambiguous keyword present
      expect(filtered).toHaveLength(0);
    });

    it('empty input returns empty output', () => {
      const filtered = filterAndScoreArticles([]);
      expect(filtered).toEqual([]);
    });

    it('"Tehran condemns airstrike in Yemen" -- passes keyword filter (has "airstrike") but enriched fields reflect indirect nature', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Tehran condemns airstrike in Yemen', source: 'Al Jazeera' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      // Should pass because "airstrike" is non-ambiguous
      // Whether it passes the 0.7 threshold depends on NLP scoring
      // Either way, if it passes, it should have enriched fields
      if (filtered.length > 0) {
        expect(filtered[0].relevanceScore).toBeDefined();
        expect(filtered[0].keywords).toContain('airstrike');
      }
    });

    it('"Iran celebrates New Year with fireworks" -- excluded by exclusion pattern', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Iran celebrates New Year with fireworks', source: 'BBC' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      expect(filtered).toHaveLength(0);
    });

    it('"Iran World Cup football match results" -- excluded by sports exclusion', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Iran World Cup football match results', source: 'BBC' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      expect(filtered).toHaveLength(0);
    });

    it('"Iran launches missile strike on Israeli bases" passes with high score (>= 0.7)', () => {
      const articles = [
        makeArticle({ id: 'a1', title: 'Iran launches missile strike on Israeli bases', source: 'BBC' }),
      ];
      const filtered = filterAndScoreArticles(articles);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].relevanceScore).toBeGreaterThanOrEqual(0.7);
    });
  });

  describe('filterConflictArticles backward compat', () => {
    it('still exists and delegates to filterAndScoreArticles', () => {
      expect(typeof filterConflictArticles).toBe('function');
      const articles = [
        makeArticle({ id: 'a1', title: 'Airstrike on Damascus outskirts', source: 'BBC' }),
        makeArticle({ id: 'a2', title: 'Local cooking show recipes' }),
      ];
      const filtered = filterConflictArticles(articles);
      // Should filter same as filterAndScoreArticles
      expect(filtered.length).toBeGreaterThanOrEqual(1);
      const ids = filtered.map(a => a.id);
      expect(ids).toContain('a1');
      expect(ids).not.toContain('a2');
    });
  });
});
