import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    visualizer({
      open: false,
      filename: 'dist/bundle-stats.html',
      gzipSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-maplibre': ['maplibre-gl'],
          // Phase 27.4.2 Plan 04 absorbed deferred fix (per
          // .planning/phases/27.4.2-ci-health-and-llm-v2-tuning/deferred-items.md):
          // dropped '@deck.gl/react' and '@deck.gl/aggregation-layers' — neither is
          // installed in package.json (only core, layers, mapbox, extensions are).
          // Rollup errors at build time when manualChunks names cannot be resolved
          // as entry modules. The two test-only mocks for aggregation-layers under
          // src/test/__mocks__/ are aliased via vite.config test.alias and never
          // need to be present in the production bundle graph.
          'vendor-deckgl': [
            '@deck.gl/core',
            '@deck.gl/layers',
            '@deck.gl/mapbox',
            '@deck.gl/extensions',
          ],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'scripts/load-test.spec.ts',
      // Phase 27.4.2 Rule-3 fix: legacy parallel-executor worktrees under
      // .claude/worktrees/agent-*/ contain stale snapshots of test files that
      // pre-date current fixture factories (e.g. filters.test.ts without
      // enabledPrecisions). They are dev tooling, not project source — vitest
      // glob-matching them inflates the failure count and blocks CI gates.
      '**/.claude/worktrees/**',
    ],
    globals: true,
    testTimeout: 10000,
    pool: 'forks',
    // vitest 4 removed per-pool option blocks; use top-level maxWorkers to bound forks.
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'text-summary', 'lcov'],
      include: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
      exclude: [
        'src/test/**',
        'src/__tests__/**',
        'server/__tests__/**',
        '**/*.test.{ts,tsx}',
        '**/*.spec.{ts,tsx}',
        '**/*.d.ts',
        'scripts/**',
      ],
      // Coverage thresholds act as a ratchet floor. Target is 80% lines / 75% functions /
      // 70% branches / 80% statements (per Phase 26.3 CONTEXT.md), but current baseline
      // is ~66% lines / ~70% funcs / ~53% branches / ~66% statements -- many UI/map
      // components are difficult to unit-test in jsdom (canvas/WebGL/deck.gl rendering
      // paths). Thresholds are pinned at the current baseline so any regression fails CI;
      // bump these upward as new tests land.
      // TODO(coverage): raise to 80/75/70/80 once jsdom-friendly tests are added for
      //   src/components/markets, src/components/notifications, src/components/search,
      //   src/components/ui/{FilterChip,SourceSelector}, src/hooks/useGeoContext,
      //   src/hooks/useShortcutKeyHandler, and the lower-coverage map layer hooks.
      thresholds: {
        lines: 66,
        functions: 69,
        branches: 53,
        statements: 65,
      },
    },
    alias: {
      'maplibre-gl/dist/maplibre-gl.css': path.resolve(
        __dirname,
        './src/test/__mocks__/maplibre-gl-css.ts',
      ),
      'maplibre-gl': path.resolve(__dirname, './src/test/__mocks__/maplibre-gl.ts'),
      '@deck.gl/mapbox': path.resolve(__dirname, './src/test/__mocks__/deck-gl-mapbox.ts'),
      '@vis.gl/react-maplibre': path.resolve(__dirname, './src/test/__mocks__/react-maplibre.tsx'),
      '@deck.gl/layers': path.resolve(__dirname, './src/test/__mocks__/deck-gl-layers.ts'),
      'maplibre-contour': path.resolve(__dirname, './src/test/__mocks__/maplibre-contour.ts'),
      '@deck.gl/aggregation-layers': path.resolve(
        __dirname,
        './src/test/__mocks__/deck-gl-aggregation-layers.ts',
      ),
      '@deck.gl/extensions': path.resolve(__dirname, './src/test/__mocks__/deck-gl-extensions.ts'),
    },
  },
});
