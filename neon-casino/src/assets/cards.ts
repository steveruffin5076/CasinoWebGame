/* =============================================================================
   cards.ts — playing-card rendering. Every face is generated as SVG markup:
   paper gradient, corner indices, pip layouts 2–10, and stylised court cards
   (J/Q/K) — no bitmaps, no external images, crisp on retina at any size.

   DOM structure (3D flip lives on the inner element so the outer transform
   stays free for GPU positioning):
     .card  > .flipper > .face | .back
   ========================================================================== */

import backSvg from './cardsBack.svg?raw';
import suitsSprite from './suits.svg?raw';
import type { Card, Rank, Suit } from '../core/deck';
import { isRed } from '../core/deck';

let spritesInstalled = false;
/** Injects the shared SVG sprite (suits + gradients) once per document. */
export function installSuitSprite() {
  if (spritesInstalled) return;
  spritesInstalled = true;
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = suitsSprite;
  document.body.appendChild(holder);
}

const ink = (s: Suit) => (isRed(s) ? '#d3202a' : '#1c2029');
const gold = '#b8912f';

/** pip positions per rank (x, y, rotated?) in the 100x140 card space */
const PIPS: Record<Rank, [number, number, boolean][]> = {
  A: [[50, 70, false]],
  '2': [
    [50, 24, false],
    [50, 116, true],
  ],
  '3': [
    [50, 24, false],
    [50, 70, false],
    [50, 116, true],
  ],
  '4': [
    [27, 24, false],
    [73, 24, false],
    [27, 116, true],
    [73, 116, true],
  ],
  '5': [
    [27, 24, false],
    [73, 24, false],
    [50, 70, false],
    [27, 116, true],
    [73, 116, true],
  ],
  '6': [
    [27, 24, false],
    [73, 24, false],
    [27, 70, false],
    [73, 70, false],
    [27, 116, true],
    [73, 116, true],
  ],
  '7': [
    [27, 24, false],
    [73, 24, false],
    [50, 47, false],
    [27, 70, false],
    [73, 70, false],
    [27, 116, true],
    [73, 116, true],
  ],
  '8': [
    [27, 24, false],
    [73, 24, false],
    [50, 47, false],
    [27, 70, false],
    [73, 70, false],
    [50, 93, true],
    [27, 116, true],
    [73, 116, true],
  ],
  '9': [
    [27, 24, false],
    [73, 24, false],
    [27, 52, false],
    [73, 52, false],
    [50, 70, false],
    [27, 88, true],
    [73, 88, true],
    [27, 116, true],
    [73, 116, true],
  ],
  '10': [
    [27, 24, false],
    [73, 24, false],
    [50, 37, false],
    [27, 52, false],
    [73, 52, false],
    [27, 88, true],
    [73, 88, true],
    [50, 103, true],
    [27, 116, true],
    [73, 116, true],
  ],
  J: [],
  Q: [],
  K: [],
};

const pipSvg = (s: Suit, x: number, y: number, rot: boolean, size = 15) =>
  `<g transform="translate(${x} ${y})${rot ? ' rotate(180)' : ''} translate(${-size / 2} ${-size / 2})">
     <use href="#suit-${s}" x="0" y="0" width="${size}" height="${size}" />
   </g>`;

/** Stylised mirrored court figure (classic J/Q/K look, drawn from shapes). */
function courtArt(rank: Rank, s: Suit): string {
  const c = ink(s);
  const goldTrim = rank === 'K' ? gold : c;
  const head = `<circle cx="50" cy="52" r="10.5" fill="#f3dcc0" stroke="${c}" stroke-width="1.6"/>`;
  const body = `
    <path d="M32 132 q2-26 18-32 q16 6 18 32 z" fill="${c}" opacity=".92"/>
    <path d="M50 100 q-9 4 -12 14 l24 0 q-3-10-12-14 z" fill="#fff" opacity=".9"/>
    <path d="M50 100 l-6 8 6 8 6-8 z" fill="${goldTrim}"/>`;
  let hat = '';
  if (rank === 'K')
    hat = `<path d="M34 44 l4-14 6 8 6-10 6 10 6-8 4 14 z" fill="${gold}"/>
           <path d="M36 44 h28 v4 h-28 z" fill="#8c6d1f"/>
           <path d="M42 62 q8 12 16 0 q-4 16-8 16 q-4 0-8-16 z" fill="#e9e6df" opacity=".9"/>`;
  if (rank === 'Q')
    hat = `<path d="M36 44 q14-14 28 0 z" fill="${gold}"/>
           <circle cx="50" cy="37" r="3" fill="#ef4444"/>
           <path d="M32 62 q10-12 18 0 q-6 14-9 14 q-3 0-9-14 z" fill="#2b1d12"/>`;
  if (rank === 'J')
    hat = `<path d="M36 46 q14-18 28 0 z" fill="${c}"/>
           <path d="M64 44 q10-14 12-22 q-8 6-14 16 z" fill="${isRed(s) ? '#ef4444' : '#3b82f6'}"/>`;

  const suitBadge = pipSvg(s, 34, 118, false, 13);
  const half = `
    <g>
      ${body}
      ${head}
      ${hat}
      <path d="M40 68 q10 5 20 0" stroke="#8a3b3b" stroke-width="1.4" fill="none"/>
      <circle cx="45.5" cy="51" r="1.5" fill="#1c2029"/>
      <circle cx="54.5" cy="51" r="1.5" fill="#1c2029"/>
      ${suitBadge}
    </g>`;
  return `
    <g>
      <path d="M22 20 h56 v100 h-56 z" fill="none" stroke="${c}" stroke-width="1.2" opacity=".35"/>
      <path d="M24 22 h52 v96 h-52 z" fill="#ffffff" opacity=".35"/>
      <g clip-path="url(#court-clip-${rank}${s})">${half}</g>
      <g transform="translate(100 140) rotate(180)" clip-path="url(#court-clip-${rank}${s})">${half}</g>
      <defs>
        <clipPath id="court-clip-${rank}${s}"><rect x="20" y="18" width="60" height="52"/></clipPath>
      </defs>
    </g>`;
}

/** Full front-face SVG markup for a card. */
export function cardFrontSvg(c: Card): string {
  const col = ink(c.s);
  const label = c.r === '10' ? '10' : c.r;
  const corner = (rot: boolean) =>
    `<g transform="${rot ? 'translate(100 140) rotate(180)' : ''}">
       <text x="8.5" y="20" font-family="Georgia,serif" font-size="${
         label.length > 1 ? 13 : 15
       }" font-weight="700" fill="${col}" text-anchor="middle">${label}</text>
       <use href="#suit-${c.s}" x="4" y="21" width="9" height="9"/>
     </g>`;
  let center = '';
  if (c.r === 'A') {
    center = `
      <circle cx="50" cy="70" r="20" fill="${col}" opacity=".08"/>
      <g transform="translate(35 55)"><use href="#suit-${c.s}" width="30" height="30"/></g>`;
  } else if (c.r === 'J' || c.r === 'Q' || c.r === 'K') {
    center = courtArt(c.r, c.s);
  } else {
    center = PIPS[c.r].map(([x, y, r]) => pipSvg(c.s, x, y, r, 16)).join('');
  }
  return `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <rect x="0" y="0" width="100" height="140" rx="10" fill="url(#paper-grad)"/>
    <rect x="1" y="1" width="98" height="138" rx="9.5" fill="none" stroke="rgba(0,0,0,.10)"/>
    ${corner(false)}
    ${corner(true)}
    ${center}
  </svg>`;
}

/** Card back (deep navy + gold lattice + diamond medallion). */
export const cardBackSvg = () => backSvg;

/* ------------------------------------------------------------------------ */
/*  CardView — reusable, pooled card DOM node                                */
/* ------------------------------------------------------------------------ */

export interface PlaceOpts {
  /** ms before the move starts (used for the dealing stagger) */
  delay?: number;
  duration?: number;
  z?: number;
  scale?: number;
}

export class CardView {
  readonly el: HTMLDivElement;
  readonly flipper: HTMLDivElement;
  readonly face: HTMLDivElement;
  readonly back: HTMLDivElement;
  card: Card | null = null;
  private _up = false;

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'card';
    this.flipper = document.createElement('div');
    this.flipper.className = 'flipper';
    this.face = document.createElement('div');
    this.face.className = 'face';
    this.back = document.createElement('div');
    this.back.className = 'back';
    this.back.innerHTML = backSvg;
    this.flipper.append(this.face, this.back);
    this.el.appendChild(this.flipper);
  }

  /** Binds card data and paints the front; `faceUp=false` keeps the back out. */
  set(card: Card | null, faceUp = false) {
    this.card = card;
    if (!card) {
      this.face.innerHTML = '';
      return this;
    }
    this.face.innerHTML = cardFrontSvg(card);
    this.el.classList.toggle('red', isRed(card.s));
    this.el.classList.toggle('black', !isRed(card.s));
    this._up = faceUp;
    this.el.classList.toggle('flipped', faceUp);
    return this;
  }

  get faceUp() {
    return this._up;
  }

  /** Flip the card (3D rotateY on the inner element). */
  flip(up: boolean, delay = 0) {
    if (delay > 0) {
      window.setTimeout(() => {
        this._up = up;
        this.el.classList.toggle('flipped', up);
      }, delay);
    } else {
      this._up = up;
      this.el.classList.toggle('flipped', up);
    }
    return this;
  }

  /** GPU-only placement: translate3d + rotate + optional scale. */
  place(x: number, y: number, rot = 0, o: PlaceOpts = {}) {
    const s = o.scale ?? 1;
    this.el.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rot}deg) scale(${s})`;
    this.el.style.zIndex = String(o.z ?? 1);
    this.el.style.transitionDelay = `${o.delay ?? 0}ms`;
    this.el.style.transitionDuration = `${o.duration ?? 420}ms`;
    return this;
  }

  /** Fade/slide in from the shoe (deal animation). */
  dealFrom(fromX: number, fromY: number, toX: number, toY: number, rot = 0, delay = 0) {
    this.el.style.transition = 'none';
    this.el.style.opacity = '0';
    this.el.style.transform = `translate3d(${fromX}px, ${fromY}px, 0) rotate(${rot}deg) scale(.86)`;
    // force style flush, then animate to the destination
    void this.el.offsetWidth;
    this.el.style.transition = 'transform .42s cubic-bezier(.16,1,.3,1), opacity .28s ease';
    this.el.style.transitionDelay = `${delay}ms`;
    this.el.style.opacity = '1';
    this.el.style.transform = `translate3d(${toX}px, ${toY}px, 0) rotate(${rot}deg) scale(1)`;
    return this;
  }

  setSize(w: number) {
    this.el.style.setProperty('--cw', `${w}px`);
    this.el.style.setProperty('--ch', `${Math.round(w * 1.4)}px`);
    this.el.style.width = `${w}px`;
    this.el.style.height = `${Math.round(w * 1.4)}px`;
    return this;
  }

  highlight(on: boolean) {
    this.el.classList.toggle('hl', on);
    return this;
  }
  ghost(on: boolean) {
    this.el.classList.toggle('ghosted', on);
    return this;
  }
  destroy() {
    this.el.remove();
  }
}

/* ------------------------------------------------------------------------ */
/*  Tiny pool so repeated hands never allocate new DOM                       */
/* ------------------------------------------------------------------------ */
export class CardPool {
  private free: CardView[] = [];
  private used = new Set<CardView>();
  constructor(private parent: HTMLElement) {}

  take(): CardView {
    let v = this.free.pop();
    if (!v) {
      v = new CardView();
      this.parent.appendChild(v.el);
    }
    v.el.style.display = '';
    this.used.add(v);
    return v;
  }

  release(v: CardView) {
    if (!this.used.delete(v)) return;
    v.el.className = 'card';
    v.el.style.cssText = '';
    v.el.style.display = 'none';
    v.card = null;
    v.face.innerHTML = '';
    this.free.push(v);
  }

  releaseAll() {
    for (const v of [...this.used]) this.release(v);
  }
}
