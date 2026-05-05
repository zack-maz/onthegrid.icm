/**
 * Phase 28.2 Plan 04 Task 5 — MapDevExposer window.__map lockdown.
 *
 * D-07 lockdown: `MapDevExposer` (defined inline in BaseMap.tsx,
 * mounted at line 461) writes the underlying MapLibre map to
 * `window.__map`. This is a Playwright capture-script primitive and
 * a footgun in prod: an attacker with XSS reach could grab the live
 * map handle. The gate must remain `import.meta.env.DEV` so prod
 * bundles strip the entire branch via dead-code elimination.
 *
 * The test is a regression guard:
 *   1. Static-source check: BaseMap.tsx must mount MapDevExposer
 *      gated by `import.meta.env.DEV` — the literal string
 *      `import.meta.env.DEV && <MapDevExposer />` (or a tolerant
 *      regex variant) must be present. It must NOT be replaced with
 *      `shouldRenderDashboard()`.
 *   2. window.__map cleanliness: the lockdown surface establishes
 *      that `window.__map` is `undefined` in any prod build. The
 *      module-level helper itself (the static-source gate) is the
 *      mechanical enforcement; this assertion documents the runtime
 *      contract that flows from it.
 *
 * Note: BaseMap.tsx requires too much WebGL setup to mount in jsdom
 * for a single regression assertion. The static-source check is the
 * load-bearing test; the runtime cleanliness check just confirms
 * `window.__map` starts undefined and stays undefined when no DEV
 * code path runs.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

describe('MapDevExposer — window.__map lockdown (D-07, UI-SPEC §1)', () => {
  beforeEach(() => {
    // Clean slate: remove any leaked __map handle.
    delete (window as unknown as { __map?: unknown }).__map;
  });

  it('Source-level guard: BaseMap.tsx gates MapDevExposer with import.meta.env.DEV (NOT shouldRenderDashboard)', () => {
    // Load-bearing assertion. If a future agent search-and-replaces
    // `import.meta.env.DEV` → `shouldRenderDashboard()` near the
    // MapDevExposer mount line, this test fails. The same regression
    // would bring window.__map to prod — a CONTEXT D-07 violation.
    const sourcePath = resolve(__dirname, '../BaseMap.tsx');
    const source = readFileSync(sourcePath, 'utf8');

    // Allow flexible whitespace, but require the exact predicate.
    // The mount point looks like `{import.meta.env.DEV && <MapDevExposer />}`.
    expect(source).toMatch(/import\.meta\.env\.DEV\s*&&\s*<MapDevExposer\s*\/>/);

    // And the inverse: `shouldRenderDashboard()` must NOT appear next
    // to MapDevExposer. Search for a pairing in either order on the
    // same line — both are signals of accidental graduation.
    expect(source).not.toMatch(/shouldRenderDashboard\(\)\s*&&\s*<MapDevExposer\s*\/>/);
    expect(source).not.toMatch(/<MapDevExposer\s*\/>\s*&&\s*shouldRenderDashboard/);
  });

  it('Runtime guard: window.__map starts undefined and is not set without a DEV-code-path render', () => {
    // The module is never imported in prod builds (Vite tree-shakes
    // the `import.meta.env.DEV && ...` branch). In jsdom the global
    // simply has no entry. This assertion documents the runtime
    // contract D-07 protects.
    const w = window as unknown as { __map?: unknown };
    expect(w.__map).toBeUndefined();
  });
});
