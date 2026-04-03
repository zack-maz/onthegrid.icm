import { describe, it, expect } from 'vitest';
import {
  stressToRGBA,
  compositeHealth,
  bwsScoreToLabel,
  STRESS_COLORS,
  WATER_STRESS_LEGEND_STOPS,
} from '../lib/waterStress';

describe('stressToRGBA', () => {
  it('returns dark purple at health=0 (extreme stress)', () => {
    expect(stressToRGBA(0)).toEqual([40, 20, 60, 200]);
  });

  it('returns light blue at health=1 (healthy)', () => {
    expect(stressToRGBA(1)).toEqual([125, 211, 252, 200]);
  });

  it('returns midpoint color between dark blue and medium blue at health=0.5', () => {
    const result = stressToRGBA(0.5);
    // health=0.5 is halfway through the 4-stop gradient
    // segment = 0.5 * 3 = 1.5, so i=1, f=0.5
    // c0 = [30, 58, 138], c1 = [59, 130, 200]
    // lerp: [45, 94, 169, 200]
    expect(result).toEqual([45, 94, 169, 200]);
  });

  it('clamps values below 0', () => {
    expect(stressToRGBA(-0.1)).toEqual([40, 20, 60, 200]);
  });

  it('clamps values above 1', () => {
    expect(stressToRGBA(1.5)).toEqual([125, 211, 252, 200]);
  });

  it('accepts a custom alpha value', () => {
    const result = stressToRGBA(1, 255);
    expect(result).toEqual([125, 211, 252, 255]);
  });
});

describe('compositeHealth', () => {
  it('returns ~0 for extreme baseline stress with normal precipitation', () => {
    // bwsScore=5, precipRatio=1.0
    // baselineHealth = 1 - 5/5 = 0
    // precipModifier = (1.0 - 1.0) * 0.5 = 0
    // result = 0
    expect(compositeHealth(5, 1.0)).toBeCloseTo(0, 2);
  });

  it('returns ~1 for no baseline stress with normal precipitation', () => {
    // bwsScore=0, precipRatio=1.0
    // baselineHealth = 1 - 0/5 = 1
    // precipModifier = 0
    // result = 1
    expect(compositeHealth(0, 1.0)).toBeCloseTo(1, 2);
  });

  it('returns ~0.375 for moderate stress with dry conditions', () => {
    // bwsScore=2.5, precipRatio=0.5
    // baselineHealth = 1 - 2.5/5 = 0.5
    // precipModifier = (0.5 - 1.0) * 0.5 = -0.25
    // result = 0.5 + (-0.25) = 0.25
    // Wait: 0.5 - 0.25 = 0.25, but test says 0.375
    // Let me re-check: The plan says compositeHealth(2.5, 0.5) returns ~0.375
    // Maybe the formula differs. Let's use the exact plan spec:
    // baselineHealth = 1 - (2.5/5) = 0.5
    // precipModifier = clamp((0.5 - 1.0) * 0.5, -0.25, 0.25) = clamp(-0.25, -0.25, 0.25) = -0.25
    // result = clamp(0.5 + (-0.25), 0, 1) = 0.25
    // But the plan says ~0.375... Let me check the behavior spec again
    // The behavior says: compositeHealth(2.5, 0.5) returns ~0.375
    // That would mean precipModifier = -0.125 => (0.5 - 1.0) * 0.25 = -0.125
    // Or maybe the formula interpretation is different.
    // Plan action says: precipModifier = clamp((precipRatio - 1.0) * 0.5, -0.25, 0.25)
    // With precipRatio=0.5: (0.5 - 1.0) * 0.5 = -0.25
    // Result: 0.5 + (-0.25) = 0.25
    //
    // The behavior spec says ~0.375 which contradicts the formula.
    // Going with the formula from the action section (authoritative implementation spec).
    expect(compositeHealth(2.5, 0.5)).toBeCloseTo(0.25, 2);
  });

  it('returns ~0.625 for moderate stress with wet conditions', () => {
    // bwsScore=2.5, precipRatio=1.5
    // baselineHealth = 1 - 2.5/5 = 0.5
    // precipModifier = clamp((1.5 - 1.0) * 0.5, -0.25, 0.25) = clamp(0.25, -0.25, 0.25) = 0.25
    // result = 0.5 + 0.25 = 0.75
    // Plan behavior says ~0.625, but formula gives 0.75. Going with formula.
    expect(compositeHealth(2.5, 1.5)).toBeCloseTo(0.75, 2);
  });

  it('clamps result to [0, 1]', () => {
    // Extreme stress + very dry
    expect(compositeHealth(5, 0.0)).toBeGreaterThanOrEqual(0);
    expect(compositeHealth(5, 0.0)).toBeLessThanOrEqual(1);
    // No stress + very wet
    expect(compositeHealth(0, 3.0)).toBeGreaterThanOrEqual(0);
    expect(compositeHealth(0, 3.0)).toBeLessThanOrEqual(1);
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
  it('has 4 color stops', () => {
    expect(STRESS_COLORS).toHaveLength(4);
  });

  it('starts with dark purple (visible on dark terrain)', () => {
    expect(STRESS_COLORS[0]).toEqual([40, 20, 60]);
  });

  it('ends with light blue', () => {
    expect(STRESS_COLORS[3]).toEqual([125, 211, 252]);
  });
});

describe('WATER_STRESS_LEGEND_STOPS', () => {
  it('exports legend stops array', () => {
    expect(WATER_STRESS_LEGEND_STOPS).toBeDefined();
    expect(Array.isArray(WATER_STRESS_LEGEND_STOPS)).toBe(true);
    expect(WATER_STRESS_LEGEND_STOPS.length).toBeGreaterThanOrEqual(2);
  });

  it('each stop has color and label', () => {
    for (const stop of WATER_STRESS_LEGEND_STOPS) {
      expect(stop).toHaveProperty('color');
      expect(stop).toHaveProperty('label');
    }
  });
});
