import { useMemo } from 'react';
import { IconLayer, ScatterplotLayer } from '@deck.gl/layers';
import { useWeatherStore, type WeatherGridPoint } from '@/stores/weatherStore';
import { useLayerStore } from '@/stores/layerStore';
import { getWindBarbIcon } from './windBarbs';

/** Interpolate temperature (-5..45 C) to RGBA color */
function tempToColor(temp: number): [number, number, number, number] {
  const t = Math.max(0, Math.min(1, (temp - (-5)) / 50)); // 0..1
  // Blue → Cyan → Green → Yellow → Red
  let r: number, g: number, b: number;
  if (t < 0.25) {
    const s = t / 0.25;
    r = 0; g = Math.round(100 * s); b = Math.round(255 * (1 - s * 0.4));
  } else if (t < 0.5) {
    const s = (t - 0.25) / 0.25;
    r = 0; g = Math.round(100 + 155 * s); b = Math.round(153 * (1 - s));
  } else if (t < 0.75) {
    const s = (t - 0.5) / 0.25;
    r = Math.round(255 * s); g = 255; b = 0;
  } else {
    const s = (t - 0.75) / 0.25;
    r = 255; g = Math.round(255 * (1 - s)); b = 0;
  }
  return [r, g, b, 100];
}

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

    const tempLayer = new ScatterplotLayer({
      id: 'weather-temp-dots',
      data: grid,
      getPosition: (d: WeatherGridPoint) => [d.lng, d.lat],
      getRadius: 55000,
      radiusUnits: 'meters' as const,
      getFillColor: (d: WeatherGridPoint) => tempToColor(d.temperature),
      pickable: false,
      antialiasing: true,
    });

    // Filter to every 3rd degree for sparser wind barb rendering
    const sparseGrid = grid.filter(
      (d) => d.lat % 3 === 0 && d.lng % 3 === 0,
    );

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

    return [tempLayer, windBarbLayer, pickerLayer];
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
export function WeatherTooltip({ point, x, y }: WeatherTooltipProps) {
  const tempC = point.temperature.toFixed(1);
  const tempF = (point.temperature * 9 / 5 + 32).toFixed(1);
  const compass = directionToCompass(point.windDirection);

  return (
    <div
      className="pointer-events-none absolute z-[var(--z-tooltip)]"
      style={{ left: x + 12, top: y - 12 }}
    >
      <div className="rounded bg-surface-overlay/90 px-2 py-1.5 text-xs text-text-primary backdrop-blur-sm shadow-lg">
        <div className="mb-0.5 text-[9px] uppercase tracking-wider text-text-muted">
          Weather
        </div>
        <div>{tempC}C / {tempF}F</div>
        <div>Wind: {compass} {Math.round(point.windSpeed)} kn</div>
      </div>
    </div>
  );
}
