import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock localStorage before importing stores (stores read localStorage on init)
const localStorageMock = {
  getItem: vi.fn(() => null),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
vi.stubGlobal('localStorage', localStorageMock);

import { searchEntities, getSearchableFields } from '@/lib/searchUtils';
import { useFilterStore } from '@/stores/filterStore';
import { useSearchStore } from '@/stores/searchStore';
import type { FlightEntity, ShipEntity, ConflictEventEntity, SiteEntity } from '@/types/entities';

// Mock entities for testing
const mockFlight: FlightEntity = {
  id: 'flight-1',
  type: 'flight',
  lat: 32.0,
  lng: 52.0,
  timestamp: Date.now(),
  label: 'IRA123',
  data: {
    icao24: 'abc123',
    callsign: 'IRA123',
    originCountry: 'Iran',
    velocity: 250,
    heading: 90,
    altitude: 10000,
    onGround: false,
    verticalRate: 0,
    unidentified: false,
  },
};

const mockShip: ShipEntity = {
  id: 'ship-1',
  type: 'ship',
  lat: 26.0,
  lng: 56.0,
  timestamp: Date.now(),
  label: 'PERSIAN GULF',
  data: {
    mmsi: 123456789,
    shipName: 'PERSIAN GULF',
    speedOverGround: 12,
    courseOverGround: 180,
    trueHeading: 180,
  },
};

const mockEvent: ConflictEventEntity = {
  id: 'event-1',
  type: 'airstrike',
  lat: 33.0,
  lng: 44.0,
  timestamp: Date.now(),
  label: 'Airstrike near Baghdad',
  data: {
    eventType: 'Use conventional military force',
    subEventType: 'CAMEO 190',
    fatalities: 0,
    actor1: 'Iran',
    actor2: 'United States',
    notes: 'test event',
    source: 'GDELT',
    goldsteinScale: -10,
    locationName: 'Baghdad, Iraq',
    cameoCode: '190',
  },
};

const mockSite: SiteEntity = {
  id: 'site-1',
  type: 'site',
  siteType: 'nuclear',
  lat: 32.6,
  lng: 51.7,
  label: 'Isfahan Nuclear Facility',
  operator: 'AEOI',
  osmId: 12345,
};

describe('searchStore', () => {
  beforeEach(() => {
    useSearchStore.getState().clearSearch();
    useSearchStore.setState({ isSearchModalOpen: false, recentTags: [] });
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.removeItem.mockClear();
  });

  it('setQuery sets query', () => {
    useSearchStore.getState().setQuery('iran');
    expect(useSearchStore.getState().query).toBe('iran');
  });

  it('setQuery also updates parsedQuery via parse()', () => {
    useSearchStore.getState().setQuery('type:flight');
    const { parsedQuery } = useSearchStore.getState();
    expect(parsedQuery).not.toBeNull();
    expect(parsedQuery!.type).toBe('tag');
    if (parsedQuery!.type === 'tag') {
      expect(parsedQuery!.prefix).toBe('type');
      expect(parsedQuery!.value).toBe('flight');
    }
  });

  it('setQuery with plain text creates text node', () => {
    useSearchStore.getState().setQuery('iran');
    const { parsedQuery } = useSearchStore.getState();
    expect(parsedQuery).not.toBeNull();
    expect(parsedQuery!.type).toBe('text');
    if (parsedQuery!.type === 'text') {
      expect(parsedQuery!.value).toBe('iran');
    }
  });

  it('setQuery with empty string sets parsedQuery to null', () => {
    useSearchStore.getState().setQuery('type:flight');
    useSearchStore.getState().setQuery('');
    expect(useSearchStore.getState().parsedQuery).toBeNull();
  });

  it('setParsedQuery also updates query via serialize()', () => {
    useSearchStore.getState().setParsedQuery({
      type: 'tag',
      prefix: 'type',
      value: 'ship',
      negated: false,
    });
    expect(useSearchStore.getState().query).toBe('type:ship');
    expect(useSearchStore.getState().parsedQuery!.type).toBe('tag');
  });

  it('setParsedQuery with null clears query', () => {
    useSearchStore.getState().setQuery('something');
    useSearchStore.getState().setParsedQuery(null);
    expect(useSearchStore.getState().query).toBe('');
    expect(useSearchStore.getState().parsedQuery).toBeNull();
  });

  it('openSearchModal sets isSearchModalOpen to true', () => {
    useSearchStore.getState().openSearchModal();
    expect(useSearchStore.getState().isSearchModalOpen).toBe(true);
  });

  it('closeSearchModal sets isSearchModalOpen to false', () => {
    useSearchStore.getState().openSearchModal();
    useSearchStore.getState().closeSearchModal();
    expect(useSearchStore.getState().isSearchModalOpen).toBe(false);
  });

  it('closeSearchModal does NOT clear query', () => {
    useSearchStore.getState().setQuery('iran');
    useSearchStore.getState().openSearchModal();
    useSearchStore.getState().closeSearchModal();
    expect(useSearchStore.getState().query).toBe('iran');
  });

  it('applyAsFilter sets isFilterMode and closes modal', () => {
    useSearchStore.getState().setQuery('iran');
    useSearchStore.getState().openSearchModal();
    useSearchStore.getState().applyAsFilter();
    const s = useSearchStore.getState();
    expect(s.isFilterMode).toBe(true);
    expect(s.isSearchModalOpen).toBe(false);
    expect(s.query).toBe('iran'); // query preserved
  });

  it('applyAsFilter saves recent tags from parsedQuery', () => {
    useSearchStore.getState().setQuery('type:flight country:iran');
    useSearchStore.getState().applyAsFilter();
    const { recentTags } = useSearchStore.getState();
    expect(recentTags).toContain('type:flight');
    expect(recentTags).toContain('country:iran');
  });

  it('applyAsFilter deduplicates recent tags', () => {
    useSearchStore.setState({ recentTags: ['type:flight'] });
    useSearchStore.getState().setQuery('type:flight country:iran');
    useSearchStore.getState().applyAsFilter();
    const { recentTags } = useSearchStore.getState();
    // type:flight appears only once
    expect(recentTags.filter((t) => t === 'type:flight')).toHaveLength(1);
  });

  it('applyAsFilter keeps max 5 recent tags', () => {
    useSearchStore.setState({ recentTags: ['a:1', 'b:2', 'c:3', 'd:4'] });
    useSearchStore.getState().setQuery('e:5 f:6');
    useSearchStore.getState().applyAsFilter();
    const { recentTags } = useSearchStore.getState();
    expect(recentTags.length).toBeLessThanOrEqual(5);
  });

  it('applyAsFilter persists recent tags to localStorage', () => {
    useSearchStore.getState().setQuery('type:flight');
    useSearchStore.getState().applyAsFilter();
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'recentSearchTags',
      expect.stringContaining('type:flight'),
    );
  });

  it('clearSearch resets query, parsedQuery, isFilterMode, and matchedIds', () => {
    useSearchStore.getState().setQuery('type:flight');
    useSearchStore.getState().applyAsFilter();
    useSearchStore.getState().setMatchedIds(new Set(['a', 'b']));
    useSearchStore.getState().clearSearch();
    const s = useSearchStore.getState();
    expect(s.query).toBe('');
    expect(s.parsedQuery).toBeNull();
    expect(s.isFilterMode).toBe(false);
    expect(s.matchedIds.size).toBe(0);
  });

  it('clearSearch preserves recentTags', () => {
    useSearchStore.getState().setQuery('type:flight');
    useSearchStore.getState().applyAsFilter();
    const tagsBefore = useSearchStore.getState().recentTags;
    useSearchStore.getState().clearSearch();
    expect(useSearchStore.getState().recentTags).toEqual(tagsBefore);
  });

  it('localStorage round-trip for recentTags', () => {
    // Simulate localStorage returning stored tags
    localStorageMock.getItem.mockReturnValueOnce(JSON.stringify(['type:ship', 'country:iraq']));
    // The loadRecentTags function is called at store creation time; we test the save path instead
    useSearchStore.getState().setQuery('type:ship');
    useSearchStore.getState().applyAsFilter();
    expect(localStorageMock.setItem).toHaveBeenCalledWith('recentSearchTags', expect.any(String));
    const savedValue = localStorageMock.setItem.mock.calls.find(
      (c: string[]) => c[0] === 'recentSearchTags',
    );
    expect(savedValue).toBeDefined();
    const parsed = JSON.parse(savedValue![1]);
    expect(parsed).toContain('type:ship');
  });
});

describe('searchUtils.getSearchableFields', () => {
  it('returns flight fields (label, icao24, originCountry)', () => {
    const fields = getSearchableFields(mockFlight);
    expect(fields).toContain('ira123');
    expect(fields).toContain('abc123');
    expect(fields).toContain('iran');
  });

  it('returns ship fields (label, mmsi, shipName)', () => {
    const fields = getSearchableFields(mockShip);
    expect(fields).toContain('persian gulf');
    expect(fields).toContain('123456789');
  });

  it('returns event fields (label, type, actor1, actor2, locationName)', () => {
    const fields = getSearchableFields(mockEvent);
    expect(fields).toContain('airstrike near baghdad');
    expect(fields).toContain('airstrike');
    expect(fields).toContain('iran');
    expect(fields).toContain('united states');
    expect(fields).toContain('baghdad, iraq');
  });

  it('returns site fields (label, siteType, operator)', () => {
    const fields = getSearchableFields(mockSite);
    expect(fields).toContain('isfahan nuclear facility');
    expect(fields).toContain('nuclear');
    expect(fields).toContain('aeoi');
  });
});

describe('searchUtils.searchEntities', () => {
  const entities = [mockFlight, mockShip, mockEvent, mockSite];

  it('returns empty array for empty query', () => {
    expect(searchEntities('', entities)).toEqual([]);
  });

  it('returns empty array for whitespace query', () => {
    expect(searchEntities('   ', entities)).toEqual([]);
  });

  it('matches flight by originCountry (case-insensitive)', () => {
    const results = searchEntities('Iran', [mockFlight]);
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe(mockFlight);
  });

  it('matches ship by name', () => {
    const results = searchEntities('persian', [mockShip]);
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe(mockShip);
  });

  it('matches event by actor', () => {
    const results = searchEntities('united states', [mockEvent]);
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe(mockEvent);
  });

  it('matches site by label', () => {
    const results = searchEntities('isfahan', [mockSite]);
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe(mockSite);
  });

  it('returns multiple matches across entity types', () => {
    // "iran" matches flight (originCountry) and event (actor1)
    const results = searchEntities('iran', entities);
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('returns no matches for non-matching query', () => {
    expect(searchEntities('nonexistent', entities)).toHaveLength(0);
  });
});

describe('filterStore.clearAll clears search state', () => {
  beforeEach(() => {
    useFilterStore.getState().clearAll();
    useSearchStore.getState().clearSearch();
  });

  it('clearAll also calls searchStore.clearSearch', () => {
    useSearchStore.getState().setQuery('iran');
    useSearchStore.getState().applyAsFilter();
    useSearchStore.getState().setMatchedIds(new Set(['a']));

    // Now call filterStore.clearAll
    useFilterStore.getState().clearAll();

    const s = useSearchStore.getState();
    expect(s.query).toBe('');
    expect(s.isFilterMode).toBe(false);
    expect(s.matchedIds.size).toBe(0);
  });
});
