import { GameHost } from '../core/GameHost';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playWin, playLose } from '../core/audio';
import { createGameShell, bindBalance } from '../core/gameShell';
import { showTutorial } from '../core/tutorial';
import { pick } from '../core/utils';

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

type BetKind =
  | { type: 'red' | 'black' | 'even' | 'odd' | 'low' | 'high' }
  | { type: 'straight'; n: number };

export function mountRoulette(root: HTMLElement): () => void {
  const { shell, stage, info, ctrl } = createGameShell('theme-roulette', '🎡 Roulette', 'roulette');
  root.appendChild(shell);
  showTutorial('roulette');

  const balEl = shell.querySelector('.bal') as HTMLElement;
  const updateBal = bindBalance(balEl, getChips);
  const host = new GameHost(stage, '#1e4d2e');

  let bet: BetKind | null = null;
  let betAmt = 50;
  let spinning = false;
  let lastNum = -1;
  let anim = 0;
  let spinRaf = 0;

  function pays(kind: BetKind, n: number): number {
    if (kind.type === 'straight') return kind.n === n ? 36 : 0;
    if (n === 0) return 0;
    if (kind.type === 'red') return RED.has(n) ? 2 : 0;
    if (kind.type === 'black') return !RED.has(n) ? 2 : 0;
    if (kind.type === 'even') return n % 2 === 0 ? 2 : 0;
    if (kind.type === 'odd') return n % 2 === 1 ? 2 : 0;
    if (kind.type === 'low') return n >= 1 && n <= 18 ? 2 : 0;
    if (kind.type === 'high') return n >= 19 && n <= 36 ? 2 : 0;
    return 0;
  }

  function spin(): void {
    if (spinning || !bet) return;
    if (getChips() < betAmt) return;
    addChips(-betAmt);
    updateBal();
    recordGamePlayed();
    spinning = true;
    renderCtrl();
    anim = 0;
    const target = Math.floor(Math.random() * 37);
    const frames = 60;
    let f = 0;
    const tick = () => {
      f++;
      anim = f / frames;
      lastNum = f < frames ? Math.floor(Math.random() * 37) : target;
      if (f < frames) spinRaf = requestAnimationFrame(tick);
      else {
        spinning = false;
        spinRaf = 0;
        const mult = pays(bet!, target);
        if (mult > 0) {
          const win = betAmt * mult;
          addChips(win);
          recordWin(win - betAmt, 'roulette');
          playWin();
          info.textContent = `Ball on ${target} — Win +${win - betAmt}`;
        } else {
          playLose();
          info.textContent = `Ball on ${target} — Loss`;
        }
        updateBal();
        renderCtrl();
      }
    };
    spinRaf = requestAnimationFrame(tick);
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
    const opts: [string, BetKind][] = [
      ['Red', { type: 'red' }],
      ['Black', { type: 'black' }],
      ['Even', { type: 'even' }],
      ['Odd', { type: 'odd' }],
      ['1-18', { type: 'low' }],
      ['19-36', { type: 'high' }],
    ];
    for (const [label, k] of opts) {
      const b = document.createElement('button');
      b.className = 'btn btn-small';
      b.textContent = label;
      b.onclick = () => {
        bet = k;
        playChip();
        info.textContent = `Bet: ${label} (${betAmt})`;
      };
      ctrl.appendChild(b);
    }
    const lucky = document.createElement('button');
    lucky.className = 'btn btn-small';
    lucky.textContent = 'Lucky #';
    lucky.onclick = () => {
      bet = { type: 'straight', n: pick([7, 17, 27, 0, 32]) };
      info.textContent = `Straight on ${(bet as { n: number }).n}`;
    };
    ctrl.appendChild(lucky);
    const spinBtn = document.createElement('button');
    spinBtn.className = 'btn btn-primary';
    spinBtn.textContent = spinning ? 'Spinning…' : 'Spin';
    spinBtn.disabled = spinning;
    spinBtn.onclick = () => spin();
    ctrl.appendChild(spinBtn);
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#1e4d2e';
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h * 0.4;
    const rOuter = Math.min(w, h) * 0.22;
    ctx.save();
    ctx.translate(cx, cy);
    if (spinning) ctx.rotate(anim * Math.PI * 10);
    ctx.fillStyle = '#c9a227';
    ctx.beginPath();
    ctx.arc(0, 0, rOuter, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(w, h) * 0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (lastNum >= 0) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 28px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(String(lastNum), cx, cy + 10);
      const col = lastNum === 0 ? '#0a0' : RED.has(lastNum) ? '#c00' : '#111';
      ctx.fillStyle = col;
      ctx.font = '14px system-ui';
      ctx.fillText(lastNum === 0 ? 'ZERO' : RED.has(lastNum) ? 'RED' : 'BLACK', cx, h * 0.55);
    }
  });

  renderCtrl();
  info.textContent = 'Pick a bet, then Spin (European 0–36)';

  return () => {
    if (spinRaf) cancelAnimationFrame(spinRaf);
    host.destroy();
    shell.remove();
  };
}
