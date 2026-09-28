import { GameHost } from '../core/GameHost';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playWin, playLose } from '../core/audio';
import { createGameShell, bindBalance } from '../core/gameShell';
import { showTutorial } from '../core/tutorial';

const SYM = ['🍒', '🍋', '⭐', '7️⃣', '💎'];
const WEIGHTS = [30, 25, 20, 10, 5];

function rollSymbol(): string {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < SYM.length; i++) {
    r -= WEIGHTS[i];
    if (r <= 0) return SYM[i];
  }
  return SYM[0];
}

function payout(a: string, b: string, c: string, bet: number): number {
  if (a === b && b === c) {
    if (a === '💎') return bet * 50;
    if (a === '7️⃣') return bet * 25;
    if (a === '⭐') return bet * 10;
    return bet * 5;
  }
  if (a === b || b === c || a === c) return bet * 2;
  return 0;
}

export function mountSlots(root: HTMLElement): () => void {
  const { shell, stage, info, ctrl } = createGameShell('theme-slots', '🎰 Slots', 'slots');
  root.appendChild(shell);
  showTutorial('slots');

  const balEl = shell.querySelector('.bal') as HTMLElement;
  const updateBal = bindBalance(balEl, getChips);
  const host = new GameHost(stage, '#2a1848');

  let reels = ['🍒', '🍋', '⭐'];
  let bet = 50;
  let spinning = false;
  let offset = [0, 0, 0];

  function spin(): void {
    if (spinning) return;
    if (getChips() < bet) return;
    addChips(-bet);
    updateBal();
    recordGamePlayed();
    spinning = true;
    let t = 0;
    const iv = setInterval(() => {
      reels = [rollSymbol(), rollSymbol(), rollSymbol()];
      offset = offset.map((o) => o + 12);
      t++;
      if (t > 18) {
        clearInterval(iv);
        spinning = false;
        const win = payout(reels[0], reels[1], reels[2], bet);
        if (win > 0) {
          addChips(win);
          recordWin(win - bet, 'slots');
          playWin();
          info.textContent = `${reels.join(' ')} — Win +${win - bet}!`;
        } else {
          playLose();
          info.textContent = `${reels.join(' ')} — Try again`;
        }
        updateBal();
      }
    }, 80);
  }

  function renderCtrl(): void {
    ctrl.innerHTML = '';
    for (const amt of [10, 50, 100, 500]) {
      const b = document.createElement('button');
      b.className = `btn btn-small ${bet === amt ? 'active' : ''}`;
      b.textContent = String(amt);
      b.onclick = () => {
        bet = amt;
        playChip();
        renderCtrl();
      };
      ctrl.appendChild(b);
    }
    const spinBtn = document.createElement('button');
    spinBtn.className = 'btn btn-primary';
    spinBtn.textContent = spinning ? '…' : 'SPIN';
    spinBtn.disabled = spinning;
    spinBtn.onclick = () => spin();
    ctrl.appendChild(spinBtn);
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#2a1848';
    ctx.fillRect(0, 0, w, h);
    const rw = Math.min(80, w * 0.22);
    const rh = rw * 1.2;
    const startX = (w - rw * 3 - 40) / 2;
    const y = h * 0.32;
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#111';
      ctx.strokeStyle = '#c9a227';
      ctx.lineWidth = 3;
      ctx.fillRect(startX + i * (rw + 20), y, rw, rh);
      ctx.strokeRect(startX + i * (rw + 20), y, rw, rh);
      ctx.font = `${Math.floor(rw * 0.45)}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(reels[i], startX + i * (rw + 20) + rw / 2, y + rh / 2 + (spinning ? offset[i] % 20 : 0));
    }
    ctx.fillStyle = '#f5ecd788';
    ctx.font = '12px system-ui';
    ctx.fillText('3 match = big win · 2 match = 2×', w / 2, h * 0.75);
  });

  renderCtrl();
  info.textContent = 'Pick bet and SPIN';

  return () => {
    host.destroy();
    shell.remove();
  };
}
