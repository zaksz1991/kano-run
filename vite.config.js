import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { createGlbCatalogSyncPlugin } from './scripts/glb-catalog-sync.mjs';

const rootDir = process.cwd();

export default defineConfig({
  base: '/',
  plugins: [createGlbCatalogSyncPlugin()],
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
