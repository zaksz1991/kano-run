import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    minify: 'esbuild',
    sourcemap: false,

    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('three/examples/jsm/postprocessing/')) {
            return 'three-postprocessing';
          }

          if (
            id.includes('three/examples/jsm/loaders/') ||
            id.includes('three/examples/jsm/shaders/')
          ) {
            return 'three-extras';
          }

          if (id.includes('node_modules/three/')) {
            return 'three-core';
          }
        }
      }
    },

    chunkSizeWarningLimit: 500
  },

  resolve: {
    alias: {
      '/vendor/three.module.js': path.resolve(
        __dirname,
        'node_modules/three/build/three.module.js'
      ),
      '../../vendor/three.module.js': path.resolve(
        __dirname,
        'node_modules/three/build/three.module.js'
      ),
      '../vendor/three.module.js': path.resolve(
        __dirname,
        'node_modules/three/build/three.module.js'
      )
    }
  },

  server: {
    port: 5173,
    host: true
  }
});