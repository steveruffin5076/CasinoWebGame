import { defineConfig } from 'vite';

// GitHub Pages sub-path — must match your repo name (see Settings → Pages).
export default defineConfig({
  base: '/CasinoWebGame/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
