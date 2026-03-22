import { beforeEach, describe, expect, it } from 'vitest';
import { useSearchStore } from '@/stores/searchStore';
import { useFilterStore } from '@/stores/filterStore';
import { searchEntities, getSearchableFields } from '@/lib/searchUtils';
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
    useSearchStore.setState({ isSearchModalOpen: false });
  });

  it('setQuery sets query', () => {
    useSearchStore.getState().setQuery('iran');
    expect(useSearchStore.getState().query).toBe('iran');
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

  it('clearSearch resets query, isFilterMode, and matchedIds', () => {
    useSearchStore.getState().setQuery('iran');
    useSearchStore.getState().applyAsFilter();
    useSearchStore.getState().setMatchedIds(new Set(['a', 'b']));
    useSearchStore.getState().clearSearch();
    const s = useSearchStore.getState();
    expect(s.query).toBe('');
    expect(s.isFilterMode).toBe(false);
    expect(s.matchedIds.size).toBe(0);
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
