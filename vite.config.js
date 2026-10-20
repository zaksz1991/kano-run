import { defineConfig } from 'vite';
import { createGlbCatalogSyncPlugin } from './scripts/glb-catalog-sync.mjs';

export default defineConfig({
  base: '/',
  plugins: [createGlbCatalogSyncPlugin()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  server: {
    host: true,
  },
});
