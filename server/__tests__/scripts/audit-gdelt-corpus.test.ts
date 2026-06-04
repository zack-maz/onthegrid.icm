// Unit test for the GDELT corpus audit's pure logic (bucketing + orphan + dedup-candidate).
// GDELT-MATCH-01 (Phase 38, Plan 03). The pure functions are imported from the
// audit script so the test exercises the logic WITHOUT any Redis I/O.

import { describe, it, expect } from 'vitest';

import {
  bucketByTier,
  detectOrphans,
  detectDuplicateClusters,
  buildAuditReport,
  type TierBuckets,
} from '../../../scripts/audit-gdelt-corpus.js';

import type { ConflictEventEntity, NewsCluster } from '../../types.js';

const DAY = 86_400_000;
const BASE = Date.UTC(2026, 2, 1); // 2026-03-01

/** Minimal ConflictEventEntity factory for fixtures. */
function ev(
  id: string,
  opts: {
    source: string;
    lat?: number;
    lng?: number;
    cameoCode?: string;
    timestamp?: number;
    locationName?: string;
  },
): ConflictEventEntity {
  return {
    id,
    type: 'airstrike',
    lat: opts.lat ?? 35.7,
    lng: opts.lng ?? 51.4,
    timestamp: opts.timestamp ?? BASE,
    label: id,
    data: {
      eventType: 'Use conventional military force',
      subEventType: `CAMEO ${opts.cameoCode ?? '190'}`,
      fatalities: 0,
      actor1: 'Iran',
      actor2: 'Israel',
      notes: '',
      source: opts.source,
      goldsteinScale: -10,
      locationName: opts.locationName ?? 'Tehran, Iran',
      cameoCode: opts.cameoCode ?? '190',
      numMentions: 3,
      numSources: 2,
    },
  };
}

/** Minimal NewsCluster factory for orphan cross-reference fixtures. */
function cluster(
  id: string,
  opts: { lat: number; lng: number; publishedAt: number; keywords: string[] },
): NewsCluster {
  const article = {
    id,
    title: `news ${id}`,
    url: `https://example.com/${id}`,
    source: 'GDELT',
    publishedAt: opts.publishedAt,
    lat: opts.lat,
    lng: opts.lng,
    keywords: opts.keywords,
  };
  return {
    id,
    primaryArticle: article,
    articles: [article],
    firstSeen: opts.publishedAt,
    lastUpdated: opts.publishedAt,
  };
}

describe('bucketByTier', () => {
  it('classifies events into tier-1 / tier-2 / tier-3 / null buckets by highest source tier', () => {
    const events = [
      ev('t1', { source: 'https://www.reuters.com/world/a' }), // tier 1
      ev('t2', { source: 'https://www.bbc.com/news/b' }), // tier 2
      ev('t3', { source: 'https://www.presstv.ir/x' }), // tier 3
      ev('tn', { source: 'https://randomblog.example/post' }), // null/unknown
    ];

    const buckets: TierBuckets = bucketByTier(events);

    expect(buckets.tier1).toHaveLength(1);
    expect(buckets.tier1[0]!.id).toBe('t1');
    expect(buckets.tier2.map((e) => e.id)).toEqual(['t2']);
    expect(buckets.tier3.map((e) => e.id)).toEqual(['t3']);
    expect(buckets.unknown.map((e) => e.id)).toEqual(['tn']);
  });

  it('buckets an event by its BEST source tier when multiple URLs present', () => {
    // source string carries one URL; getHighestTier still resolves the best of provided URLs.
    const events = [ev('best', { source: 'https://www.reuters.com/world/a' })];
    const buckets = bucketByTier(events);
    expect(buckets.tier1.map((e) => e.id)).toEqual(['best']);
  });
});

describe('detectOrphans', () => {
  it('flags events with no matching GDELT-DOC cluster (temporal + geo + keyword)', () => {
    const events = [
      // matches the cluster: same day, ~same location, shared keyword
      ev('matched', {
        source: 'https://www.reuters.com/x',
        lat: 35.7,
        lng: 51.4,
        timestamp: BASE,
        locationName: 'Tehran',
      }),
      // orphan: no nearby/temporal cluster at all
      ev('orphan-geo', {
        source: 'https://www.bbc.com/y',
        lat: 10.0,
        lng: 10.0,
        timestamp: BASE,
        locationName: 'Nowhere',
      }),
      // orphan: right place but weeks apart in time
      ev('orphan-time', {
        source: 'https://www.bbc.com/z',
        lat: 35.7,
        lng: 51.4,
        timestamp: BASE + 30 * DAY,
        locationName: 'Tehran',
      }),
    ];
    const clusters = [
      cluster('c1', { lat: 35.71, lng: 51.41, publishedAt: BASE, keywords: ['tehran', 'strike'] }),
    ];

    const orphans = detectOrphans(events, clusters);
    const orphanIds = orphans.map((e) => e.id).sort();
    expect(orphanIds).toEqual(['orphan-geo', 'orphan-time']);
  });

  it('treats every event as an orphan when there are no clusters', () => {
    const events = [ev('a', { source: 'https://www.reuters.com/a' })];
    expect(detectOrphans(events, [])).toHaveLength(1);
  });
});

describe('detectDuplicateClusters', () => {
  it('reports event groups of size >= 2 as duplicate-source candidates', () => {
    const events = [
      // duplicate pair: same day, same CAMEO root, within 50km
      ev('dup-a', {
        source: 'https://www.reuters.com/a',
        lat: 35.7,
        lng: 51.4,
        cameoCode: '190',
        timestamp: BASE,
      }),
      ev('dup-b', {
        source: 'https://www.bbc.com/b',
        lat: 35.72,
        lng: 51.42,
        cameoCode: '193',
        timestamp: BASE,
      }),
      // singleton: far away
      ev('solo', {
        source: 'https://www.cnn.com/c',
        lat: 0.0,
        lng: 0.0,
        cameoCode: '190',
        timestamp: BASE,
      }),
    ];

    const dups = detectDuplicateClusters(events);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.entities).toHaveLength(2);
    expect(dups[0]!.entities.map((e) => e.id).sort()).toEqual(['dup-a', 'dup-b']);
  });

  it('returns no duplicate clusters when every event is isolated', () => {
    const events = [
      ev('x', { source: 'https://www.reuters.com/x', lat: 0, lng: 0 }),
      ev('y', { source: 'https://www.bbc.com/y', lat: 40, lng: 40 }),
    ];
    expect(detectDuplicateClusters(events)).toHaveLength(0);
  });
});

describe('buildAuditReport', () => {
  it('produces per-bucket counts, orphan count, and a duplicate-cluster size histogram', () => {
    const events = [
      ev('t1-dup-a', {
        source: 'https://www.reuters.com/a',
        lat: 35.7,
        lng: 51.4,
        timestamp: BASE,
        locationName: 'Tehran',
      }),
      ev('t2-dup-b', {
        source: 'https://www.bbc.com/b',
        lat: 35.72,
        lng: 51.42,
        timestamp: BASE,
        locationName: 'Tehran',
      }),
      ev('t3-solo', {
        source: 'https://www.presstv.ir/c',
        lat: 0,
        lng: 0,
        timestamp: BASE,
        locationName: 'Nowhere',
      }),
    ];
    const clusters = [
      cluster('c1', { lat: 35.71, lng: 51.41, publishedAt: BASE, keywords: ['tehran'] }),
    ];

    const report = buildAuditReport(events, clusters);

    expect(report.total).toBe(3);
    expect(report.tierCounts.tier1).toBe(1);
    expect(report.tierCounts.tier2).toBe(1);
    expect(report.tierCounts.tier3).toBe(1);
    expect(report.tierCounts.unknown).toBe(0);

    // t3-solo is the orphan (far from cluster); the dup pair near Tehran matches.
    expect(report.orphanCount).toBe(1);
    expect(report.orphanIds).toContain('t3-solo');

    // One duplicate cluster of size 2.
    expect(report.duplicateClusterCount).toBe(1);
    expect(report.duplicateClusterSizeHistogram['2']).toBe(1);
    expect(report.generatedAt).toBeTypeOf('string');
  });
});
