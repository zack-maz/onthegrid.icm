import { useEffect, useState, useCallback } from 'react';
import { Source, Layer, useMap } from '@vis.gl/react-maplibre';
import type { MapMouseEvent } from 'maplibre-gl';
import { useLayerStore } from '@/stores/layerStore';
import { FACTION_ASSIGNMENTS, FACTION_COLORS } from '@/lib/factions';
import countriesData from '@/data/countries.json';
import disputedData from '@/data/disputed.json';

const HATCH_PATTERN_ID = 'dispute-hatch';

/**
 * Build the MapLibre match expression for faction-based coloring.
 * Maps each ISO_A3 code to its faction color, with neutral as fallback.
 */
function buildFactionMatchExpression(): unknown[] {
  const expr: unknown[] = ['match', ['get', 'ISO_A3']];
  for (const [code, faction] of Object.entries(FACTION_ASSIGNMENTS)) {
    expr.push(code, FACTION_COLORS[faction]);
  }
  // Neutral fallback
  expr.push(FACTION_COLORS.neutral);
  return expr;
}

/** Generate a tileable diagonal hatching pattern on canvas. */
function createHatchingImage(): ImageData {
  const size = 16;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);

  ctx.strokeStyle = '#f59e0b'; // amber-500
  ctx.lineWidth = 2;

  // Draw diagonal lines with wrap-around for seamless tiling
  for (let offset = -size; offset < size * 2; offset += 8) {
    ctx.beginPath();
    ctx.moveTo(offset, size);
    ctx.lineTo(offset + size, 0);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, size, size);
}

/** Register hatching pattern image with the map instance. */
function useHatchingPattern(): boolean {
  const { current: mapRef } = useMap();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mapRef) return;
    const map = mapRef.getMap();
    if (map.hasImage(HATCH_PATTERN_ID)) {
      setReady(true);
      return;
    }
    const imageData = createHatchingImage();
    map.addImage(HATCH_PATTERN_ID, imageData, { sdf: false });
    setReady(true);
  }, [mapRef]);

  return ready;
}

const factionMatch = buildFactionMatchExpression();

/**
 * Political overlay: faction-colored country fills, borders,
 * disputed territory hatching, and hover labels for disputed zones.
 * Rendered as a child of <Map>.
 */
export function PoliticalOverlay() {
  const isActive = useLayerStore((s) => s.activeLayers.has('political'));
  const isPatternReady = useHatchingPattern();
  const { current: mapRef } = useMap();

  // Track hovered disputed feature for label visibility
  const handleDisputedEnter = useCallback(
    (e: MapMouseEvent & { features?: Array<{ id?: number | string }> }) => {
      if (!mapRef || !e.features?.[0]) return;
      const featureId = e.features[0].id;
      if (featureId != null) {
        mapRef.getMap().setFeatureState(
          { source: 'political-disputed', id: featureId },
          { hover: true }
        );
      }
    },
    [mapRef]
  );

  const handleDisputedLeave = useCallback(() => {
    if (!mapRef) return;
    // Clear all feature states on the disputed source
    mapRef.getMap().removeFeatureState({ source: 'political-disputed' });
  }, [mapRef]);

  // Bind hover events on the disputed fill layer
  useEffect(() => {
    if (!mapRef || !isActive || !isPatternReady) return;
    const map = mapRef.getMap();

    map.on('mouseenter', 'disputed-hatching', handleDisputedEnter as unknown as (e: MapMouseEvent) => void);
    map.on('mouseleave', 'disputed-hatching', handleDisputedLeave);

    return () => {
      map.off('mouseenter', 'disputed-hatching', handleDisputedEnter as unknown as (e: MapMouseEvent) => void);
      map.off('mouseleave', 'disputed-hatching', handleDisputedLeave);
    };
  }, [mapRef, isActive, isPatternReady, handleDisputedEnter, handleDisputedLeave]);

  if (!isActive) return null;

  // Add stable numeric IDs to disputed features for feature-state to work
  const disputedWithIds = {
    ...disputedData,
    features: disputedData.features.map((f, i) => ({ ...f, id: i })),
  };

  return (
    <>
      {/* Country fills: faction-colored at 15% opacity */}
      <Source id="political-countries" type="geojson" data={countriesData as GeoJSON.FeatureCollection} >
        <Layer
          id="political-fills"
          type="fill"
          paint={{
            'fill-color': factionMatch as unknown as string,
            'fill-opacity': 0.15,
          }}
        />

        {/* Country borders: faction-colored, thin lines */}
        <Layer
          id="political-borders"
          type="line"
          paint={{
            'line-color': factionMatch as unknown as string,
            'line-width': 1,
            'line-opacity': 0.6,
          }}
        />
      </Source>

      {/* Disputed territories */}
      <Source
        id="political-disputed"
        type="geojson"
        data={disputedWithIds as unknown as GeoJSON.FeatureCollection}
        promoteId="id"
      >
        {/* Hatching pattern fill - only render when pattern is registered */}
        {isPatternReady && (
          <Layer
            id="disputed-hatching"
            type="fill"
            paint={{
              'fill-pattern': HATCH_PATTERN_ID,
            }}
          />
        )}

        {/* Hover labels for disputed zones */}
        <Layer
          id="disputed-labels"
          type="symbol"
          layout={{
            'text-field': ['get', 'NAME'],
            'text-size': 11,
            'text-allow-overlap': true,
          }}
          paint={{
            'text-color': '#fbbf24',
            'text-halo-color': 'rgba(0, 0, 0, 0.8)',
            'text-halo-width': 1.5,
            'text-opacity': [
              'case',
              ['boolean', ['feature-state', 'hover'], false],
              1,
              0,
            ],
          }}
        />
      </Source>
    </>
  );
}
