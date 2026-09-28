import { defineConfig } from 'vite';

// Replace casinowebgame with your GitHub repo name for GitHub Pages sub-path deploy.
export default defineConfig({
  base: '/casinowebgame/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
});
