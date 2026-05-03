import { Source, Layer } from '@vis.gl/react-maplibre';
import { useEffect } from 'react';

import { useLayerStore } from '@/stores/layerStore';

import { setupContourProtocol, CONTOUR_TILE_URL } from './contourSetup';
import { GEO_FEATURES } from './geoFeatures';

/**
 * Color-relief elevation tinting layer.
 *
 * maplibre-gl 5.x supports `color-relief` at runtime, but the LayerSpecification
 * union in @vis.gl/react-maplibre 8.x has not yet added it. We isolate the cast
 * here so the surrounding component code stays type-safe.
 */
function ColorReliefLayer() {
  /* eslint-disable @typescript-eslint/no-explicit-any -- color-relief layer not yet in @vis.gl/react-maplibre 8 type defs */
  const layerProps = {
    id: 'elevation-tint',
    type: 'color-relief',
    source: 'terrain-dem',
    paint: {
      'color-relief-opacity': 0.5,
      'color-relief-color': [
        'interpolate',
        ['linear'],
        ['elevation'],
        0,
        '#000000',
        1500,
        '#334155',
        4000,
        '#cccccc',
      ],
    },
  } as any;
  return <Layer {...layerProps} />;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

/**
 * Geographic visualization layer: elevation color tinting, contour lines,
 * and geographic feature labels. Rendered as a child of <Map>.
 */
export function GeographicOverlay() {
  const isActive = useLayerStore((s) => s.activeLayers.has('geographic'));

  useEffect(() => {
    setupContourProtocol();
  }, []);

  if (!isActive) return null;

  return (
    <>
      <ColorReliefLayer />

      {/* Contour lines from maplibre-contour vector tiles */}
      <Source id="contour-source" type="vector" tiles={[CONTOUR_TILE_URL]} maxzoom={13} />
      <Layer
        id="contour-lines"
        type="line"
        source="contour-source"
        source-layer="contours"
        paint={{
          'line-color': 'rgba(255, 255, 255, 0.45)',
          'line-width': ['case', ['>', ['get', 'level'], 0], 0.8, 0.2],
        }}
        minzoom={4}
      />

      {/* Geographic feature labels (GeoJSON point labels) */}
      <Source id="geo-labels" type="geojson" data={GEO_FEATURES} />
      <Layer
        id="geo-feature-labels"
        type="symbol"
        source="geo-labels"
        layout={{
          'text-field': ['get', 'name'],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.3,
          'text-size': 11,
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': 'rgba(148, 163, 184, 0.5)',
          'text-halo-color': 'rgba(0, 0, 0, 0.6)',
          'text-halo-width': 1,
        }}
        filter={['<=', ['get', 'minzoom'], ['zoom']]}
      />
    </>
  );
}
