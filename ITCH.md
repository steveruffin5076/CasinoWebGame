# itch.io build & upload

itch.io needs a **ZIP** with `index.html` at the **root** and **relative** asset paths (`./assets/...`). GitHub Pages uses a different base path — use the itch scripts here.

## One command

```bash
npm install
npm run package:itch
```

Output: **`release/grand-felt-casino-itch.zip`**

Upload that file on itch.io → **Edit game** → **Uploads** → **Upload files**.

Mark the upload as playable in the browser and choose **index.html** if prompted.

## Test locally before uploading

```bash
npm run build:itch
npm run preview:itch
```

Open the URL Vite prints (usually port 4173). Embed size on itch: try **960 × 640** or **960 × 720**.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run build` | GitHub Pages → `dist/` with base `/CasinoWebGame/` |
| `npm run build:itch` | itch.io → `dist-itch/` with base `./` |
| `npm run package:itch` | Build + ZIP for itch upload |

Config file: `vite.config.itch.ts`
