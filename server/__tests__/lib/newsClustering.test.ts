// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { hashUrl, deduplicateAndCluster } from '../../lib/newsClustering.js';
import type { NewsArticle, NewsCluster } from '../../types.js';

const makeArticle = (overrides: Partial<NewsArticle> = {}): NewsArticle => ({
  id: 'test-id',
  title: 'Default test article title for testing purposes',
  url: 'https://example.com/article',
  source: 'TestSource',
  publishedAt: Date.now(),
  keywords: ['test'],
  ...overrides,
});

describe('newsClustering', () => {
  describe('hashUrl', () => {
    it('returns a 16-character hex string', () => {
      const hash = hashUrl('https://example.com/article');
      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('returns consistent hash for same URL', () => {
      const hash1 = hashUrl('https://example.com/test');
      const hash2 = hashUrl('https://example.com/test');
      expect(hash1).toBe(hash2);
    });

    it('returns different hashes for different URLs', () => {
      const hash1 = hashUrl('https://example.com/a');
      const hash2 = hashUrl('https://example.com/b');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('deduplicateAndCluster', () => {
    it('removes duplicate URLs keeping first seen', () => {
      const now = Date.now();
      const articles = [
        makeArticle({ id: 'id-1', url: 'https://example.com/same', title: 'First version', publishedAt: now }),
        makeArticle({ id: 'id-1', url: 'https://example.com/same', title: 'Second version', publishedAt: now + 1000 }),
      ];

      const clusters = deduplicateAndCluster(articles);
      // After dedup, only 1 unique article -> 1 cluster
      expect(clusters).toHaveLength(1);
      expect(clusters[0].primaryArticle.title).toBe('First version');
    });

    it('identifies similar titles with Jaccard similarity > 0.8', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/1'),
          url: 'https://a.com/1',
          title: 'Iran launches massive missile strike on Israeli military bases',
          publishedAt: now,
          source: 'BBC',
        }),
        makeArticle({
          id: hashUrl('https://b.com/2'),
          url: 'https://b.com/2',
          title: 'Iran launches massive missile strike on Israeli military bases overnight',
          publishedAt: now + 60_000,
          source: 'Al Jazeera',
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      // Should be grouped into 1 cluster
      expect(clusters).toHaveLength(1);
      expect(clusters[0].articles).toHaveLength(2);
    });

    it('separates dissimilar titles into different clusters', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/1'),
          url: 'https://a.com/1',
          title: 'Iran launches massive missile strike on military bases',
          publishedAt: now,
        }),
        makeArticle({
          id: hashUrl('https://b.com/2'),
          url: 'https://b.com/2',
          title: 'UN Security Council holds emergency session on climate change',
          publishedAt: now + 1000,
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      expect(clusters).toHaveLength(2);
    });

    it('sets primary to earliest publishedAt in cluster', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/later'),
          url: 'https://a.com/later',
          title: 'Iran launches massive missile strike on Israeli military targets',
          publishedAt: now + 3600_000, // 1 hour later
          source: 'Later Source',
        }),
        makeArticle({
          id: hashUrl('https://b.com/earlier'),
          url: 'https://b.com/earlier',
          title: 'Iran launches massive missile strike on Israeli military targets tonight',
          publishedAt: now, // earliest
          source: 'Earlier Source',
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].primaryArticle.source).toBe('Earlier Source');
      expect(clusters[0].firstSeen).toBe(now);
      expect(clusters[0].lastUpdated).toBe(now + 3600_000);
    });

    it('does not cluster articles beyond 24h window even if titles match', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/today'),
          url: 'https://a.com/today',
          title: 'Iran launches massive missile strike on Israeli military targets',
          publishedAt: now,
        }),
        makeArticle({
          id: hashUrl('https://b.com/old'),
          url: 'https://b.com/old',
          title: 'Iran launches massive missile strike on Israeli military targets',
          publishedAt: now - 25 * 3600_000, // 25 hours ago
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      expect(clusters).toHaveLength(2);
    });

    it('produces single-article clusters for unique articles', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/unique'),
          url: 'https://a.com/unique',
          title: 'Completely unique article about diplomatic talks',
          publishedAt: now,
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      expect(clusters).toHaveLength(1);
      expect(clusters[0].articles).toHaveLength(1);
      expect(clusters[0].primaryArticle.id).toBe(clusters[0].id);
    });

    it('skips fuzzy matching for short titles (< 5 tokens)', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/short1'),
          url: 'https://a.com/short1',
          title: 'Iran strikes back',
          publishedAt: now,
        }),
        makeArticle({
          id: hashUrl('https://b.com/short2'),
          url: 'https://b.com/short2',
          title: 'Iran strikes back',
          publishedAt: now + 1000,
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      // Short titles should not be fuzzy matched, so 2 separate clusters
      expect(clusters).toHaveLength(2);
    });

    it('returns clusters sorted by lastUpdated descending', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/old'),
          url: 'https://a.com/old',
          title: 'Older diplomatic talks resume in Geneva with multiple parties',
          publishedAt: now - 3600_000,
        }),
        makeArticle({
          id: hashUrl('https://b.com/new'),
          url: 'https://b.com/new',
          title: 'Breaking news on latest military operations in the region today',
          publishedAt: now,
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      expect(clusters).toHaveLength(2);
      expect(clusters[0].lastUpdated).toBeGreaterThanOrEqual(clusters[1].lastUpdated);
    });

    it('cluster id matches primaryArticle id', () => {
      const now = Date.now();
      const articles = [
        makeArticle({
          id: hashUrl('https://a.com/1'),
          url: 'https://a.com/1',
          title: 'Test article about something important in the middle east region',
          publishedAt: now,
        }),
      ];

      const clusters = deduplicateAndCluster(articles);
      expect(clusters[0].id).toBe(clusters[0].primaryArticle.id);
    });
  });
});
