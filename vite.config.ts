import { defineConfig } from 'vite';
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
          'vendor-deckgl': [
            '@deck.gl/core',
            '@deck.gl/layers',
            '@deck.gl/mapbox',
            '@deck.gl/react',
            '@deck.gl/aggregation-layers',
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
    exclude: ['**/node_modules/**', '**/dist/**', 'scripts/load-test.spec.ts'],
    globals: true,
    testTimeout: 10000,
    pool: 'forks',
    forks: {
      maxForks: 4,
    },
    alias: {
      'maplibre-gl/dist/maplibre-gl.css': path.resolve(__dirname, './src/test/__mocks__/maplibre-gl-css.ts'),
      'maplibre-gl': path.resolve(__dirname, './src/test/__mocks__/maplibre-gl.ts'),
      '@deck.gl/mapbox': path.resolve(__dirname, './src/test/__mocks__/deck-gl-mapbox.ts'),
      '@vis.gl/react-maplibre': path.resolve(__dirname, './src/test/__mocks__/react-maplibre.tsx'),
      '@deck.gl/layers': path.resolve(__dirname, './src/test/__mocks__/deck-gl-layers.ts'),
      'maplibre-contour': path.resolve(__dirname, './src/test/__mocks__/maplibre-contour.ts'),
      '@deck.gl/aggregation-layers': path.resolve(__dirname, './src/test/__mocks__/deck-gl-aggregation-layers.ts'),
    },
  },
});
