import { PathLayer, IconLayer, TextLayer } from '@deck.gl/layers';
import { useMemo } from 'react';

import { getIconAtlasForLayer, ICON_MAPPING } from '@/components/map/layers/icons';
import riversGeoJson from '@/data/rivers.json';
import { haversineKm } from '@/lib/geo';
import { WATER_ATTACK_EVENT_TYPES } from '@/lib/waterAttackEvents';
import { stressToRGBA } from '@/lib/waterStress';
import { useEventStore } from '@/stores/eventStore';
import { useFilterStore } from '@/stores/filterStore';
import { useLayerStore } from '@/stores/layerStore';
import { useWaterStore } from '@/stores/waterStore';

import type { WaterFacility, WaterFacilityType } from '../../server/types';
import type { Layer } from '@deck.gl/core';

/** Maps water facility type to icon atlas key */
const WATER_ICON_MAP: Record<WaterFacilityType, string> = {
  dam: 'waterDam',
  reservoir: 'waterReservoir',
  desalination: 'waterDesalination',
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
  /** IDs of facilities with destructive events within 5km */
  destroyedIds: Set<string>;
}

export function useWaterLayers(): WaterLayerGroup {
  const isActive = useLayerStore((s) => s.activeLayers.has('water'));
  const facilities = useWaterStore((s) => s.facilities);
  const events = useEventStore((s) => s.events);
  const dateEnd = useFilterStore((s) => s.dateEnd) ?? Date.now();
  const showWater = useFilterStore((s) => s.showWater);
  const enabledWaterTypes = useFilterStore((s) => s.enabledWaterTypes);
  const waterNameFilter = useFilterStore((s) => s.waterNameFilter);
  const showHighStress = useFilterStore((s) => s.showHighStress);
  const showMediumStress = useFilterStore((s) => s.showMediumStress);
  const showLowStress = useFilterStore((s) => s.showLowStress);
  const showHealthyWater = useFilterStore((s) => s.showHealthyWater);
  const showAttackedWater = useFilterStore((s) => s.showAttackedWater);
  const proximityPin = useFilterStore((s) => s.proximityPin);
  const proximityRadiusKm = useFilterStore((s) => s.proximityRadiusKm);

  return useMemo(() => {
    if (!isActive || !showWater)
      return { riverLayers: [], facilityLayers: [], destroyedIds: new Set<string>() };

    // Filter facilities by enabled water types
    let filteredFacilities = facilities.filter((f) => enabledWaterTypes.includes(f.facilityType));

    // Name filter
    if (waterNameFilter) {
      const q = waterNameFilter.toLowerCase();
      filteredFacilities = filteredFacilities.filter((f) => f.label.toLowerCase().includes(q));
    }

    // Proximity filter — match entityPassesFilters behavior for flights/ships/events
    if (proximityPin) {
      filteredFacilities = filteredFacilities.filter(
        (f) => haversineKm(proximityPin.lat, proximityPin.lng, f.lat, f.lng) <= proximityRadiusKm,
      );
    }

    // Stress level filter based on compositeHealth
    filteredFacilities = filteredFacilities.filter((f) => {
      const h = f.stress.compositeHealth;
      if (h <= 0.33) return showHighStress;
      if (h <= 0.66) return showMediumStress;
      return showLowStress;
    });

    // Pre-compute destroyed set (O(facilities * destructiveEvents))
    // REV-5: use shared WATER_ATTACK_EVENT_TYPES so 'targeted' and 'on_ground' also count.
    const destructiveEvents = events.filter(
      (e) => WATER_ATTACK_EVENT_TYPES.has(e.type) && e.timestamp <= dateEnd,
    );

    if (import.meta.env.DEV) {
      // Log once per render so we can see what's happening with attacked detection (REV-5)
      console.debug('[useWaterLayers] attack detection:', {
        totalEvents: events.length,
        destructiveEvents: destructiveEvents.length,
        eventTypes: Array.from(new Set(events.map((e) => e.type))),
        facilities: filteredFacilities.length,
        dateEnd: new Date(dateEnd).toISOString(),
      });
    }

    const destroyedIds = new Set<string>();
    const COARSE_DEG = 0.05;
    for (const f of filteredFacilities) {
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

    // Attacked/healthy filter (must be after destroyedIds computed)
    if (!showAttackedWater || !showHealthyWater) {
      filteredFacilities = filteredFacilities.filter((f) => {
        const isAttacked = destroyedIds.has(f.id);
        if (isAttacked) return showAttackedWater;
        return showHealthyWater;
      });
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
      data: filteredFacilities,
      getPosition: (d: WaterFacility) => [d.lng, d.lat],
      getIcon: (d: WaterFacility) => WATER_ICON_MAP[d.facilityType] ?? 'diamond',
      getSize: 2000,
      sizeUnits: 'meters' as const,
      sizeMinPixels: 18,
      sizeMaxPixels: 120,
      getColor: (d: WaterFacility) => {
        if (destroyedIds.has(d.id)) return [45, 10, 78, 255] as [number, number, number, number];
        return stressToRGBA(d.stress.compositeHealth);
      },
      getAngle: () => 0,
      billboard: true,
      pickable: true,
      iconAtlas: getIconAtlasForLayer(),
      iconMapping: ICON_MAPPING,
    });

    return {
      riverLayers: [riverLayer, riverLabelLayer],
      facilityLayers: [facilityLayer],
      destroyedIds,
    };
  }, [
    isActive,
    facilities,
    events,
    dateEnd,
    showWater,
    enabledWaterTypes,
    waterNameFilter,
    showHighStress,
    showMediumStress,
    showLowStress,
    showHealthyWater,
    showAttackedWater,
    proximityPin,
    proximityRadiusKm,
  ]);
}
