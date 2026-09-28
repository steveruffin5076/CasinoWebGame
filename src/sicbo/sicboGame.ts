import { GameHost } from '../core/GameHost';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playWin, playLose } from '../core/audio';
import { createGameShell, bindBalance } from '../core/gameShell';
import { showTutorial } from '../core/tutorial';

type SicBet =
  | { kind: 'small' | 'big' | 'anyTriple' }
  | { kind: 'total'; n: number };

function rollDice(): [number, number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

function isTriple(d: [number, number, number]): boolean {
  return d[0] === d[1] && d[1] === d[2];
}

function payout(bet: SicBet, d: [number, number, number], amt: number): number {
  const sum = d[0] + d[1] + d[2];
  if (bet.kind === 'anyTriple' && isTriple(d)) return amt * 25;
  if (isTriple(d) && bet.kind !== 'anyTriple') return 0;
  if (bet.kind === 'small' && sum >= 4 && sum <= 10) return amt * 2;
  if (bet.kind === 'big' && sum >= 11 && sum <= 17) return amt * 2;
  if (bet.kind === 'total' && sum === bet.n) {
    const pays: Record<number, number> = { 4: 50, 5: 20, 6: 15, 7: 12, 8: 8, 9: 6, 10: 6, 11: 6, 12: 6, 13: 8, 14: 12, 15: 15, 16: 20, 17: 50 };
    return amt * (pays[sum] ?? 0);
  }
  return 0;
}

export function mountSicBo(root: HTMLElement): () => void {
  const { shell, stage, info, ctrl } = createGameShell('theme-sicbo', '🔮 Sic Bo', 'sicbo');
  root.appendChild(shell);
  showTutorial('sicbo');

  const balEl = shell.querySelector('.bal') as HTMLElement;
  const updateBal = bindBalance(balEl, getChips);
  const host = new GameHost(stage, '#3a2818');

  let bet: SicBet | null = null;
  let betAmt = 50;
  let dice: [number, number, number] = [1, 1, 1];
  let shaking = false;
  let shakeTimer: ReturnType<typeof setInterval> | null = null;

  function roll(): void {
    if (!bet || shaking) return;
    if (getChips() < betAmt) return;
    addChips(-betAmt);
    updateBal();
    recordGamePlayed();
    shaking = true;
    renderCtrl();
    let n = 0;
    if (shakeTimer) clearInterval(shakeTimer);
    shakeTimer = setInterval(() => {
      dice = rollDice();
      n++;
      if (n > 12) {
        if (shakeTimer) clearInterval(shakeTimer);
        shakeTimer = null;
        shaking = false;
        const win = payout(bet!, dice, betAmt);
        const sum = dice[0] + dice[1] + dice[2];
        if (win > 0) {
          addChips(win);
          recordWin(win - betAmt, 'sicbo');
          playWin();
          info.textContent = `${dice.join('-')} (sum ${sum}) — Win +${win - betAmt}`;
        } else {
          playLose();
          info.textContent = `${dice.join('-')} (sum ${sum}) — Loss`;
        }
        updateBal();
        renderCtrl();
      }
    }, 70);
  }

  function renderCtrl(): void {
    ctrl.innerHTML = '';
    for (const amt of [10, 50, 100]) {
      const b = document.createElement('button');
      b.className = `btn btn-small ${betAmt === amt ? 'active' : ''}`;
      b.textContent = String(amt);
      b.onclick = () => {
        betAmt = amt;
        renderCtrl();
      };
      ctrl.appendChild(b);
    }
    for (const [label, kind] of [['Small 4-10', 'small'], ['Big 11-17', 'big'], ['Any Triple', 'anyTriple']] as const) {
      const b = document.createElement('button');
      b.className = 'btn btn-small';
      b.textContent = label;
      b.onclick = () => {
        bet = { kind };
        playChip();
        renderCtrl();
      };
      ctrl.appendChild(b);
    }
    for (const t of [9, 10, 11, 12]) {
      const b = document.createElement('button');
      b.className = 'btn btn-small';
      b.textContent = `Total ${t}`;
      b.onclick = () => {
        bet = { kind: 'total', n: t };
        playChip();
        renderCtrl();
      };
      ctrl.appendChild(b);
    }
    const rollBtn = document.createElement('button');
    rollBtn.className = 'btn btn-primary';
    rollBtn.textContent = shaking ? 'Rolling…' : 'Roll dice';
    rollBtn.disabled = shaking || !bet;
    rollBtn.onclick = () => roll();
    ctrl.appendChild(rollBtn);
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#3a2818';
    ctx.fillRect(0, 0, w, h);
    const size = 48;
    const startX = w / 2 - size * 1.5;
    const y = h * 0.38;
    dice.forEach((d, i) => {
      ctx.fillStyle = '#fffef8';
      ctx.strokeStyle = '#c9a227';
      ctx.fillRect(startX + i * (size + 16), y, size, size);
      ctx.strokeRect(startX + i * (size + 16), y, size, size);
      ctx.fillStyle = '#c00';
      ctx.font = 'bold 22px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(d), startX + i * (size + 16) + size / 2, y + size / 2);
    });
  });

  renderCtrl();
  info.textContent = 'Choose bet, then Roll dice';

  return () => {
    if (shakeTimer) clearInterval(shakeTimer);
    host.destroy();
    shell.remove();
  };
}
