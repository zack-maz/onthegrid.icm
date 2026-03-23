import type { Map as MaplibreMap } from 'maplibre-gl';

// ---------------------------------------------------------------------------
// Canvas Pattern Generation for MapLibre fill-pattern
// ---------------------------------------------------------------------------

/** Pattern tile size -- must be power of 2 for seamless tiling */
const PATTERN_SIZE = 16;

/**
 * Generates a 45-degree diagonal hatching pattern on a transparent background.
 * Returns ImageData suitable for map.addImage().
 */
export function createHatchPattern(
  color: [number, number, number],
  alpha: number,
  lineWidth = 2,
  spacing = 6,
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = PATTERN_SIZE;
  canvas.height = PATTERN_SIZE;
  const ctx = canvas.getContext('2d')!;

  // Transparent background
  ctx.clearRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);

  // Draw 45-degree diagonal lines that tile seamlessly
  ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;
  ctx.lineWidth = lineWidth;

  for (let i = -PATTERN_SIZE; i < PATTERN_SIZE * 2; i += spacing) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + PATTERN_SIZE, PATTERN_SIZE);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, PATTERN_SIZE, PATTERN_SIZE);
}

/**
 * Generates alternating diagonal stripes in two faction colors for contested countries.
 * Color1 and color2 stripes alternate with a 4px offset between them.
 */
export function createDualHatchPattern(
  color1: [number, number, number],
  color2: [number, number, number],
  alpha: number,
): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = PATTERN_SIZE;
  canvas.height = PATTERN_SIZE;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, PATTERN_SIZE, PATTERN_SIZE);
  ctx.lineWidth = 2;

  // Alternating diagonal stripes in two colors
  for (let i = -PATTERN_SIZE; i < PATTERN_SIZE * 2; i += 8) {
    // Color 1 stripe
    ctx.strokeStyle = `rgba(${color1[0]}, ${color1[1]}, ${color1[2]}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + PATTERN_SIZE, PATTERN_SIZE);
    ctx.stroke();

    // Color 2 stripe (offset by 4px)
    ctx.strokeStyle = `rgba(${color2[0]}, ${color2[1]}, ${color2[2]}, ${alpha})`;
    ctx.beginPath();
    ctx.moveTo(i + 4, 0);
    ctx.lineTo(i + 4 + PATTERN_SIZE, PATTERN_SIZE);
    ctx.stroke();
  }

  return ctx.getImageData(0, 0, PATTERN_SIZE, PATTERN_SIZE);
}

/**
 * Registers all faction hatching pattern images on the map instance.
 * Uses hasImage guard to prevent duplicate registration.
 * Must be called imperatively before fill layers reference the patterns.
 */
export function registerPatterns(map: MaplibreMap): void {
  const patterns: Record<string, ImageData> = {
    'hatch-iran': createHatchPattern([239, 68, 68], 0.35),
    'hatch-us': createHatchPattern([59, 130, 246], 0.35),
    'hatch-turkic': createHatchPattern([245, 158, 11], 0.35),
    'hatch-neutral': createHatchPattern([156, 163, 175], 0.2),
    'hatch-contested_iran_us': createDualHatchPattern([239, 68, 68], [59, 130, 246], 0.35),
    'hatch-contested_iran_china_us': createDualHatchPattern([239, 68, 68], [59, 130, 246], 0.35),
  };

  for (const [name, imageData] of Object.entries(patterns)) {
    if (!map.hasImage(name)) {
      map.addImage(name, imageData);
    }
  }
}
