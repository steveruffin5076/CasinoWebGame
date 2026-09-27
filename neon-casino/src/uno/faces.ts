/* =============================================================================
   faces.ts — UNO card model + code-drawn card art.
   Classic 108-card deck: 19 per colour (one 0, two of 1-9, two each of
   Skip/Reverse/+2) + 4 Wild + 4 Wild +4.
   Colour-blind friendly: every colour also carries a unique corner shape
   (red ●, yellow ▲, green ■, blue ◆, wild ★).
   ========================================================================== */

import unoSprite from '../assets/unoFaces.svg?raw';

export type UnoColor = 'r' | 'y' | 'g' | 'b' | 'w';
export type UnoKind = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 'skip' | 'rev' | 'd2' | 'wild' | 'wd4';

export interface UnoCard {
  uid: number;
  key: string; // "r5", "yskip", "wild", "wd4"
  color: UnoColor;
  kind: UnoKind;
  points: number;
}

export const COLORS: UnoColor[] = ['r', 'y', 'g', 'b'];
export const COLOR_NAME: Record<UnoColor, string> = {
  r: 'Red',
  y: 'Yellow',
  g: 'Green',
  b: 'Blue',
  w: 'Wild',
};
/** Neon-leaning palette that still reads as classic UNO on a dark table. */
export const COLOR_HEX: Record<UnoColor, { a: string; b: string; glow: string }> = {
  r: { a: '#ff6b6b', b: '#b91c1c', glow: 'rgba(239,68,68,.55)' },
  y: { a: '#fde68a', b: '#ca8a04', glow: 'rgba(250,204,21,.5)' },
  g: { a: '#6ee7a8', b: '#15803d', glow: 'rgba(34,197,94,.5)' },
  b: { a: '#7dd3fc', b: '#1d4ed8', glow: 'rgba(59,130,246,.5)' },
  w: { a: '#4c1d95', b: '#1e1b4b', glow: 'rgba(232,121,249,.5)' },
};

/** shape badge per colour (colour-blind aid) */
export const COLOR_SHAPE: Record<UnoColor, string> = {
  r: '●',
  y: '▲',
  g: '■',
  b: '◆',
  w: '★',
};

const NUM_KINDS: UnoKind[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const ACTION_KINDS: UnoKind[] = ['skip', 'rev', 'd2'];

let uidSeq = 1;

export const cardPoints = (c: UnoCard): number => {
  if (typeof c.kind === 'number') return c.kind;
  if (c.kind === 'wild' || c.kind === 'wd4') return 50;
  return 20;
};

/** Builds and shuffles the classic 108-card deck. */
export function buildUnoDeck(): UnoCard[] {
  const deck: UnoCard[] = [];
  const mk = (color: UnoColor, kind: UnoKind, copies: number) => {
    for (let i = 0; i < copies; i++) {
      const c: UnoCard = { uid: uidSeq++, key: `${color}${kind}`, color, kind, points: 0 };
      c.points = cardPoints(c);
      deck.push(c);
    }
  };
  for (const c of COLORS) {
    mk(c, 0, 1);
    for (const n of NUM_KINDS) if (n !== 0) mk(c, n, 2);
    for (const a of ACTION_KINDS) mk(c, a, 2);
  }
  mk('w', 'wild', 4);
  mk('w', 'wd4', 4);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** One representative of every printable face (used by the preloader). */
export const ALL_UNO_IDS: string[] = [
  ...COLORS.flatMap((c) => [...NUM_KINDS.map((n) => `${c}${n}`), ...ACTION_KINDS.map((a) => `${c}${a}`)]),
  'wwild',
  'wwd4',
];

export function unoCardFromKey(key: string): UnoCard {
  const color = key[0] as UnoColor;
  const rest = key.slice(1);
  const kind: UnoKind =
    rest === 'wild' || rest === 'wd4' || rest === 'skip' || rest === 'rev' || rest === 'd2'
      ? rest
      : (parseInt(rest, 10) as UnoKind);
  const c: UnoCard = { uid: 0, key, color, kind, points: 0 };
  c.points = cardPoints(c);
  return c;
}

/** Human label ("Skip", "+2", "7", "Wild +4"). */
export function cardLabel(c: UnoCard): string {
  if (typeof c.kind === 'number') return String(c.kind);
  return { skip: 'Skip', rev: 'Reverse', d2: '+2', wild: 'Wild', wd4: '+4' }[c.kind] ?? '?';
}

/* ---------------------------- sprite install ------------------------------ */
let installed = false;
export function installUnoSprite() {
  if (installed) return;
  installed = true;
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = unoSprite;
  document.body.appendChild(holder);
}

/* ================================ CARD ART ================================ */
/*  viewBox 60 x 90 — matches the CSS card size (1 : 1.5)                     */

const SYMBOL_FOR: Partial<Record<UnoKind, string>> = {
  skip: 'uno-skip',
  rev: 'uno-reverse',
  d2: 'uno-draw2',
  wild: 'uno-wild',
  wd4: 'uno-draw4',
};

export function unoFaceSvg(c: UnoCard): string {
  const col = COLOR_HEX[c.color];
  const wild = c.color === 'w';
  const sym = SYMBOL_FOR[c.kind];
  const label = cardLabel(c);
  const center = sym
    ? `<g color="#0b0b12" style="color:#0b0b12"><use href="#${sym}" x="0" y="0" width="60" height="90"/></g>`
    : `<text x="30" y="60" text-anchor="middle" font-family="Georgia,'Times New Roman',serif"
             font-size="46" font-weight="800" fill="${c.color === 'y' ? '#b45309' : col.b}"
             stroke="#fff" stroke-width="6" paint-order="stroke">${label}</text>`;

  const corner = (flip: boolean) => `
    <g transform="${flip ? 'translate(60 90) rotate(180)' : ''}">
      <text x="6" y="15" font-family="Georgia,serif" font-size="11" font-weight="800"
            fill="#fff" stroke="rgba(0,0,0,.35)" stroke-width="2.5" paint-order="stroke">${
              wild ? 'W' : label.length > 2 ? label.slice(0, 2) : label
            }</text>
      <text x="6" y="25" font-size="8" fill="#fff" opacity=".9">${COLOR_SHAPE[c.color]}</text>
    </g>`;

  const quad = wild
    ? `<g opacity=".95">
         <path d="M30 8 A22 22 0 0 1 52 30 L30 30 Z" fill="#ef4444"/>
         <path d="M52 30 A22 22 0 0 1 30 52 L30 30 Z" fill="#eab308"/>
         <path d="M30 52 A22 22 0 0 1 8 30 L30 30 Z" fill="#22c55e"/>
         <path d="M8 30 A22 22 0 0 1 30 8 L30 30 Z" fill="#3b82f6"/>
       </g>`
    : '';

  return `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <linearGradient id="ug-${c.key}-${c.uid}" x1="0" y1="0" x2="0.7" y2="1">
        <stop offset="0" stop-color="${col.a}"/><stop offset="1" stop-color="${col.b}"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="60" height="90" rx="9" fill="url(#ug-${c.key}-${c.uid})"/>
    <rect x="2.5" y="2.5" width="55" height="85" rx="7" fill="none" stroke="rgba(255,255,255,.55)" stroke-width="2"/>
    ${quad}
    <!-- the classic white swoosh -->
    <g transform="rotate(-21 30 45)">
      <ellipse cx="30" cy="45" rx="26" ry="18" fill="#fff" opacity=".97"/>
    </g>
    <g transform="rotate(-21 30 45)">${center}</g>
    ${corner(false)}
    ${corner(true)}
    <rect x="0" y="0" width="60" height="90" rx="9" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.5"/>
  </svg>`;
}

/** Card back: purple + gold lattice with a diamond "UNO" mark. */
export function unoBackSvg(): string {
  return `<svg viewBox="0 0 60 90" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
    <defs>
      <pattern id="ub-lattice" width="9" height="9" patternUnits="userSpaceOnUse">
        <path d="M4.5 0 L9 4.5 L4.5 9 L0 4.5 Z" fill="none" stroke="#d4af37" stroke-opacity=".35" stroke-width=".8"/>
      </pattern>
    </defs>
    <rect width="60" height="90" rx="9" fill="#2e1065"/>
    <rect width="60" height="90" rx="9" fill="url(#ub-lattice)"/>
    <rect x="3" y="3" width="54" height="84" rx="7" fill="none" stroke="#d4af37" stroke-opacity=".85" stroke-width="1.6"/>
    <g transform="translate(30 45)">
      <path d="M0 -16 L13 0 L0 16 L-13 0 Z" fill="#d4af37"/>
      <path d="M0 -10 L8 0 L0 10 L-8 0 Z" fill="#2e1065"/>
      <text y="3.6" text-anchor="middle" font-family="Georgia,serif" font-size="8.5" font-weight="800" fill="#f5e6b8">U</text>
    </g>
  </svg>`;
}

/** Sorts a hand: by colour, then kind (numbers before actions, then wilds). */
const KIND_ORDER: UnoKind[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'skip', 'rev', 'd2', 'wild', 'wd4'];

export function sortByColor(a: UnoCard[]): UnoCard[] {
  return [...a].sort((x, y) => {
    const cx = COLORS.indexOf(x.color) - COLORS.indexOf(y.color);
    if (cx !== 0) return cx;
    return KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind);
  });
}

export function sortByNumber(a: UnoCard[]): UnoCard[] {
  return [...a].sort((x, y) => {
    const kx = KIND_ORDER.indexOf(x.kind) - KIND_ORDER.indexOf(y.kind);
    if (kx !== 0) return kx;
    return COLORS.indexOf(x.color) - COLORS.indexOf(y.color);
  });
}
