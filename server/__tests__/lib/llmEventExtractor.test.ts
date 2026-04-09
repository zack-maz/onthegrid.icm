import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EventGroup } from '../../lib/eventGrouping.js';
import type { ConflictEventEntity } from '../../types.js';

// Mock callLLM
vi.mock('../../adapters/llm-provider.js', () => ({
  callLLM: vi.fn(),
}));

// Mock forwardGeocode
vi.mock('../../adapters/nominatim.js', () => ({
  forwardGeocode: vi.fn(),
  reverseGeocode: vi.fn(),
}));

// Mock logger
vi.mock('../../lib/logger.js', () => ({
  logger: {
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

// Mock Redis cache
vi.mock('../../cache/redis.js', () => ({
  cacheGetSafe: vi.fn().mockResolvedValue(null),
  cacheSetSafe: vi.fn().mockResolvedValue(undefined),
  redis: { get: vi.fn(), set: vi.fn() },
}));

function makeEntity(overrides?: Partial<ConflictEventEntity>): ConflictEventEntity {
  return {
    id: 'evt-1',
    type: 'airstrike',
    lat: 33.3,
    lng: 44.4,
    timestamp: Date.now(),
    label: 'Test event',
    data: {
      eventType: 'Airstrike',
      subEventType: 'CAMEO 195',
      fatalities: 0,
      actor1: 'UNITED STATES',
      actor2: 'IRAN',
      notes: '',
      source: 'https://example.com',
      goldsteinScale: -10,
      locationName: 'Baghdad, Iraq',
      cameoCode: '195',
      numMentions: 10,
      numSources: 5,
    },
    ...overrides,
  };
}

function makeGroup(overrides?: Partial<EventGroup>): EventGroup {
  return {
    key: 'grp-1',
    entities: [makeEntity()],
    centroidLat: 33.3,
    centroidLng: 44.4,
    primaryCameo: '195',
    timestamp: Date.now(),
    totalMentions: 10,
    totalSources: 5,
    sourceUrls: ['https://example.com'],
    ...overrides,
  };
}

describe('llmEventExtractor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns EnrichedEvent[] with location, type, summary, casualties fields', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    const { processEventGroups } = await import('../../lib/llmEventExtractor.js');

    const validResponse = JSON.stringify({
      events: [
        {
          groupKey: 'grp-1',
          location: { name: 'Baghdad', precision: 'city' },
          type: 'airstrike',
          actors: ['UNITED STATES', 'IRAN'],
          severity: 'high',
          summary: 'US airstrike on Iranian positions near Baghdad.',
          casualties: { killed: 5, injured: 10, unknown: false },
          sourceCount: 5,
        },
      ],
    });
    vi.mocked(callLLM).mockResolvedValueOnce(validResponse);

    const groups = [makeGroup()];
    const result = await processEventGroups(groups);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(1);
    expect(result![0].location.name).toBe('Baghdad');
    expect(result![0].type).toBe('airstrike');
    expect(result![0].summary).toBe('US airstrike on Iranian positions near Baghdad.');
    expect(result![0].casualties).toEqual({ killed: 5, injured: 10, unknown: false });
  });

  it('returns null when callLLM returns null (graceful degradation)', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    const { processEventGroups } = await import('../../lib/llmEventExtractor.js');

    vi.mocked(callLLM).mockResolvedValueOnce(null);

    const groups = [makeGroup()];
    const result = await processEventGroups(groups);

    expect(result).toBeNull();
  });

  it('validates LLM output with Zod and rejects malformed responses', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    const { processEventGroups } = await import('../../lib/llmEventExtractor.js');

    // Missing required fields
    const malformedResponse = JSON.stringify({
      events: [
        {
          groupKey: 'grp-1',
          // Missing location, type, etc.
          summary: 'Some text',
        },
      ],
    });
    vi.mocked(callLLM).mockResolvedValueOnce(malformedResponse);

    const groups = [makeGroup()];
    const result = await processEventGroups(groups);

    // Should return null or empty array since the batch failed validation
    expect(result === null || (Array.isArray(result) && result.length === 0)).toBe(true);
  });

  it('batch-processes groups (BATCH_SIZE = 8)', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    const { processEventGroups } = await import('../../lib/llmEventExtractor.js');

    // Create 10 groups — should result in 2 batches (8 + 2)
    const groups = Array.from({ length: 10 }, (_, i) => makeGroup({ key: `grp-${i}` }));

    const makeBatchResponse = (keys: string[]) =>
      JSON.stringify({
        events: keys.map((k) => ({
          groupKey: k,
          location: { name: 'Baghdad', precision: 'city' },
          type: 'airstrike',
          actors: ['US'],
          severity: 'medium',
          summary: 'Event summary.',
          casualties: { killed: null, injured: null, unknown: true },
          sourceCount: 3,
        })),
      });

    // First batch: 8 groups
    vi.mocked(callLLM).mockResolvedValueOnce(
      makeBatchResponse(groups.slice(0, 8).map((g) => g.key)),
    );
    // Second batch: 2 groups
    vi.mocked(callLLM).mockResolvedValueOnce(
      makeBatchResponse(groups.slice(8).map((g) => g.key)),
    );

    const result = await processEventGroups(groups);

    expect(result).not.toBeNull();
    expect(result).toHaveLength(10);
    expect(vi.mocked(callLLM)).toHaveBeenCalledTimes(2);
  });

  it('EnrichedEvent has precision field with enum value', async () => {
    const { callLLM } = await import('../../adapters/llm-provider.js');
    const { processEventGroups } = await import('../../lib/llmEventExtractor.js');

    const response = JSON.stringify({
      events: [
        {
          groupKey: 'grp-1',
          location: { name: 'Sadr City', precision: 'neighborhood' },
          type: 'explosion',
          actors: ['UNKNOWN'],
          severity: 'critical',
          summary: 'Large explosion reported in Sadr City.',
          casualties: { killed: 12, injured: 30, unknown: false },
          sourceCount: 8,
        },
      ],
    });
    vi.mocked(callLLM).mockResolvedValueOnce(response);

    const groups = [makeGroup()];
    const result = await processEventGroups(groups);

    expect(result).not.toBeNull();
    expect(['exact', 'neighborhood', 'city', 'region']).toContain(result![0].location.precision);
    expect(result![0].location.precision).toBe('neighborhood');
  });
});
