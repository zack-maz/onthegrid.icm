// @vitest-environment node
import { describe, it, expect } from 'vitest';

import {
  FACILITY_TYPE_LABELS,
  type WaterFacility,
  type WaterStressIndicators,
} from '../../../server/types';
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
});
