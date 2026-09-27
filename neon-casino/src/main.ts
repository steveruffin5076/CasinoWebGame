/* =============================================================================
   main.ts — Neon Casino entry point.
   Mounts the shell, preloads all generated art behind a loading bar, then
   hands control to the hash router.
   ========================================================================== */

import './styles/theme.css';
import './assets/cards.css';
import './assets/chips.css';
import './lobby/lobby.css';

import { installSuitSprite } from './assets/cards';
import { installMahjongSprite } from './mahjong/tiles';
import { installUnoSprite } from './uno/faces';
import { installAvatarsSprite } from './assets/avatars';
import { preloadAll } from './core/preload';
import { installAudioUnlock } from './core/audio';
import { installFpsMeter } from './core/loop';
import { start, register } from './core/router';
import { mountLobby } from './lobby/lobby';
import { mountBlackjack } from './blackjack/blackjack';
import { mountPoker } from './poker/poker';
import { mountMahjong } from './mahjong/mahjong';
import { mountUno } from './uno/uno';

/* --------------------------- global error guard --------------------------- */
window.addEventListener('error', (e) => console.error('[neon-casino]', e.message));
window.addEventListener('unhandledrejection', (e) =>
  console.error('[neon-casino] unhandled promise', e.reason),
);

function boot() {
  installSuitSprite();
  installMahjongSprite();
  installUnoSprite();
  installAvatarsSprite();
  installAudioUnlock();
  installFpsMeter();

  const app = document.getElementById('app')!;
  app.innerHTML = `<div class="app-bg"></div><div class="vignette"></div><div id="outlet" style="position:absolute;inset:0;z-index:2"></div>`;

  register('lobby', mountLobby);
  register('blackjack', mountBlackjack);
  register('poker', mountPoker);
  register('mahjong', mountMahjong);
  register('uno', mountUno);

  const bootEl = document.getElementById('boot');
  const bar = bootEl?.querySelector('.bar i') as HTMLElement | null;

  // Preload all code-drawn art while the neon boot screen is visible.
  preloadAll((p) => {
    if (bar) bar.style.transform = `translateX(${-110 + p * 520}%)`;
  }).then(() => {
    start(document.getElementById('outlet')!);
    if (bootEl) {
      bootEl.style.opacity = '0';
      setTimeout(() => bootEl.remove(), 480);
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
