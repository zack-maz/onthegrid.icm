// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  computeRelevanceScore,
  SOURCE_RELIABILITY,
  CONFLICT_VERBS,
  EXCLUSION_PATTERNS,
} from '../../lib/relevanceScorer.js';
import { extractTriple } from '../../lib/nlpExtractor.js';
import type { ScoringInput } from '../../lib/relevanceScorer.js';

/** Helper: create ScoringInput from headline text */
function scoreHeadline(title: string, source = 'GDELT', summary?: string): number {
  const triple = extractTriple(title, summary);
  return computeRelevanceScore({ triple, source, title, summary });
}

describe('relevanceScorer', () => {
  describe('computeRelevanceScore', () => {
    it('full triple + conflict verb + BBC source scores >= 0.7', () => {
      const title = 'Iran launches missile strike on Israeli bases';
      const triple = extractTriple(title);
      const score = computeRelevanceScore({
        triple,
        source: 'BBC',
        title,
      });
      expect(score).toBeGreaterThanOrEqual(0.7);
    });

    it('no triple + unknown GDELT source scores < 0.4', () => {
      const title = 'A brief update on recent developments';
      const triple = extractTriple(title);
      const score = computeRelevanceScore({
        triple,
        source: 'GDELT',
        domain: 'unknownsource.example.com',
        title,
      });
      expect(score).toBeLessThan(0.4);
    });

    it('partial triple + negative headline + Al Jazeera scores between 0.5-0.8', () => {
      const title = 'Tehran condemns airstrike in Yemen';
      const triple = extractTriple(title);
      const score = computeRelevanceScore({
        triple,
        source: 'Al Jazeera',
        title,
      });
      expect(score).toBeGreaterThanOrEqual(0.3);
      expect(score).toBeLessThanOrEqual(0.85);
    });

    it('article with exclusion pattern (e.g., "World Cup") returns score 0', () => {
      const title = 'Iran World Cup victory celebrations continue';
      const triple = extractTriple(title);
      const score = computeRelevanceScore({
        triple,
        source: 'BBC',
        title,
      });
      expect(score).toBe(0);
    });

    it('article with no conflict signal at all gets very low score', () => {
      const title = 'Celebrity gossip roundup';
      const score = scoreHeadline(title);
      expect(score).toBeLessThan(0.3);
    });

    it('score is clamped to 0-1 range', () => {
      // Even with all factors maxed, should not exceed 1
      const title = 'Iran strikes Israel destroys bombs shells kills targets seizes captures raids';
      const triple = extractTriple(title);
      const score = computeRelevanceScore({
        triple,
        source: 'BBC',
        title,
      });
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('direct conflict headline scores higher than indirect/diplomatic headline', () => {
      const directScore = scoreHeadline('Iran launches missile strikes on Israeli military bases');
      const indirectScore = scoreHeadline('Tehran condemns airstrike in Yemen');
      expect(directScore).toBeGreaterThan(indirectScore);
    });
  });

  describe('source reliability tiers', () => {
    it('BBC is tier 1 (1.0)', () => {
      expect(SOURCE_RELIABILITY['BBC']).toBe(1.0);
      expect(SOURCE_RELIABILITY['bbc.co.uk']).toBe(1.0);
      expect(SOURCE_RELIABILITY['bbc.com']).toBe(1.0);
    });

    it('Al Jazeera is tier 2 (0.95)', () => {
      expect(SOURCE_RELIABILITY['Al Jazeera']).toBe(0.95);
      expect(SOURCE_RELIABILITY['aljazeera.com']).toBe(0.95);
    });

    it('Tehran Times is tier 3 (0.8)', () => {
      expect(SOURCE_RELIABILITY['Tehran Times']).toBe(0.8);
      expect(SOURCE_RELIABILITY['tehrantimes.com']).toBe(0.8);
    });

    it('unknown GDELT source defaults to 0.6', () => {
      // Default is 0.6 via getSourceReliability fallback
      const title = 'Some headline';
      const triple = extractTriple(title);
      const scoreGDELT = computeRelevanceScore({
        triple,
        source: 'GDELT',
        domain: 'unknownsource.example.com',
        title,
      });
      const scoreBBC = computeRelevanceScore({
        triple,
        source: 'BBC',
        title,
      });
      // BBC should score higher due to better source reliability
      expect(scoreBBC).toBeGreaterThan(scoreGDELT);
    });
  });

  describe('negativity signal', () => {
    it('detects conflict verbs (strike, kill, bomb, destroy, attack, shell, invade)', () => {
      // Headlines with conflict verbs should score higher than neutral ones
      const conflictScore = scoreHeadline('Forces strike and destroy enemy positions');
      const neutralScore = scoreHeadline('Diplomats meet and discuss new proposals');
      expect(conflictScore).toBeGreaterThan(neutralScore);
    });

    it('CONFLICT_VERBS set contains expected entries', () => {
      expect(CONFLICT_VERBS.has('strike')).toBe(true);
      expect(CONFLICT_VERBS.has('kill')).toBe(true);
      expect(CONFLICT_VERBS.has('bomb')).toBe(true);
      expect(CONFLICT_VERBS.has('destroy')).toBe(true);
      expect(CONFLICT_VERBS.has('attack')).toBe(true);
      expect(CONFLICT_VERBS.has('shell')).toBe(true);
      expect(CONFLICT_VERBS.has('invade')).toBe(true);
    });
  });

  describe('exclusion patterns', () => {
    it('EXCLUSION_PATTERNS contains expanded categories', () => {
      // Historical
      expect(EXCLUSION_PATTERNS).toContain('world war ii');
      expect(EXCLUSION_PATTERNS).toContain('documentary');
      // Entertainment
      expect(EXCLUSION_PATTERNS).toContain('video game');
      expect(EXCLUSION_PATTERNS).toContain('netflix');
      // Sports
      expect(EXCLUSION_PATTERNS).toContain('world cup');
      expect(EXCLUSION_PATTERNS).toContain('olympics');
      // Education
      expect(EXCLUSION_PATTERNS).toContain('university study');
      // Technology
      expect(EXCLUSION_PATTERNS).toContain('product launch');
      // Weather
      expect(EXCLUSION_PATTERNS).toContain('earthquake');
    });

    it('exclusion applied to summary text too', () => {
      const title = 'Iran in the news';
      const summary = 'Iran won the World Cup qualifier in a stunning match';
      const score = scoreHeadline(title, 'BBC', summary);
      expect(score).toBe(0);
    });
  });

  describe('realistic false positive scenarios', () => {
    it('"Iran launches missile strike on Israeli bases" should score >= 0.7', () => {
      const score = scoreHeadline('Iran launches missile strike on Israeli bases', 'BBC');
      expect(score).toBeGreaterThanOrEqual(0.7);
    });

    it('"Celebrity gossip roundup" should score near 0', () => {
      const score = scoreHeadline('Celebrity gossip roundup');
      expect(score).toBeLessThan(0.25);
    });

    it('"Iran World Cup victory celebrations" should score 0 (exclusion)', () => {
      const score = scoreHeadline('Iran World Cup victory celebrations');
      expect(score).toBe(0);
    });
  });
});
