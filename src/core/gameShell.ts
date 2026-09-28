import { navigate } from './router';
import { addTutorialButton, type PlayableTutorialGame } from './tutorial';

export interface GameShellRefs {
  shell: HTMLElement;
  stage: HTMLElement;
  info: HTMLElement;
  ctrl: HTMLElement;
}

export function createGameShell(
  theme: string,
  title: string,
  tutorial: PlayableTutorialGame,
): GameShellRefs {
  const shell = document.createElement('div');
  shell.className = `game-shell ${theme}`;
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" data-back>← Lobby</button><h2>${title}</h2><span class="bal"></span></div><div class="game-stage"></div><div class="info-bar"></div><div class="game-controls"></div>`;
  const header = shell.querySelector('.game-header') as HTMLElement;
  addTutorialButton(header, tutorial);
  shell.querySelector('[data-back]')!.addEventListener('click', () => navigate({ name: 'lobby' }));
  return {
    shell,
    stage: shell.querySelector('.game-stage') as HTMLElement,
    info: shell.querySelector('.info-bar') as HTMLElement,
    ctrl: shell.querySelector('.game-controls') as HTMLElement,
  };
}

export function bindBalance(el: HTMLElement, getChips: () => number): () => void {
  const tick = () => {
    el.textContent = `💰 ${getChips().toLocaleString()}`;
  };
  tick();
  return tick;
}
