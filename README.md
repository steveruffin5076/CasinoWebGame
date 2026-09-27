# CasinoWebGame — Neon Casino 🎰

This repo contains **Neon Casino**, a luxury neon-Vegas casino web game: Blackjack, Texas Hold'em, Hong Kong Mahjong and UNO Classic against AI bots. Virtual chips only — no real money.

👉 **Everything lives in [`neon-casino/`](neon-casino/)** — see its [README](neon-casino/README.md) for the full docs.

## Quick start

```bash
cd neon-casino
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

## Deploy

Push to `main` and the Pages workflow at `.github/workflows/deploy.yml` builds `neon-casino/` and deploys it (enable **Settings → Pages → Source: GitHub Actions** once). Public URL: `https://<USERNAME>.github.io/<REPO_NAME>/`.
