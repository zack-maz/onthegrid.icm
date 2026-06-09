/**
 * Wave-0 RED stub — REVEAL-DOCS-07 capture:layers contract.
 *
 * Reads `scripts/capture-hero.ts` as text (the script imports Playwright at
 * module load, so we assert against source text rather than executing it) and
 * pins the `--layers` extension Plan 04 implements:
 *   - ALL_LAYERS contains the 6 viz labels (incl. Geographic + Climate)
 *   - the screenshot output-path constants point at public/screenshots/ (D-06)
 *   - parseArgs recognizes a --layers mode
 *   - the ~10 expected layer-shot output filenames are enumerated
 *
 * RED today because: the path constants still point at docs/ (SCREENSHOTS_DIR =
 * join(DOCS_DIR, 'screenshots')), parseArgs has no 'layers' mode, and the
 * per-layer output filenames are not yet enumerated for the new shots. Goes
 * GREEN when Plan 04 repoints constants + adds the --layers mode.
 *
 * package.json must also expose the `capture:layers` script (Plan 04).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const ROOT = resolve(__dirname, '../..');
const script = readFileSync(resolve(ROOT, 'scripts/capture-hero.ts'), 'utf8');
const pkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')) as {
  scripts?: Record<string, string>;
};

describe('capture:layers contract (REVEAL-DOCS-07)', () => {
  it('ALL_LAYERS enumerates the 6 viz labels including Geographic + Climate', () => {
    const m = script.match(/const ALL_LAYERS\s*=\s*\[([^\]]*)\]/);
    expect(m, 'ALL_LAYERS const present').not.toBeNull();
    const body = m?.[1] ?? '';
    for (const label of [
      'Geographic',
      'Climate',
      'Political',
      'Ethnic',
      'Water',
      'Threat Density',
    ]) {
      expect(body, `ALL_LAYERS should include ${label}`).toContain(label);
    }
  });

  it('screenshot output constants point at public/screenshots/ (D-06 consolidation)', () => {
    // After the D-06 move, SCREENSHOTS_DIR must resolve under public/, not docs/.
    expect(script).toMatch(/public[\\/]screenshots/);
    // and must NOT still anchor the screenshots dir under docs/
    expect(script).not.toMatch(
      /SCREENSHOTS_DIR\s*=\s*join\(\s*DOCS_DIR\s*,\s*['"]screenshots['"]\s*\)/,
    );
  });

  it('parseArgs recognizes a --layers mode', () => {
    expect(script).toMatch(/--layers/);
    expect(script).toMatch(/['"]layers['"]/);
  });

  it('enumerates the ~10 expected layer-shot output filenames', () => {
    // The new --layers run produces a stable set of named PNGs in public/screenshots/.
    const expected = [
      'geographic',
      'climate',
      'political',
      'ethnic',
      'water-stress',
      'threat-density',
      'api-health',
      'actor-quality',
      'flight-recorder',
      'og-card',
    ];
    for (const name of expected) {
      expect(script, `capture:layers should output ${name}.png`).toContain(`${name}.png`);
    }
  });

  it('package.json exposes the capture:layers npm script', () => {
    expect(pkg.scripts?.['capture:layers']).toBeTruthy();
    expect(pkg.scripts?.['capture:layers']).toMatch(/--layers/);
  });
});
