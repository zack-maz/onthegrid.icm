#!/usr/bin/env tsx
/**
 * capture-hero.ts — Agentic hero GIF + layer screenshot capture
 *
 * Generates the portfolio hero GIF (Strait of Hormuz zoom with all visualization
 * layers active) and the PNG layer/feature screenshots by driving a headless
 * Playwright Chromium instance against the local dev server. All PNG/GIF outputs
 * land in `public/screenshots/` (D-06 consolidation — Vite serves these at
 * `/screenshots/...`, and the README/SHOWCASE reference them at the repo path
 * `public/screenshots/...`).
 *
 * Prerequisites:
 * - `npm run dev` running in another terminal (http://localhost:5173)
 * - `ffmpeg` and `gifski` on PATH (`brew install ffmpeg gifski`) — GIF mode ONLY;
 *   the `--layers` PNG path needs NEITHER (REVEAL-DOCS-07).
 * - Playwright chromium already installed (comes with @playwright/test devDep)
 *
 * Outputs (all under public/screenshots/):
 * - public/screenshots/hero.gif          (hero animated GIF, target <3MB)
 * - public/screenshots/political-layer.png
 * - public/screenshots/ethnic-layer.png
 * - public/screenshots/water-stress.png
 * - public/screenshots/threat-density.png
 * - public/screenshots/detail-panel.png
 * - public/screenshots/search-modal.png
 *
 * Additional outputs in `--layers` mode (REVEAL-DOCS-07, ~10 live-data shots):
 * - public/screenshots/geographic.png
 * - public/screenshots/climate.png
 * - public/screenshots/political.png
 * - public/screenshots/ethnic.png
 * - public/screenshots/water-stress.png
 * - public/screenshots/threat-density.png
 * - public/screenshots/api-health.png
 * - public/screenshots/actor-quality.png
 * - public/screenshots/flight-recorder.png
 * - public/screenshots/og-card.png       (1200x630 OG share card, REVEAL-SITE-03)
 *
 * Runtime: ~45 seconds end-to-end on a warm dev server.
 *
 * Usage:
 *   npm run capture:hero             # full capture (GIF + all screenshots)
 *   npm run capture:hero -- --gif    # GIF only
 *   npm run capture:hero -- --shots  # screenshots only
 *   npm run capture:layers           # ~10 live-data layer/feature PNGs + og-card.png
 */

import { execSync } from 'node:child_process';
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium, type Page } from '@playwright/test';

// ---------- Configuration ----------

const DEV_URL = 'http://localhost:5173';
const REPO_ROOT = resolve(import.meta.dirname, '..');
const TMP_DIR = join(REPO_ROOT, 'tmp', 'capture-hero');
// D-06: all capture outputs live under public/screenshots/ so Vite serves them
// at /screenshots/... and the README/SHOWCASE reference them at public/screenshots/...
const PUBLIC_DIR = join(REPO_ROOT, 'public');
const SCREENSHOTS_DIR = join(PUBLIC_DIR, 'screenshots');
const HERO_GIF = join(SCREENSHOTS_DIR, 'hero.gif');
const MAX_GIF_BYTES = 3 * 1024 * 1024; // 3 MB ceiling

const VIEWPORT = { width: 1280, height: 720 };

// Geographic coordinates (lng, lat) for the hero zoom animation
const WIDE_VIEW = { center: [45, 30] as [number, number], zoom: 4, pitch: 0, bearing: 0 };
const HORMUZ_VIEW = {
  center: [56.25, 26.57] as [number, number],
  zoom: 7,
  pitch: 45,
  bearing: 0,
};

// All layer toggles by aria-label. LayerTogglesSlot builds `Toggle ${label} layer`
// where label comes from LAYER_CONFIGS in LayerTogglesSlot.tsx. The weather layer
// is labeled "Climate" in the UI, not "Weather" — keep this in sync with the source.
const ALL_LAYERS = ['Geographic', 'Climate', 'Political', 'Ethnic', 'Water', 'Threat Density'];

// ---------- Utilities ----------

type Mode = 'full' | 'gif' | 'shots' | 'layers';

function parseArgs(): Mode {
  const args = process.argv.slice(2);
  if (args.includes('--gif')) return 'gif';
  if (args.includes('--layers')) return 'layers';
  if (args.includes('--shots')) return 'shots';
  return 'full';
}

function log(msg: string): void {
  console.log(`[capture-hero] ${msg}`);
}

function die(msg: string, code = 1): never {
  console.error(`[capture-hero] ERROR: ${msg}`);
  process.exit(code);
}

async function checkPrereqs(mode: Mode): Promise<void> {
  // Check dev server is reachable (all modes drive the live UI)
  try {
    const res = await fetch(DEV_URL);
    if (!res.ok) die(`Dev server returned ${res.status} at ${DEV_URL}`);
  } catch {
    die(`Dev server not reachable at ${DEV_URL}. Run \`npm run dev\` in another terminal first.`);
  }

  // ffmpeg/gifski are GIF-stitch ONLY. The --layers (and --shots) PNG paths
  // capture via page.screenshot() and need NEITHER. Skip the CLI-tool gate
  // unless a GIF is actually being produced (REVEAL-DOCS-07).
  const needsGifTools = mode === 'full' || mode === 'gif';
  if (!needsGifTools) return;

  for (const bin of ['ffmpeg', 'gifski']) {
    try {
      execSync(`command -v ${bin}`, { stdio: 'ignore' });
    } catch {
      die(`${bin} not found on PATH. Install with: brew install ${bin}`);
    }
  }
}

async function waitForMap(page: Page): Promise<void> {
  log('waiting for map instance…');
  // Phase 1: wait for window.__map to exist (MapDevExposer in BaseMap.tsx sets it
  // when the react-maplibre ref resolves).
  await page.waitForFunction(
    () => {
      const w = window as unknown as { __map?: unknown };
      return w.__map != null;
    },
    { timeout: 15_000 },
  );
  log('  map instance acquired');

  // Phase 2: wait for style to be loaded (faster than map.loaded() which also
  // requires all currently-needed sources to finish — terrain tiles can drag).
  log('  waiting for style…');
  await page.waitForFunction(
    () => {
      const w = window as unknown as {
        __map?: { isStyleLoaded?: () => boolean };
      };
      return w.__map?.isStyleLoaded?.() === true;
    },
    { timeout: 15_000 },
  );
  log('  style loaded');

  // Phase 3: dwell to let terrain, entity sources, and deck.gl layers render
  await page.waitForTimeout(3000);
  log('map ready');
}

/**
 * Opens the Sidebar's Layers content panel. The layer toggle switches live
 * inside a slide-in panel that has `!pointer-events-none` when closed, so
 * clicking a switch directly times out — we need to click the Layers icon
 * button in the sidebar icon strip first.
 */
async function openLayersPanel(page: Page): Promise<void> {
  // The icon strip has a button with aria-label="Layers" (from SECTIONS[].label).
  // The Layers icon button is a TOGGLE, so a blind click can close an already-open
  // panel. Probe whether a layer switch is already actionable first, and only
  // click to open when the panel is closed. Confirm the open by waiting for a
  // toggle to become clickable (not intercepted by the icon strip) — a fixed
  // timeout alone races the slide-in animation across repeated calls.
  const probeToggle = page.getByRole('switch', { name: /Toggle Geographic layer/i }).first();
  const alreadyOpen = await probeToggle.isVisible().catch(() => false);
  if (!alreadyOpen) {
    const layersButton = page.getByRole('button', { name: 'Layers', exact: true });
    if ((await layersButton.count()) === 0) {
      log('  ! Layers sidebar button not found — continuing anyway');
      return;
    }
    await layersButton.first().click();
  }
  // Wait for the slide-in to settle and the switch to become actionable. If the
  // panel still isn't interactable (intercepted by the icon strip), click the
  // Layers button once more as a recovery.
  try {
    await probeToggle.waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    const layersButton = page.getByRole('button', { name: 'Layers', exact: true });
    if ((await layersButton.count()) > 0) {
      await layersButton.first().click();
      await probeToggle.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
    }
  }
  await page.waitForTimeout(500);
}

async function enableAllLayers(page: Page): Promise<void> {
  log('opening Layers sidebar panel…');
  await openLayersPanel(page);

  log('enabling all visualization layers…');
  for (const layer of ALL_LAYERS) {
    const toggle = page.getByRole('switch', { name: new RegExp(`Toggle ${layer} layer`, 'i') });
    const count = await toggle.count();
    if (count === 0) {
      log(`  ! no toggle found for "${layer}" — skipping`);
      continue;
    }
    const state = await toggle.first().getAttribute('aria-checked');
    if (state !== 'true') {
      await toggle.first().click({ force: true });
      log(`  ✓ ${layer} toggled on`);
      await page.waitForTimeout(250);
    } else {
      log(`  ✓ ${layer} already on`);
    }
  }
  // Let all layers finish their first render pass
  await page.waitForTimeout(1500);
}

async function setOnlyLayer(page: Page, keepOn: string): Promise<void> {
  await openLayersPanel(page);
  for (const layer of ALL_LAYERS) {
    const toggle = page.getByRole('switch', { name: new RegExp(`Toggle ${layer} layer`, 'i') });
    const count = await toggle.count();
    if (count === 0) continue;
    const state = await toggle.first().getAttribute('aria-checked');
    const shouldBeOn = layer === keepOn;
    if ((state === 'true') !== shouldBeOn) {
      // force: the toggle is visible+enabled but the slide-in panel can render
      // with its click point under the sidebar-icon-strip on repeated re-opens,
      // which the default actionability check rejects as an intercept.
      await toggle.first().click({ force: true });
      await page.waitForTimeout(200);
    }
  }
  await page.waitForTimeout(1200);
}

/**
 * Closes the sidebar panel by clicking the currently-active icon strip button
 * again. The hero video wants the map to fill the viewport with no sidebar in
 * the frame. The screenshots also look cleaner without the sidebar open.
 */
async function closeSidebar(page: Page): Promise<void> {
  // Pressing Escape typically closes modals/panels; if that doesn't work for
  // this app, click outside the sidebar as a fallback.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  // If the sidebar is still open, click on the map center to defocus
  const sidebarOpen = await page
    .locator('[data-testid="sidebar-content"]')
    .evaluate((el) => {
      // Check if the sidebar content is visible (not translated off-screen)
      const rect = el.getBoundingClientRect();
      return rect.left >= 0;
    })
    .catch(() => false);
  if (sidebarOpen) {
    // Click a neutral map area (right side of viewport)
    await page.mouse.click(VIEWPORT.width - 100, VIEWPORT.height / 2);
    await page.waitForTimeout(400);
  }
}

async function jumpTo(
  page: Page,
  target: { center: [number, number]; zoom: number; pitch?: number; bearing?: number },
): Promise<void> {
  await page.evaluate((t) => {
    const w = window as unknown as { __map?: { jumpTo?: (opts: unknown) => void } };
    w.__map?.jumpTo?.({
      center: t.center,
      zoom: t.zoom,
      pitch: t.pitch ?? 0,
      bearing: t.bearing ?? 0,
    });
  }, target);
  await page.waitForTimeout(800);
}

// ---------- Capture: Hero GIF ----------

async function captureHeroGif(): Promise<void> {
  log('=== HERO GIF CAPTURE ===');

  // Prepare temp frame directory.
  //
  // Note on approach: Playwright's `recordVideo` does NOT capture WebGL content
  // in headless + software-GL mode (the browser compositor receives zeroed
  // frames for WebGL canvases rendered by SwiftShader). `page.screenshot()`
  // however reads the canvas backbuffer synchronously and does render the map
  // correctly. So we take a sequence of screenshots at ~10fps during the
  // flyTo animation and stitch them into a GIF with ffmpeg + gifski.
  const frameDir = join(TMP_DIR, 'frames');
  mkdirSync(frameDir, { recursive: true });
  for (const f of readdirSync(frameDir)) {
    try {
      unlinkSync(join(frameDir, f));
    } catch {
      /* ignore */
    }
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-accelerated-2d-canvas',
    ],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const FRAME_INTERVAL_MS = 150;
  const ANIMATION_DURATION_MS = 6000;
  const DWELL_MS = 1200;
  const TOTAL_FRAMES = Math.ceil((ANIMATION_DURATION_MS + DWELL_MS) / FRAME_INTERVAL_MS);
  const TARGET_FPS = Math.round(1000 / FRAME_INTERVAL_MS); // ~7 fps effective

  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);
    await enableAllLayers(page);
    await closeSidebar(page);

    // Start wide
    await jumpTo(page, WIDE_VIEW);
    await page.waitForTimeout(800);

    // Kick off the flyTo animation WITHOUT awaiting — it needs to run while
    // we snapshot frames. The `essential: true` flag disables motion-prefers-
    // reduced-motion shortcut that would skip animation entirely.
    await page.evaluate(
      (t) => {
        const w = window as unknown as {
          __map?: { flyTo?: (opts: unknown) => void };
        };
        w.__map?.flyTo?.({
          center: t.center,
          zoom: t.zoom,
          pitch: t.pitch,
          bearing: t.bearing,
          duration: t.duration,
          essential: true,
        });
      },
      { ...HORMUZ_VIEW, duration: ANIMATION_DURATION_MS },
    );

    // Snapshot frames at intervals during the animation + dwell
    log(`capturing ${TOTAL_FRAMES} frames at ${FRAME_INTERVAL_MS}ms intervals…`);
    for (let i = 0; i < TOTAL_FRAMES; i++) {
      const frameStart = Date.now();
      const framePath = join(frameDir, `frame-${String(i).padStart(4, '0')}.png`);
      await page.screenshot({ path: framePath, fullPage: false });
      const elapsed = Date.now() - frameStart;
      const sleep = Math.max(0, FRAME_INTERVAL_MS - elapsed);
      if (sleep > 0) {
        await page.waitForTimeout(sleep);
      }
    }
    log(`  captured ${TOTAL_FRAMES} frames`);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Stitch frames into a GIF via ffmpeg → gifski
  const frameCount = readdirSync(frameDir).filter((f) => f.endsWith('.png')).length;
  if (frameCount === 0) die('No frames captured');
  log(`stitching ${frameCount} frames → gif…`);

  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const stitch = (fps: number, width: number, quality: number): void => {
    // gifski accepts PNG files directly and handles lanczos scaling via --width.
    // No intermediate ffmpeg step needed for PNG → GIF.
    const cmd = `gifski -o "${HERO_GIF}" --fps ${fps} --width ${width} --quality ${quality} ${frameDir}/frame-*.png`;
    execSync(cmd, { shell: '/bin/bash', stdio: 'inherit' });
  };

  stitch(TARGET_FPS, 1280, 85);
  let gifBytes = statSync(HERO_GIF).size;
  log(`first pass: ${(gifBytes / 1024).toFixed(0)} KB`);

  if (gifBytes > MAX_GIF_BYTES) {
    log(`over 3MB ceiling — re-encoding at width=960 quality=70`);
    stitch(TARGET_FPS, 960, 70);
    gifBytes = statSync(HERO_GIF).size;
    log(`second pass: ${(gifBytes / 1024).toFixed(0)} KB`);
  }

  if (gifBytes > MAX_GIF_BYTES) {
    log(`still over ceiling — re-encoding at width=800 quality=60`);
    stitch(TARGET_FPS, 800, 60);
    gifBytes = statSync(HERO_GIF).size;
    log(`third pass: ${(gifBytes / 1024).toFixed(0)} KB`);
  }

  if (gifBytes > MAX_GIF_BYTES) {
    die(
      `GIF still over ${MAX_GIF_BYTES} bytes after 3 encoding passes — manual intervention needed`,
    );
  }

  log(
    `✓ public/screenshots/hero.gif written (${(gifBytes / 1024).toFixed(0)} KB, ${frameCount} frames @ ${TARGET_FPS}fps)`,
  );

  // Clean up frame PNGs
  for (const f of readdirSync(frameDir)) {
    try {
      unlinkSync(join(frameDir, f));
    } catch {
      /* ignore */
    }
  }
}

// ---------- Capture: Layer screenshots ----------

async function captureScreenshots(): Promise<void> {
  log('=== LAYER SCREENSHOTS ===');

  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-accelerated-2d-canvas',
    ],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // higher res for screenshots
  });
  const page = await context.newPage();

  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);

    // --- political-layer.png ---
    log('capturing political-layer.png');
    await setOnlyLayer(page, 'Political');
    await closeSidebar(page);
    await jumpTo(page, { center: [45, 30], zoom: 4.2, pitch: 0, bearing: 0 });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'political-layer.png'),
      fullPage: false,
    });

    // --- ethnic-layer.png ---
    log('capturing ethnic-layer.png');
    await setOnlyLayer(page, 'Ethnic');
    await closeSidebar(page);
    await jumpTo(page, { center: [42, 34], zoom: 5, pitch: 0, bearing: 0 });
    await page.waitForTimeout(1500);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'ethnic-layer.png'),
      fullPage: false,
    });

    // --- water-stress.png ---
    log('capturing water-stress.png');
    await setOnlyLayer(page, 'Water');
    await closeSidebar(page);
    await jumpTo(page, { center: [45, 32], zoom: 5, pitch: 20, bearing: 0 });
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'water-stress.png'),
      fullPage: false,
    });

    // --- threat-density.png ---
    log('capturing threat-density.png');
    await setOnlyLayer(page, 'Threat Density');
    await closeSidebar(page);
    await jumpTo(page, { center: [45, 32], zoom: 5, pitch: 0, bearing: 0 });
    await page.waitForTimeout(1800);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'threat-density.png'),
      fullPage: false,
    });

    // --- search-modal.png ---
    // Capture BEFORE detail-panel so leftover panel state doesn't interfere.
    // Click the topbar search hint button directly rather than rely on Cmd+K,
    // which doesn't always register through Playwright's keyboard API in
    // headless mode (it calls useSearchStore.getState().openSearchModal()).
    log('capturing search-modal.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    const searchHint = page.locator('[data-testid="topbar-search-hint"]');
    const hintCount = await searchHint.count();
    if (hintCount === 0) {
      log('  ! topbar search hint not found — search modal capture will be blank');
    } else {
      await searchHint.first().click();
      await page.waitForTimeout(500);
    }
    // Type a sample query to show autocomplete
    await page.keyboard.type('type:flight', { delay: 50 });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'search-modal.png'),
      fullPage: false,
    });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // --- detail-panel.png ---
    // Enable all layers so there's something to click, then click-center
    log('capturing detail-panel.png');
    await enableAllLayers(page);
    await closeSidebar(page);
    await jumpTo(page, { center: [51.4, 35.7], zoom: 7, pitch: 30, bearing: 0 });
    await page.waitForTimeout(2000);
    // Click somewhere in the middle of the viewport to try to hit an entity
    await page.mouse.click(VIEWPORT.width / 2, VIEWPORT.height / 2);
    await page.waitForTimeout(800);
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'detail-panel.png'),
      fullPage: false,
    });
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const shots = readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
  log(`✓ ${shots.length} screenshots in public/screenshots/`);
  for (const s of shots) {
    const bytes = statSync(join(SCREENSHOTS_DIR, s)).size;
    log(`  - ${s} (${(bytes / 1024).toFixed(0)} KB)`);
  }
}

// ---------- Capture: Layer + feature screenshots (--layers, REVEAL-DOCS-07) ----------

/**
 * Opens the DevApiStatus modal (dev-open per useShouldRenderDashboard ===
 * `import.meta.env.DEV || hasDashboardKey()`, so no localStorage auth injection
 * is needed in local dev) and selects the consolidated API Health tab.
 */
async function openApiHealth(page: Page): Promise<void> {
  const trigger = page.locator('[data-testid="dev-api-status-trigger"]');
  if ((await trigger.count()) === 0) {
    log('  ! dev-api-status-trigger not found — API Health shots will be blank');
    return;
  }
  await trigger.first().click();
  await page.waitForTimeout(400);
  const tab = page.locator('[data-testid="tab-api-health"]');
  if ((await tab.count()) > 0) {
    await tab.first().click();
    await page.waitForTimeout(400);
  }
}

/** Expands an API-Health collapsible group by clicking its header button. */
async function expandGroup(page: Page, slug: string): Promise<void> {
  const group = page.locator(`[data-testid="group-${slug}"]`);
  if ((await group.count()) === 0) {
    log(`  ! group-${slug} not found — skipping expand`);
    return;
  }
  const header = group.locator(`#group-${slug}-header`);
  const body = group.locator(`#group-${slug}-body`);
  const hidden = await body.first().getAttribute('hidden');
  if (hidden !== null && (await header.count()) > 0) {
    await header.first().click();
    await page.waitForTimeout(400);
  }
}

async function captureLayers(): Promise<void> {
  log('=== LAYER + FEATURE SCREENSHOTS (--layers) ===');

  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    // REQUIRED: without --use-gl=angle --use-angle=swiftshader the WebGL map
    // canvas renders zeroed frames under headless software GL.
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-accelerated-2d-canvas',
    ],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2, // crisp retina-grade PNGs
  });
  const page = await context.newPage();

  try {
    await page.goto(DEV_URL, { waitUntil: 'domcontentloaded' });
    await waitForMap(page);

    // --- 6 isolated visualization layers (live data, D-04) ---
    const layerShots: Array<{
      label: string;
      file: string;
      view: { center: [number, number]; zoom: number; pitch?: number; bearing?: number };
      dwellMs: number;
    }> = [
      {
        label: 'Geographic',
        file: 'geographic.png',
        view: { center: [52, 30], zoom: 4.4, pitch: 30 },
        dwellMs: 1500,
      },
      {
        label: 'Climate',
        file: 'climate.png',
        view: { center: [50, 30], zoom: 4.2, pitch: 0 },
        dwellMs: 1500,
      },
      {
        label: 'Political',
        file: 'political.png',
        view: { center: [45, 30], zoom: 4.2, pitch: 0 },
        dwellMs: 1500,
      },
      {
        label: 'Ethnic',
        file: 'ethnic.png',
        view: { center: [42, 34], zoom: 5, pitch: 0 },
        dwellMs: 1500,
      },
      {
        label: 'Water',
        file: 'water-stress.png',
        view: { center: [45, 32], zoom: 5, pitch: 20 },
        dwellMs: 1800,
      },
      {
        label: 'Threat Density',
        file: 'threat-density.png',
        view: { center: [45, 32], zoom: 5, pitch: 0 },
        dwellMs: 1800,
      },
    ];

    for (const shot of layerShots) {
      log(`capturing ${shot.file} (layer: ${shot.label})`);
      await setOnlyLayer(page, shot.label);
      await closeSidebar(page);
      await jumpTo(page, shot.view);
      await page.waitForTimeout(shot.dwellMs);
      await page.screenshot({ path: join(SCREENSHOTS_DIR, shot.file), fullPage: false });
    }

    // --- API Health dashboard (dev-open) ---
    log('capturing api-health.png');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    await openApiHealth(page);
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'api-health.png'), fullPage: false });

    // --- actor-quality drill-down (API Health → Operator Actions group) ---
    log('capturing actor-quality.png');
    await expandGroup(page, 'operator-actions');
    const actorRow = page.locator('[data-testid="actor-quality-row"]');
    if ((await actorRow.count()) > 0) {
      await actorRow
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page.waitForTimeout(400);
    } else {
      log('  ! actor-quality-row not found — capturing operator-actions group as-is');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'actor-quality.png'), fullPage: false });

    // --- FlightRecorderBlock drill-down (API Health → LLM Pipeline group, Phase 39) ---
    log('capturing flight-recorder.png');
    await expandGroup(page, 'llm-pipeline');
    const recorder = page.locator('[data-testid*="flight-recorder"], [data-testid*="run-history"]');
    if ((await recorder.count()) > 0) {
      await recorder
        .first()
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page.waitForTimeout(400);
    } else {
      log('  ! flight-recorder block not found — capturing llm-pipeline group as-is');
    }
    await page.screenshot({ path: join(SCREENSHOTS_DIR, 'flight-recorder.png'), fullPage: false });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);

    // --- og-card.png (1200x630 OG share card, REVEAL-SITE-03) ---
    // A well-composed all-layers Hormuz frame, clipped to exactly 1200x630 so the
    // social-share crawlers get the universal og:image dimensions.
    log('capturing og-card.png (1200x630)');
    await enableAllLayers(page);
    await closeSidebar(page);
    await jumpTo(page, { center: [56.25, 26.57], zoom: 6.4, pitch: 40, bearing: 0 });
    await page.waitForTimeout(2000);
    // Clip to a 1200x630 region anchored top-left of the viewport. With
    // deviceScaleFactor:2 a 600x315 CSS clip yields a 1200x630 PNG.
    await page.screenshot({
      path: join(SCREENSHOTS_DIR, 'og-card.png'),
      clip: { x: 0, y: 0, width: 600, height: 315 },
    });
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  const shots = readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith('.png'));
  log(`✓ ${shots.length} PNGs in public/screenshots/`);
  for (const s of shots) {
    const bytes = statSync(join(SCREENSHOTS_DIR, s)).size;
    log(`  - ${s} (${(bytes / 1024).toFixed(0)} KB)`);
  }
}

// ---------- Main ----------

async function main(): Promise<void> {
  const mode = parseArgs();
  log(`mode: ${mode}`);

  await checkPrereqs(mode);

  if (mode === 'full' || mode === 'gif') {
    await captureHeroGif();
  }
  if (mode === 'full' || mode === 'shots') {
    await captureScreenshots();
  }
  if (mode === 'layers') {
    await captureLayers();
  }

  log('done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
