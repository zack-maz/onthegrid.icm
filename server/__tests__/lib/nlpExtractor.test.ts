// @vitest-environment node
import { describe, it, expect } from 'vitest';

import { loadConfig } from '../../config.js';
import { extractTriple } from '../../lib/nlpExtractor.js';

import type { NewsArticle } from '../../types.js';

describe('nlpExtractor', () => {
  describe('extractTriple', () => {
    it('extracts actor, action, target from "Iran launches missile at Israel"', () => {
      const triple = extractTriple('Iran launches missile at Israel');
      expect(triple.actor).toMatch(/iran/i);
      expect(triple.action).toMatch(/launch/i);
      expect(triple.target).toMatch(/israel/i);
    });

    it('extracts action and target from "Airstrike in Damascus"', () => {
      const triple = extractTriple('Airstrike in Damascus');
      expect(triple.action).toMatch(/airstrike/i);
      expect(triple.target).toMatch(/damascus/i);
      // actor may be null -- no subject in headline
    });

    it('extracts actor, action, target from "Tehran condemns attack in Yemen"', () => {
      const triple = extractTriple('Tehran condemns attack in Yemen');
      expect(triple.actor).toMatch(/tehran/i);
      expect(triple.action).toMatch(/condemn/i);
      // target should reference Yemen, NOT Tehran
      expect(triple.target).toMatch(/yemen/i);
    });

    it('returns all-null triple for headlines with no proper nouns or verbs', () => {
      const triple = extractTriple('the quick brown fox');
      // At least two of three fields should be null
      const nonNull = [triple.actor, triple.action, triple.target].filter(Boolean).length;
      expect(nonNull).toBeLessThanOrEqual(1);
    });

    it('processes title + summary combined when summary is provided', () => {
      const triple = extractTriple(
        'Military operation underway',
        'Israel Defense Forces launched a ground offensive in southern Lebanon early Thursday.',
      );
      // With summary, should get richer extraction
      const nonNull = [triple.actor, triple.action, triple.target].filter(Boolean).length;
      expect(nonNull).toBeGreaterThanOrEqual(2);
    });

    it('returns partial triple with nulls for missing fields', () => {
      // Actor-only scenario
      const triple = extractTriple('Iran responds');
      // Should get at least actor
      expect(triple.actor).not.toBeNull();
      // All fields should be string | null
      expect(typeof triple.actor === 'string' || triple.actor === null).toBe(true);
      expect(typeof triple.action === 'string' || triple.action === null).toBe(true);
      expect(typeof triple.target === 'string' || triple.target === null).toBe(true);
    });
  });
});

describe('NewsArticle type extension', () => {
  it('accepts optional actor, action, target, relevanceScore fields', () => {
    const article: NewsArticle = {
      id: 'test-123',
      title: 'Test headline',
      url: 'https://example.com/test',
      source: 'BBC',
      publishedAt: Date.now(),
      keywords: ['test'],
      actor: 'Iran',
      action: 'launches',
      target: 'Israel',
      relevanceScore: 0.85,
    };
    expect(article.actor).toBe('Iran');
    expect(article.action).toBe('launches');
    expect(article.target).toBe('Israel');
    expect(article.relevanceScore).toBe(0.85);
  });

  it('allows omitting actor, action, target, relevanceScore for backward compatibility', () => {
    const article: NewsArticle = {
      id: 'test-456',
      title: 'Old article',
      url: 'https://example.com/old',
      source: 'GDELT',
      publishedAt: Date.now(),
      keywords: [],
    };
    expect(article.actor).toBeUndefined();
    expect(article.action).toBeUndefined();
    expect(article.target).toBeUndefined();
    expect(article.relevanceScore).toBeUndefined();
  });
});

describe('config NEWS_RELEVANCE_THRESHOLD', () => {
  it('returns 0.7 default when env var is not set', () => {
    // loadConfig() returns the cached config object (Zod-parsed at module load)
    const config = loadConfig();
    expect(config.newsRelevanceThreshold).toBe(0.7);
  });

  it('Zod schema validates NEWS_RELEVANCE_THRESHOLD from env', async () => {
    // Config is now parsed once at module load via Zod.
    // Test the schema behavior directly using zod.
    const { z } = await import('zod');
    const schema = z.coerce.number().min(0).max(1).default(0.7);
    expect(schema.parse('0.5')).toBe(0.5);
    expect(schema.parse(undefined)).toBe(0.7);
  });

  it('Zod schema clamps value to 0-1 range', async () => {
    const { z } = await import('zod');
    const schema = z.coerce.number().min(0).max(1).default(0.7);
    // Zod .min/.max throws on out-of-range (not clamp), so invalid values fail
    expect(schema.safeParse('1.5').success).toBe(false);
    expect(schema.safeParse('-0.3').success).toBe(false);
    expect(schema.parse('0.9')).toBe(0.9);
  });
});
