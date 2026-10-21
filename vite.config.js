import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { createGlbCatalogSyncPlugin } from './scripts/glb-catalog-sync.mjs';
import { createKekeCatalogSafetyPlugin } from './scripts/keke-catalog-safety.mjs';

const rootDir = process.cwd();

export default defineConfig({
  base: '/',
  // The first plugin discovers the actual GLBs and writes the generated
  // catalogue. The post-transform guard prevents character assets from ever
  // becoming candidates for the player vehicle.
  plugins: [
    createGlbCatalogSyncPlugin(),
    createKekeCatalogSafetyPlugin(),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        glbModelReview: resolve(rootDir, 'glb-model-review.html'),
      },
    },
  },
  server: { host: true },
});
