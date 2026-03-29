import { useMemo } from 'react';
import { Source, Layer } from '@vis.gl/react-maplibre';
import { useWeatherStore, type WeatherGridPoint } from '@/stores/weatherStore';
import { useLayerStore } from '@/stores/layerStore';

// Data grid bounds (from server/adapters/open-meteo.ts)
const DATA_LAT_MIN = 15;
const DATA_LAT_MAX = 42;
const DATA_LNG_MIN = 30;
const DATA_LNG_MAX = 70;

const DATA_W = DATA_LNG_MAX - DATA_LNG_MIN + 1; // 41
const DATA_H = DATA_LAT_MAX - DATA_LAT_MIN + 1; // 28

// Image must extend well beyond MAX_BOUNDS so it fills the entire viewport
// at all zoom levels and pitch angles (maxBounds only constrains the center,
// not what's visible at the edges).
const IMG_LNG_MIN = -10;
const IMG_LNG_MAX = 110;
const IMG_LAT_MIN = -20;
const IMG_LAT_MAX = 70;

/** Interpolate temperature (-5..45 C) to RGB */
function tempToRgb(temp: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, (temp + 5) / 50));
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
  return [r, g, b];
}

/** Bilinear sample with edge clamping (areas outside data grid use nearest edge) */
function bilinearSample(
  grid: Float32Array,
  gw: number,
  gh: number,
  fx: number,
  fy: number,
): number {
  // Clamp to grid bounds — outside the data area, use edge values
  const cfx = Math.max(0, Math.min(gw - 1, fx));
  const cfy = Math.max(0, Math.min(gh - 1, fy));

  const x0 = Math.floor(cfx);
  const y0 = Math.floor(cfy);
  const x1 = Math.min(x0 + 1, gw - 1);
  const y1 = Math.min(y0 + 1, gh - 1);
  const dx = cfx - x0;
  const dy = cfy - y0;

  const v00 = grid[y0 * gw + x0];
  const v10 = grid[y0 * gw + x1];
  const v01 = grid[y1 * gw + x0];
  const v11 = grid[y1 * gw + x1];

  return v00 * (1 - dx) * (1 - dy) +
    v10 * dx * (1 - dy) +
    v01 * (1 - dx) * dy +
    v11 * dx * dy;
}

/** Render weather grid to a canvas data URL covering the full map */
function renderHeatmap(points: WeatherGridPoint[]): string {
  // Build the data grid
  const temps = new Float32Array(DATA_W * DATA_H);
  for (const p of points) {
    const col = Math.round(p.lng - DATA_LNG_MIN);
    const row = Math.round(p.lat - DATA_LAT_MIN);
    if (col >= 0 && col < DATA_W && row >= 0 && row < DATA_H) {
      temps[row * DATA_W + col] = p.temperature;
    }
  }

  // Image dimensions: 2px per degree for smooth interpolation
  const PX_PER_DEG = 2;
  const imgLngSpan = IMG_LNG_MAX - IMG_LNG_MIN;
  const imgLatSpan = IMG_LAT_MAX - IMG_LAT_MIN;
  const w = imgLngSpan * PX_PER_DEG;
  const h = imgLatSpan * PX_PER_DEG;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(w, h);
  const data = imageData.data;

  for (let py = 0; py < h; py++) {
    // Image row 0 = top = IMG_LAT_MAX, row h-1 = bottom = IMG_LAT_MIN
    const lat = IMG_LAT_MAX - (py / PX_PER_DEG);
    // Map lat to data grid row (fractional)
    const fy = lat - DATA_LAT_MIN;

    for (let px = 0; px < w; px++) {
      const lng = IMG_LNG_MIN + (px / PX_PER_DEG);
      // Map lng to data grid col (fractional)
      const fx = lng - DATA_LNG_MIN;

      const temp = bilinearSample(temps, DATA_W, DATA_H, fx, fy);
      const [r, g, b] = tempToRgb(temp);
      const i = (py * w + px) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 100;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL();
}

// Image source coordinates: [top-left, top-right, bottom-right, bottom-left]
const IMAGE_COORDS: [[number, number], [number, number], [number, number], [number, number]] = [
  [IMG_LNG_MIN, IMG_LAT_MAX],
  [IMG_LNG_MAX, IMG_LAT_MAX],
  [IMG_LNG_MAX, IMG_LAT_MIN],
  [IMG_LNG_MIN, IMG_LAT_MIN],
];

/**
 * Weather temperature heatmap as a MapLibre image source + raster layer.
 * Covers the full map bounds, draping onto terrain like hillshade.
 * Areas outside the data grid extrapolate from the nearest edge values.
 */
export function WeatherHeatmap() {
  const grid = useWeatherStore((s) => s.grid);
  const isActive = useLayerStore((s) => s.activeLayers.has('weather'));

  const dataUrl = useMemo(() => {
    if (!grid || grid.length === 0) return null;
    return renderHeatmap(grid);
  }, [grid]);

  if (!isActive || !dataUrl) return null;

  return (
    <>
      <Source
        id="weather-heatmap"
        type="image"
        url={dataUrl}
        coordinates={IMAGE_COORDS}
      />
      <Layer
        id="weather-heatmap-layer"
        type="raster"
        source="weather-heatmap"
        paint={{
          'raster-opacity': 0.6,
          'raster-fade-duration': 300,
        }}
      />
    </>
  );
}
