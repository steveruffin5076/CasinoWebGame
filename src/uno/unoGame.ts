import { GameHost } from '../core/GameHost';
import { createUnoDeck, drawUnoCard, type UnoCard, type UnoColor } from '../core/assets';
import { shuffle, delay } from '../core/utils';
import { getDifficulty } from '../core/storage';
import { botPickCard, botWildColor, canPlay, handPoints } from '../ai/unoBot';
import { recordGamePlayed, recordWin } from '../core/chips';
import { playDeal, playUno, playWin } from '../core/audio';
import { navigate } from '../core/router';

interface Player {
  name: string;
  human: boolean;
  hand: UnoCard[];
  saidUno: boolean;
}

export function mountUno(root: HTMLElement): () => void {
  const shell = document.createElement('div');
  shell.className = 'game-shell theme-uno';
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" id="uno-back">← Lobby</button><h2>🃏 UNO Classic</h2><span id="uno-score"></span></div><div class="game-stage" id="uno-stage"></div><div class="info-bar" id="uno-info"></div><div class="game-controls" id="uno-ctrl"></div>`;
  root.appendChild(shell);

  const stage = shell.querySelector('#uno-stage') as HTMLElement;
  const info = shell.querySelector('#uno-info') as HTMLElement;
  const ctrl = shell.querySelector('#uno-ctrl') as HTMLElement;
  const scoreEl = shell.querySelector('#uno-score') as HTMLElement;
  const host = new GameHost(stage, '#1e4d7b');

  let deck: UnoCard[] = [];
  let discard: UnoCard[] = [];
  let players: Player[] = [];
  let current = 0;
  let direction = 1;
  let currentColor: UnoColor = 'red';
  let round = 0;
  let totalScores = [0, 0, 0, 0];
  let sortMode = false;
  let selected: number | null = null;
  let pendingDraw = 0;

  function newRound(): void {
    deck = shuffle(createUnoDeck());
    players = [
      { name: 'You', human: true, hand: [], saidUno: false },
      { name: 'Bot 1', human: false, hand: [], saidUno: false },
      { name: 'Bot 2', human: false, hand: [], saidUno: false },
      { name: 'Bot 3', human: false, hand: [], saidUno: false },
    ];
    for (let i = 0; i < 7; i++) {
      for (const p of players) p.hand.push(deck.pop()!);
    }
    discard = [deck.pop()!];
    while (discard[0].kind === 'wild' || discard[0].kind === 'wild4') {
      deck.unshift(discard[0]);
      discard = [deck.pop()!];
    }
    currentColor = discard[0].color === 'wild' ? 'red' : discard[0].color;
    current = 0;
    direction = 1;
    pendingDraw = 0;
    round++;
    info.textContent = `Round ${round} — Match ${currentColor}`;
    renderCtrl();
    if (!players[0].human) return;
    turnLoop();
  }

  function top(): UnoCard {
    return discard[discard.length - 1];
  }

  async function turnLoop(): Promise<void> {
    const p = players[current];
    if (p.hand.length === 0) {
      endRound(current);
      return;
    }
    if (p.hand.length === 1 && !p.saidUno) {
      if (p.human) {
        info.textContent = 'Press UNO! or draw +2 penalty';
      } else {
        p.saidUno = true;
        playUno();
      }
    }
    if (!p.human) {
      info.textContent = `${p.name} thinking...`;
      ctrl.innerHTML = '<span class="thinking">...</span>';
      await delay(getDifficulty('uno') === 'easy' ? 2000 : 1200);
      botTurn(p);
      return;
    }
    renderCtrl();
  }

  function botTurn(p: Player): void {
    const diff = getDifficulty('uno');
    if (pendingDraw > 0) {
      for (let i = 0; i < pendingDraw; i++) if (deck.length) p.hand.push(deck.pop()!);
      pendingDraw = 0;
      advance();
      turnLoop();
      return;
    }
    const card = botPickCard(p.hand, top(), currentColor, diff);
    if (!card) {
      if (deck.length) p.hand.push(deck.pop()!);
      advance();
      turnLoop();
      return;
    }
    playCard(p, card);
  }

  function playCard(p: Player, card: UnoCard, wildColor?: UnoColor): void {
    const idx = p.hand.findIndex((c) => c.id === card.id);
    if (idx < 0) return;
    if (p.human && !canPlay(card, top(), currentColor)) return;
    if (card.kind === 'wild4') {
      const hasColor = p.hand.some((c) => c.color === currentColor && c.id !== card.id);
      if (hasColor) return;
    }
    p.hand.splice(idx, 1);
    discard.push(card);
    playDeal();
    if (card.kind === 'wild' || card.kind === 'wild4') {
      currentColor = wildColor ?? (p.human ? 'red' : botWildColor(p.hand));
    } else currentColor = card.color;

    if (card.kind === 'skip') advance();
    else if (card.kind === 'reverse') {
      direction *= -1;
      if (players.length === 2) advance();
    } else if (card.kind === 'draw2') pendingDraw = 2;
    else if (card.kind === 'wild4') pendingDraw = 4;

    advance();
    if (p.hand.length === 1) p.saidUno = true;
    turnLoop();
  }

  function advance(): void {
    current = (current + direction + players.length) % players.length;
  }

  function drawOne(): void {
    const p = players[0];
    if (pendingDraw > 0) {
      for (let i = 0; i < pendingDraw; i++) if (deck.length) p.hand.push(deck.pop()!);
      pendingDraw = 0;
    } else if (deck.length) p.hand.push(deck.pop()!);
    advance();
    turnLoop();
  }

  function endRound(winner: number): void {
    let pts = 0;
    for (let i = 0; i < players.length; i++) {
      if (i !== winner) pts += handPoints(players[i].hand);
    }
    totalScores[winner] += pts;
    if (winner === 0) {
      recordWin(pts, 'uno');
      playWin();
      host.addFloatText(stage.clientWidth / 2, 80, `+${pts} pts`);
    }
    scoreEl.textContent = `You: ${totalScores[0]} pts`;
    if (totalScores[0] >= 500 || round >= 5) {
      info.textContent = totalScores[0] >= totalScores[1] ? 'You win the match!' : 'Match over';
      ctrl.innerHTML = '<button class="btn btn-primary" id="uno-rem">Play Again</button>';
      ctrl.querySelector('#uno-rem')!.addEventListener('click', () => {
        round = 0;
        totalScores = [0, 0, 0, 0];
        recordGamePlayed();
        newRound();
      });
    } else {
      info.textContent = `${players[winner].name} wins round (+${pts})`;
      ctrl.innerHTML = '<button class="btn btn-primary" id="uno-next">Next Round</button>';
      ctrl.querySelector('#uno-next')!.addEventListener('click', () => newRound());
    }
  }

  function renderCtrl(): void {
    ctrl.innerHTML = '';
    const p = players[0];
    const unoBtn = document.createElement('button');
    unoBtn.className = 'btn btn-primary';
    unoBtn.textContent = 'UNO!';
    unoBtn.onclick = () => {
      p.saidUno = true;
      playUno();
      info.textContent = 'UNO called!';
    };
    ctrl.appendChild(unoBtn);

    const drawBtn = document.createElement('button');
    drawBtn.className = 'btn';
    drawBtn.textContent = pendingDraw ? `Draw ${pendingDraw}` : 'Draw';
    drawBtn.onclick = drawOne;
    ctrl.appendChild(drawBtn);

    const sortBtn = document.createElement('button');
    sortBtn.className = 'btn btn-small';
    sortBtn.textContent = sortMode ? 'Sort #' : 'Sort color';
    sortBtn.onclick = () => {
      sortMode = !sortMode;
      p.hand.sort((a, b) =>
        sortMode
          ? a.value - b.value
          : a.color.localeCompare(b.color) || a.value - b.value,
      );
    };
    ctrl.appendChild(sortBtn);
  }

  function showColorPicker(cb: (c: UnoColor) => void): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<p>Pick color</p><div class="color-picker"></div>';
    const grid = modal.querySelector('.color-picker')!;
    for (const col of ['red', 'yellow', 'green', 'blue'] as UnoColor[]) {
      const b = document.createElement('button');
      b.className = `btn btn-${col}`;
      b.textContent = col;
      b.onclick = () => {
        backdrop.remove();
        cb(col);
      };
      grid.appendChild(b);
    }
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#1e4d7b';
    ctx.fillRect(0, 0, w, h);
    const cw = Math.min(56, w * 0.11);
    const ch = cw * 1.45;

    if (discard.length) drawUnoCard(ctx, top(), w / 2 - cw / 2, h * 0.38, cw, ch);
    ctx.fillStyle = '#fff9';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(`Color: ${currentColor} | Deck: ${deck.length}`, w / 2, h * 0.32);

    const padX = Math.max(12, w * 0.05);
    const padY = Math.max(12, h * 0.04);
    const playerY = h - ch - padY;
    const sideY = h * 0.32;
    const miniW = cw * 0.6;
    const miniH = ch * 0.6;

    players.forEach((pl, i) => {
      if (i === 0) {
        const startX = (w - pl.hand.length * (cw * 0.55)) / 2;
        pl.hand.forEach((c, ci) => {
          const y = playerY - (selected === ci ? 14 : 0);
          drawUnoCard(ctx, c, startX + ci * cw * 0.55, y, cw, ch);
        });
        return;
      }

      const label = `${pl.name} (${pl.hand.length})`;
      ctx.fillStyle = '#fff';
      ctx.font = '14px system-ui';

      let labelX = w / 2;
      let cardX = w / 2 - miniW / 2;
      let labelY = padY + 14;

      if (i === 1) {
        ctx.textAlign = 'left';
        labelX = padX;
        labelY = sideY;
        cardX = padX;
      } else if (i === 2) {
        ctx.textAlign = 'center';
        labelY = padY + 14;
        cardX = w / 2 - miniW / 2;
      } else if (i === 3) {
        ctx.textAlign = 'right';
        labelX = w - padX;
        labelY = sideY;
        cardX = w - padX - miniW - Math.min(4, pl.hand.length - 1) * 4;
      }

      ctx.fillText(label, labelX, labelY);
      const stackY = labelY + 8;
      for (let j = 0; j < Math.min(5, pl.hand.length); j++) {
        ctx.fillStyle = '#1a1a2e';
        ctx.strokeStyle = '#c9a227';
        ctx.lineWidth = 1;
        const ox = i === 3 ? cardX - j * 4 : cardX + j * 4;
        ctx.fillRect(ox, stackY, miniW, miniH);
        ctx.strokeRect(ox, stackY, miniW, miniH);
      }
      ctx.textAlign = 'center';
    });
  });

  stage.addEventListener(
    'click',
    (ev) => {
      if (current !== 0) return;
      const rect = stage.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      const cw = Math.min(56, w * 0.11);
      const hand = players[0].hand;
      const startX = (w - hand.length * (cw * 0.55)) / 2;
      const baseY = h - cw * 1.45 - 20;
      if (y > baseY - 30 && y < baseY + cw * 2) {
        const ci = Math.floor((x - startX) / (cw * 0.55));
        if (ci >= 0 && ci < hand.length) {
          const card = hand[ci];
          if (card.kind === 'wild' || card.kind === 'wild4') {
            showColorPicker((col) => playCard(players[0], card, col));
          } else if (canPlay(card, top(), currentColor)) {
            playCard(players[0], card);
          }
        }
      }
      if (y > h * 0.3 && y < h * 0.5 && x > w / 2 - 40 && x < w / 2 + 40) {
        drawOne();
      }
    },
    { passive: true },
  );

  recordGamePlayed();
  newRound();
  scoreEl.textContent = 'You: 0 pts';
  shell.querySelector('#uno-back')!.addEventListener('click', () => navigate({ name: 'lobby' }));

  return () => {
    host.destroy();
    shell.remove();
  };
}
