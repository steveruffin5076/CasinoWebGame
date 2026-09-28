import { GameHost } from '../core/GameHost';
import { createMahjongWall, drawMahjongTile, type MahjongTile } from '../core/assets';
import { shuffle, delay } from '../core/utils';
import { getDifficulty } from '../core/storage';
import { sortHand, canWinHand, scoreHand, pointsFromFan, tileKey } from './rules';
import { botDiscard, botShouldPung, botShouldWin, botShouldChow } from '../ai/mahjongBot';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playDeal, playWin } from '../core/audio';
import { navigate } from '../core/router';

interface MJPlayer {
  name: string;
  human: boolean;
  hand: MahjongTile[];
  melds: MahjongTile[][];
}

export function mountMahjong(root: HTMLElement): () => void {
  const shell = document.createElement('div');
  shell.className = 'game-shell theme-mahjong';
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" id="mj-back">← Lobby</button><h2>🀄 Hong Kong Mahjong</h2><button class="btn btn-small" id="mj-leave">Leave</button></div><div class="game-stage" id="mj-stage"></div><div class="info-bar" id="mj-info">No Flowers — 136 tiles</div><div class="game-controls" id="mj-ctrl"></div>`;
  root.appendChild(shell);

  const stage = shell.querySelector('#mj-stage') as HTMLElement;
  const info = shell.querySelector('#mj-info') as HTMLElement;
  const ctrl = shell.querySelector('#mj-ctrl') as HTMLElement;
  const host = new GameHost(stage, '#2a6b5a');

  let wall: MahjongTile[] = [];
  let players: MJPlayer[] = [];
  let current = 0; // 0 = human (East start)
  let roundWind = 0;
  let eastRound = 1;
  let lastDiscard: { tile: MahjongTile; from: number } | null = null;
  let selected: number | null = null;
  let callTimer: ReturnType<typeof setTimeout> | null = null;
  let dragStartY = 0;

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
    info.textContent = `Wall: ${wall.length} | Round East-${eastRound}`;
    humanTurn();
  }

  function drawFor(player: MJPlayer): void {
    if (!wall.length) return;
    const t = wall.pop()!;
    player.hand.push(t);
    player.hand = sortHand(player.hand);
    playDeal();
    if (canWinHand(player.hand)) {
      win(player, true);
      return;
    }
  }

  function humanTurn(): void {
    renderCtrl();
    info.textContent = `Your turn — tap tile, tap again or drag up to discard | Wall: ${wall.length}`;
  }

  function discard(player: MJPlayer, tile: MahjongTile): void {
    const idx = player.hand.findIndex((t) => t.id === tile.id);
    if (idx < 0) return;
    player.hand.splice(idx, 1);
    lastDiscard = { tile, from: current };
    current = (current + 1) % 4;
    afterDiscard();
  }

  async function afterDiscard(): Promise<void> {
    const tile = lastDiscard!.tile;
    const from = lastDiscard!.from;
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
      if (idx === upper && botShouldChow(p.hand, tile, diff)) {
        chow(p, tile);
        claimed = true;
        break;
      }
    }

    if (!claimed && players[0].human) {
      offerCalls(tile, from);
      return;
    }

    if (!claimed) botTurnLoop();
    else if (players[current].human) humanTurn();
    else botTurnLoop();
  }

  function offerCalls(tile: MahjongTile, _from: number): void {
    ctrl.innerHTML = '';
    const hand = players[0].hand;
    const add = (label: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.onclick = () => {
        if (callTimer) clearTimeout(callTimer);
        fn();
      };
      ctrl.appendChild(b);
    };
    if (canWinHand([...hand, tile])) add('Win (Hu)', () => win(players[0], false));
    const key = tileKey(tile);
    if (hand.filter((t) => tileKey(t) === key).length >= 2) add('Pung', () => pung(players[0], tile, 0));
    add('Pass', () => {
      if (callTimer) clearTimeout(callTimer);
      botTurnLoop();
    });
    let sec = 8;
    info.textContent = `Calls available — ${sec}s`;
    callTimer = setInterval(() => {
      sec--;
      info.textContent = `Calls available — ${sec}s`;
      if (sec <= 0) {
        clearInterval(callTimer!);
        ctrl.innerHTML = '';
        botTurnLoop();
      }
    }, 1000);
  }

  function pung(p: MJPlayer, tile: MahjongTile, playerIdx: number): void {
    const key = tileKey(tile);
    const taken = p.hand.filter((t) => tileKey(t) === key).slice(0, 2);
    p.hand = p.hand.filter((t) => !taken.find((x) => x.id === t.id));
    p.melds.push([...taken, tile]);
    current = playerIdx;
    lastDiscard = null;
    if (p.human) humanTurn();
    else botTurnLoop();
  }

  function chow(p: MJPlayer, tile: MahjongTile): void {
    p.hand.push(tile);
    p.hand = sortHand(p.hand);
    current = players.indexOf(p);
    lastDiscard = null;
    botTurnLoop();
  }

  async function botTurnLoop(): Promise<void> {
    while (current !== 0 && wall.length > 0) {
      const p = players[current];
      drawFor(p);
      if (canWinHand(p.hand)) {
        win(p, true);
        return;
      }
      await delay(600);
      const tile = botDiscard(p.hand, getDifficulty('mahjong'));
      discard(p, tile);
      if (players[0].human && lastDiscard) return;
    }
    if (current === 0) humanTurn();
  }

  function win(p: MJPlayer, selfDraw: boolean): void {
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
      if (roundWind >= 1) showLeaderboard();
      else startMatch();
    });
  }

  function showLeaderboard(): void {
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
        if (selected === ci) discard(players[0], hand[ci]);
        else selected = ci;
      }
    },
    { passive: true },
  );

  stage.addEventListener(
    'pointerup',
    (ev) => {
      if (selected !== null && dragStartY - ev.clientY > 40) {
        discard(players[0], players[0].hand[selected]);
        selected = null;
      }
    },
    { passive: true },
  );

  recordGamePlayed();
  startMatch();
  shell.querySelector('#mj-back')!.addEventListener('click', () => navigate({ name: 'lobby' }));
  shell.querySelector('#mj-leave')!.addEventListener('click', () => showLeaderboard());

  return () => {
    if (callTimer) clearInterval(callTimer);
    host.destroy();
    shell.remove();
  };
}
