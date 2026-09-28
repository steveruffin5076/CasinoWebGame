import { GameHost } from '../core/GameHost';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playWin, playLose } from '../core/audio';
import { createGameShell, bindBalance } from '../core/gameShell';
import { showTutorial } from '../core/tutorial';

type Phase = 'comeOut' | 'point';

function roll2d6(): [number, number] {
  return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

export function mountCraps(root: HTMLElement): () => void {
  const { shell, stage, info, ctrl } = createGameShell('theme-craps', '🎲 Craps', 'craps');
  root.appendChild(shell);
  showTutorial('craps');

  const balEl = shell.querySelector('.bal') as HTMLElement;
  const updateBal = bindBalance(balEl, getChips);
  const host = new GameHost(stage, '#24516b');

  let phase: Phase = 'comeOut';
  let point = 0;
  let betAmt = 50;
  let betOn = false;
  let dice: [number, number] = [1, 1];
  let rolling = false;

  function resolve(sum: number): void {
    if (!betOn) return;
    let win = 0;
    if (phase === 'comeOut') {
      if (sum === 7 || sum === 11) win = betAmt * 2;
      else if (sum === 2 || sum === 3 || sum === 12) win = 0;
      else {
        phase = 'point';
        point = sum;
        betOn = true;
        info.textContent = `Point is ${point} — roll again before 7`;
        return;
      }
    } else {
      if (sum === point) win = betAmt * 2;
      else if (sum === 7) win = 0;
      else {
        info.textContent = `Rolled ${sum} — keep shooting for ${point}`;
        return;
      }
      phase = 'comeOut';
      point = 0;
    }
    betOn = false;
    if (win > 0) {
      addChips(win);
      recordWin(win - betAmt, 'craps');
      playWin();
      info.textContent = `Win +${win - betAmt} (rolled ${sum})`;
    } else {
      playLose();
      info.textContent = `Loss on ${sum}`;
    }
    updateBal();
  }

  function shoot(): void {
    if (rolling) return;
    if (!betOn) {
      if (getChips() < betAmt) return;
      addChips(-betAmt);
      betOn = true;
      updateBal();
      recordGamePlayed();
    }
    rolling = true;
    let n = 0;
    const iv = setInterval(() => {
      dice = roll2d6();
      n++;
      if (n > 10) {
        clearInterval(iv);
        rolling = false;
        resolve(dice[0] + dice[1]);
      }
    }, 60);
  }

  function renderCtrl(): void {
    ctrl.innerHTML = '';
    for (const amt of [10, 50, 100, 500]) {
      const b = document.createElement('button');
      b.className = `btn btn-small ${betAmt === amt ? 'active' : ''}`;
      b.textContent = String(amt);
      b.disabled = betOn;
      b.onclick = () => {
        betAmt = amt;
        playChip();
        renderCtrl();
      };
      ctrl.appendChild(b);
    }
    const shootBtn = document.createElement('button');
    shootBtn.className = 'btn btn-primary';
    shootBtn.textContent = rolling ? 'Rolling…' : betOn ? 'Roll' : `Pass Line ${betAmt}`;
    shootBtn.disabled = rolling;
    shootBtn.onclick = () => shoot();
    ctrl.appendChild(shootBtn);
    if (betOn && phase === 'point') {
      const clear = document.createElement('button');
      clear.className = 'btn btn-small';
      clear.textContent = 'New shooter';
      clear.onclick = () => {
        phase = 'comeOut';
        point = 0;
        betOn = false;
        info.textContent = 'Come-out roll — bet Pass Line';
        renderCtrl();
      };
      ctrl.appendChild(clear);
    }
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#24516b';
    ctx.fillRect(0, 0, w, h);
    const size = 56;
    const x = w / 2 - size - 8;
    const y = h * 0.35;
    [0, 1].forEach((i) => {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = '#c9a227';
      ctx.beginPath();
      ctx.arc(x + i * (size + 16), y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.font = 'bold 24px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(dice[i]), x + i * (size + 16), y);
    });
    ctx.fillStyle = '#f5ecd7';
    ctx.font = '14px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(phase === 'comeOut' ? 'COME OUT' : `POINT: ${point}`, w / 2, h * 0.55);
    ctx.fillText(`Sum: ${dice[0] + dice[1]}`, w / 2, h * 0.62);
  });

  renderCtrl();
  info.textContent = 'Pass Line — Come-out: 7/11 win, 2/3/12 lose';

  return () => {
    host.destroy();
    shell.remove();
  };
}
