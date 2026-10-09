import { defineConfig } from 'vite';

/**
 * Keep Vite's default entry, plugin and asset behavior, changing only the
 * generated fingerprint alphabet to hexadecimal for broader cache-hint tools.
 */
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        hashCharacters: 'hex'
      }
    }
  }
});
