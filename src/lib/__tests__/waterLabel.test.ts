// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  FACILITY_TYPE_LABELS,
  type WaterFacility,
  type WaterStressIndicators,
} from '../../../server/types';
import { getSearchableFields, searchEntities } from '../searchUtils';
import { getWaterFacilityDisplayName } from '../waterLabel';

const stubStress: WaterStressIndicators = {
  bws_raw: 0,
  bws_score: 0,
  bws_label: 'Low',
  drr_score: 0,
  gtd_score: 0,
  sev_score: 0,
  iav_score: 0,
  compositeHealth: 0.8,
};

function makeFacility(overrides: Partial<WaterFacility>): WaterFacility {
  return {
    id: 'water-test',
    type: 'water',
    facilityType: 'dam',
    lat: 35.7,
    lng: 51.4,
    label: '',
    osmId: 1,
    stress: stubStress,
    // WATER-LATIN-04: nameLatin / nameOriginal are optional — undefined here,
    // overridable per-test to exercise the romanized-name display path.
    ...overrides,
  };
}

describe('getWaterFacilityDisplayName (Phase 27.3.2 — server-owned labels)', () => {
  it('returns trimmed facility.label when present (Latin-named facility)', () => {
    const f = makeFacility({ facilityType: 'dam', label: 'Mosul Dam' });
    expect(getWaterFacilityDisplayName(f)).toBe('Mosul Dam');
  });

  it('returns FACILITY_TYPE_LABELS fallback when label is empty (defensive)', () => {
    const f = makeFacility({ facilityType: 'reservoir', label: '' });
    expect(getWaterFacilityDisplayName(f)).toBe(FACILITY_TYPE_LABELS.reservoir);
  });

  it('passes synthesized desal label through unchanged', () => {
    const f = makeFacility({
      facilityType: 'desalination',
      label: 'Desalination Plant near Jeddah',
    });
    expect(getWaterFacilityDisplayName(f)).toBe('Desalination Plant near Jeddah');
  });

  // WATER-LATIN-04: the romanized token lives in `label` (set server-side from
  // the synthetic name:en); the original is preserved in `nameOriginal`.
  it('displays the romanized label for a previously non-Latin facility', () => {
    const f = makeFacility({
      facilityType: 'dam',
      label: 'Sd Lmwsl', // romanized "سد الموصل"
      nameLatin: 'Sd Lmwsl',
      nameOriginal: 'سد الموصل',
    });
    expect(getWaterFacilityDisplayName(f)).toBe('Sd Lmwsl');
    // The original is reachable for hover/sub-label display.
    expect(f.nameOriginal).toBe('سد الموصل');
  });
});

describe('searchUtils — nameLatin / nameOriginal indexing (WATER-LATIN-04)', () => {
  const romanizedFacility = makeFacility({
    id: 'water-700001',
    facilityType: 'dam',
    label: 'Sd Lmwsl',
    nameLatin: 'Sd Lmwsl',
    nameOriginal: 'سد الموصل',
  });

  it('includes nameLatin + nameOriginal in the searchable fields', () => {
    const fields = getSearchableFields(romanizedFacility);
    expect(fields).toContain('sd lmwsl');
    expect(fields).toContain('سد الموصل');
  });

  it('matches a romanized-token query against a non-Latin facility', () => {
    const results = searchEntities('lmwsl', [romanizedFacility]);
    expect(results.length).toBe(1);
    expect(results[0]!.entity.id).toBe('water-700001');
  });

  it('matches the original non-Latin name query too', () => {
    const results = searchEntities('سد', [romanizedFacility]);
    expect(results.length).toBe(1);
    expect(results[0]!.entity.id).toBe('water-700001');
  });
});
