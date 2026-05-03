import { GeoJsonLayer } from '@deck.gl/layers';
import { useMemo } from 'react';

import { LEGEND_REGISTRY } from '@/components/map/MapLegend';
import countriesData from '@/data/countries.json';
import disputedData from '@/data/disputed.json';
import { FACTION_COLORS, getFaction } from '@/lib/factions';
import { useLayerStore } from '@/stores/layerStore';

import type { Feature, FeatureCollection } from 'geojson';

/** Parse hex color to [r, g, b] */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const US_RGB = hexToRgb(FACTION_COLORS.us);
const IRAN_RGB = hexToRgb(FACTION_COLORS.iran);
const NEUTRAL_RGB = hexToRgb(FACTION_COLORS.neutral);
const DISPUTED_RGB = hexToRgb('#f59e0b'); // amber-500

const FACTION_RGB: Record<string, [number, number, number]> = {
  us: US_RGB,
  iran: IRAN_RGB,
  neutral: NEUTRAL_RGB,
};

// Register legend
LEGEND_REGISTRY.push({
  layerId: 'political',
  title: 'FACTIONS',
  mode: 'discrete' as const,
  colorStops: [
    { color: FACTION_COLORS.us, label: 'US-aligned' },
    { color: FACTION_COLORS.iran, label: 'Iran-aligned' },
    { color: FACTION_COLORS.neutral, label: 'Neutral' },
    { color: '#f59e0b', label: 'Disputed' },
  ],
});

/**
 * Pre-compute fill/line colors per feature so deck.gl gets flat arrays.
 */
function getCountryFillColor(feature: Feature): [number, number, number, number] {
  const props = feature.properties as Record<string, string> | null;
  const iso = props?.ISO_A3 ?? '';
  const faction = getFaction(iso);
  const rgb = FACTION_RGB[faction] ?? NEUTRAL_RGB;
  return [rgb[0], rgb[1], rgb[2], 38]; // ~15% opacity
}

function getCountryLineColor(feature: Feature): [number, number, number, number] {
  const props = feature.properties as Record<string, string> | null;
  const iso = props?.ISO_A3 ?? '';
  const faction = getFaction(iso);
  const rgb = FACTION_RGB[faction] ?? NEUTRAL_RGB;
  return [rgb[0], rgb[1], rgb[2], 153]; // ~60% opacity
}

/**
 * Returns deck.gl layers for the political boundaries overlay.
 * Country fills color-coded by faction + disputed territory outlines.
 */
export function usePoliticalLayers(): GeoJsonLayer[] {
  const isActive = useLayerStore((s) => s.activeLayers.has('political'));

  return useMemo(() => {
    if (!isActive) return [];

    // deck.gl GeoJsonLayer accepts FeatureCollection at runtime; static GeoJSON imports
    // type as Record<string, unknown> via Vite's JSON loader, so we narrow via `unknown`.
    const countryLayer = new GeoJsonLayer({
      id: 'political-countries',
      data: countriesData as unknown as FeatureCollection,
      pickable: false,
      stroked: true,
      filled: true,
      getFillColor: getCountryFillColor,
      getLineColor: getCountryLineColor,
      getLineWidth: 1,
      lineWidthUnits: 'pixels' as const,
    });

    const disputedLayer = new GeoJsonLayer({
      id: 'political-disputed',
      data: disputedData as unknown as FeatureCollection,
      pickable: false,
      stroked: true,
      filled: true,
      getFillColor: [DISPUTED_RGB[0], DISPUTED_RGB[1], DISPUTED_RGB[2], 50] as [
        number,
        number,
        number,
        number,
      ],
      getLineColor: [DISPUTED_RGB[0], DISPUTED_RGB[1], DISPUTED_RGB[2], 200] as [
        number,
        number,
        number,
        number,
      ],
      getLineWidth: 2,
      lineWidthUnits: 'pixels' as const,
    });

    return [countryLayer, disputedLayer];
  }, [isActive]);
}

// Keep backward-compat export for BaseMap JSX slot (renders null now — layers via hook)
export function PoliticalOverlay() {
  return null;
}
