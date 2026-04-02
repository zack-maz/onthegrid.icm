import { useMemo } from 'react';
import { GeoJsonLayer, TextLayer } from '@deck.gl/layers';
import { FillStyleExtension } from '@deck.gl/extensions';
import { useLayerStore } from '@/stores/layerStore';
import { ETHNIC_GROUPS, type EthnicGroup } from '@/lib/ethnicGroups';
import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import ethnicZonesData from '@/data/ethnic-zones.json';

// ---------------------------------------------------------------------------
// Module-level data partitioning
// ---------------------------------------------------------------------------

interface SingleGroupFeature {
  type: string;
  properties: { group: string; label: string };
  geometry: Record<string, unknown>;
}

interface OverlapFeature {
  type: string;
  properties: { groups: string[]; label: string };
  geometry: Record<string, unknown>;
}

const allFeatures = ethnicZonesData.features as Array<{
  type: string;
  properties: Record<string, unknown>;
  geometry: Record<string, unknown>;
}>;

const singleGroupFeatures: SingleGroupFeature[] = allFeatures.filter(
  (f): f is SingleGroupFeature => typeof f.properties.group === 'string',
);

const overlapFeatures: OverlapFeature[] = allFeatures.filter(
  (f): f is OverlapFeature => Array.isArray(f.properties.groups),
);

/** Unique group IDs that appear in overlap zones */
const overlapGroupIds: string[] = [
  ...new Set(overlapFeatures.flatMap((f) => f.properties.groups)),
];

// ---------------------------------------------------------------------------
// Canvas hatch atlas (created once at module load)
// ---------------------------------------------------------------------------

const ATLAS_SIZE = 32;

function createHatchAtlas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;

  // Draw 45-degree diagonal lines with 8px spacing.
  // Draw enough lines to cover the full tile, including wrapping.
  const spacing = 8;
  for (let i = -ATLAS_SIZE; i < ATLAS_SIZE * 2; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + ATLAS_SIZE, ATLAS_SIZE);
    ctx.stroke();
  }

  return canvas;
}

const hatchAtlas = createHatchAtlas();

const HATCH_MAPPING: Record<string, { x: number; y: number; width: number; height: number }> = {
  hatch: { x: 0, y: 0, width: ATLAS_SIZE, height: ATLAS_SIZE },
};

// ---------------------------------------------------------------------------
// Centroid computation (module-level)
// ---------------------------------------------------------------------------

interface CentroidEntry {
  position: [number, number]; // [lng, lat]
  text: string;
}

function computeCentroid(geometry: Record<string, unknown>): [number, number] {
  // Flatten all coordinate rings from any geometry type
  const coords: number[][] = [];

  function extractCoords(arr: unknown): void {
    if (!Array.isArray(arr)) return;
    if (arr.length >= 2 && typeof arr[0] === 'number' && typeof arr[1] === 'number') {
      coords.push(arr as number[]);
      return;
    }
    for (const item of arr) {
      extractCoords(item);
    }
  }

  extractCoords(geometry.coordinates);

  if (coords.length === 0) return [0, 0];

  let sumLng = 0;
  let sumLat = 0;
  for (const c of coords) {
    sumLng += c[0];
    sumLat += c[1];
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

const centroidData: CentroidEntry[] = [
  ...singleGroupFeatures.map((f) => ({
    position: computeCentroid(f.geometry),
    text: f.properties.label,
  })),
  ...overlapFeatures.map((f) => ({
    position: computeCentroid(f.geometry),
    text: f.properties.label,
  })),
];

// ---------------------------------------------------------------------------
// Legend registration (module-level)
// ---------------------------------------------------------------------------

LEGEND_REGISTRY.push({
  layerId: 'ethnic',
  title: 'ETHNIC GROUPS',
  mode: 'discrete' as const,
  colorStops: Object.values(ETHNIC_GROUPS).map((g) => ({
    color: g.color,
    label: g.label,
  })),
});

// ---------------------------------------------------------------------------
// Fill style extension (single instance reused)
// ---------------------------------------------------------------------------

const fillStyleExt = new FillStyleExtension({ pattern: true });

// ---------------------------------------------------------------------------
// Hook: useEthnicLayers
// ---------------------------------------------------------------------------

export function useEthnicLayers(): (GeoJsonLayer | TextLayer)[] {
  const isActive = useLayerStore((s) => s.activeLayers.has('ethnic'));

  return useMemo(() => {
    if (!isActive) return [];

    const layers: (GeoJsonLayer | TextLayer)[] = [];

    // A. Single-group hatched fill layer
    layers.push(
      new GeoJsonLayer({
        id: 'ethnic-zones',
        data: { type: 'FeatureCollection', features: singleGroupFeatures } as unknown as Record<string, unknown>,
        pickable: true,
        stroked: true,
        filled: true,
        getFillColor: ((feature: SingleGroupFeature) => {
          const group = feature.properties?.group as EthnicGroup | undefined;
          return group && ETHNIC_GROUPS[group] ? ETHNIC_GROUPS[group].rgba : [128, 128, 128, 40];
        }) as any,
        getLineColor: [255, 255, 255, 30] as [number, number, number, number],
        getLineWidth: 0.5,
        lineWidthUnits: 'pixels' as const,
        ...(hatchAtlas
          ? {
              fillPatternAtlas: hatchAtlas,
              fillPatternMapping: HATCH_MAPPING,
              getFillPattern: () => 'hatch',
              getFillPatternScale: 500,
              fillPatternMask: true,
              extensions: [fillStyleExt],
            }
          : {}),
      }),
    );

    // B. Stacked overlap layers (one per group appearing in overlap zones)
    for (let i = 0; i < overlapGroupIds.length; i++) {
      const group = overlapGroupIds[i];
      const groupConfig = ETHNIC_GROUPS[group as EthnicGroup];
      if (!groupConfig) continue;

      const groupOverlapFeatures = overlapFeatures.filter((f) =>
        f.properties.groups.includes(group),
      );
      if (groupOverlapFeatures.length === 0) continue;

      layers.push(
        new GeoJsonLayer({
          id: `ethnic-overlap-${group}`,
          data: { type: 'FeatureCollection', features: groupOverlapFeatures } as unknown as Record<string, unknown>,
          pickable: true,
          stroked: false,
          filled: true,
          getFillColor: groupConfig.rgba,
          ...(hatchAtlas
            ? {
                fillPatternAtlas: hatchAtlas,
                fillPatternMapping: HATCH_MAPPING,
                getFillPattern: () => 'hatch',
                getFillPatternOffset: [i / overlapGroupIds.length, 0],
                getFillPatternScale: 500,
                fillPatternMask: true,
                extensions: [fillStyleExt],
              }
            : {}),
        }),
      );
    }

    // C. Centroid text labels
    layers.push(
      new TextLayer({
        id: 'ethnic-labels',
        data: centroidData,
        getPosition: (d: CentroidEntry) => d.position,
        getText: (d: CentroidEntry) => d.text,
        getColor: [255, 255, 255, 200],
        getSize: 14,
        sizeMinPixels: 10,
        sizeMaxPixels: 24,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 700,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        billboard: false,
        pickable: false,
      }),
    );

    return layers;
  }, [isActive]);
}

// ---------------------------------------------------------------------------
// Backward-compat null component export
// ---------------------------------------------------------------------------

export function EthnicOverlay() {
  return null;
}
