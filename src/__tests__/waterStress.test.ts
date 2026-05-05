import { describe, it, expect } from 'vitest';

import {
  stressToRGBA,
  compositeHealth,
  healthToScore,
  scoreToLabel,
  bwsScoreToLabel,
  STRESS_COLORS,
  WATER_STRESS_LEGEND_STOPS,
} from '../lib/waterStress';

describe('stressToRGBA', () => {
  it('returns deep navy at health=0 (extreme stress)', () => {
    expect(stressToRGBA(0)).toEqual([10, 20, 60, 200]);
  });

  it('returns light blue at health=1 (healthy)', () => {
    expect(stressToRGBA(1)).toEqual([140, 210, 250, 200]);
  });

  it('returns midpoint color at health=0.5', () => {
    const result = stressToRGBA(0.5);
    // health=0.5 is halfway through the 5-stop gradient
    // segment = 0.5 * 4 = 2.0, so i=2, f=0.0
    // c0 = [40, 100, 180], c1 = [80, 160, 220]
    // lerp at f=0: [40, 100, 180, 200]
    expect(result).toEqual([40, 100, 180, 200]);
  });

  it('clamps values below 0', () => {
    expect(stressToRGBA(-0.1)).toEqual([10, 20, 60, 200]);
  });

  it('clamps values above 1', () => {
    expect(stressToRGBA(1.5)).toEqual([140, 210, 250, 200]);
  });

  it('accepts a custom alpha value', () => {
    const result = stressToRGBA(1, 255);
    expect(result).toEqual([140, 210, 250, 255]);
  });
});

describe('compositeHealth', () => {
  it('returns ~0 for extreme baseline stress with normal precipitation', () => {
    expect(compositeHealth(5, 1.0)).toBeCloseTo(0, 2);
  });

  it('returns ~1 for no baseline stress with normal precipitation', () => {
    expect(compositeHealth(0, 1.0)).toBeCloseTo(1, 2);
  });

  it('precipitation flow-through: dry conditions lower score', () => {
    // compositeHealth(3, 0.5) < compositeHealth(3, 1.0)
    const dry = compositeHealth(3, 0.5);
    const normal = compositeHealth(3, 1.0);
    expect(dry).toBeLessThan(normal);
  });

  it('precipitation flow-through: wet conditions raise score', () => {
    // compositeHealth(3, 1.5) > compositeHealth(3, 1.0)
    const wet = compositeHealth(3, 1.5);
    const normal = compositeHealth(3, 1.0);
    expect(wet).toBeGreaterThan(normal);
  });

  it('clamps result to [0, 1]', () => {
    expect(compositeHealth(5, 0.0)).toBeGreaterThanOrEqual(0);
    expect(compositeHealth(5, 0.0)).toBeLessThanOrEqual(1);
    expect(compositeHealth(0, 3.0)).toBeGreaterThanOrEqual(0);
    expect(compositeHealth(0, 3.0)).toBeLessThanOrEqual(1);
  });
});

describe('healthToScore', () => {
  it('returns 1 for health=0 (not 0 -- score 0 is destroyed, applied externally)', () => {
    expect(healthToScore(0)).toBe(1);
  });

  it('returns 10 for health=1', () => {
    expect(healthToScore(1)).toBe(10);
  });

  it('returns intermediate scores for intermediate health values', () => {
    expect(healthToScore(0.5)).toBeGreaterThanOrEqual(4);
    expect(healthToScore(0.5)).toBeLessThanOrEqual(6);
  });
});

describe('scoreToLabel', () => {
  it('returns "Destroyed" for score 0', () => {
    expect(scoreToLabel(0)).toBe('Destroyed');
  });

  it('returns "Extreme Stress" for scores 1-2', () => {
    expect(scoreToLabel(1)).toBe('Extreme Stress');
    expect(scoreToLabel(2)).toBe('Extreme Stress');
  });

  it('returns "High Stress" for scores 3-4', () => {
    expect(scoreToLabel(3)).toBe('High Stress');
    expect(scoreToLabel(4)).toBe('High Stress');
  });

  it('returns "Moderate" for scores 5-6', () => {
    expect(scoreToLabel(5)).toBe('Moderate');
    expect(scoreToLabel(6)).toBe('Moderate');
  });

  it('returns "Good" for scores 7-8', () => {
    expect(scoreToLabel(7)).toBe('Good');
    expect(scoreToLabel(8)).toBe('Good');
  });

  it('returns "Healthy" for scores 9-10', () => {
    expect(scoreToLabel(9)).toBe('Healthy');
    expect(scoreToLabel(10)).toBe('Healthy');
  });
});

describe('bwsScoreToLabel', () => {
  it('returns "Low" for score 0-1', () => {
    expect(bwsScoreToLabel(0)).toBe('Low');
    expect(bwsScoreToLabel(0.5)).toBe('Low');
    expect(bwsScoreToLabel(0.99)).toBe('Low');
  });

  it('returns "Low-Medium" for score 1-2', () => {
    expect(bwsScoreToLabel(1)).toBe('Low-Medium');
    expect(bwsScoreToLabel(1.5)).toBe('Low-Medium');
  });

  it('returns "Medium-High" for score 2-3', () => {
    expect(bwsScoreToLabel(2)).toBe('Medium-High');
    expect(bwsScoreToLabel(2.9)).toBe('Medium-High');
  });

  it('returns "High" for score 3-4', () => {
    expect(bwsScoreToLabel(3)).toBe('High');
    expect(bwsScoreToLabel(3.5)).toBe('High');
  });

  it('returns "Extremely High" for score 4-5', () => {
    expect(bwsScoreToLabel(4)).toBe('Extremely High');
    expect(bwsScoreToLabel(5)).toBe('Extremely High');
  });
});

describe('STRESS_COLORS', () => {
  it('has 5 color stops', () => {
    expect(STRESS_COLORS).toHaveLength(5);
  });

  it('starts with deep navy (extreme stress)', () => {
    expect(STRESS_COLORS[0]).toEqual([10, 20, 60]);
  });

  it('ends with light blue (healthy)', () => {
    expect(STRESS_COLORS[4]).toEqual([140, 210, 250]);
  });
});

describe('WATER_STRESS_LEGEND_STOPS', () => {
  it('exports legend stops array with at least 3 entries', () => {
    expect(WATER_STRESS_LEGEND_STOPS).toBeDefined();
    expect(Array.isArray(WATER_STRESS_LEGEND_STOPS)).toBe(true);
    expect(WATER_STRESS_LEGEND_STOPS.length).toBeGreaterThanOrEqual(3);
  });

  it('each stop has color and label', () => {
    for (const stop of WATER_STRESS_LEGEND_STOPS) {
      expect(stop).toHaveProperty('color');
      expect(stop).toHaveProperty('label');
    }
  });

  it('includes Destroyed entry with deep dark purple color', () => {
    const destroyedStop = WATER_STRESS_LEGEND_STOPS.find((s) => s.label.includes('Destroyed'));
    expect(destroyedStop).toBeDefined();
    expect(destroyedStop!.color).toBe('#2d0a4e');
  });

  it('first stop is the Destroyed entry', () => {
    expect(WATER_STRESS_LEGEND_STOPS[0].label).toContain('Destroyed');
    expect(WATER_STRESS_LEGEND_STOPS[0].color).toBe('#2d0a4e');
  });
});
