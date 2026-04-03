import { useMemo } from 'react';
import { GeoJsonLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import { useWaterStore } from '@/stores/waterStore';
import { useLayerStore } from '@/stores/layerStore';
import { stressToRGBA } from '@/lib/waterStress';
import { getIconAtlas, ICON_MAPPING } from '@/components/map/layers/icons';
import riversGeoJson from '@/data/rivers.json';
import type { WaterFacility, WaterFacilityType } from '../../server/types';

/** Maps water facility type to icon atlas key (fallback to existing icons until dedicated water icons exist) */
const WATER_ICON_MAP: Record<WaterFacilityType, string> = {
  dam: 'diamond',               // placeholder -- distinct diamond shape
  reservoir: 'siteDesalination', // water droplet icon (existing in atlas)
  treatment_plant: 'diamond',    // placeholder
  canal: 'diamond',              // placeholder
  desalination: 'siteDesalination', // water droplet icon (existing in atlas)
};

interface RiverFeature {
  type: 'Feature';
  properties: {
    name?: string;
    compositeHealth?: number;
    scalerank?: number;
  };
  geometry: {
    type: string;
    coordinates: number[][] | number[][][];
  };
}

/**
 * Get the midpoint of a river feature's coordinates for label placement.
 */
function getRiverMidpoint(feature: RiverFeature): [number, number] {
  const coords = feature.geometry.coordinates;
  if (feature.geometry.type === 'LineString') {
    const line = coords as number[][];
    const mid = line[Math.floor(line.length / 2)];
    return [mid[0], mid[1]];
  }
  // MultiLineString: use the longest segment's midpoint
  const lines = coords as number[][][];
  let longest = lines[0];
  for (const line of lines) {
    if (line.length > longest.length) longest = line;
  }
  const mid = longest[Math.floor(longest.length / 2)];
  return [mid[0], mid[1]];
}

/**
 * Returns deck.gl layers for water visualization:
 * - River GeoJsonLayer (stress-colored lines)
 * - River label TextLayer (italic serif)
 * - Facility IconLayer (stress-tinted markers)
 *
 * All rendering is gated by the 'water' visualization layer toggle.
 */
export function useWaterLayers(): (GeoJsonLayer | IconLayer<WaterFacility> | TextLayer)[] {
  const isActive = useLayerStore((s) => s.activeLayers.has('water'));
  const facilities = useWaterStore((s) => s.facilities);

  return useMemo(() => {
    if (!isActive) return [];

    // River lines colored by watershed stress
    const riverLayer = new GeoJsonLayer({
      id: 'water-rivers',
      data: riversGeoJson as unknown as Record<string, unknown>,
      getLineColor: ((f: RiverFeature) => {
        const health = f.properties?.compositeHealth ?? 0.5;
        return stressToRGBA(health);
      }) as any,
      getLineWidth: ((f: RiverFeature) => {
        const scale = f.properties?.scalerank ?? 3;
        return Math.max(1, 6 - scale) * 500;
      }) as any,
      lineWidthUnits: 'meters' as const,
      lineWidthMinPixels: 1,
      lineWidthMaxPixels: 6,
      pickable: false,
    });

    // River name labels in italic serif
    const riverLabelData = (riversGeoJson as { features: RiverFeature[] }).features.filter(
      (f) => f.properties?.name,
    );

    const riverLabelLayer = new TextLayer({
      id: 'water-river-labels',
      data: riverLabelData,
      getText: (f: RiverFeature) => f.properties?.name ?? '',
      getPosition: (f: RiverFeature) => getRiverMidpoint(f),
      getSize: 12,
      sizeMinPixels: 10,
      sizeMaxPixels: 18,
      fontFamily: 'serif',
      fontStyle: 'italic',
      getColor: [147, 197, 253, 220] as [number, number, number, number],
      outlineColor: [0, 0, 0, 180] as [number, number, number, number],
      outlineWidth: 2,
      billboard: false,
      pickable: false,
    });

    // Facility markers tinted by composite health
    const facilityLayer = new IconLayer<WaterFacility>({
      id: 'water-facility-icons',
      data: facilities,
      getPosition: (d: WaterFacility) => [d.lng, d.lat],
      getIcon: (d: WaterFacility) => WATER_ICON_MAP[d.facilityType] ?? 'diamond',
      getSize: 2000,
      sizeUnits: 'meters' as const,
      sizeMinPixels: 12,
      sizeMaxPixels: 80,
      getColor: (d: WaterFacility) => stressToRGBA(d.stress.compositeHealth),
      pickable: true,
      iconAtlas: getIconAtlas(),
      iconMapping: ICON_MAPPING,
    });

    return [riverLayer, riverLabelLayer, facilityLayer];
  }, [isActive, facilities]);
}
