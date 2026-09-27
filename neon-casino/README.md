# 🎰 Neon Casino

A **luxury neon-Vegas casino web game** — Blackjack, Texas Hold'em, Hong Kong Mahjong and UNO Classic against AI bots, in one offline-first static site.

> 🎮 **Virtual chips only.** No real money, no purchases, no prizes, no login — just good clean felt.

---

## 🕹 Play

| Game | Highlights |
| --- | --- |
| ♠️ **Blackjack** | 6-deck shoe, Vegas rules (S17, BJ 3:2), double, split, insurance, basic-strategy bots |
| ♥️ **Texas Hold'em** | 6-max no-limit, blinds 10/20 doubling every 10 hands, side pots, showdown highlights, Monte-Carlo equity bots |
| 🀄 **HK Mahjong** | Full 136-tile wall, Chow/Pung/Kong/Hu with an 8-second call timer, simplified fan scoring, leaderboard |
| 🃏 **UNO Classic** | 108 cards, colour-blind-friendly faces, UNO! button + catch-the-bot, ambient table colour glow |

Everything is drawn **in code** (SVG/CSS/Canvas) — no external images, no network calls, works fully offline. All sounds are synthesized with the Web Audio API.

## 🧱 Tech choice

**Vite + TypeScript + hand-rolled DOM/Canvas (no framework, no Phaser).**

1. Four card tables are mostly *transform-animated DOM + SVG*, which stays crisp on retina, needs zero asset downloads and keeps the bundle ~55 kB gzipped — Phaser's scene graph would be dead weight for turn-based tables.
2. One shared `requestAnimationFrame` ticker + object pools (cards, chips, particles) give us the 60 fps discipline we wanted without a game engine.
3. A framework-free static build means `npm run build` → `dist/` deploys anywhere (GitHub Pages, any static host) with no hydration or runtime deps.

## 🚀 Run locally

```bash
npm install
npm run dev                 # http://localhost:5173
```

**In Arena / proxied preview** (bind all interfaces, accept any host):

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

The vite config already sets `server.host = '0.0.0.0'`, `allowedHosts: true` and wss HMR for proxied preview, so `npm run dev` works both ways.

Production build + preview:

```bash
npm run build              # type-checks, then emits dist/
npm run preview -- --host 0.0.0.0 --port 4173
```

### Tests (optional, dev-only)

```bash
# headless engine tests: 500 blackjack rounds, 200 poker hands, 100 uno
# rounds, mahjong scoring/shanten checks
npx esbuild tests/logic.test.ts --bundle --platform=node --format=esm \
  --outfile=/tmp/logic.test.mjs --loader:.svg=text && node /tmp/logic.test.mjs

# DOM smoke test (needs jsdom): see header of tests/dom.smoke.js
```

## 🌐 Deploy to GitHub Pages

1. Push to `main`. Two workflows are included: the repo-root `.github/workflows/deploy.yml` (project in the `neon-casino/` sub-folder — active when you push the whole CasinoWebGame repo) and `neon-casino/.github/workflows/deploy.yml` (standalone, when the folder itself is the repo).
2. In GitHub: **Settings → Pages → Source: GitHub Actions** (one-time).
3. Every push to `main` now builds and deploys automatically.

Public URL format: **`https://<USERNAME>.github.io/<REPO_NAME>/`**

The app is **sub-path safe by construction**: assets are emitted with relative URLs (`base: './'`) and routing is hash-based (`#/blackjack`), so the same `dist/` works at the domain root, under any sub-path, and in the Arena preview. If you prefer to pin the repo name, change `base` in `vite.config.ts` to `'/<REPO_NAME>/'` — but you don't need to.

## 🎨 Design system

All colours, fonts, buttons, modals and keyframes live in [`src/styles/theme.css`](src/styles/theme.css):

- Deep navy gradient (`#0a0e1a → #131a2e`) with an animated spotlight sweep and vignette
- Gold (`#d4af37` / `#f5e6b8`) for borders, titles, chips; neon cyan/magenta/green/red accents
- Glassmorphism panels, 44 px minimum touch targets, `prefers-reduced-motion` support
- Per-table themes: emerald felt + wood rim (Blackjack), midnight pro table (Hold'em), jade + bamboo (Mahjong), purple arena with ambient colour flood (UNO)

## ⚡ Performance

- One shared rAF ticker; **auto-degrades to low-FX mode** if FPS < 45 for 3 s (or via the ✨ toggle in the top bar)
- Particles hard-capped at 150; object pools for cards, chips and particles
- Every stage is authored on a fixed virtual canvas (e.g. 1000×680) and scaled with a single GPU transform — 360 px phones through 1920 px desktops, portrait or landscape
- Hidden FPS meter: append **`?fps=1`** to the URL
- All textures are generated at boot behind the loading bar (52 card faces, 34 mahjong faces, 56 UNO faces, 6 avatars)

## 🤖 The bots

Six recurring characters — **Vegas Vic 😎, Lucky Lin 🍀, Bluff Bella 🕶️, Chip Charlie 🤖, Ruby Rae 💎, Neon Nick 🎲** — with code-drawn SVG avatars, mood faces (thinking/happy/sad), speech bubbles and per-game AI (`src/ai/`), each with Easy/Normal/Hard difficulty from the lobby cards.

## 📐 Rule simplifications (documented)

- **Mahjong:** no Flowers/Seasons (136 tiles); dead wall = last 14 tiles; a match is 4 hands (East-1 → East-4, one full wind rotation); simplified HK fan table capped at 13 fan; **points = fan × 10 chips**, discarder pays 3× on a win by discard, all players pay on a self-draw win.
- **UNO:** classic rules — no stacking, Wild +4 only when you hold no card of the current colour; match target 500 points or best-of-5 (toggle in the toolbar).
- **Poker:** table buy-in 1,000 chips from your wallet (cash out any time); bots silently re-buy when busted.

## 📁 Project layout

```
neon-casino/
├─ index.html              # boot screen + app root
├─ vite.config.ts          # 0.0.0.0 + allowedHosts for proxied preview
├─ .github/workflows/deploy.yml
├─ src/
│  ├─ main.ts              # entry: sprites, preload, router
│  ├─ styles/theme.css     # the whole design system
│  ├─ core/                # chips/wallet, storage, audio, loop (rAF), fx, ui, router, deck
│  ├─ assets/              # cards.ts (SVG faces), chips, avatars + .svg sprites
│  ├─ lobby/               # casino floor + game art headers
│  ├─ blackjack/ poker/ mahjong/ uno/   # engine + table UI per game
│  └─ ai/                  # one bot brain per game
└─ tests/                  # headless engine tests + jsdom smoke test
```

## 🔒 Persistence

`localStorage` key `neon-casino:v1`: chip balance (start 10,000), daily bonus timer (+2,000 every 24 h), free refill under 100 chips, settings (sound, FX, per-game difficulty) and stats (games played, biggest win, win rate). No database, no backend, no tracking.
