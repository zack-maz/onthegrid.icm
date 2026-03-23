import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { PoliticalOverlay } from '@/components/map/layers/PoliticalOverlay';
import {
  FACTION_MAP,
  FACTIONS,
  COUNTRIES_GEOJSON,
  DISPUTED_GEOJSON,
} from '@/components/map/layers/politicalData';
import type { FactionId } from '@/components/map/layers/politicalData';
import { useLayerStore } from '@/stores/layerStore';

// Note: Canvas-based pattern tests (createHatchPattern, createDualHatchPattern)
// are skipped in jsdom because document.createElement('canvas').getContext('2d')
// returns null. Pattern rendering is verified visually in the browser.

describe('PoliticalOverlay', () => {
  beforeEach(() => {
    useLayerStore.setState({ activeLayers: new Set() });
  });

  it('renders nothing when political layer is inactive', () => {
    const { container } = render(<PoliticalOverlay />);
    expect(container.innerHTML).toBe('');
  });
});

describe('FACTION_MAP', () => {
  it('assigns all specified countries to correct factions', () => {
    expect(FACTION_MAP['IRN']).toBe('iran');
    expect(FACTION_MAP['SYR']).toBe('iran');
    expect(FACTION_MAP['YEM']).toBe('iran');
    expect(FACTION_MAP['ISR']).toBe('us');
    expect(FACTION_MAP['SAU']).toBe('us');
    expect(FACTION_MAP['EGY']).toBe('us');
    expect(FACTION_MAP['TUR']).toBe('turkic');
    expect(FACTION_MAP['AZE']).toBe('turkic');
    expect(FACTION_MAP['TKM']).toBe('turkic');
    expect(FACTION_MAP['IRQ']).toBe('contested_iran_us');
    expect(FACTION_MAP['LBN']).toBe('contested_iran_us');
    expect(FACTION_MAP['PAK']).toBe('contested_iran_china_us');
    expect(FACTION_MAP['OMN']).toBe('neutral');
    expect(FACTION_MAP['AFG']).toBe('neutral');
  });
});

describe('FACTIONS', () => {
  it('covers all 6 faction IDs', () => {
    const ids = FACTIONS.map((f) => f.id);
    const expected: FactionId[] = [
      'iran',
      'us',
      'turkic',
      'contested_iran_us',
      'contested_iran_china_us',
      'neutral',
    ];
    for (const factionId of expected) {
      expect(ids).toContain(factionId);
    }
    expect(ids).toHaveLength(6);
  });
});

describe('COUNTRIES_GEOJSON', () => {
  it('is a valid FeatureCollection with ADM0_A3 properties', () => {
    expect(COUNTRIES_GEOJSON.type).toBe('FeatureCollection');
    expect(COUNTRIES_GEOJSON.features.length).toBeGreaterThan(0);
    for (const feature of COUNTRIES_GEOJSON.features) {
      expect(typeof feature.properties.ADM0_A3).toBe('string');
      expect(feature.properties.ADM0_A3.length).toBe(3);
    }
  });
});

describe('DISPUTED_GEOJSON', () => {
  it('contains 7 disputed zones with name and minzoom', () => {
    expect(DISPUTED_GEOJSON.features).toHaveLength(7);
    for (const feature of DISPUTED_GEOJSON.features) {
      expect(typeof feature.properties.name).toBe('string');
      expect(feature.properties.name.length).toBeGreaterThan(0);
      expect(typeof feature.properties.minzoom).toBe('number');
    }
  });

  it('includes expected disputed zone names', () => {
    const names = DISPUTED_GEOJSON.features.map((f) => f.properties.name);
    expect(names).toContain('KURDISTAN');
    expect(names).toContain('GAZA & WEST BANK');
    expect(names).toContain('GOLAN HEIGHTS');
    expect(names).toContain('CRIMEA & E. UKRAINE');
    expect(names).toContain('NAGORNO-KARABAKH');
    expect(names).toContain('KHUZESTAN');
    expect(names).toContain('BALOCHISTAN');
  });

  it('has correct zoom thresholds per zone', () => {
    const byName = Object.fromEntries(
      DISPUTED_GEOJSON.features.map((f) => [f.properties.name, f.properties.minzoom]),
    );
    // Large zones at z5
    expect(byName['KURDISTAN']).toBe(5);
    expect(byName['CRIMEA & E. UKRAINE']).toBe(5);
    expect(byName['BALOCHISTAN']).toBe(5);
    // Smaller zones at z7
    expect(byName['GAZA & WEST BANK']).toBe(7);
    expect(byName['GOLAN HEIGHTS']).toBe(7);
    expect(byName['NAGORNO-KARABAKH']).toBe(7);
    expect(byName['KHUZESTAN']).toBe(7);
  });
});
