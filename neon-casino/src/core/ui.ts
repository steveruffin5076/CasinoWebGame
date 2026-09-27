/* =============================================================================
   ui.ts — shared chrome: sticky top bar with the animated chip balance,
   modals, toasts, seats (bot avatars with moods + speech bubbles) and the
   chip-bet rack. Every screen composes its layout from these pieces so the
   luxury look stays identical across the four tables.
   ========================================================================== */

import { countUp, el, fmt, on, signed } from './utils';
import { wallet } from './chips';
import { sfx } from './audio';
import { save } from './storage';
import { ticker } from './loop';
import { toast } from './fx';
import { avatarSvg, type AvatarId, type Mood } from '../assets/avatars';

/* ------------------------------------------------------------------ TOP BAR */

export interface TopBarOpts {
  title: string;
  sub?: string;
  onBack?: () => void;
  backLabel?: string;
  /** extra controls appended before the sound/fx buttons */
  extra?: HTMLElement[];
}

export interface TopBar {
  el: HTMLElement;
  destroy(): void;
}

export function topBar(o: TopBarOpts): TopBar {
  const bar = el('header', 'topbar glass');
  bar.innerHTML = `
    <div class="tb-left">
      ${
        o.onBack
          ? `<button class="icon-btn back" type="button" aria-label="${o.backLabel ?? 'Back to lobby'}">◀</button>`
          : ''
      }
      <div class="tb-title">
        <div class="t">${o.title}</div>
        ${o.sub ? `<div class="s muted">${o.sub}</div>` : ''}
      </div>
    </div>
    <div class="tb-right">
      <div class="chip-pill" title="Chip balance">
        <span class="coin">💰</span><span class="amt num">0</span>
      </div>
      <button class="icon-btn snd" type="button" aria-label="Toggle sound">🔊</button>
      <button class="icon-btn fxb" type="button" aria-label="Toggle effects">✨</button>
    </div>`;

  const pill = bar.querySelector('.chip-pill') as HTMLElement;
  const amt = bar.querySelector('.amt') as HTMLElement;
  const snd = bar.querySelector('.snd') as HTMLElement;
  const fxb = bar.querySelector('.fxb') as HTMLElement;

  // balance + count-up + "+X" burst on change
  let shown = wallet.balance;
  amt.textContent = fmt(shown);
  const offWallet = wallet.onChange((bal, delta) => {
    countUp(amt, shown, bal, 620);
    shown = bal;
    pill.classList.remove('bump');
    void pill.offsetWidth;
    pill.classList.add('bump');
    if (delta !== 0) {
      const r = pill.getBoundingClientRect();
      const n = el('div', `float-text ${delta < 0 ? 'bad' : ''}`.trim(), signed(delta));
      n.style.left = `${r.left + r.width / 2}px`;
      n.style.top = `${r.top + 34}px`;
      n.style.fontSize = '20px';
      document.body.appendChild(n);
      const a = n.animate(
        [
          { transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 },
          { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%,-140%) scale(1)', opacity: 0 },
        ],
        { duration: 1200, easing: 'cubic-bezier(.16,1,.3,1)' },
      );
      a.onfinish = () => n.remove();
      a.oncancel = () => n.remove();
    }
  });

  const syncSnd = () => {
    const onn = save.settings().sound;
    snd.textContent = onn ? '🔊' : '🔇';
    snd.classList.toggle('off', !onn);
    snd.classList.toggle('on', onn);
  };
  const syncFx = () => {
    const low = save.settings().fx === 'low';
    fxb.textContent = low ? '⚡' : '✨';
    fxb.classList.toggle('off', low);
    fxb.classList.toggle('on', !low);
  };
  syncSnd();
  syncFx();

  const offs = [
    on(snd, 'click', () => {
      sfx.setEnabled(!save.settings().sound);
      syncSnd();
      sfx.click();
      toast(save.settings().sound ? 'Sound on' : 'Sound muted');
    }),
    on(fxb, 'click', () => {
      const low = save.settings().fx === 'low';
      save.setSetting('fx', low ? 'full' : 'low');
      if (low) ticker.upgrade();
      else ticker.degrade('user');
      syncFx();
      sfx.click();
      toast(low ? 'Full effects (60fps target)' : 'Low effects mode — best for older phones');
    }),
  ];
  if (o.onBack) offs.push(on(bar.querySelector('.back') as HTMLElement, 'click', o.onBack));
  if (o.extra) for (const n of o.extra) (bar.querySelector('.tb-right') as HTMLElement).insertBefore(n, snd);

  return {
    el: bar,
    destroy() {
      offWallet();
      offs.forEach((f) => f());
    },
  };
}

/* -------------------------------------------------------------------- MODAL */

export interface ModalAction {
  label: string;
  kind?: 'primary' | 'glass' | 'danger' | 'ghost';
  onClick?: () => void;
  keepOpen?: boolean;
}

export interface ModalOpts {
  title: string;
  body: string | Node;
  actions?: ModalAction[];
  dismissable?: boolean;
  onClose?: () => void;
  wide?: boolean;
}

export function modal(o: ModalOpts): { el: HTMLElement; close: () => void } {
  const back = el('div', 'modal-backdrop');
  const box = el('div', 'modal');
  if (o.wide) box.style.width = 'min(720px, 100%)';
  box.innerHTML = `<h2>${o.title}</h2><div class="divider-gold"></div><div class="modal-body"></div>`;
  const body = box.querySelector('.modal-body') as HTMLElement;
  if (typeof o.body === 'string') body.innerHTML = o.body;
  else body.appendChild(o.body);
  body.classList.add('mb');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    const a = back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, fill: 'forwards' });
    a.onfinish = () => {
      back.remove();
      o.onClose?.();
    };
    a.oncancel = () => back.remove();
  };

  if (o.actions?.length) {
    const row = el('div', 'modal-actions');
    for (const a of o.actions) {
      const b = el(
        'button',
        `btn ${a.kind === 'primary' ? 'btn-primary' : a.kind === 'danger' ? 'btn-danger' : a.kind === 'ghost' ? 'btn-ghost' : 'btn-glass'}`,
        a.label,
      );
      b.type = 'button';
      b.addEventListener('click', () => {
        sfx.click();
        a.onClick?.();
        if (!a.keepOpen) close();
      });
      row.appendChild(b);
    }
    box.appendChild(row);
  }

  back.appendChild(box);
  if (o.dismissable !== false) {
    back.addEventListener('click', (e) => {
      if (e.target === back) close();
    });
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        window.removeEventListener('keydown', esc);
      }
    };
    window.addEventListener('keydown', esc);
  }
  document.body.appendChild(back);
  const first = box.querySelector('.btn-primary') as HTMLElement | null;
  first?.focus();
  return { el: back, close };
}

/** Quick yes/no dialog. */
export function confirmBox(title: string, msg: string, yes = 'Confirm', onYes?: () => void) {
  return modal({
    title,
    body: `<p class="muted" style="margin:0;line-height:1.55">${msg}</p>`,
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      { label: yes, kind: 'primary', onClick: onYes },
    ],
  });
}

/* --------------------------------------------------------------------- SEAT */

export interface SeatOpts {
  name: string;
  avatar: AvatarId;
  emoji?: string;
  x: number;
  y: number;
  chips?: number;
  max?: number;
  you?: boolean;
  /** 'bot' seats render a compact avatar, 'you' seats get a gold crown ring */
}

export type SeatState = '' | 'active' | 'think' | 'win' | 'lose' | 'dim';

export class Seat {
  el: HTMLElement;
  private ring: HTMLElement;
  private bubble: HTMLElement;
  private stackEl: HTMLElement;
  private bar: HTMLElement;
  private nameEl: HTMLElement;
  private mood: Mood = 'normal';
  private sayTimer = 0;

  constructor(private o: SeatOpts) {
    this.el = el('div', `seat${o.you ? ' you' : ''}`);
    this.el.style.left = `${o.x}px`;
    this.el.style.top = `${o.y}px`;
    this.el.innerHTML = `
      <div class="ava-wrap">
        <div class="avatar-ring">${avatarSvg(o.avatar, 'normal')}</div>
        <div class="bubble"></div>
      </div>
      <div class="nm">${o.name}</div>
      <div class="stack-bar"><i style="width:0%"></i></div>
      <div class="stack num">0</div>`;
    this.ring = this.el.querySelector('.avatar-ring') as HTMLElement;
    this.bubble = this.el.querySelector('.bubble') as HTMLElement;
    this.stackEl = this.el.querySelector('.stack') as HTMLElement;
    this.bar = this.el.querySelector('.stack-bar i') as HTMLElement;
    this.nameEl = this.el.querySelector('.nm') as HTMLElement;
    if (o.you) {
      this.ring.style.borderColor = '#f5e6b8';
      this.ring.style.boxShadow = '0 0 0 2px rgba(245,230,184,.7), 0 0 18px rgba(212,175,55,.5)';
    }
    if (o.chips != null) this.setStack(o.chips, o.max);
  }

  setStack(v: number, max?: number) {
    this.stackEl.textContent = fmt(v);
    const m = max ?? Math.max(v, (this.o.max ?? 0) || 1000);
    this.bar.style.width = `${Math.max(0, Math.min(100, (v / (m || 1)) * 100))}%`;
  }

  setName(n: string) {
    this.nameEl.textContent = n;
  }

  /** Mood drives the drawn face (eyes + mouth) and the CSS state class. */
  setMood(m: Mood) {
    this.mood = m;
    this.ring.innerHTML = avatarSvg(this.o.avatar, m);
  }

  /** State class: active / think / win / lose / dim (drives glow + animation). */
  setState(s: SeatState) {
    this.el.classList.remove('active', 'think', 'win', 'lose', 'dim');
    if (s) this.el.classList.add(s);
    if (s === 'think') this.setMood('think');
    else if (s === 'win') this.setMood('happy');
    else if (s === 'lose') this.setMood('sad');
    else if (!s) this.setMood('normal');
  }

  /** Speech bubble with auto-hide. */
  say(text: string, ms = 1700) {
    this.bubble.textContent = text;
    this.bubble.classList.add('show');
    window.clearTimeout(this.sayTimer);
    this.sayTimer = window.setTimeout(() => this.bubble.classList.remove('show'), ms);
  }

  hush() {
    this.bubble.classList.remove('show');
    window.clearTimeout(this.sayTimer);
  }

  destroy() {
    window.clearTimeout(this.sayTimer);
    this.el.remove();
  }
}

/* ----------------------------------------------------------------- HELPERS */

export const prettyList = (items: string[]) =>
  `<ul class="rules">${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;

/** Standard "how to play" modal used by every table. */
export function rulesModal(title: string, bullets: string[]) {
  return modal({
    title,
    body: prettyList(bullets),
    actions: [{ label: 'Got it', kind: 'primary' }],
  });
}
