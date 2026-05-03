/**
 * Phase 28.1 W6 D-13 — colorBridge module-load CSS-var reader tests.
 *
 * Test design:
 * - jsdom does NOT compute styles for `:root` CSS vars by default, so all
 *   `getComputedStyle(...).getPropertyValue('--color-*')` reads return ''
 *   (empty string), exercising the fallback path on every export.
 * - Tests assert: (a) every export is a well-shaped tuple/hex, (b) the
 *   fallback values are byte-identical to the previous runtime literals in
 *   `src/components/map/layers/constants.ts ENTITY_COLORS` and
 *   `src/lib/factions.ts FACTION_COLORS` and `src/lib/ethnicGroups.ts`.
 *
 * If a fallback default in colorBridge.ts ever drifts (e.g., a copy-paste
 * error changes `[234, 179, 8]` → `[200, 150, 0]`), the byte-identity tests
 * here fail at the next `vitest run` — this is the W6 D-13 "no silent
 * runtime drift" sentinel.
 */
import { describe, it, expect } from 'vitest';
import * as bridge from '@/lib/colorBridge';
import { ENTITY_COLORS, ENTITY_DOT_COLORS } from '@/components/map/layers/constants';
import { FACTION_COLORS } from '@/lib/factions';
import { ETHNIC_GROUPS } from '@/lib/ethnicGroups';

describe('colorBridge', () => {
  describe('RGBA tuple shape', () => {
    const rgbaExports = [
      'COLOR_FLIGHT',
      'COLOR_FLIGHT_UNIDENTIFIED',
      'COLOR_SHIP',
      'COLOR_EVENT_AIRSTRIKE',
      'COLOR_EVENT_ON_GROUND',
      'COLOR_EVENT_EXPLOSION',
      'COLOR_EVENT_TARGETED',
      'COLOR_EVENT_OTHER',
      'COLOR_SITE_HEALTHY',
      'COLOR_SITE_ATTACKED',
      'COLOR_FACTION_US_ALIGNED',
      'COLOR_FACTION_IRAN_ALIGNED',
      'COLOR_FACTION_NEUTRAL',
      'COLOR_FACTION_DISPUTED',
      'COLOR_ETHNIC_KURDISH',
      'COLOR_ETHNIC_ARAB',
      'COLOR_ETHNIC_PERSIAN',
      'COLOR_ETHNIC_BALOCH',
      'COLOR_ETHNIC_TURKMEN',
      'COLOR_ETHNIC_DRUZE',
      'COLOR_ETHNIC_ALAWITE',
      'COLOR_ETHNIC_YAZIDI',
      'COLOR_ETHNIC_ASSYRIAN',
      'COLOR_ETHNIC_PASHTUN',
    ] as const;

    it.each(rgbaExports)('%s is a 3-tuple of bytes 0-255', (name) => {
      const tuple = (bridge as Record<string, unknown>)[name] as number[];
      expect(Array.isArray(tuple)).toBe(true);
      expect(tuple).toHaveLength(3);
      for (const channel of tuple) {
        expect(Number.isInteger(channel)).toBe(true);
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    });
  });

  describe('hex string shape', () => {
    const hexExports = [
      'COLOR_FLIGHT_HEX',
      'COLOR_FLIGHT_UNIDENTIFIED_HEX',
      'COLOR_SHIP_HEX',
      'COLOR_EVENT_AIRSTRIKE_HEX',
      'COLOR_EVENT_ON_GROUND_HEX',
      'COLOR_EVENT_EXPLOSION_HEX',
      'COLOR_EVENT_TARGETED_HEX',
      'COLOR_EVENT_OTHER_HEX',
      'COLOR_SITE_HEALTHY_HEX',
      'COLOR_SITE_ATTACKED_HEX',
      'COLOR_FACTION_US_ALIGNED_HEX',
      'COLOR_FACTION_IRAN_ALIGNED_HEX',
      'COLOR_FACTION_NEUTRAL_HEX',
      'COLOR_FACTION_DISPUTED_HEX',
      'COLOR_ETHNIC_KURDISH_HEX',
      'COLOR_ETHNIC_ARAB_HEX',
      'COLOR_ETHNIC_PERSIAN_HEX',
      'COLOR_ETHNIC_BALOCH_HEX',
      'COLOR_ETHNIC_TURKMEN_HEX',
      'COLOR_ETHNIC_DRUZE_HEX',
      'COLOR_ETHNIC_ALAWITE_HEX',
      'COLOR_ETHNIC_YAZIDI_HEX',
      'COLOR_ETHNIC_ASSYRIAN_HEX',
      'COLOR_ETHNIC_PASHTUN_HEX',
    ] as const;

    it.each(hexExports)('%s matches /^#[0-9a-f]{6}$/i', (name) => {
      const hex = (bridge as Record<string, unknown>)[name] as string;
      expect(typeof hex).toBe('string');
      expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  describe('byte-identity invariant — RGBA tuples match current runtime literals', () => {
    // Each assertion confirms a colorBridge fallback default matches the value
    // currently used at runtime (sourced from layers/constants.ts ENTITY_COLORS,
    // factions.ts FACTION_COLORS, and ethnicGroups.ts rgba). If any test fails,
    // the W6 migration would silently change runtime color — REVERT and surface.

    it('flight matches ENTITY_COLORS.flight', () => {
      expect(bridge.COLOR_FLIGHT).toEqual([...ENTITY_COLORS.flight]);
    });

    it('flightUnidentified matches ENTITY_COLORS.flightUnidentified (drift: D-13 spec was #ef4444; runtime is #ffff64 — runtime preserved)', () => {
      expect(bridge.COLOR_FLIGHT_UNIDENTIFIED).toEqual([...ENTITY_COLORS.flightUnidentified]);
    });

    it('ship matches ENTITY_COLORS.ship', () => {
      expect(bridge.COLOR_SHIP).toEqual([...ENTITY_COLORS.ship]);
    });

    it('event airstrike matches ENTITY_COLORS.airstrike', () => {
      expect(bridge.COLOR_EVENT_AIRSTRIKE).toEqual([...ENTITY_COLORS.airstrike]);
    });

    it('event on_ground matches ENTITY_COLORS.on_ground (drift: D-13 spec was #c0392b; runtime is #b43214 — runtime preserved)', () => {
      expect(bridge.COLOR_EVENT_ON_GROUND).toEqual([...ENTITY_COLORS.on_ground]);
    });

    it('event explosion matches ENTITY_COLORS.explosion (drift: D-13 spec was #e74c3c; runtime is #ff5f19 — runtime preserved)', () => {
      expect(bridge.COLOR_EVENT_EXPLOSION).toEqual([...ENTITY_COLORS.explosion]);
    });

    it('event targeted matches ENTITY_COLORS.targeted (drift: D-13 spec was #dc143c; runtime is #8b1e1e — runtime preserved)', () => {
      expect(bridge.COLOR_EVENT_TARGETED).toEqual([...ENTITY_COLORS.targeted]);
    });

    it('event other matches ENTITY_COLORS.other (drift: D-13 spec was #800000; runtime is #dc5a5a — runtime preserved)', () => {
      expect(bridge.COLOR_EVENT_OTHER).toEqual([...ENTITY_COLORS.other]);
    });

    it('site healthy matches ENTITY_COLORS.siteHealthy', () => {
      expect(bridge.COLOR_SITE_HEALTHY).toEqual([...ENTITY_COLORS.siteHealthy]);
    });

    it('site attacked matches ENTITY_COLORS.siteAttacked', () => {
      expect(bridge.COLOR_SITE_ATTACKED).toEqual([...ENTITY_COLORS.siteAttacked]);
    });
  });

  describe('byte-identity invariant — hex re-exports match current runtime literals', () => {
    it('flight hex matches ENTITY_DOT_COLORS.flights', () => {
      expect(bridge.COLOR_FLIGHT_HEX).toBe(ENTITY_DOT_COLORS.flights);
    });

    it('flightUnidentified hex matches ENTITY_DOT_COLORS.unidentified', () => {
      expect(bridge.COLOR_FLIGHT_UNIDENTIFIED_HEX).toBe(ENTITY_DOT_COLORS.unidentified);
    });

    it('ship hex matches ENTITY_DOT_COLORS.ships', () => {
      expect(bridge.COLOR_SHIP_HEX).toBe(ENTITY_DOT_COLORS.ships);
    });

    it('event airstrike hex matches ENTITY_DOT_COLORS.airstrikes', () => {
      expect(bridge.COLOR_EVENT_AIRSTRIKE_HEX).toBe(ENTITY_DOT_COLORS.airstrikes);
    });

    it('event on_ground hex matches ENTITY_DOT_COLORS.on_ground', () => {
      expect(bridge.COLOR_EVENT_ON_GROUND_HEX).toBe(ENTITY_DOT_COLORS.on_ground);
    });

    it('event explosion hex matches ENTITY_DOT_COLORS.explosion', () => {
      expect(bridge.COLOR_EVENT_EXPLOSION_HEX).toBe(ENTITY_DOT_COLORS.explosion);
    });

    it('event targeted hex matches ENTITY_DOT_COLORS.targeted', () => {
      expect(bridge.COLOR_EVENT_TARGETED_HEX).toBe(ENTITY_DOT_COLORS.targeted);
    });

    it('event other hex matches ENTITY_DOT_COLORS.other', () => {
      expect(bridge.COLOR_EVENT_OTHER_HEX).toBe(ENTITY_DOT_COLORS.other);
    });

    it('site healthy hex matches ENTITY_DOT_COLORS.siteHealthy', () => {
      expect(bridge.COLOR_SITE_HEALTHY_HEX).toBe(ENTITY_DOT_COLORS.siteHealthy);
    });

    it('site attacked hex matches ENTITY_DOT_COLORS.siteAttacked', () => {
      expect(bridge.COLOR_SITE_ATTACKED_HEX).toBe(ENTITY_DOT_COLORS.siteAttacked);
    });

    it('faction us-aligned hex matches FACTION_COLORS.us', () => {
      expect(bridge.COLOR_FACTION_US_ALIGNED_HEX).toBe(FACTION_COLORS.us);
    });

    it('faction iran-aligned hex matches FACTION_COLORS.iran', () => {
      expect(bridge.COLOR_FACTION_IRAN_ALIGNED_HEX).toBe(FACTION_COLORS.iran);
    });

    it('faction neutral hex matches FACTION_COLORS.neutral', () => {
      expect(bridge.COLOR_FACTION_NEUTRAL_HEX).toBe(FACTION_COLORS.neutral);
    });

    it('faction disputed hex is #f59e0b (D-13 spec; not consumed by FACTION_COLORS today)', () => {
      // Phase 24 disputed territories use this color via the political-disputed
      // GeoJSON layer, not via FACTION_COLORS. Bridge exports it for any
      // future consumer.
      expect(bridge.COLOR_FACTION_DISPUTED_HEX).toBe('#f59e0b');
    });

    it('ethnic kurdish hex matches ETHNIC_GROUPS.kurdish.color', () => {
      expect(bridge.COLOR_ETHNIC_KURDISH_HEX).toBe(ETHNIC_GROUPS.kurdish.color);
    });

    it('ethnic arab hex matches ETHNIC_GROUPS.arab.color', () => {
      expect(bridge.COLOR_ETHNIC_ARAB_HEX).toBe(ETHNIC_GROUPS.arab.color);
    });

    it('ethnic persian hex matches ETHNIC_GROUPS.persian.color', () => {
      expect(bridge.COLOR_ETHNIC_PERSIAN_HEX).toBe(ETHNIC_GROUPS.persian.color);
    });

    it('ethnic baloch hex matches ETHNIC_GROUPS.baloch.color', () => {
      expect(bridge.COLOR_ETHNIC_BALOCH_HEX).toBe(ETHNIC_GROUPS.baloch.color);
    });

    it('ethnic turkmen hex matches ETHNIC_GROUPS.turkmen.color', () => {
      expect(bridge.COLOR_ETHNIC_TURKMEN_HEX).toBe(ETHNIC_GROUPS.turkmen.color);
    });

    it('ethnic druze hex matches ETHNIC_GROUPS.druze.color', () => {
      expect(bridge.COLOR_ETHNIC_DRUZE_HEX).toBe(ETHNIC_GROUPS.druze.color);
    });

    it('ethnic alawite hex matches ETHNIC_GROUPS.alawite.color', () => {
      expect(bridge.COLOR_ETHNIC_ALAWITE_HEX).toBe(ETHNIC_GROUPS.alawite.color);
    });

    it('ethnic yazidi hex matches ETHNIC_GROUPS.yazidi.color', () => {
      expect(bridge.COLOR_ETHNIC_YAZIDI_HEX).toBe(ETHNIC_GROUPS.yazidi.color);
    });

    it('ethnic assyrian hex matches ETHNIC_GROUPS.assyrian.color', () => {
      expect(bridge.COLOR_ETHNIC_ASSYRIAN_HEX).toBe(ETHNIC_GROUPS.assyrian.color);
    });

    it('ethnic pashtun hex matches ETHNIC_GROUPS.pashtun.color', () => {
      expect(bridge.COLOR_ETHNIC_PASHTUN_HEX).toBe(ETHNIC_GROUPS.pashtun.color);
    });
  });

  describe('byte-identity invariant — ethnic RGBA tuples match runtime', () => {
    // ETHNIC_GROUPS.rgba is [r, g, b, alpha] (4-tuple); bridge tuples are
    // 3-tuples (alpha owned by consumer). Compare RGB channels only.
    it('kurdish RGB matches ETHNIC_GROUPS.kurdish.rgba[0..3]', () => {
      expect(bridge.COLOR_ETHNIC_KURDISH).toEqual(ETHNIC_GROUPS.kurdish.rgba.slice(0, 3));
    });

    it('arab RGB matches ETHNIC_GROUPS.arab.rgba[0..3]', () => {
      expect(bridge.COLOR_ETHNIC_ARAB).toEqual(ETHNIC_GROUPS.arab.rgba.slice(0, 3));
    });

    it('persian RGB matches ETHNIC_GROUPS.persian.rgba[0..3]', () => {
      expect(bridge.COLOR_ETHNIC_PERSIAN).toEqual(ETHNIC_GROUPS.persian.rgba.slice(0, 3));
    });
  });
});
