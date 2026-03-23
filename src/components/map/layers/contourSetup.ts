import mlcontour from 'maplibre-contour';
import maplibregl from 'maplibre-gl';
import { TERRAIN_SOURCE_TILES } from '../constants';

const demSource = new mlcontour.DemSource({
  url: TERRAIN_SOURCE_TILES[0],
  encoding: 'terrarium',
  maxzoom: 13,
  worker: true,
  cacheSize: 100,
});

let initialized = false;

/** Register the contour protocol with maplibre-gl (idempotent). */
export function setupContourProtocol(): void {
  if (initialized) return;
  demSource.setupMaplibre(maplibregl);
  initialized = true;
}

/** Vector tile URL for contour lines. */
export const CONTOUR_TILE_URL = demSource.contourProtocolUrl({
  thresholds: {
    7: [500, 2500],
    9: [500, 2500],
  },
});
