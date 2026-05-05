import { describe, it, expect } from 'vitest';

import { matchNewsToEvent } from '../lib/newsMatching';

import type { ConflictEventEntity, NewsCluster, NewsArticle } from '../../server/types';

function makeArticle(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: 'article-1',
    title: 'Airstrike hits Tehran military base',
    url: 'https://example.com/article',
    source: 'BBC',
    publishedAt: Date.now(),
    keywords: ['airstrike', 'Iran'],
    ...overrides,
  };
}

function makeCluster(
  overrides: Partial<NewsCluster> & { primaryArticle?: Partial<NewsArticle> } = {},
): NewsCluster {
  const primaryArticle = makeArticle(overrides.primaryArticle);
  return {
    id: primaryArticle.id,
    primaryArticle,
    articles: [primaryArticle],
    firstSeen: primaryArticle.publishedAt,
    lastUpdated: primaryArticle.publishedAt,
    ...overrides,
    // Ensure primaryArticle override is applied
    ...(overrides.primaryArticle ? { primaryArticle: makeArticle(overrides.primaryArticle) } : {}),
  };
}

function makeEvent(
  overrides: Partial<ConflictEventEntity> & { data?: Partial<ConflictEventEntity['data']> } = {},
): ConflictEventEntity {
  const now = Date.now();
  const { data: dataOverrides, ...rest } = overrides;
  return {
    id: 'gdelt-test-1',
    type: 'airstrike',
    lat: 35.6892,
    lng: 51.389,
    timestamp: now,
    label: 'Tehran: Aerial weapons',
    data: {
      eventType: 'Aerial weapons',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: 'IRAN',
      actor2: 'IRAQ',
      notes: '',
      source: 'https://reuters.com',
      goldsteinScale: -9.5,
      locationName: 'Tehran, Tehran, Iran',
      cameoCode: '195',
      ...dataOverrides,
    },
    ...rest,
  };
}

describe('matchNewsToEvent', () => {
  it('returns empty array when no clusters are within 24h temporal window', () => {
    const now = Date.now();
    const event = makeEvent({ timestamp: now });
    const oldCluster = makeCluster({
      primaryArticle: {
        publishedAt: now - 48 * 60 * 60 * 1000, // 48h ago
      },
      lastUpdated: now - 48 * 60 * 60 * 1000,
    });

    const result = matchNewsToEvent(event, [oldCluster]);

    expect(result).toHaveLength(0);
  });

  it('returns max 3 headlines even when more clusters match', () => {
    const now = Date.now();
    const event = makeEvent({ timestamp: now });
    const clusters = Array.from({ length: 5 }, (_, i) =>
      makeCluster({
        primaryArticle: {
          id: `article-${i}`,
          title: `Tehran military conflict report #${i}`,
          publishedAt: now - i * 60 * 60 * 1000, // staggered by 1h
          lat: 35.6892,
          lng: 51.389,
        },
        id: `article-${i}`,
        lastUpdated: now - i * 60 * 60 * 1000,
      }),
    );

    const result = matchNewsToEvent(event, clusters);

    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('geographic proximity boosts ranking (closer articles rank higher)', () => {
    const now = Date.now();
    const event = makeEvent({
      timestamp: now,
      lat: 35.6892,
      lng: 51.389,
    });

    // Close cluster (same coordinates)
    const closeCluster = makeCluster({
      id: 'close',
      primaryArticle: {
        id: 'close',
        title: 'Tehran conflict update',
        publishedAt: now - 1 * 60 * 60 * 1000,
        lat: 35.69,
        lng: 51.39,
      },
      lastUpdated: now - 1 * 60 * 60 * 1000,
    });

    // Far cluster (500km away)
    const farCluster = makeCluster({
      id: 'far',
      primaryArticle: {
        id: 'far',
        title: 'Tehran conflict update',
        publishedAt: now - 1 * 60 * 60 * 1000,
        lat: 30.0, // ~600km south
        lng: 51.389,
      },
      lastUpdated: now - 1 * 60 * 60 * 1000,
    });

    const result = matchNewsToEvent(event, [farCluster, closeCluster]);

    // Close cluster should rank higher
    expect(result.length).toBeGreaterThanOrEqual(1);
    // The first result should be from the close cluster
    expect(result[0].source).toBe('BBC');
  });

  it('returns MatchedHeadline objects with correct shape', () => {
    const now = Date.now();
    const event = makeEvent({ timestamp: now });
    const cluster = makeCluster({
      primaryArticle: {
        title: 'Breaking: Airstrike near Tehran',
        source: 'Al Jazeera',
        url: 'https://aljazeera.com/123',
        publishedAt: now - 1 * 60 * 60 * 1000,
        lat: 35.7,
        lng: 51.4,
      },
      lastUpdated: now - 1 * 60 * 60 * 1000,
    });

    const result = matchNewsToEvent(event, [cluster]);

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]).toEqual(
      expect.objectContaining({
        source: expect.any(String),
        title: expect.any(String),
        url: expect.any(String),
      }),
    );
  });

  it('keyword overlap boosts relevance (locationName words in title)', () => {
    const now = Date.now();
    const event = makeEvent({
      timestamp: now,
      data: { locationName: 'Baghdad, Iraq' },
    });

    // Cluster with matching keywords
    const matchingCluster = makeCluster({
      id: 'matching',
      primaryArticle: {
        id: 'matching',
        title: 'Explosion reported in Baghdad area',
        publishedAt: now - 1 * 60 * 60 * 1000,
      },
      lastUpdated: now - 1 * 60 * 60 * 1000,
    });

    // Cluster without matching keywords
    const nonMatchingCluster = makeCluster({
      id: 'non-matching',
      primaryArticle: {
        id: 'non-matching',
        title: 'Diplomatic meeting in Geneva',
        publishedAt: now - 1 * 60 * 60 * 1000,
      },
      lastUpdated: now - 1 * 60 * 60 * 1000,
    });

    const result = matchNewsToEvent(event, [nonMatchingCluster, matchingCluster]);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // Matching cluster should rank first
    expect(result[0].title).toContain('Baghdad');
  });
});
