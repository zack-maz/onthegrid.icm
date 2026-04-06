// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { extractTriple, extractActorsAndPlaces, lookupCityCoords } from '../../lib/nlpExtractor.js';
import type { NlpExtraction } from '../../lib/nlpExtractor.js';
import type { NewsArticle } from '../../types.js';
import { loadConfig } from '../../config.js';

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

describe('extractActorsAndPlaces', () => {
  it('extracts places from "Israel strikes targets in Damascus"', () => {
    const result: NlpExtraction = extractActorsAndPlaces('Israel strikes targets in Damascus');
    expect(result.places).toEqual(
      expect.arrayContaining([expect.stringMatching(/damascus/i)]),
    );
    // Should also detect actors
    expect(result.actors.length + result.triple.actor!.length).toBeGreaterThan(0);
  });

  it('recognizes ME-specific city name Isfahan via custom lexicon', () => {
    const result = extractActorsAndPlaces('Airstrike near Isfahan kills 12');
    expect(result.places).toEqual(
      expect.arrayContaining([expect.stringMatching(/isfahan/i)]),
    );
  });

  it('extracts actors from "Houthi rebels attack ship"', () => {
    const result = extractActorsAndPlaces('Houthi rebels attack ship');
    // Should have actor-like content but no/minimal places
    const hasActor =
      result.actors.some(a => /houthi/i.test(a)) ||
      (result.triple.actor !== null && /houthi/i.test(result.triple.actor));
    expect(hasActor).toBe(true);
  });

  it('recognizes multi-word ME city "Deir ez-Zor"', () => {
    const result = extractActorsAndPlaces('Explosion in Deir ez-Zor market');
    expect(result.places).toEqual(
      expect.arrayContaining([expect.stringMatching(/deir ez-zor/i)]),
    );
  });

  it('returns NlpExtraction shape with actors, places, triple', () => {
    const result = extractActorsAndPlaces('Iran attacks Israel');
    expect(result).toHaveProperty('actors');
    expect(result).toHaveProperty('places');
    expect(result).toHaveProperty('triple');
    expect(Array.isArray(result.actors)).toBe(true);
    expect(Array.isArray(result.places)).toBe(true);
    expect(result.triple).toHaveProperty('actor');
    expect(result.triple).toHaveProperty('action');
    expect(result.triple).toHaveProperty('target');
  });

  it('preserves backward compat -- triple still works as before', () => {
    const result = extractActorsAndPlaces('Iran launches missile at Israel');
    expect(result.triple.actor).toMatch(/iran/i);
    expect(result.triple.target).toMatch(/israel/i);
  });
});

describe('lookupCityCoords', () => {
  it('returns coords for "damascus"', () => {
    const result = lookupCityCoords('damascus');
    expect(result).not.toBeNull();
    expect(result!.countryCode).toBe('SY');
    expect(result!.lat).toBeCloseTo(33.51, 0);
    expect(result!.lng).toBeCloseTo(36.28, 0);
  });

  it('returns coords for "isfahan"', () => {
    const result = lookupCityCoords('isfahan');
    expect(result).not.toBeNull();
    expect(result!.countryCode).toBe('IR');
    expect(result!.lat).toBeCloseTo(32.65, 0);
    expect(result!.lng).toBeCloseTo(51.67, 0);
  });

  it('returns null for nonexistent city', () => {
    const result = lookupCityCoords('nonexistent-city');
    expect(result).toBeNull();
  });

  it('disambiguates by proximity when original coords provided', () => {
    // Look up a city name that might exist in multiple countries
    // "Mosul" should be in Iraq
    const result = lookupCityCoords('mosul', 36.34, 43.12);
    expect(result).not.toBeNull();
    expect(result!.countryCode).toBe('IQ');
  });

  it('returns most populous match when no original coords', () => {
    const result = lookupCityCoords('istanbul');
    expect(result).not.toBeNull();
    expect(result!.countryCode).toBe('TR');
  });

  it('is case-insensitive', () => {
    const lower = lookupCityCoords('tehran');
    const upper = lookupCityCoords('Tehran');
    expect(lower).not.toBeNull();
    expect(upper).not.toBeNull();
    expect(lower!.lat).toBe(upper!.lat);
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
    delete process.env.NEWS_RELEVANCE_THRESHOLD;
    const config = loadConfig();
    expect(config.newsRelevanceThreshold).toBe(0.7);
  });

  it('reads NEWS_RELEVANCE_THRESHOLD from env', () => {
    process.env.NEWS_RELEVANCE_THRESHOLD = '0.5';
    const config = loadConfig();
    expect(config.newsRelevanceThreshold).toBe(0.5);
    delete process.env.NEWS_RELEVANCE_THRESHOLD;
  });

  it('clamps value to 0-1 range', () => {
    process.env.NEWS_RELEVANCE_THRESHOLD = '1.5';
    expect(loadConfig().newsRelevanceThreshold).toBe(1);

    process.env.NEWS_RELEVANCE_THRESHOLD = '-0.3';
    expect(loadConfig().newsRelevanceThreshold).toBe(0);
    delete process.env.NEWS_RELEVANCE_THRESHOLD;
  });
});
