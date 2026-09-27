import { defineConfig } from 'vite';

/**
 * Neon Casino — Vite configuration
 *
 * BASE PATH
 * ---------
 * `base: './'` emits *relative* asset URLs ("./assets/index-xxx.js") so the exact same
 * `dist/` works when served from the domain root (`https://user.github.io/`), from a
 * GitHub Pages sub-path (`https://<USERNAME>.github.io/<REPO_NAME>/`) and from the
 * Arena proxied preview. No code anywhere hardcodes a sub-path — routing is hash based
 * (`#/blackjack`), so it is sub-path safe by construction.
 *
 * If you prefer to pin the repo name for GitHub Pages, replace with:
 *   base: '/<REPO_NAME>/',
 * (relative './' also works fine on Pages and is more portable, so it is the default).
 */
export default defineConfig({
  base: './',

  server: {
    // Arena live-preview / phone testing: bind to all interfaces, never 127.0.0.1.
    host: '0.0.0.0',
    port: 5173,
    // Accept any Host header (required for the proxied https://5173-<id>.e2b.app origin).
    allowedHosts: true,
    // Dev-server origin checks are disabled so the proxied preview never gets blocked.
    cors: true,
    // HMR through the https proxy: connect back on the default TLS port with wss.
    hmr: {
      protocol: 'wss',
      clientPort: 443,
    },
  },

  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: true,
    cors: true,
  },

  build: {
    target: 'es2019',
    outDir: 'dist',
    assetsInlineLimit: 8192,
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
