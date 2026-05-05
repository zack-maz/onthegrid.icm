import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useMemo } from 'react';

import { useLayerStore } from '@/stores/layerStore';
import { useWaterStore } from '@/stores/waterStore';
import type { PrecipitationData } from '@/stores/waterStore';
import { useWeatherStore, type WeatherGridPoint } from '@/stores/weatherStore';

import { getWindBarbIcon } from './windBarbs';

/**
 * Returns deck.gl layers for weather visualization:
 * - ScatterplotLayer for temperature dots
 * - IconLayer for wind barbs
 * - ScatterplotLayer (invisible) for tooltip picking
 */
export function useWeatherLayers() {
  const grid = useWeatherStore((s) => s.grid);
  const isActive = useLayerStore((s) => s.activeLayers.has('weather'));

  return useMemo(() => {
    if (!isActive || grid.length === 0) return [];

    // Filter to every 3rd degree for sparser wind barb rendering
    const sparseGrid = grid.filter((d) => d.lat % 3 === 0 && d.lng % 3 === 0);

    const windBarbLayer = new IconLayer({
      id: 'weather-wind-barbs',
      data: sparseGrid,
      getPosition: (d: WeatherGridPoint) => [d.lng, d.lat],
      getIcon: (d: WeatherGridPoint) => ({
        url: getWindBarbIcon(d.windSpeed),
        width: 32,
        height: 64,
        anchorY: 32,
      }),
      getSize: 24,
      sizeUnits: 'pixels' as const,
      getAngle: (d: WeatherGridPoint) => -d.windDirection,
      billboard: true,
      pickable: false,
    });

    const pickerLayer = new ScatterplotLayer({
      id: 'weather-picker',
      data: grid,
      getPosition: (d: WeatherGridPoint) => [d.lng, d.lat],
      getRadius: 50000,
      radiusUnits: 'meters' as const,
      getFillColor: [0, 0, 0, 0],
      pickable: true,
    });

    return [windBarbLayer, pickerLayer];
  }, [isActive, grid]);
}

/** Compass direction labels for 8-way cardinal/intercardinal directions */
const COMPASS_LABELS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

function directionToCompass(degrees: number): string {
  const index = Math.round(degrees / 45) % 8;
  return COMPASS_LABELS[index];
}

interface WeatherTooltipProps {
  point: WeatherGridPoint;
  x: number;
  y: number;
}

/**
 * Weather tooltip showing temperature (C/F) and wind (direction + speed).
 * Positioned at cursor coordinates, styled to match EntityTooltip.
 */
/** Find the nearest precipitation entry within ~200km of a point */
function findNearestPrecip(
  lat: number,
  lng: number,
  data: PrecipitationData[],
): PrecipitationData | null {
  let best: PrecipitationData | null = null;
  let bestDist = Infinity;
  for (const p of data) {
    const d = Math.abs(p.lat - lat) + Math.abs(p.lng - lng);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  // ~2 degrees ≈ 200km — precip is a regional 30-day metric, coarse matching is fine
  return bestDist < 2.0 ? best : null;
}

export function WeatherTooltip({ point, x, y }: WeatherTooltipProps) {
  const tempC = point.temperature.toFixed(1);
  const tempF = ((point.temperature * 9) / 5 + 32).toFixed(1);
  const compass = directionToCompass(point.windDirection);
  const rawPrecipData = useWaterStore((s) => s.rawPrecipData);

  const precip =
    rawPrecipData.length > 0 ? findNearestPrecip(point.lat, point.lng, rawPrecipData) : null;

  return (
    <div
      className="pointer-events-none absolute z-[var(--z-tooltip)]"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="rounded bg-surface-overlay px-2 py-1.5 text-xs text-text-primary backdrop-blur-sm shadow-lg">
        <div className="mb-0.5 text-[9px] uppercase tracking-wider text-text-muted">Weather</div>
        <div>
          {tempC}C / {tempF}F
        </div>
        <div>
          Wind: {compass} {Math.round(point.windSpeed)} kn
        </div>
        {precip && (
          <>
            <div className="mt-1 border-t border-border/30 pt-1 text-[9px] uppercase tracking-wider text-text-muted">
              Precipitation
            </div>
            <div>30-day: {precip.last30DaysMm.toFixed(1)} mm</div>
            <div>Anomaly: {Math.round(precip.anomalyRatio * 100)}% of normal</div>
          </>
        )}
      </div>
    </div>
  );
}
