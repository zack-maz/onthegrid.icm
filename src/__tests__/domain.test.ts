import { describe, it, expect } from 'vitest';
import { IRAN_BBOX, IRAN_CENTER, WAR_START, ADSB_RADIUS_NM } from '@/lib/domain';
import {
  IRAN_BBOX as SERVER_IRAN_BBOX,
  IRAN_CENTER as SERVER_IRAN_CENTER,
  WAR_START as SERVER_WAR_START,
  ADSB_RADIUS_NM as SERVER_ADSB_RADIUS_NM,
} from '../../server/config';

/**
 * Phase 28.1 W5 D-11 — domain-constant byte-identity tests.
 *
 * These constants define "what this dashboard monitors." They are intentionally
 * NOT env-tunable. The values asserted here must match the runtime behavior
 * preserved through Phase 28.1 — any drift requires an explicit decision in a
 * later phase, not a silent cleanup change.
 *
 * Tier-bridging note: server/config.ts maintains its own copies of these
 * constants because the server tsconfig (`include: ["server","api"]`) excludes
 * the src/ tree. The parity-test block below is the drift sentinel — it fails
 * loudly if either copy is edited without the other.
 */
describe('src/lib/domain — domain-definitional constants (D-11)', () => {
  it('IRAN_BBOX matches Greater Middle East + Mediterranean + Arabian Sea coverage', () => {
    expect(IRAN_BBOX).toEqual({ south: 0.0, north: 50.0, west: 20.0, east: 80.0 });
  });

  it('IRAN_CENTER is the (28.0, 45.0) regional center for ADS-B radius queries', () => {
    expect(IRAN_CENTER).toEqual({ lat: 28.0, lon: 45.0 });
  });

  it('WAR_START is Feb 28, 2026 00:00 UTC (US-Iran war start)', () => {
    expect(WAR_START).toBe(Date.UTC(2026, 1, 28));
  });

  it('ADSB_RADIUS_NM is 1200 — preserved from pre-W5 runtime; see drift note in domain.ts', () => {
    // Drift note: prior CLAUDE.md drafts said 500 NM. Code value (1200) is
    // authoritative for runtime; CLAUDE.md is updated in this same wave.
    expect(ADSB_RADIUS_NM).toBe(1200);
  });
});

describe('src/lib/domain ↔ server/config parity (D-11 drift sentinel)', () => {
  it('IRAN_BBOX is byte-identical across tiers', () => {
    expect(IRAN_BBOX).toEqual(SERVER_IRAN_BBOX);
  });

  it('IRAN_CENTER is byte-identical across tiers', () => {
    expect(IRAN_CENTER).toEqual(SERVER_IRAN_CENTER);
  });

  it('WAR_START is byte-identical across tiers', () => {
    expect(WAR_START).toBe(SERVER_WAR_START);
  });

  it('ADSB_RADIUS_NM is byte-identical across tiers', () => {
    expect(ADSB_RADIUS_NM).toBe(SERVER_ADSB_RADIUS_NM);
  });
});
