/**
 * Phase 28.1 W6 D-13 — CSS-var → deck.gl RGBA tuple bridge.
 *
 * Reads `--color-*` CSS custom properties from `:root` ONCE at module load
 * and parses them to RGBA tuples (`[r, g, b]`) for deck.gl `getColor` callbacks.
 * Falls back to TS-literal defaults when the CSS var is missing
 * (SSR / jsdom / theme-not-loaded edge cases).
 *
 * **Why module-load (not per-frame):** deck.gl `getColor` callbacks fire on
 * every render frame; calling `getComputedStyle(...)` inside that hot path
 * would be expensive. The W6 D-13 contract is:
 *   - CSS `@theme` block in `src/styles/app.css` is the SOURCE OF TRUTH for
 *     HTML/Tailwind utilities (`text-flight`, `bg-event-airstrike`, …).
 *   - This module mirrors those values ONCE for deck.gl consumers.
 *
 * **Tradeoff:** runtime theme switching won't update colors without a reload.
 * Acceptable for Phase 28.1 — the dashboard ships a single theme.
 *
 * **Byte-identity invariant:** the fallback default in each `readCssRGB` /
 * `readCssHex` call MUST match the corresponding CSS var value in
 * `src/styles/app.css` AND the previous literal in
 * `src/components/map/layers/constants.ts ENTITY_COLORS`. The byte-identity
 * test in `src/__tests__/lib/colorBridge.test.ts` enforces this — if a
 * fallback drifts, the test fails at the next `vitest run`.
 *
 * **Drift surfaced (W6 SUMMARY):** CONTEXT D-13 specifies different hex
 * values for several event colors than the current runtime
 * (e.g., `--color-flight-unidentified: #ef4444` per D-13, but runtime is
 * `#ffff64`). Per W5 Pattern 3 (cleanup waves preserve runtime, never
 * silently change values), this bridge defaults preserve the RUNTIME
 * tuples, not the D-13 spec.
 */

/**
 * Read a CSS custom property from `:root` and parse it as `#rrggbb` or
 * `rgb(r, g, b)`. Returns the supplied fallback if the var is missing or
 * the value can't be parsed.
 */
function readCssRGB(
  varName: string,
  fallback: readonly [number, number, number],
): [number, number, number] {
  if (typeof document === 'undefined') return [...fallback];
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!raw) return [...fallback];
  if (raw.startsWith('#')) {
    const hex = raw.slice(1);
    if (hex.length !== 6) return [...fallback];
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return [...fallback];
    return [r, g, b];
  }
  const m = raw.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/);
  if (m && m[1] !== undefined && m[2] !== undefined && m[3] !== undefined) {
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }
  return [...fallback];
}

/**
 * Read a CSS custom property from `:root` as a raw hex string. Returns the
 * supplied fallback if the var is missing.
 */
function readCssHex(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  return raw || fallback;
}

// ----------------------------------------------------------------------------
// RGBA tuple exports — consumed by deck.gl layer factories
// (src/components/map/layers/constants.ts ENTITY_COLORS, etc.)
// ----------------------------------------------------------------------------

export const COLOR_FLIGHT = readCssRGB('--color-flight', [234, 179, 8]);
export const COLOR_FLIGHT_UNIDENTIFIED = readCssRGB('--color-flight-unidentified', [255, 255, 100]);
export const COLOR_SHIP = readCssRGB('--color-ship', [167, 139, 250]);

export const COLOR_EVENT_AIRSTRIKE = readCssRGB('--color-event-airstrike', [255, 59, 48]);
export const COLOR_EVENT_ON_GROUND = readCssRGB('--color-event-on-ground', [180, 50, 20]);
export const COLOR_EVENT_EXPLOSION = readCssRGB('--color-event-explosion', [255, 95, 25]);
export const COLOR_EVENT_TARGETED = readCssRGB('--color-event-targeted', [139, 30, 30]);
export const COLOR_EVENT_OTHER = readCssRGB('--color-event-other', [220, 100, 90]);

export const COLOR_SITE_HEALTHY = readCssRGB('--color-site-healthy', [34, 197, 94]);
export const COLOR_SITE_ATTACKED = readCssRGB('--color-site-attacked', [249, 115, 22]);

export const COLOR_FACTION_US_ALIGNED = readCssRGB('--color-faction-us-aligned', [59, 130, 246]);
export const COLOR_FACTION_IRAN_ALIGNED = readCssRGB('--color-faction-iran-aligned', [220, 38, 38]);
export const COLOR_FACTION_NEUTRAL = readCssRGB('--color-faction-neutral', [100, 116, 139]);
export const COLOR_FACTION_DISPUTED = readCssRGB('--color-faction-disputed', [245, 158, 11]);

// Ethnic palette — 10 groups (src/lib/ethnicGroups.ts consumer). Tuples
// preserve runtime byte-identically; alpha is owned by the consumer
// (ETHNIC_GROUPS rgba field appends 140 for ~55% fill).
export const COLOR_ETHNIC_KURDISH = readCssRGB('--color-ethnic-kurdish', [245, 158, 11]);
export const COLOR_ETHNIC_ARAB = readCssRGB('--color-ethnic-arab', [16, 185, 129]);
export const COLOR_ETHNIC_PERSIAN = readCssRGB('--color-ethnic-persian', [99, 102, 241]);
export const COLOR_ETHNIC_BALOCH = readCssRGB('--color-ethnic-baloch', [236, 72, 153]);
export const COLOR_ETHNIC_TURKMEN = readCssRGB('--color-ethnic-turkmen', [20, 184, 166]);
export const COLOR_ETHNIC_DRUZE = readCssRGB('--color-ethnic-druze', [249, 115, 22]);
export const COLOR_ETHNIC_ALAWITE = readCssRGB('--color-ethnic-alawite', [139, 92, 246]);
export const COLOR_ETHNIC_YAZIDI = readCssRGB('--color-ethnic-yazidi', [234, 179, 8]);
export const COLOR_ETHNIC_ASSYRIAN = readCssRGB('--color-ethnic-assyrian', [6, 182, 212]);
export const COLOR_ETHNIC_PASHTUN = readCssRGB('--color-ethnic-pashtun', [132, 204, 22]);

// ----------------------------------------------------------------------------
// Hex string re-exports — consumed by HTML/CSS surfaces
// (src/lib/factions.ts FACTION_COLORS map, src/lib/ethnicGroups.ts color field)
// ----------------------------------------------------------------------------

export const COLOR_FLIGHT_HEX = readCssHex('--color-flight', '#eab308');
export const COLOR_FLIGHT_UNIDENTIFIED_HEX = readCssHex('--color-flight-unidentified', '#ffff64');
export const COLOR_SHIP_HEX = readCssHex('--color-ship', '#a78bfa');

export const COLOR_EVENT_AIRSTRIKE_HEX = readCssHex('--color-event-airstrike', '#ff3b30');
export const COLOR_EVENT_ON_GROUND_HEX = readCssHex('--color-event-on-ground', '#b43214');
export const COLOR_EVENT_EXPLOSION_HEX = readCssHex('--color-event-explosion', '#ff5f19');
export const COLOR_EVENT_TARGETED_HEX = readCssHex('--color-event-targeted', '#8b1e1e');
export const COLOR_EVENT_OTHER_HEX = readCssHex('--color-event-other', '#dc5a5a');

export const COLOR_SITE_HEALTHY_HEX = readCssHex('--color-site-healthy', '#22c55e');
export const COLOR_SITE_ATTACKED_HEX = readCssHex('--color-site-attacked', '#f97316');

// Phase 40 D-13 — operator-console status namespace (hex only; no deck.gl consumer,
// so no readCssRGB tuple export). Byte-identical to the map tokens they replace as
// status colors; the sentinel test in colorBridge.test.ts asserts the literals.
export const COLOR_STATUS_HEALTHY_HEX = readCssHex('--color-status-healthy', '#22c55e');
export const COLOR_STATUS_DEGRADED_HEX = readCssHex('--color-status-degraded', '#f97316');
export const COLOR_STATUS_WARNING_HEX = readCssHex('--color-status-warning', '#eab308');

export const COLOR_FACTION_US_ALIGNED_HEX = readCssHex('--color-faction-us-aligned', '#3b82f6');
export const COLOR_FACTION_IRAN_ALIGNED_HEX = readCssHex('--color-faction-iran-aligned', '#dc2626');
export const COLOR_FACTION_NEUTRAL_HEX = readCssHex('--color-faction-neutral', '#64748b');
export const COLOR_FACTION_DISPUTED_HEX = readCssHex('--color-faction-disputed', '#f59e0b');

export const COLOR_ETHNIC_KURDISH_HEX = readCssHex('--color-ethnic-kurdish', '#f59e0b');
export const COLOR_ETHNIC_ARAB_HEX = readCssHex('--color-ethnic-arab', '#10b981');
export const COLOR_ETHNIC_PERSIAN_HEX = readCssHex('--color-ethnic-persian', '#6366f1');
export const COLOR_ETHNIC_BALOCH_HEX = readCssHex('--color-ethnic-baloch', '#ec4899');
export const COLOR_ETHNIC_TURKMEN_HEX = readCssHex('--color-ethnic-turkmen', '#14b8a6');
export const COLOR_ETHNIC_DRUZE_HEX = readCssHex('--color-ethnic-druze', '#f97316');
export const COLOR_ETHNIC_ALAWITE_HEX = readCssHex('--color-ethnic-alawite', '#8b5cf6');
export const COLOR_ETHNIC_YAZIDI_HEX = readCssHex('--color-ethnic-yazidi', '#eab308');
export const COLOR_ETHNIC_ASSYRIAN_HEX = readCssHex('--color-ethnic-assyrian', '#06b6d4');
export const COLOR_ETHNIC_PASHTUN_HEX = readCssHex('--color-ethnic-pashtun', '#84cc16');
