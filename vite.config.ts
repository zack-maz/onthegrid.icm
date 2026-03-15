import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
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
    globals: true,
    alias: {
      'maplibre-gl/dist/maplibre-gl.css': path.resolve(__dirname, './src/test/__mocks__/maplibre-gl-css.ts'),
      'maplibre-gl': path.resolve(__dirname, './src/test/__mocks__/maplibre-gl.ts'),
      '@deck.gl/mapbox': path.resolve(__dirname, './src/test/__mocks__/deck-gl-mapbox.ts'),
      '@vis.gl/react-maplibre': path.resolve(__dirname, './src/test/__mocks__/react-maplibre.tsx'),
      '@deck.gl/layers': path.resolve(__dirname, './src/test/__mocks__/deck-gl-layers.ts'),
    },
  },
});
