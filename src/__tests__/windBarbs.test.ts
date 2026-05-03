import { describe, it, expect } from 'vitest';

import { generateWindBarbSVG, getWindBarbIcon } from '@/components/map/layers/windBarbs';

describe('generateWindBarbSVG', () => {
  it('generates valid SVG with staff only for calm wind (0 knots)', () => {
    const svg = generateWindBarbSVG(0);
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 32 64"');
    // Calm wind: staff line only, no barbs or triangles
    expect(svg).toContain('<line');
    expect(svg).not.toContain('<polygon');
  });

  it('generates SVG with one long barb for 10 knots', () => {
    const svg = generateWindBarbSVG(10);
    expect(svg).toContain('<svg');
    // Should have staff + 1 long barb line (total 2 lines)
    const lineMatches = svg.match(/<line/g);
    expect(lineMatches).toBeTruthy();
    // Staff + 1 long barb = 2 lines
    expect(lineMatches!.length).toBe(2);
  });

  it('generates SVG with two long barbs and one short barb for 25 knots', () => {
    const svg = generateWindBarbSVG(25);
    expect(svg).toContain('<svg');
    const lineMatches = svg.match(/<line/g);
    expect(lineMatches).toBeTruthy();
    // Staff + 2 long + 1 short = 4 lines
    expect(lineMatches!.length).toBe(4);
  });

  it('generates SVG with one triangle for 50 knots', () => {
    const svg = generateWindBarbSVG(50);
    expect(svg).toContain('<svg');
    expect(svg).toContain('<polygon');
    const polyMatches = svg.match(/<polygon/g);
    expect(polyMatches!.length).toBe(1);
  });

  it('generates SVG with one triangle and two long barbs plus one short for 75 knots', () => {
    const svg = generateWindBarbSVG(75);
    expect(svg).toContain('<svg');
    // 1 triangle
    const polyMatches = svg.match(/<polygon/g);
    expect(polyMatches!.length).toBe(1);
    // Staff + 2 long + 1 short = 4 lines
    const lineMatches = svg.match(/<line/g);
    expect(lineMatches!.length).toBe(4);
  });
});

describe('getWindBarbIcon', () => {
  it('returns data:image/svg+xml URL', () => {
    const url = getWindBarbIcon(10);
    expect(url).toMatch(/^data:image\/svg\+xml/);
  });

  it('rounds to nearest 5-knot bucket', () => {
    // 12 rounds to 10, 13 rounds to 15
    const url10 = getWindBarbIcon(10);
    const url12 = getWindBarbIcon(12);
    const url13 = getWindBarbIcon(13);
    const url15 = getWindBarbIcon(15);
    expect(url12).toBe(url10);
    expect(url13).toBe(url15);
  });

  it('pre-caches all icons from 0 to 100 by 5', () => {
    for (let speed = 0; speed <= 100; speed += 5) {
      const url = getWindBarbIcon(speed);
      expect(url).toMatch(/^data:image\/svg\+xml/);
    }
  });
});
