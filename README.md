# Neon Casino

Virtual-chips casino lobby with **Blackjack**, **Texas Hold'em**, and **Hong Kong Mahjong** — single-player vs AI bots. Offline-first, no backend, no real money.

## Tech choice (3 lines)

**Vite + TypeScript + HTML Canvas** keeps the bundle small for GitHub Pages while giving full control over 60fps card animations (GPU transforms, particle pools) without loading Phaser for multiple game UIs. The lobby uses responsive DOM; each game mounts a canvas stage with shared core utilities (audio, storage, FPS). This split is easier to maintain than separate Phaser scenes yet still hits performance targets on mobile.

## Run locally

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173/CasinoWebGame/`).

## Build

```bash
npm run build
```

Output is in `dist/`.

## GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source:** GitHub Actions.
3. On each push to `main`, `.github/workflows/deploy.yml` runs `npm ci`, `npm run build`, and deploys `dist/`.

Public URL: `https://<USERNAME>.github.io/<REPO_NAME>/`  
For this repo: `https://steveruffin5076.github.io/CasinoWebGame/`

### Base path

`vite.config.ts` sets `base: '/CasinoWebGame/'`. Change it to match your repository name.

## Features

- Chip balance, daily bonus (+2,000 / 24h), free refill below 100 chips
- Bot difficulty per game (Easy / Normal / Hard)
- Web Audio synthesized SFX + mute toggle
- localStorage for balance, settings, stats
- `?fps=1` shows FPS meter; auto-reduces particles if FPS drops
- Mahjong: **136 tiles, no Flowers/Seasons** (documented simplification)

## Project structure

```
src/
  core/       chips, audio, storage, fps, assets, GameHost
  lobby/      casino home
  blackjack/  ♠️
  poker/      ♥️ + handEval
  mahjong/    🀄 + rules
  ai/         bot logic per game
```

## License

For entertainment only. No gambling with real money.
