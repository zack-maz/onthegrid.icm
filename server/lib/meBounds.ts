/**
 * Middle East geocoding constraints shared by the Nominatim adapter and the
 * layered resolver (Phase 27.4 D-02).
 *
 * Viewbox format per Nominatim docs: [lng1, lat1, lng2, lat2]
 *   — (west=30, south=15) → (east=70, north=42)
 *   — matches CLAUDE.md IRAN_BBOX.
 *
 * countrycodes is a lowercased comma-separated ISO 3166-1 alpha-2 list.
 * Hard-coded server-side (never user-configurable) to prevent resolver-bypass
 * attacks per 27.4 security threat model.
 */
export const ME_VIEWBOX: readonly [number, number, number, number] = [30, 15, 70, 42] as const;

export const ME_COUNTRY_CODES =
  'ir,iq,sy,lb,il,ps,jo,eg,sa,ae,bh,kw,om,qa,ye,tr,af,pk,tm,az,am,ge';
