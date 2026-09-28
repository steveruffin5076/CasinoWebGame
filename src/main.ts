import './style.css';
import { preloadAssets } from './core/assets';
import { initFps } from './core/fps';
import { onRoute } from './core/router';
import { renderLobby } from './lobby/lobby';
import { mountBlackjack } from './blackjack/blackjackGame';
import { mountPoker } from './poker/pokerGame';
import { mountMahjong } from './mahjong/mahjongGame';
import { resumeAudio } from './core/audio';

const app = document.querySelector<HTMLDivElement>('#app')!;
const overlay = document.querySelector('#loading-overlay')!;
const fill = document.querySelector('#loading-fill') as HTMLElement;
const loadText = document.querySelector('#loading-text') as HTMLElement;

let unmountGame: (() => void) | null = null;

function showLoading(): void {
  overlay.classList.remove('hidden');
}

function hideLoading(): void {
  overlay.classList.add('hidden');
}

async function boot(): Promise<void> {
  initFps();
  showLoading();
  await preloadAssets((p, label) => {
    fill.style.width = `${p * 100}%`;
    loadText.textContent = `Loading ${label}…`;
  });
  hideLoading();

  document.body.addEventListener(
    'click',
    () => resumeAudio(),
    { once: true, passive: true },
  );

  onRoute((route) => {
    unmountGame?.();
    unmountGame = null;
    app.innerHTML = '';
    if (route.name === 'lobby') {
      renderLobby(app);
      return;
    }
    if (route.name === 'blackjack') unmountGame = mountBlackjack(app);
    if (route.name === 'poker') unmountGame = mountPoker(app);
    if (route.name === 'mahjong') unmountGame = mountMahjong(app);
  });

  renderLobby(app);
}

boot();
