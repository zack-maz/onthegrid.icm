import { describe, expect, it } from 'vitest';

import { haversineKm } from '@/lib/geo';

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
  });

  it('returns ~111.19 km for 1 degree longitude at equator', () => {
    const dist = haversineKm(0, 0, 0, 1);
    expect(dist).toBeCloseTo(111.19, 0);
  });

  it('calculates Tehran to Isfahan as ~417 km', () => {
    const dist = haversineKm(35.6762, 51.4241, 32.4279, 53.688);
    expect(dist).toBeCloseTo(417, 0);
  });

  it('is symmetric (A->B equals B->A)', () => {
    const ab = haversineKm(35.6762, 51.4241, 32.4279, 53.688);
    const ba = haversineKm(32.4279, 53.688, 35.6762, 51.4241);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('handles antipodal points (~20015 km half circumference)', () => {
    const dist = haversineKm(0, 0, 0, 180);
    expect(dist).toBeCloseTo(20015, -1);
  });
});
