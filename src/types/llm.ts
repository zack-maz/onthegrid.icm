/**
 * Phase 27.4 Plan 09 — client-side mirror of server/lib/llmSchema.ts
 * GeocodeProvenance union.
 *
 * The client bundle MUST NOT import from `server/` (Vite aliases do not
 * reach that folder and it would bleed Node-specific code into the browser).
 * Keep this union in lock-step with `GEOCODE_PROVENANCE_VALUES` in
 * server/lib/llmSchema.ts — a server-side exhaustive-switch test guards
 * drift on that side; the server payload is our contract here.
 */
export type GeocodeProvenance =
  | 'own-site-snapshot'
  | 'poi-amenity-nominatim'
  | 'nominatim-direct'
  | 'nominatim-verified-2pass'
  | 'gdelt-actiongeo-fallback'
  | 'bellingcat-coord-passthrough';
