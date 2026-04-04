// Canvas-generated icon atlas for entity markers (Deck.gl IconLayer mask mode)

/** Icon mapping entry for Deck.gl */
interface IconEntry {
  x: number;
  y: number;
  width: number;
  height: number;
  mask: boolean;
}

/** Icon mapping for the 17 entity shapes */
export const ICON_MAPPING: Record<string, IconEntry> = {
  chevron:           { x: 0,   y: 0, width: 32, height: 32, mask: true },
  diamond:           { x: 32,  y: 0, width: 32, height: 32, mask: true },
  starburst:         { x: 64,  y: 0, width: 32, height: 32, mask: true },
  xmark:             { x: 96,  y: 0, width: 32, height: 32, mask: true },
  chevronGround:     { x: 128, y: 0, width: 32, height: 32, mask: true },
  explosion:         { x: 160, y: 0, width: 32, height: 32, mask: true },
  crosshair:         { x: 192, y: 0, width: 32, height: 32, mask: true },
  siteNuclear:       { x: 224, y: 0, width: 32, height: 32, mask: true },
  siteNaval:         { x: 256, y: 0, width: 32, height: 32, mask: true },
  siteOil:           { x: 288, y: 0, width: 32, height: 32, mask: true },
  siteAirbase:       { x: 320, y: 0, width: 32, height: 32, mask: true },
  siteDesalination:  { x: 352, y: 0, width: 32, height: 32, mask: true },
  sitePort:          { x: 384, y: 0, width: 32, height: 32, mask: true },
  waterDam:          { x: 416, y: 0, width: 32, height: 32, mask: true },
  waterReservoir:    { x: 448, y: 0, width: 32, height: 32, mask: true },
  waterTreatment:    { x: 480, y: 0, width: 32, height: 32, mask: true },
  waterDesalination: { x: 512, y: 0, width: 32, height: 32, mask: true },
};

/** Cached atlas canvas */
let atlas: HTMLCanvasElement | null = null;

/**
 * Lazily generates a 544x32 canvas icon atlas with 17 white shapes.
 * All shapes drawn white -- Deck.gl mask mode tints via getColor.
 */
export function getIconAtlas(): HTMLCanvasElement {
  // Guard against stale cache in dev HMR (old atlas was 416px)
  if (atlas && atlas.width === 544) return atlas;
  atlas = null;

  const canvas = document.createElement('canvas');
  canvas.width = 544;
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

  // Icon 3 (offset 96): X mark -- two crossed lines (wide for easier picking)
  ctx.lineWidth = 5;
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

  // Icon 5 (offset 160): Explosion -- radiating burst (8-point, uneven rays)
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  const cx5 = 176;
  const cy5 = 16;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 2 === 0 ? 14 : 7;
    const x = cx5 + r * Math.cos(angle);
    const y = cy5 + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Icon 6 (offset 192): Crosshair -- targeting reticle
  const cx6 = 208;
  const cy6 = 16;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  // Circle
  ctx.beginPath();
  ctx.arc(cx6, cy6, 8, 0, Math.PI * 2);
  ctx.stroke();
  // Horizontal line
  ctx.beginPath();
  ctx.moveTo(cx6 - 13, cy6);
  ctx.lineTo(cx6 + 13, cy6);
  ctx.stroke();
  // Vertical line
  ctx.beginPath();
  ctx.moveTo(cx6, cy6 - 13);
  ctx.lineTo(cx6, cy6 + 13);
  ctx.stroke();

  // Icon 7 (offset 224): Atom/Nuclear -- 3 elliptical orbits with nucleus
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'white';
  const cx7 = 240;
  const cy7 = 16;
  for (let i = 0; i < 3; i++) {
    const angle = (i * Math.PI) / 3;
    ctx.save();
    ctx.translate(cx7, cy7);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = 'white';
  ctx.beginPath();
  ctx.arc(cx7, cy7, 3, 0, Math.PI * 2);
  ctx.fill();

  // Icon 8 (offset 256): Anchor/Naval
  ctx.strokeStyle = 'white';
  ctx.fillStyle = 'white';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  // Vertical shaft
  ctx.beginPath();
  ctx.moveTo(272, 7);
  ctx.lineTo(272, 26);
  ctx.stroke();
  // Horizontal crossbar
  ctx.beginPath();
  ctx.moveTo(264, 12);
  ctx.lineTo(280, 12);
  ctx.stroke();
  // Curved flukes at bottom
  ctx.beginPath();
  ctx.arc(272, 22, 8, 0, Math.PI, false);
  ctx.stroke();
  // Ring at top
  ctx.beginPath();
  ctx.arc(272, 5, 2.5, 0, Math.PI * 2);
  ctx.stroke();

  // Icon 9 (offset 288): Oil Derrick -- triangular tower
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'white';
  // Two legs of the triangle
  ctx.beginPath();
  ctx.moveTo(296, 4);
  ctx.lineTo(288, 28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(296, 4);
  ctx.lineTo(304, 28);
  ctx.stroke();
  // Base
  ctx.beginPath();
  ctx.moveTo(288, 28);
  ctx.lineTo(304, 28);
  ctx.stroke();
  // Cross-struts
  ctx.lineWidth = 1.5;
  const strutY1 = 12;
  const strutY2 = 20;
  // Left leg x at y: x = 296 - (296-288)*(y-4)/(28-4) = 296 - 8*(y-4)/24
  const lx1 = 296 - 8 * (strutY1 - 4) / 24;
  const rx1 = 296 + 8 * (strutY1 - 4) / 24;
  const lx2 = 296 - 8 * (strutY2 - 4) / 24;
  const rx2 = 296 + 8 * (strutY2 - 4) / 24;
  ctx.beginPath();
  ctx.moveTo(lx1, strutY1);
  ctx.lineTo(rx1, strutY1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(lx2, strutY2);
  ctx.lineTo(rx2, strutY2);
  ctx.stroke();

  // Icon 10 (offset 320): Jet Silhouette/Airbase -- top-down jet
  ctx.fillStyle = 'white';
  ctx.beginPath();
  // Fuselage
  ctx.moveTo(336, 4);
  ctx.lineTo(338, 12);
  // Right wing
  ctx.lineTo(350, 18);
  ctx.lineTo(338, 16);
  // Tail right
  ctx.lineTo(339, 24);
  ctx.lineTo(344, 28);
  ctx.lineTo(338, 26);
  // Tail center
  ctx.lineTo(336, 28);
  // Mirror left side
  ctx.lineTo(334, 26);
  ctx.lineTo(328, 28);
  ctx.lineTo(333, 24);
  // Left wing
  ctx.lineTo(334, 16);
  ctx.lineTo(322, 18);
  ctx.lineTo(334, 12);
  ctx.closePath();
  ctx.fill();

  // Icon 11 (offset 352): Water Droplet/Desalination -- simple filled teardrop
  ctx.fillStyle = 'white';
  const cx11 = 368;
  const cy11 = 20;
  const r11 = 11;
  ctx.beginPath();
  ctx.arc(cx11, cy11, r11, 0.2 * Math.PI, 0.8 * Math.PI, false); // round bottom
  ctx.lineTo(cx11, 2); // converge to sharp top point
  ctx.closePath();
  ctx.fill();

  // Icon 12 (offset 384): Bollard/Port -- mooring post
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  const cx12 = 400;
  // Rounded cap
  ctx.beginPath();
  ctx.arc(cx12, 10, 6, Math.PI, 0);
  ctx.fill();
  // Post body
  ctx.fillRect(cx12 - 4, 10, 8, 12);
  // Base plate
  ctx.fillRect(cx12 - 8, 22, 16, 4);

  // Reset styles for water facility icons
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'white';
  ctx.lineWidth = 2;
  ctx.lineCap = 'butt';

  // Icon 13 (offset 416): Dam -- trapezoid wall cross-section
  // Wide base (~24px), narrow top (~16px), ~22px tall
  ctx.beginPath();
  ctx.moveTo(424, 5);    // top-left
  ctx.lineTo(440, 5);    // top-right
  ctx.lineTo(444, 27);   // bottom-right
  ctx.lineTo(420, 27);   // bottom-left
  ctx.closePath();
  ctx.fill();

  // Icon 14 (offset 448): Reservoir -- oval lake shape with wave line
  const cx14 = 464;
  const cy14 = 16;
  // Main ellipse body
  ctx.beginPath();
  ctx.ellipse(cx14, cy14, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Wavy line across upper third to suggest water surface
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx14 - 9, cy14 - 2);
  ctx.quadraticCurveTo(cx14 - 4, cy14 - 5, cx14, cy14 - 2);
  ctx.quadraticCurveTo(cx14 + 4, cy14 + 1, cx14 + 9, cy14 - 2);
  ctx.stroke();
  ctx.strokeStyle = 'white';

  // Icon 15 (offset 480): Treatment plant -- rectangular base with circular tank
  ctx.fillStyle = 'white';
  // Rectangular base building
  ctx.fillRect(487, 18, 18, 10);
  // Circular tank on top
  ctx.beginPath();
  ctx.arc(496, 14, 6, 0, Math.PI * 2);
  ctx.fill();
  // Small chimney/pipe on left side
  ctx.fillRect(488, 6, 3, 8);

  // Icon 16 (offset 512): Desalination -- factory building + water droplet
  ctx.fillStyle = 'white';
  // Left: factory/building silhouette with angled roof
  ctx.beginPath();
  ctx.moveTo(514, 8);    // roof peak
  ctx.lineTo(520, 14);   // roof right
  ctx.lineTo(520, 28);   // bottom right
  ctx.lineTo(514, 28);   // bottom left (narrower)
  ctx.lineTo(514, 14);   // wall left
  ctx.closePath();
  ctx.fill();
  // Factory body
  ctx.fillRect(514, 14, 6, 14);
  // Right: water droplet
  const cx16d = 530;
  const cy16d = 20;
  ctx.beginPath();
  ctx.arc(cx16d, cy16d + 2, 5, 0.2 * Math.PI, 0.8 * Math.PI, false);
  ctx.lineTo(cx16d, 10);
  ctx.closePath();
  ctx.fill();

  atlas = canvas;
  return canvas;
}
