// Canvas-generated icon atlas for entity markers (Deck.gl IconLayer mask mode)

/** Icon mapping entry for Deck.gl */
interface IconEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: boolean;
}

/** Icon mapping for the 5 entity shapes */
export const ICON_MAPPING: Record<string, IconEntry> = {
  chevron:        { x: 0,   y: 0, width: 32, height: 32, mask: true },
  diamond:        { x: 32,  y: 0, width: 32, height: 32, mask: true },
  starburst:      { x: 64,  y: 0, width: 32, height: 32, mask: true },
  xmark:          { x: 96,  y: 0, width: 32, height: 32, mask: true },
  chevronGround:  { x: 128, y: 0, width: 32, height: 32, mask: true },
};

/** Cached atlas canvas */
let atlas: HTMLCanvasElement | null = null;

/**
 * Lazily generates a 128x32 canvas icon atlas with 4 white shapes.
 * All shapes drawn white -- Deck.gl mask mode tints via getColor.
 */
export function getIconAtlas(): HTMLCanvasElement {
  if (atlas) return atlas;

  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // jsdom lacks canvas support -- return blank canvas for test environments
    atlas = canvas;
    return canvas;
  }

  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';

  // Icon 0 (offset 0): Chevron -- upward-pointing arrow/triangle
  ctx.beginPath();
  ctx.moveTo(16, 4);   // top center
  ctx.lineTo(28, 28);  // bottom right
  ctx.lineTo(16, 20);  // center notch
  ctx.lineTo(4, 28);   // bottom left
  ctx.closePath();
  ctx.fill();

  // Icon 1 (offset 32): Diamond -- rotated square
  ctx.beginPath();
  ctx.moveTo(48, 6);   // top
  ctx.lineTo(58, 16);  // right
  ctx.lineTo(48, 26);  // bottom
  ctx.lineTo(38, 16);  // left
  ctx.closePath();
  ctx.fill();

  // Icon 2 (offset 64): Starburst -- 6-point star
  const cx2 = 80;
  const cy2 = 16;
  const outerR = 13;
  const innerR = 6;
  ctx.beginPath();
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI / 6) * i - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const x = cx2 + r * Math.cos(angle);
    const y = cy2 + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Icon 3 (offset 96): X mark -- two crossed lines
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(102, 6);
  ctx.lineTo(122, 26);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(122, 6);
  ctx.lineTo(102, 26);
  ctx.stroke();

  // Icon 4 (offset 128): Chevron-ground -- chevron with diagonal hash lines
  ctx.beginPath();
  ctx.moveTo(144, 4);   // top center
  ctx.lineTo(156, 28);  // bottom right
  ctx.lineTo(144, 20);  // center notch
  ctx.lineTo(132, 28);  // bottom left
  ctx.closePath();
  ctx.fill();
  // Hash lines clipped to chevron shape
  ctx.save();
  ctx.clip();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(101,67,33,0.7)';
  for (let i = -2; i < 6; i++) {
    const x0 = 128 + i * 7;
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0 + 32, 32);
    ctx.stroke();
  }
  ctx.restore();

  atlas = canvas;
  return canvas;
}
