import { GameHost } from '../core/GameHost';
import { createMahjongWall, drawMahjongTile, type MahjongTile } from '../core/assets';
import { shuffle, delay } from '../core/utils';
import { getDifficulty } from '../core/storage';
import { sortHand, canWinHand, scoreHand, pointsFromFan, tileKey, findChowTiles } from './rules';
import { botDiscard, botShouldPung, botShouldWin, botShouldChow } from '../ai/mahjongBot';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playDeal, playWin } from '../core/audio';
import { navigate } from '../core/router';
import { addTutorialButton, showTutorial } from '../core/tutorial';

interface MJPlayer {
  name: string;
  human: boolean;
  hand: MahjongTile[];
  melds: MahjongTile[][];
}

function expectsDraw(handLen: number): boolean {
  return handLen % 3 === 1;
}

function expectsDiscard(handLen: number): boolean {
  return handLen % 3 === 2;
}

export function mountMahjong(root: HTMLElement): () => void {
  const shell = document.createElement('div');
  shell.className = 'game-shell theme-mahjong';
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" id="mj-back">← Lobby</button><h2>🀄 Hong Kong Mahjong</h2><button class="btn btn-small" id="mj-leave">Leave</button></div><div class="game-stage" id="mj-stage"></div><div class="info-bar" id="mj-info">No Flowers — 136 tiles</div><div class="game-controls" id="mj-ctrl"></div>`;
  root.appendChild(shell);

  const header = shell.querySelector('.game-header') as HTMLElement;
  addTutorialButton(header, 'mahjong');
  showTutorial('mahjong');

  const stage = shell.querySelector('#mj-stage') as HTMLElement;
  const info = shell.querySelector('#mj-info') as HTMLElement;
  const ctrl = shell.querySelector('#mj-ctrl') as HTMLElement;
  const host = new GameHost(stage, '#2a6b5a');

  let wall: MahjongTile[] = [];
  let players: MJPlayer[] = [];
  let current = 0;
  let roundWind = 0;
  let eastRound = 1;
  let lastDiscard: { tile: MahjongTile; from: number } | null = null;
  let selected: number | null = null;
  let callTimer: ReturnType<typeof setInterval> | null = null;
  let dragStartY = 0;

  function clearCallTimer(): void {
    if (callTimer) {
      clearInterval(callTimer);
      callTimer = null;
    }
  }

  function startMatch(): void {
    wall = shuffle(createMahjongWall());
    players = [
      { name: 'You (East)', human: true, hand: [], melds: [] },
      { name: 'North Bot', human: false, hand: [], melds: [] },
      { name: 'West Bot', human: false, hand: [], melds: [] },
      { name: 'South Bot', human: false, hand: [], melds: [] },
    ];
    for (let i = 0; i < 13; i++) {
      for (const p of players) p.hand.push(wall.pop()!);
    }
    players.forEach((p) => (p.hand = sortHand(p.hand)));
    current = 0;
    lastDiscard = null;
    selected = null;
    info.textContent = `Wall: ${wall.length} | Wind ${roundWind + 1}/4 — East-${eastRound}`;
    if (current === 0) humanTurn();
    else botTurnLoop();
  }

  function drawFor(player: MJPlayer): boolean {
    if (!wall.length) return false;
    const t = wall.pop()!;
    player.hand.push(t);
    player.hand = sortHand(player.hand);
    playDeal();
    if (canWinHand(player.hand)) {
      win(player, true);
      return true;
    }
    return false;
  }

  function humanDraw(): void {
    if (current !== 0 || !expectsDraw(players[0].hand.length)) return;
    if (drawFor(players[0])) return;
    humanTurn();
  }

  function humanTurn(): void {
    renderCtrl();
    const h = players[0].hand.length;
    if (expectsDraw(h)) {
      info.textContent = `Draw a tile from the wall (${wall.length} left)`;
    } else if (expectsDiscard(h)) {
      info.textContent = `Select a tile to discard (tap twice or drag up)`;
    } else {
      info.textContent = `Wall: ${wall.length}`;
    }
  }

  function discard(player: MJPlayer, tile: MahjongTile): void {
    if (!expectsDiscard(player.hand.length)) return;
    const idx = player.hand.findIndex((t) => t.id === tile.id);
    if (idx < 0) return;
    player.hand.splice(idx, 1);
    selected = null;
    lastDiscard = { tile, from: current };
    const fromPlayer = current;
    current = (current + 1) % 4;
    afterDiscard(fromPlayer);
  }

  async function afterDiscard(from: number): Promise<void> {
    const tile = lastDiscard!.tile;
    const upper = (from + 1) % 4;
    let claimed = false;

    for (let pi = 1; pi <= 3; pi++) {
      const idx = (from + pi) % 4;
      const p = players[idx];
      if (p.human) continue;
      const diff = getDifficulty('mahjong');
      if (botShouldWin(p.hand, tile)) {
        win(p, false);
        return;
      }
      if (botShouldPung(p.hand, tile, diff)) {
        pung(p, tile, idx);
        claimed = true;
        break;
      }
      if (idx === upper && botShouldChow(p.hand, tile, diff) && findChowTiles(p.hand, tile)) {
        chow(p, tile, idx);
        claimed = true;
        break;
      }
    }

    if (!claimed && from !== 0) {
      offerCalls(tile, from);
      return;
    }

    if (!claimed) await botTurnLoop();
    else if (players[current].human) humanTurn();
    else await botTurnLoop();
  }

  function offerCalls(tile: MahjongTile, from: number): void {
    clearCallTimer();
    ctrl.innerHTML = '';
    const hand = players[0].hand;
    const upper = (from + 1) % 4;
    const add = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.onclick = () => {
        clearCallTimer();
        fn();
      };
      ctrl.appendChild(b);
    };
    if (canWinHand([...hand, tile])) {
      add('Win (Hu)', () => {
        players[0].hand.push(tile);
        players[0].hand = sortHand(players[0].hand);
        win(players[0], false);
      });
    }
    const key = tileKey(tile);
    if (hand.filter((t) => tileKey(t) === key).length >= 2) {
      add('Pung', () => pung(players[0], tile, 0));
    }
    if (upper === 0 && findChowTiles(hand, tile)) {
      add('Chow', () => {
        chow(players[0], tile, 0);
      });
    }
    add('Pass', () => {
      clearCallTimer();
      botTurnLoop();
    });

    let sec = 8;
    info.textContent = `Calls available — ${sec}s`;
    callTimer = setInterval(() => {
      sec--;
      info.textContent = `Calls available — ${sec}s`;
      if (sec <= 0) {
        clearCallTimer();
        ctrl.innerHTML = '';
        botTurnLoop();
      }
    }, 1000);
  }

  function pung(p: MJPlayer, tile: MahjongTile, playerIdx: number): void {
    const key = tileKey(tile);
    const inHand = p.hand.filter((t) => tileKey(t) === key);
    const taken = inHand.slice(0, 2);
    p.hand = p.hand.filter((t) => !taken.find((x) => x.id === t.id));
    p.melds.push([...taken, tile]);
    current = playerIdx;
    lastDiscard = null;
    if (p.human) humanTurn();
    else botTurnLoop();
  }

  function chow(p: MJPlayer, tile: MahjongTile, playerIdx: number): void {
    const pair = findChowTiles(p.hand, tile);
    if (!pair) return;
    p.hand = p.hand.filter((t) => !pair.find((x) => x.id === t.id));
    p.melds.push([...pair, tile].sort((a, b) => String(a.value).localeCompare(String(b.value))));
    current = playerIdx;
    lastDiscard = null;
    if (p.human) humanTurn();
    else botTurnLoop();
  }

  async function botTurnLoop(): Promise<void> {
    while (current !== 0 && wall.length > 0) {
      const p = players[current];
      if (drawFor(p)) return;
      await delay(600);
      if (!expectsDiscard(p.hand.length)) continue;
      const tile = botDiscard(p.hand, getDifficulty('mahjong'));
      discard(p, tile);
      if (current === 0 || lastDiscard) return;
    }
    if (current === 0) humanTurn();
  }

  function win(p: MJPlayer, selfDraw: boolean): void {
    clearCallTimer();
    const { total, breakdown } = scoreHand(p.hand, selfDraw);
    const pts = pointsFromFan(total);
    if (p.human) {
      addChips(pts * 3);
      recordWin(pts * 3, 'mahjong');
      playWin();
      info.textContent = `You win! ${total} Fan — ${breakdown.map((b) => b.name).join(', ')}`;
    } else {
      addChips(-pts);
      info.textContent = `${p.name} wins ${total} Fan (${pts} chips)`;
    }
    ctrl.innerHTML = `<button class="btn btn-primary" id="mj-next">Next Round</button>`;
    ctrl.querySelector('#mj-next')!.addEventListener('click', () => {
      eastRound++;
      if (eastRound > 4) {
        eastRound = 1;
        roundWind++;
      }
      if (roundWind >= 4) showLeaderboard();
      else startMatch();
    });
  }

  function showLeaderboard(): void {
    clearCallTimer();
    info.textContent = `Match over — Your chips: ${getChips()}`;
    ctrl.innerHTML = '<button class="btn btn-primary" id="mj-restart">New Match</button>';
    ctrl.querySelector('#mj-restart')!.addEventListener('click', () => {
      eastRound = 1;
      roundWind = 0;
      startMatch();
    });
  }

  function renderCtrl(): void {
    ctrl.innerHTML = '';
    const sortBtn = document.createElement('button');
    sortBtn.className = 'btn';
    sortBtn.textContent = 'Sort';
    sortBtn.onclick = () => {
      players[0].hand = sortHand(players[0].hand);
    };
    ctrl.appendChild(sortBtn);
    if (current === 0 && expectsDraw(players[0].hand.length)) {
      const drawBtn = document.createElement('button');
      drawBtn.className = 'btn btn-primary';
      drawBtn.textContent = 'Draw';
      drawBtn.onclick = () => humanDraw();
      ctrl.appendChild(drawBtn);
    }
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#2a6b5a';
    ctx.fillRect(0, 0, w, h);
    const tw = Math.min(36, w * 0.09);
    const th = tw * 1.25;
    const hand = players[0]?.hand ?? [];
    const startX = (w - hand.length * (tw + 4)) / 2;
    hand.forEach((t, i) => {
      const y = h - th - 16 - (selected === i ? 10 : 0);
      drawMahjongTile(ctx, t, startX + i * (tw + 4), y, tw, th);
    });
    if (lastDiscard) {
      drawMahjongTile(ctx, lastDiscard.tile, w / 2 - tw / 2, h / 2, tw, th);
    }
    ctx.fillStyle = '#fff9';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`Wall: ${wall.length}`, w / 2, 24);
    for (let i = 1; i < 4; i++) {
      ctx.fillText(`${players[i]?.name}: ${players[i]?.hand.length} tiles`, w / 2, 40 + i * 14);
    }
  });

  stage.addEventListener(
    'pointerdown',
    (ev) => {
      if (current !== 0) return;
      dragStartY = ev.clientY;
      const rect = stage.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const w = rect.width;
      const h = rect.height;
      const tw = Math.min(36, w * 0.09);
      const hand = players[0].hand;
      const startX = (w - hand.length * (tw + 4)) / 2;
      const baseY = h - tw * 1.25 - 16;
      const ci = Math.floor((x - startX) / (tw + 4));
      if (ci >= 0 && ci < hand.length && ev.clientY - rect.top > baseY - 30) {
        if (!expectsDiscard(hand.length)) return;
        if (selected === ci) discard(players[0], hand[ci]);
        else selected = ci;
      }
    },
    { passive: true },
  );

  stage.addEventListener(
    'pointerup',
    (ev) => {
      if (current !== 0 || !expectsDiscard(players[0].hand.length)) return;
      if (selected !== null && dragStartY - ev.clientY > 40) {
        discard(players[0], players[0].hand[selected]);
        selected = null;
      }
    },
    { passive: true },
  );

  recordGamePlayed();
  startMatch();
  shell.querySelector('#mj-back')!.addEventListener('click', () => {
    clearCallTimer();
    navigate({ name: 'lobby' });
  });
  shell.querySelector('#mj-leave')!.addEventListener('click', () => showLeaderboard());

  return () => {
    clearCallTimer();
    host.destroy();
    shell.remove();
  };
}
