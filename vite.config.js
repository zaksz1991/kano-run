import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  },
  resolve: {
    alias: {
      // systems still import vendor path
      '/vendor/three.module.js': path.resolve(__dirname, 'node_modules/three/build/three.module.js'),
      '../../vendor/three.module.js': path.resolve(__dirname, 'node_modules/three/build/three.module.js'),
      '../vendor/three.module.js': path.resolve(__dirname, 'node_modules/three/build/three.module.js')
    }
  },
  server: { port: 5173, host: true }
});
