import { describe, it, expect, beforeEach } from 'vitest';
import { altitudeToOpacity, ENTITY_COLORS, ICON_SIZE, PULSE_CONFIG } from '@/components/map/layers/constants';
import { ICON_MAPPING } from '@/components/map/layers/icons';
import { useUIStore } from '@/stores/uiStore';

describe('Entity Layer Constants', () => {
  describe('altitudeToOpacity', () => {
    it('returns 0.6 for null altitude', () => {
      expect(altitudeToOpacity(null)).toBe(0.6);
    });

    it('returns 0.6 for altitude 0', () => {
      expect(altitudeToOpacity(0)).toBe(0.6);
    });

    it('returns 1.0 for altitude at ceiling (13000m)', () => {
      expect(altitudeToOpacity(13000)).toBe(1.0);
    });

    it('returns ~0.8 for midpoint altitude (6500m)', () => {
      const result = altitudeToOpacity(6500);
      expect(result).toBeCloseTo(0.8, 1);
    });

    it('clamps to 1.0 for altitude above ceiling', () => {
      expect(altitudeToOpacity(20000)).toBe(1.0);
    });
  });

  describe('ENTITY_COLORS', () => {
    it('flight is green [34, 197, 94]', () => {
      expect(ENTITY_COLORS.flight).toEqual([34, 197, 94]);
    });

    it('flightUnidentified is yellow [234, 179, 8]', () => {
      expect(ENTITY_COLORS.flightUnidentified).toEqual([234, 179, 8]);
    });

    it('ship is blue [59, 130, 246]', () => {
      expect(ENTITY_COLORS.ship).toEqual([59, 130, 246]);
    });

    it('drone is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.drone).toEqual([239, 68, 68]);
    });

    it('missile is red [239, 68, 68]', () => {
      expect(ENTITY_COLORS.missile).toEqual([239, 68, 68]);
    });
  });

  describe('ICON_SIZE', () => {
    it('flight is 14', () => {
      expect(ICON_SIZE.flight).toBe(14);
    });

    it('ship is 12', () => {
      expect(ICON_SIZE.ship).toBe(12);
    });

    it('drone is 14', () => {
      expect(ICON_SIZE.drone).toBe(14);
    });

    it('missile is 14', () => {
      expect(ICON_SIZE.missile).toBe(14);
    });
  });

  describe('PULSE_CONFIG', () => {
    it('has correct pulse configuration', () => {
      expect(PULSE_CONFIG.minOpacity).toBe(0.7);
      expect(PULSE_CONFIG.maxOpacity).toBe(1.0);
      expect(PULSE_CONFIG.periodMs).toBe(2000);
    });
  });
});

describe('Icon Mapping', () => {
  const expectedKeys = ['chevron', 'diamond', 'starburst', 'xmark'] as const;

  it('has all 4 icon keys', () => {
    expect(Object.keys(ICON_MAPPING).sort()).toEqual([...expectedKeys].sort());
  });

  for (const key of expectedKeys) {
    it(`${key} has mask: true`, () => {
      expect(ICON_MAPPING[key].mask).toBe(true);
    });

    it(`${key} has x, y, width, height properties`, () => {
      const entry = ICON_MAPPING[key];
      expect(entry).toHaveProperty('x');
      expect(entry).toHaveProperty('y');
      expect(entry).toHaveProperty('width', 32);
      expect(entry).toHaveProperty('height', 32);
    });
  }
});

describe('uiStore pulseEnabled', () => {
  beforeEach(() => {
    useUIStore.setState({
      isDetailPanelOpen: false,
      isCountersCollapsed: false,
      isFiltersExpanded: false,
      pulseEnabled: true,
    });
  });

  it('defaults pulseEnabled to true', () => {
    expect(useUIStore.getState().pulseEnabled).toBe(true);
  });

  it('togglePulse flips pulseEnabled', () => {
    expect(useUIStore.getState().pulseEnabled).toBe(true);
    useUIStore.getState().togglePulse();
    expect(useUIStore.getState().pulseEnabled).toBe(false);
    useUIStore.getState().togglePulse();
    expect(useUIStore.getState().pulseEnabled).toBe(true);
  });
});
