import { addChips, getChips, needsFreeRefill, freeRefill } from '../core/chips';
import {
  canClaimDaily,
  loadSave,
  msUntilDaily,
  setDifficulty,
  getDifficulty,
  writeSave,
  DAILY_BONUS,
  type BotDifficulty,
} from '../core/storage';
import { formatChips, formatCountdown } from '../core/utils';
import { navigate, type Route } from '../core/router';
import { toggleMute, isMuted, resumeAudio, playClick } from '../core/audio';
import { setHighFpsMode, isHighFpsMode } from '../core/fps';
import { showTutorial, type PlayableTutorialGame } from '../core/tutorial';

const HOUSE_GAMES = new Set(['baccarat', 'craps', 'roulette', 'slots', 'sicbo']);

const GAMES: { id: string; name: string; emoji: string; route: Route['name'] }[] = [
  { id: 'blackjack', name: 'Blackjack', emoji: '♠️', route: 'blackjack' },
  { id: 'poker', name: "Texas Hold'em", emoji: '♥️', route: 'poker' },
  { id: 'mahjong', name: 'Hong Kong Mahjong', emoji: '🀄', route: 'mahjong' },
  { id: 'baccarat', name: 'Baccarat', emoji: '🎴', route: 'baccarat' },
  { id: 'craps', name: 'Craps', emoji: '🎲', route: 'craps' },
  { id: 'roulette', name: 'Roulette', emoji: '🎡', route: 'roulette' },
  { id: 'slots', name: 'Slots', emoji: '🎰', route: 'slots' },
  { id: 'sicbo', name: 'Sic Bo', emoji: '🔮', route: 'sicbo' },
];

export function renderLobby(root: HTMLElement): void {
  const save = loadSave();
  root.innerHTML = '';

  const top = document.createElement('div');
  top.className = 'top-bar';

  const bal = document.createElement('span');
  bal.className = 'chip-balance';
  bal.textContent = `💰 ${formatChips(getChips())}`;

  const dailyBtn = document.createElement('button');
  dailyBtn.className = 'btn btn-small';
  if (canClaimDaily(save)) {
    dailyBtn.textContent = `Daily +${DAILY_BONUS}`;
    dailyBtn.onclick = () => {
      resumeAudio();
      playClick();
      const s = loadSave();
      s.lastDailyBonus = Date.now();
      writeSave(s);
      addChips(DAILY_BONUS);
      renderLobby(root);
    };
  } else {
    dailyBtn.textContent = `Bonus ${formatCountdown(msUntilDaily(save))}`;
    dailyBtn.disabled = true;
  }

  const soundBtn = document.createElement('button');
  soundBtn.className = 'btn btn-small';
  soundBtn.textContent = isMuted() ? '🔇' : '🔊';
  soundBtn.onclick = () => {
    toggleMute();
    renderLobby(root);
  };

  const fpsBtn = document.createElement('button');
  fpsBtn.className = `btn btn-small ${isHighFpsMode() ? 'active' : ''}`;
  fpsBtn.textContent = '60fps';
  fpsBtn.title = 'Toggle particles / effects';
  fpsBtn.onclick = () => {
    setHighFpsMode(!isHighFpsMode());
    renderLobby(root);
  };

  if (needsFreeRefill()) {
    const refill = document.createElement('button');
    refill.className = 'btn btn-primary btn-small';
    refill.textContent = 'FREE REFILL';
    refill.onclick = () => {
      freeRefill();
      renderLobby(root);
    };
    top.append(bal, refill, dailyBtn, soundBtn, fpsBtn);
  } else {
    top.append(bal, dailyBtn, soundBtn, fpsBtn);
  }

  const lobby = document.createElement('div');
  lobby.className = 'lobby';

  const title = document.createElement('h1');
  title.className = 'lobby-title';
  title.textContent = '✨ Classic Casino ✨';

  const grid = document.createElement('div');
  grid.className = 'game-grid';

  for (const g of GAMES) {
    const card = document.createElement('div');
    card.className = 'game-card';
    const best = save.stats.winsByGame[g.id] ?? 0;
    card.innerHTML = `<span class="emoji">${g.emoji}</span><h3>${g.name}</h3><p class="muted">Best wins: ${best}</p>`;

    const diffRow = document.createElement('div');
    diffRow.className = 'diff-row';
    if (!HOUSE_GAMES.has(g.id)) {
      for (const d of ['easy', 'normal', 'hard'] as BotDifficulty[]) {
        const b = document.createElement('button');
        b.className = `btn btn-small ${getDifficulty(g.id) === d ? 'active' : ''}`;
        b.textContent = d[0].toUpperCase() + d.slice(1);
        b.onclick = () => {
          setDifficulty(g.id, d);
          renderLobby(root);
        };
        diffRow.appendChild(b);
      }
    } else {
      const tag = document.createElement('span');
      tag.className = 'muted';
      tag.textContent = 'vs house';
      diffRow.appendChild(tag);
    }

    const play = document.createElement('button');
    play.className = 'btn btn-primary';
    play.textContent = 'Play';
    play.onclick = () => {
      resumeAudio();
      playClick();
      navigate({ name: g.route });
    };

    const help = document.createElement('button');
    help.className = 'btn btn-small';
    help.textContent = 'Tutorial';
    help.onclick = () => showTutorial(g.id as PlayableTutorialGame, true);

    card.append(diffRow, play, help);
    grid.appendChild(card);
  }

  const footer = document.createElement('div');
  footer.className = 'stats-footer';
  footer.textContent = `Games played: ${save.stats.gamesPlayed} · Biggest win: ${formatChips(save.stats.biggestWin)} chips`;

  lobby.append(title, grid, footer);
  root.append(top, lobby);
}
