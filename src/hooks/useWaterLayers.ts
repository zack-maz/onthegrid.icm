import { useMemo } from 'react';
import { PathLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import { useWaterStore } from '@/stores/waterStore';
import { useLayerStore } from '@/stores/layerStore';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { stressToRGBA } from '@/lib/waterStress';
import { getIconAtlas, ICON_MAPPING } from '@/components/map/layers/icons';
import riversGeoJson from '@/data/rivers.json';
import type { WaterFacility, WaterFacilityType } from '../../server/types';
import type { Layer } from '@deck.gl/core';

/** Maps water facility type to icon atlas key */
const WATER_ICON_MAP: Record<WaterFacilityType, string> = {
  dam: 'waterDam',
  reservoir: 'waterReservoir',
  desalination: 'waterDesalination',
  treatment_plant: 'waterTreatment',
};

/** Event types that indicate facility destruction */
const DESTRUCTIVE_EVENT_TYPES = new Set(['airstrike', 'bombing', 'shelling', 'wmd']);

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

/** A single river segment with path coordinates and per-vertex colors */
interface RiverSegment {
  name: string;
  path: [number, number][];
  colors: [number, number, number, number][];
  width: number;
}

/**
 * Pre-compute river segments with per-vertex gradient colors.
 * Source (first coord) is healthier, mouth (last coord) is more stressed.
 * Health interpolates from compositeHealth+0.2 at source to compositeHealth-0.1 at mouth.
 */
function buildRiverSegments(): RiverSegment[] {
  const features = (riversGeoJson as { features: RiverFeature[] }).features;
  const segments: RiverSegment[] = [];

  for (const f of features) {
    const baseHealth = f.properties?.compositeHealth ?? 0.5;
    const scale = f.properties?.scalerank ?? 3;
    const width = Math.max(1, 6 - scale) * 1200;
    const name = f.properties?.name ?? '';

    // Health range: source is healthier, mouth is more stressed
    const sourceHealth = Math.min(1, baseHealth + 0.25);
    const mouthHealth = Math.max(0, baseHealth - 0.15);

    const lines: number[][][] =
      f.geometry.type === 'LineString'
        ? [f.geometry.coordinates as number[][]]
        : (f.geometry.coordinates as number[][][]);

    for (const line of lines) {
      const path: [number, number][] = line.map((c) => [c[0], c[1]]);
      const colors: [number, number, number, number][] = line.map((_, i) => {
        const t = line.length > 1 ? i / (line.length - 1) : 0.5;
        const health = sourceHealth + (mouthHealth - sourceHealth) * t;
        return stressToRGBA(health, 220);
      });
      segments.push({ name, path, colors, width });
    }
  }

  return segments;
}

/** Cached river segments — computed once at module load */
const RIVER_SEGMENTS = buildRiverSegments();

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
 * - River PathLayer (gradient stress-colored lines)
 * - River label TextLayer (italic serif)
 * - Facility IconLayer (stress-tinted markers)
 *
 * All rendering is gated by the 'water' visualization layer toggle.
 */
export interface WaterLayerGroup {
  /** Rivers + labels — render below entities */
  riverLayers: Layer[];
  /** Facility icons — render at entity level */
  facilityLayers: Layer[];
}

export function useWaterLayers(): WaterLayerGroup {
  const isActive = useLayerStore((s) => s.activeLayers.has('water'));
  const facilities = useWaterStore((s) => s.facilities);
  const events = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd) ?? Date.now();

  return useMemo(() => {
    if (!isActive) return { riverLayers: [], facilityLayers: [] };

    // Pre-compute destroyed set (O(facilities * destructiveEvents))
    const destructiveEvents = events.filter(
      (e) => DESTRUCTIVE_EVENT_TYPES.has(e.type) && e.timestamp <= dateEnd,
    );
    const destroyedIds = new Set<string>();
    const COARSE_DEG = 0.05;
    for (const f of facilities) {
      for (const e of destructiveEvents) {
        if (Math.abs(e.lat - f.lat) > COARSE_DEG || Math.abs(e.lng - f.lng) > COARSE_DEG) continue;
        const dLat = ((e.lat - f.lat) * Math.PI) / 180;
        const dLng = ((e.lng - f.lng) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((f.lat * Math.PI) / 180) *
            Math.cos((e.lat * Math.PI) / 180) *
            Math.sin(dLng / 2) ** 2;
        const dist = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        if (dist <= 5) {
          destroyedIds.add(f.id);
          break;
        }
      }
    }

    // River lines with per-vertex gradient coloring
    const riverLayer = new PathLayer<RiverSegment>({
      id: 'water-rivers',
      data: RIVER_SEGMENTS,
      getPath: (d) => d.path,
      getColor: (d) => d.colors,
      getWidth: (d) => d.width,
      widthUnits: 'meters',
      widthMinPixels: 5,
      widthMaxPixels: 24,
      pickable: false,
      capRounded: true,
      jointRounded: true,
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
      getSize: 16,
      sizeMinPixels: 14,
      sizeMaxPixels: 24,
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
      getColor: (d: WaterFacility) => {
        if (destroyedIds.has(d.id)) return [0, 0, 0, 255] as [number, number, number, number];
        return stressToRGBA(d.stress.compositeHealth);
      },
      pickable: true,
      iconAtlas: getIconAtlas(),
      iconMapping: ICON_MAPPING,
    });

    return {
      riverLayers: [riverLayer, riverLabelLayer],
      facilityLayers: [facilityLayer],
    };
  }, [isActive, facilities, events, dateEnd]);
}
