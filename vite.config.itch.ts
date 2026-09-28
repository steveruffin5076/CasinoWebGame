import { defineConfig } from 'vite';

/** itch.io upload: ZIP must have index.html at root; assets use relative paths. */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist-itch',
    assetsDir: 'assets',
    emptyOutDir: true,
  },
});
