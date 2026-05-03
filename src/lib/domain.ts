/**
 * Domain-definitional constants (Phase 28.1 W5 D-11).
 *
 * "What this dashboard monitors." Single source of truth for the client tier.
 * NOT env-tunable per D-11. To change these is to change the dashboard's identity.
 *
 * Note on tier-bridging: server/config.ts maintains its own copies of these
 * constants because the server tsconfig (`include: ["server","api"]`) excludes
 * the src/ tree, so a cross-tier re-export is not buildable. To prevent
 * accidental drift, `server/__tests__/domainParity.test.ts` asserts byte-identity
 * between the two copies on every CI run. Editing any of these values here
 * REQUIRES the same edit to server/config.ts in the same commit.
 *
 * Drift note (surfaced 2026-05-01 in PATTERNS.md): ADSB_RADIUS_NM = 1200 in
 * code, CONTEXT D-11 referenced "500 NM". Code value is authoritative for
 * runtime; CLAUDE.md is updated in this same wave (W5 Task 3) to document the
 * actual value.
 */

export interface BoundingBox {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** Start of the US-Iran war — earliest date for historical event data */
export const WAR_START = Date.UTC(2026, 1, 28); // Feb 28, 2026 00:00Z

/** Greater Middle East + Mediterranean + Arabian Sea — full visible map area */
export const IRAN_BBOX: BoundingBox = {
  south: 0.0,
  north: 50.0,
  west: 20.0,
  east: 80.0,
};

/** adsb.lol center point for radius query (centered on region) */
export const IRAN_CENTER = { lat: 28.0, lon: 45.0 } as const;

/** ADS-B query radius in nautical miles. PRESERVED at 1200; see drift note above. */
export const ADSB_RADIUS_NM = 1200;
