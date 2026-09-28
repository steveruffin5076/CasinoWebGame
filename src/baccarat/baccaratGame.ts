import { GameHost } from '../core/GameHost';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playDeal, playWin, playLose } from '../core/audio';
import { shuffle } from '../core/utils';
import { createGameShell, bindBalance } from '../core/gameShell';
import { showTutorial } from '../core/tutorial';
import { dealBaccarat, handTotal, makeShoe, type BaccaratCard } from './baccaratLogic';

type Bet = 'player' | 'banker' | 'tie' | null;

export function mountBaccarat(root: HTMLElement): () => void {
  const { shell, stage, info, ctrl } = createGameShell('theme-baccarat', '🎴 Baccarat', 'baccarat');
  root.appendChild(shell);
  showTutorial('baccarat');

  const balEl = shell.querySelector('.bal') as HTMLElement;
  const updateBal = bindBalance(balEl, getChips);
  const host = new GameHost(stage, '#3d2a1f');

  let shoe = shuffle(makeShoe());
  let bet: Bet = null;
  let betAmt = 0;
  let player: BaccaratCard[] = [];
  let banker: BaccaratCard[] = [];
  let phase: 'bet' | 'reveal' | 'end' = 'bet';
  let resultText = '';

  function drawRankLabel(r: number): string {
    if (r === 1) return 'A';
    if (r === 11) return 'J';
    if (r === 12) return 'Q';
    if (r === 13) return 'K';
    return String(r);
  }

  function deal(): void {
    if (!bet || betAmt < 10) {
      info.textContent = 'Choose Player, Banker, or Tie and a chip amount';
      return;
    }
    if (getChips() < betAmt) return;
    addChips(-betAmt);
    updateBal();
    recordGamePlayed();
    if (shoe.length < 20) shoe = shuffle(makeShoe());
    const dealt = dealBaccarat(shoe);
    shoe = dealt.rest;
    player = dealt.player;
    banker = dealt.banker;
    phase = 'end';
    playDeal();

    const pt = handTotal(player);
    const bt = handTotal(banker);
    let win = 0;
    if (pt === bt && bet === 'tie') win = betAmt * 9;
    else if (pt > bt && bet === 'player') win = betAmt * 2;
    else if (bt > pt && bet === 'banker') win = betAmt + Math.floor(betAmt * 0.95);
    else if (pt === bt && bet !== 'tie') {
      /* push on tie for player/banker bets - return bet */
      win = betAmt;
    }

    if (win > betAmt) {
      addChips(win);
      recordWin(win - betAmt, 'baccarat');
      playWin();
      resultText = `Win +${win - betAmt}`;
    } else if (win === betAmt && pt === bt) {
      addChips(win);
      resultText = 'Push (tie)';
    } else {
      playLose();
      resultText = `Loss -${betAmt}`;
    }
    updateBal();
    info.textContent = `Player ${pt} · Banker ${bt} — ${resultText}`;
    renderCtrl();
  }

  function renderCtrl(): void {
    ctrl.innerHTML = '';
    if (phase === 'end') {
      const again = document.createElement('button');
      again.className = 'btn btn-primary';
      again.textContent = 'New round';
      again.onclick = () => {
        phase = 'bet';
        bet = null;
        betAmt = 0;
        player = [];
        banker = [];
        renderCtrl();
        info.textContent = 'Place your bet';
      };
      ctrl.appendChild(again);
      return;
    }
    for (const amt of [10, 50, 100, 500]) {
      const b = document.createElement('button');
      b.className = 'btn btn-small';
      b.textContent = String(amt);
      b.onclick = () => {
        betAmt = amt;
        playChip();
      };
      ctrl.appendChild(b);
    }
    for (const [label, key] of [['Player', 'player'], ['Banker', 'banker'], ['Tie', 'tie']] as const) {
      const b = document.createElement('button');
      b.className = `btn ${bet === key ? 'active' : ''}`;
      b.textContent = label;
      b.onclick = () => {
        bet = key;
        renderCtrl();
      };
      ctrl.appendChild(b);
    }
    const dealBtn = document.createElement('button');
    dealBtn.className = 'btn btn-primary';
    dealBtn.textContent = `Deal ${betAmt || ''}`;
    dealBtn.onclick = () => deal();
    ctrl.appendChild(dealBtn);
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#4a3228';
    ctx.fillRect(0, 0, w, h);
    const cw = 44;
    const ch = 62;
    const drawHand = (cards: BaccaratCard[], x: number, y: number, label: string) => {
      ctx.fillStyle = '#f5ecd7';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 60, y - 8);
      cards.forEach((c, i) => {
        ctx.fillStyle = '#fffef8';
        ctx.strokeStyle = '#333';
        ctx.fillRect(x + i * 48, y, cw, ch);
        ctx.strokeRect(x + i * 48, y, cw, ch);
        ctx.fillStyle = '#222';
        ctx.font = 'bold 18px system-ui';
        ctx.fillText(drawRankLabel(c.rank), x + i * 48 + cw / 2, y + ch / 2 + 6);
      });
    };
    drawHand(player, w * 0.15, h * 0.35, 'PLAYER');
    drawHand(banker, w * 0.55, h * 0.35, 'BANKER');
  });

  renderCtrl();
  info.textContent = 'Place your bet';

  return () => {
    host.destroy();
    shell.remove();
  };
}
