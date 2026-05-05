// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  getSourceTier,
  getHighestTier,
  extractDomain,
  TIER_1_DOMAINS,
  TIER_2_DOMAINS,
  TIER_3_DOMAINS,
} from '../../lib/sourceTiers.js';

describe('sourceTiers', () => {
  describe('extractDomain', () => {
    it('extracts domain from a full URL', () => {
      expect(extractDomain('https://www.reuters.com/article/123')).toBe('reuters.com');
    });

    it('strips www. prefix', () => {
      expect(extractDomain('https://www.bbc.co.uk/news/article')).toBe('bbc.co.uk');
    });

    it('handles URLs without www', () => {
      expect(extractDomain('https://apnews.com/article/test')).toBe('apnews.com');
    });

    it('returns empty string for malformed URL', () => {
      expect(extractDomain('not-a-url')).toBe('');
    });

    it('returns empty string for empty string', () => {
      expect(extractDomain('')).toBe('');
    });
  });

  describe('getSourceTier', () => {
    // Tier 1 (gold): Wire services + OSINT
    it('Reuters by name returns 1', () => {
      expect(getSourceTier('Reuters', undefined)).toBe(1);
    });

    it('Associated Press by name returns 1', () => {
      expect(getSourceTier('Associated Press', undefined)).toBe(1);
    });

    it('AFP by name returns 1', () => {
      expect(getSourceTier('AFP', undefined)).toBe(1);
    });

    it('Bellingcat by name returns 1', () => {
      expect(getSourceTier('Bellingcat', undefined)).toBe(1);
    });

    it('Liveuamap by name returns 1', () => {
      expect(getSourceTier('Liveuamap', undefined)).toBe(1);
    });

    // Tier 2 (silver): Major outlets
    it('BBC by name returns 2', () => {
      expect(getSourceTier('BBC', undefined)).toBe(2);
    });

    it('BBC by domain returns 2', () => {
      expect(getSourceTier('BBC', 'bbc.co.uk')).toBe(2);
    });

    it('Al Jazeera by name returns 2', () => {
      expect(getSourceTier('Al Jazeera', undefined)).toBe(2);
    });

    it('CNN by name returns 2', () => {
      expect(getSourceTier('CNN', undefined)).toBe(2);
    });

    // Tier 3 (bronze): Regional/niche
    it('Tehran Times by name returns 3', () => {
      expect(getSourceTier('Tehran Times', undefined)).toBe(3);
    });

    it('IRNA by name returns 3', () => {
      expect(getSourceTier('IRNA', undefined)).toBe(3);
    });

    it('SANA by name returns 3', () => {
      expect(getSourceTier('SANA', undefined)).toBe(3);
    });

    it('Press TV by name returns 3', () => {
      expect(getSourceTier('Press TV', undefined)).toBe(3);
    });

    // GDELT source with domain lookup
    it('GDELT with reuters.com domain returns 1', () => {
      expect(getSourceTier('GDELT', 'reuters.com')).toBe(1);
    });

    it('GDELT with bbc.co.uk domain returns 2', () => {
      expect(getSourceTier('GDELT', 'bbc.co.uk')).toBe(2);
    });

    it('GDELT with tehrantimes.com domain returns 3', () => {
      expect(getSourceTier('GDELT', 'tehrantimes.com')).toBe(3);
    });

    // Unknown sources
    it('GDELT with unknown domain returns null', () => {
      expect(getSourceTier('GDELT', 'unknownsource.com')).toBeNull();
    });

    it('RandomBlog with no domain returns null', () => {
      expect(getSourceTier('RandomBlog', undefined)).toBeNull();
    });

    it('empty source with no domain returns null', () => {
      expect(getSourceTier('', undefined)).toBeNull();
    });
  });

  describe('getHighestTier', () => {
    it('returns 1 when mix of Tier 1, 2, and unknown URLs', () => {
      const urls = [
        'https://www.reuters.com/article/123',
        'https://www.bbc.co.uk/news/456',
        'https://unknownsource.com/page',
      ];
      expect(getHighestTier(urls)).toBe(1);
    });

    it('returns 2 when highest is Tier 2', () => {
      const urls = ['https://www.bbc.co.uk/news/456', 'https://tehrantimes.com/article/789'];
      expect(getHighestTier(urls)).toBe(2);
    });

    it('returns 3 when only Tier 3 sources', () => {
      const urls = ['https://tehrantimes.com/article/789'];
      expect(getHighestTier(urls)).toBe(3);
    });

    it('returns null when all unknown sources', () => {
      const urls = ['https://unknownsource.com/page'];
      expect(getHighestTier(urls)).toBeNull();
    });

    it('returns null for empty array', () => {
      expect(getHighestTier([])).toBeNull();
    });
  });

  describe('tier domain sets', () => {
    it('TIER_1_DOMAINS contains wire services and OSINT', () => {
      expect(TIER_1_DOMAINS.has('reuters.com')).toBe(true);
      expect(TIER_1_DOMAINS.has('apnews.com')).toBe(true);
      expect(TIER_1_DOMAINS.has('afp.com')).toBe(true);
      expect(TIER_1_DOMAINS.has('bellingcat.com')).toBe(true);
      expect(TIER_1_DOMAINS.has('liveuamap.com')).toBe(true);
    });

    it('TIER_2_DOMAINS contains major outlets', () => {
      expect(TIER_2_DOMAINS.has('bbc.co.uk')).toBe(true);
      expect(TIER_2_DOMAINS.has('bbc.com')).toBe(true);
      expect(TIER_2_DOMAINS.has('aljazeera.com')).toBe(true);
      expect(TIER_2_DOMAINS.has('cnn.com')).toBe(true);
      expect(TIER_2_DOMAINS.has('timesofisrael.com')).toBe(true);
      expect(TIER_2_DOMAINS.has('middleeasteye.net')).toBe(true);
      expect(TIER_2_DOMAINS.has('theguardian.com')).toBe(true);
      expect(TIER_2_DOMAINS.has('nytimes.com')).toBe(true);
      expect(TIER_2_DOMAINS.has('washingtonpost.com')).toBe(true);
    });

    it('TIER_3_DOMAINS contains state/regional media', () => {
      expect(TIER_3_DOMAINS.has('tehrantimes.com')).toBe(true);
      expect(TIER_3_DOMAINS.has('irna.ir')).toBe(true);
      expect(TIER_3_DOMAINS.has('sana.sy')).toBe(true);
      expect(TIER_3_DOMAINS.has('presstv.ir')).toBe(true);
    });
  });
});
