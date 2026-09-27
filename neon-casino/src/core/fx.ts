/* =============================================================================
   fx.ts — the "juice" layer: particle canvas (pooled, capped), floating text,
   screen flashes, BIG WIN banner and flying chips.
   All movement is transform/opacity only (GPU) and respects:
     • prefers-reduced-motion
     • the 60fps toggle + auto-degrade (ticker.low)
   ========================================================================== */

import { chance, el, randInt, reducedMotion } from './utils';
import { ticker } from './loop';
import { sfx } from './audio';
import { DAILY_BONUS } from './storage';

const MAX_PARTICLES = 150; // hard cap (spec)
const POOL = 260; // pre-allocated objects (object pooling, no GC churn)

type Kind = 0 | 1 | 2; // 0 confetti rect  1 coin  2 spark

interface P {
  alive: boolean;
  kind: Kind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  life: number;
  max: number;
  size: number;
  hue: string;
  spin: number;
}

const GOLD = ['#f5e6b8', '#d4af37', '#a8842a', '#fff3cf'];
const NEON = ['#22d3ee', '#e879f9', '#22c55e', '#f5e6b8'];

class Fx {
  private cvs: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private pool: P[] = [];
  private live = 0;

  constructor() {
    this.cvs = el('canvas');
    this.cvs.id = 'fx-canvas';
    document.body.appendChild(this.cvs);
    this.ctx = this.cvs.getContext('2d')!;
    for (let i = 0; i < POOL; i++) {
      this.pool.push({
        alive: false,
        kind: 0,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        rot: 0,
        vr: 0,
        life: 0,
        max: 1,
        size: 6,
        hue: '#d4af37',
        spin: 0,
      });
    }
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
    ticker.add((dt) => this.step(dt));
  }

  private resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cvs.width = Math.floor(innerWidth * dpr);
    this.cvs.height = Math.floor(innerHeight * dpr);
    this.cvs.style.width = `${innerWidth}px`;
    this.cvs.style.height = `${innerHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private take(): P | null {
    if (this.live >= Math.ceil(MAX_PARTICLES * ticker.quality)) return null;
    for (const p of this.pool) {
      if (!p.alive) {
        p.alive = true;
        this.live++;
        return p;
      }
    }
    return null;
  }

  private step(dt: number) {
    const c = this.ctx;
    c.clearRect(0, 0, innerWidth, innerHeight);
    if (this.live === 0) return;
    const s = dt / 16.667; // normalised to 60fps
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.live--;
        continue;
      }
      p.vy += 0.34 * s; // gravity
      p.vx *= 0.995;
      p.x += p.vx * s;
      p.y += p.vy * s;
      p.rot += p.vr * s;
      const t = p.life / p.max;
      const a = t > 0.35 ? 1 : t / 0.35;
      c.save();
      c.globalAlpha = a;
      c.translate(p.x, p.y);
      if (p.kind === 0) {
        // confetti (rotating rect with a fake 3D flutter)
        c.rotate(p.rot);
        c.scale(1, Math.abs(Math.cos(p.rot * 1.6)) * 0.85 + 0.15);
        c.fillStyle = p.hue;
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else if (p.kind === 1) {
        // coin: squash on X to fake a spin
        const sx = Math.cos(p.rot);
        c.scale(Math.abs(sx) * 0.9 + 0.1, 1);
        const g = c.createLinearGradient(-p.size, -p.size, p.size, p.size);
        g.addColorStop(0, '#fff6d5');
        g.addColorStop(0.5, '#e6c65a');
        g.addColorStop(1, '#8c6d1f');
        c.fillStyle = g;
        c.beginPath();
        c.arc(0, 0, p.size, 0, Math.PI * 2);
        c.fill();
        if (sx > 0.25) {
          c.strokeStyle = 'rgba(255,255,255,.7)';
          c.lineWidth = 1.4;
          c.beginPath();
          c.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
          c.stroke();
        }
      } else {
        // spark
        c.rotate(p.rot);
        c.fillStyle = p.hue;
        c.shadowColor = p.hue;
        c.shadowBlur = ticker.low ? 0 : 10;
        c.beginPath();
        c.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  }

  /* ---------------------------- emitters --------------------------------- */
  private emit(
    x: number,
    y: number,
    n: number,
    cfg: (p: P) => void,
  ) {
    if (reducedMotion()) return;
    const count = Math.max(1, Math.round(n * ticker.quality));
    for (let i = 0; i < count; i++) {
      const p = this.take();
      if (!p) return;
      cfg(p);
    }
  }

  /** gold + neon confetti shower (wins, blackjack, daily bonus) */
  confetti(x: number, y: number, n = 60, spread = 1) {
    this.emit(x, y, n, (p) => {
      p.kind = 0;
      p.x = x + (Math.random() - 0.5) * 40 * spread;
      p.y = y + (Math.random() - 0.5) * 20;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6 * spread;
      const sp = 4 + Math.random() * 8;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.rot = Math.random() * 6.28;
      p.vr = (Math.random() - 0.5) * 0.5;
      p.max = p.life = 1100 + Math.random() * 900;
      p.size = 6 + Math.random() * 8;
      p.hue = chance(0.72) ? GOLD[randInt(GOLD.length)] : NEON[randInt(NEON.length)];
    });
  }

  /** chip/coin fountain from a point (payouts) */
  coins(x: number, y: number, n = 26) {
    this.emit(x, y, n, (p) => {
      p.kind = 1;
      p.x = x + (Math.random() - 0.5) * 22;
      p.y = y;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.1;
      const sp = 6 + Math.random() * 7;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.rot = Math.random() * 6.28;
      p.vr = 0.18 + Math.random() * 0.22;
      p.max = p.life = 900 + Math.random() * 700;
      p.size = 6 + Math.random() * 5;
    });
    sfx.coins();
  }

  /** soft glowing sparks (highlight/turn events) */
  sparkle(x: number, y: number, n = 14, color = '#22d3ee') {
    this.emit(x, y, n, (p) => {
      p.kind = 2;
      p.x = x + (Math.random() - 0.5) * 46;
      p.y = y + (Math.random() - 0.5) * 46;
      const a = Math.random() * 6.28;
      const sp = 0.6 + Math.random() * 2.4;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - 0.6;
      p.rot = Math.random() * 6.28;
      p.vr = 0.06;
      p.max = p.life = 500 + Math.random() * 500;
      p.size = 3 + Math.random() * 4;
      p.hue = color;
    });
  }

  /** one-shot combined "you won" celebration */
  celebrate(x: number, y: number, scale = 1) {
    this.coins(x, y, Math.round(22 * scale));
    this.confetti(x, y, Math.round(46 * scale));
    this.sparkle(x, y, Math.round(12 * scale), '#f5e6b8');
  }

  /* ---------------------------- DOM fx ----------------------------------- */
  /** "+2,500" style floating gold text (WAAPI = compositor driven). */
  floatText(x: number, y: number, text: string, cls: '' | 'bad' | 'cyan' = '', scale = 1) {
    const n = el('div', `float-text ${cls}`.trim(), text);
    n.style.left = `${x}px`;
    n.style.top = `${y}px`;
    n.style.fontSize = `${30 * scale}px`;
    document.body.appendChild(n);
    const dur = reducedMotion() ? 400 : 1400;
    const anim = n.animate(
      [
        { transform: 'translate(-50%,-50%) scale(.6)', opacity: 0 },
        { transform: 'translate(-50%,-50%) scale(1.12)', opacity: 1, offset: 0.18 },
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.55 },
        { transform: 'translate(-50%,-160%) scale(.95)', opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' },
    );
    anim.onfinish = () => n.remove();
    anim.oncancel = () => n.remove();
  }

  /** gold screen-edge flash */
  flash(color = 'rgba(212,175,55,.85)', ms = 520) {
    if (reducedMotion()) return;
    const n = el('div', 'screen-flash');
    n.style.boxShadow = `inset 0 0 140px 24px ${color}`;
    document.body.appendChild(n);
    const a = n.animate(
      [
        { opacity: 0 },
        { opacity: 0.95, offset: 0.12 },
        { opacity: 0 },
      ],
      { duration: ms, easing: 'ease-out' },
    );
    a.onfinish = () => n.remove();
    a.oncancel = () => n.remove();
  }

  /** BIG WIN / UNO! / MAHJONG! banner */
  banner(text: string, ms = 2400) {
    const n = el('div', 'bigwin-banner', text);
    document.body.appendChild(n);
    const a = n.animate([{ opacity: 1 }], { duration: ms, fill: 'forwards' });
    a.onfinish = () => n.remove();
    a.oncancel = () => n.remove();
  }

  /** Chips physically fly from A to B (bet placement, payouts). */
  flyChips(
    from: { x: number; y: number },
    to: { x: number; y: number },
    denom: number,
    count = 3,
    delay = 0,
  ) {
    if (reducedMotion()) return;
    for (let i = 0; i < count; i++) {
      const c = el('div', `chip-fly chip c${denom}`);
      c.style.setProperty('--cs', '38px');
      c.innerHTML = `<div class="in"><b>${denom}</b></div>`;
      c.style.left = `${from.x - 19}px`;
      c.style.top = `${from.y - 19}px`;
      document.body.appendChild(c);
      const dx = to.x - from.x + (Math.random() - 0.5) * 26;
      const dy = to.y - from.y + (Math.random() - 0.5) * 22;
      const anim = c.animate(
        [
          { transform: 'translate(0,0) scale(.7) rotate(0deg)', opacity: 0.2 },
          {
            transform: `translate(${dx * 0.5}px,${dy * 0.5 - 60}px) scale(1.15) rotate(180deg)`,
            opacity: 1,
            offset: 0.5,
          },
          { transform: `translate(${dx}px,${dy}px) scale(.9) rotate(360deg)`, opacity: 1 },
        ],
        {
          duration: 620,
          delay: delay + i * 70,
          easing: 'cubic-bezier(.22,.85,.24,1)',
          fill: 'forwards',
        },
      );
      anim.onfinish = () => {
        c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).onfinish =
          () => c.remove();
      };
      anim.oncancel = () => c.remove();
    }
    sfx.chip();
  }

  /** claim-bonus burst used by the lobby daily bonus. */
  bonusBurst(x: number, y: number) {
    this.confetti(x, y, 90, 1.35);
    this.coins(x, y, 34);
    this.flash('rgba(212,175,55,.9)', 620);
  }
}

export const fx = new Fx();

/* ------------------------- shared toast helper --------------------------- */
let toastWrap: HTMLElement | null = null;
export function toast(msg: string, kind: '' | 'good' | 'bad' = '', ms = 2200) {
  toastWrap ||= (() => {
    const w = el('div', 'toast-wrap');
    document.body.appendChild(w);
    return w;
  })();
  const t = el('div', `toast ${kind}`.trim(), msg);
  toastWrap.appendChild(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 320);
  }, ms);
}

/** Screen-edge gold flash + banner + sound for a large win. */
export function bigWin(profit: number) {
  fx.flash();
  fx.banner('BIG WIN');
  fx.celebrate(innerWidth / 2, innerHeight * 0.55, 1.4);
  fx.floatText(innerWidth / 2, innerHeight * 0.45, `+${profit.toLocaleString('en-US')}`, '', 1.6);
  sfx.win(true);
}

/** Re-exported so game modules can celebrate the daily bonus consistently. */
export const BONUS_AMOUNT = DAILY_BONUS;
