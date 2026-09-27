/* =============================================================================
   tiles.ts — Hong Kong Mahjong tiles: data model + 100% code-drawn SVG faces.

   Tile ids
   --------
     d1..d9  Dots   (筒子 - circles)
     b1..b9  Bams   (索子 - bamboo)
     c1..c9  Cracks (萬子 - characters)
     we ws ww wn    Winds  (East / South / West / North)
     dr dg dw       Dragons (Red / Green / White)

   A full set is 34 unique faces x 4 copies = 136 tiles. Flowers/seasons are
   deliberately omitted (simplified Hong Kong variant — see README).
   ========================================================================== */

import mahjongSprite from '../assets/mahjongFaces.svg?raw';

export type TileId = string;

export type TileSuit = 'dot' | 'bam' | 'crack' | 'wind' | 'dragon';

export interface TileInfo {
  id: TileId;
  suit: TileSuit;
  rank: number; // 1..9 for suits, 1..4 winds (E,S,W,N), 1..3 dragons (R,G,W)
  name: string;
  /** terminal or honour -> counts toward mixed/All-terminals style hands */
  honour: boolean;
  terminal: boolean;
}

/* --------------------------- tile catalogue ------------------------------- */

const WIND_NAMES = ['East', 'South', 'West', 'North'];
const DRAGON_NAMES = ['Red', 'Green', 'White'];

export const TILES: Record<TileId, TileInfo> = {};

function def(id: TileId, suit: TileSuit, rank: number, name: string) {
  TILES[id] = {
    id,
    suit,
    rank,
    name,
    honour: suit === 'wind' || suit === 'dragon',
    terminal: (suit === 'dot' || suit === 'bam' || suit === 'crack') && (rank === 1 || rank === 9),
  };
}

for (let i = 1; i <= 9; i++) {
  def(`d${i}`, 'dot', i, `${i} Dot`);
  def(`b${i}`, 'bam', i, `${i} Bam`);
  def(`c${i}`, 'crack', i, `${i} Crack`);
}
['we', 'ws', 'ww', 'wn'].forEach((id, i) => def(id, 'wind', i + 1, `${WIND_NAMES[i]} Wind`));
['dr', 'dg', 'dw'].forEach((id, i) => def(id, 'dragon', i + 1, `${DRAGON_NAMES[i]} Dragon`));

export const ALL_TILE_IDS: TileId[] = Object.keys(TILES);

export const info = (id: TileId): TileInfo => TILES[id] ?? TILES.d1;
export const suitOf = (id: TileId) => info(id).suit;
export const rankOf = (id: TileId) => info(id).rank;
export const isHonour = (id: TileId) => info(id).honour;
export const isSuited = (id: TileId) => {
  const s = suitOf(id);
  return s === 'dot' || s === 'bam' || s === 'crack';
};

/** Builds a shuffled 136-tile wall (4 copies of every face). */
export function buildWall(): TileId[] {
  const wall: TileId[] = [];
  for (const id of ALL_TILE_IDS) for (let i = 0; i < 4; i++) wall.push(id);
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [wall[i], wall[j]] = [wall[j], wall[i]];
  }
  return wall;
}

/* ---------------------------- sprite install ------------------------------ */

let installed = false;
export function installMahjongSprite() {
  if (installed) return;
  installed = true;
  const holder = document.createElement('div');
  holder.style.display = 'none';
  holder.innerHTML = mahjongSprite;
  document.body.appendChild(holder);
}

/* ============================== FACE ART ================================== */
/*  Faces are drawn into a 60 x 80 viewBox (matching the CSS tile size 1:1.33)
    with an ivory paper base; the 3D bevel/depth comes from CSS.               */

const svgWrap = (inner: string) =>
  `<svg viewBox="0 0 60 80" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
     <rect x="0" y="0" width="60" height="80" rx="6" fill="url(#mj-ivory)"/>
     <rect x="1" y="1" width="58" height="78" rx="5.5" fill="none" stroke="rgba(0,0,0,.10)"/>
     <path d="M2 2 h56 a4 4 0 0 1 0 8 h-56 a4 4 0 0 1 0-8 z" fill="#fff" opacity=".55"/>
     ${inner}
   </svg>`;

/* ------------------------------- Dots ------------------------------------- */
type Pt = [number, number];

const DOT_LAYOUT: Record<number, Pt[]> = {
  1: [[30, 40]],
  2: [[30, 24], [30, 56]],
  3: [[18, 20], [30, 40], [42, 60]],
  4: [[20, 24], [40, 24], [20, 56], [40, 56]],
  5: [[19, 21], [41, 21], [30, 40], [19, 59], [41, 59]],
  6: [[20, 20], [40, 20], [20, 40], [40, 40], [20, 60], [40, 60]],
  7: [[17, 15], [30, 15], [43, 15], [20, 43], [40, 43], [20, 66], [40, 66]],
  8: [[20, 15], [40, 15], [20, 32], [40, 32], [20, 49], [40, 49], [20, 66], [40, 66]],
  9: [[16, 19], [30, 19], [44, 19], [16, 40], [30, 40], [44, 40], [16, 61], [30, 61], [44, 61]],
};

function dotFace(n: number): string {
  const pts = DOT_LAYOUT[n] ?? DOT_LAYOUT[1];
  const big = n === 1;
  const r = big ? 13 : n <= 5 ? 6.4 : n <= 7 ? 5.6 : 4.9;
  const mid = Math.floor(pts.length / 2);
  return svgWrap(
    pts
      .map(([x, y], i) => {
        const isCentre = pts.length % 2 === 1 && i === mid;
        const fill = big ? 'url(#mj-dot-r)' : isCentre ? 'url(#mj-dot-r)' : 'url(#mj-dot)';
        const ring = big
          ? `<circle cx="${x}" cy="${y}" r="${r - 5}" fill="#faf7ef"/>
             <circle cx="${x}" cy="${y}" r="${r - 8}" fill="url(#mj-dot-r)"/>
             <circle cx="${x - 3}" cy="${y - 3}" r="2" fill="#fff" opacity=".55"/>`
          : `<circle cx="${x - r * 0.28}" cy="${y - r * 0.3}" r="${r * 0.3}" fill="#fff" opacity=".45"/>`;
        return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="rgba(0,0,0,.18)" stroke-width=".7"/>${ring}</g>`;
      })
      .join(''),
  );
}

/* ------------------------------- Bams ------------------------------------- */
const BAM_LAYOUT: Record<
  number,
  { x: number; y: number; rot?: number; h?: number; red?: boolean }[]
> = {
  1: [{ x: 30, y: 40, h: 34, red: true }],
  2: [
    { x: 21, y: 26, h: 26 },
    { x: 39, y: 54, h: 26 },
  ],
  3: [
    { x: 30, y: 20, h: 22 },
    { x: 21, y: 52, h: 26 },
    { x: 39, y: 52, h: 26 },
  ],
  4: [
    { x: 21, y: 25, h: 24 },
    { x: 39, y: 25, h: 24 },
    { x: 21, y: 55, h: 24 },
    { x: 39, y: 55, h: 24 },
  ],
  5: [
    { x: 19, y: 22, h: 22 },
    { x: 41, y: 22, h: 22 },
    { x: 30, y: 41, h: 22, red: true },
    { x: 19, y: 60, h: 22 },
    { x: 41, y: 60, h: 22 },
  ],
  6: [
    { x: 20, y: 20, h: 20 },
    { x: 40, y: 20, h: 20 },
    { x: 20, y: 40, h: 20 },
    { x: 40, y: 40, h: 20 },
    { x: 20, y: 60, h: 20 },
    { x: 40, y: 60, h: 20 },
  ],
  7: [
    { x: 30, y: 16, h: 17 },
    { x: 20, y: 40, h: 20 },
    { x: 40, y: 40, h: 20 },
    { x: 20, y: 63, h: 20 },
    { x: 40, y: 63, h: 20 },
    { x: 20, y: 20, h: 0 },
    { x: 40, y: 20, h: 0 },
  ],
  8: [
    { x: 15, y: 24, h: 22, rot: -12 },
    { x: 28, y: 24, h: 22, rot: -12 },
    { x: 41, y: 24, h: 22, rot: -12 },
    { x: 52, y: 24, h: 22, rot: -12 },
    { x: 15, y: 56, h: 22, rot: 12 },
    { x: 28, y: 56, h: 22, rot: 12 },
    { x: 41, y: 56, h: 22, rot: 12 },
    { x: 52, y: 56, h: 22, rot: 12 },
  ],
  9: [
    { x: 17, y: 18, h: 18 },
    { x: 30, y: 18, h: 18 },
    { x: 43, y: 18, h: 18 },
    { x: 17, y: 40, h: 18 },
    { x: 30, y: 40, h: 18 },
    { x: 43, y: 40, h: 18 },
    { x: 17, y: 62, h: 18 },
    { x: 30, y: 62, h: 18 },
    { x: 43, y: 62, h: 18 },
  ],
};

function bamFace(n: number): string {
  const sticks = (BAM_LAYOUT[n] ?? BAM_LAYOUT[1]).filter((s) => (s.h ?? 0) > 0);
  const body = sticks
    .map((s) => {
      const h = s.h ?? 20;
      const w = h * 0.34;
      const rot = s.rot ? ` rotate(${s.rot} ${s.x} ${s.y})` : '';
      const dye = s.red ? '#b91c1c' : 'url(#mj-bam)';
      return `<g transform="translate(${s.x - w / 2} ${s.y - h / 2})${rot}">
        <rect x="0" y="0" width="${w}" height="${h}" rx="${w / 2}" fill="${dye}" stroke="rgba(0,0,0,.22)" stroke-width=".6"/>
        <rect x="${w * 0.18}" y="${h * 0.28}" width="${w * 0.22}" height="${h * 0.06}" fill="#0b2b17" opacity=".6"/>
        <rect x="${w * 0.18}" y="${h * 0.66}" width="${w * 0.22}" height="${h * 0.06}" fill="#0b2b17" opacity=".6"/>
        <rect x="${w * 0.2}" y="${h * 0.06}" width="${w * 0.18}" height="${h * 0.88}" rx="${w * 0.09}" fill="#fff" opacity=".2"/>
      </g>`;
    })
    .join('');
  // the "1 Bam" bird: a small red crest + leaf flourish on top of the single stick
  const bird =
    n === 1
      ? `<g fill="none" stroke="#b91c1c" stroke-width="1.8" stroke-linecap="round">
           <path d="M30 16 q8 -6 12 2 q-6 6 -12 -2 z" fill="#b91c1c" fill-opacity=".85"/>
           <path d="M30 24 q-9 2 -12 12 M30 26 q9 1 12 11"/>
         </g>
         <path d="M24 64 q6 -8 12 0" stroke="#14532d" stroke-width="1.6" fill="none"/>`
      : '';
  return svgWrap(body + bird);
}

/* ------------------------------ Cracks ------------------------------------ */
/** Chinese numeral 1-9 drawn with simple brush strokes (font independent). */
function numeral(n: number, color = '#1f2937'): string {
  const s = `stroke="${color}" stroke-width="3.4" stroke-linecap="round" fill="none"`;
  const g = (d: string) => `<path d="${d}" ${s}/>`;
  switch (n) {
    case 1:
      return g('M12 22 H48');
    case 2:
      return g('M13 14 H47') + g('M10 30 H50');
    case 3:
      return g('M13 10 H47') + g('M16 21 H44') + g('M10 33 H50');
    case 4:
      return (
        `<rect x="15" y="8" width="30" height="27" rx="2" ${s}/>` +
        g('M24 12 l-3 19') +
        g('M36 12 l3 19')
      );
    case 5:
      return g('M12 11 H48') + g('M21 11 V21') + g('M21 21 H46') + g('M46 21 L24 38') + g('M12 38 H50');
    case 6:
      return g('M28 6 L28 11') + g('M8 18 H52') + g('M20 23 L13 40') + g('M40 23 L48 40');
    case 7:
      return g('M8 18 H52') + g('M40 7 L22 38 q-3 7 7 6');
    case 8:
      return g('M22 10 L13 40') + g('M38 10 L48 40');
    case 9:
      return g('M18 11 L10 38') + g('M20 15 H48') + g('M48 15 L28 36 q-4 7 7 6');
    default:
      return '';
  }
}

function crackFace(n: number): string {
  return svgWrap(`
    <g transform="translate(0 -6)">${numeral(n, '#1f2937')}</g>
    <g transform="translate(11 34) scale(.78)"><use href="#mj-wan" width="50" height="50"/></g>
  `);
}

/* ------------------------------- Honours ---------------------------------- */
function windFace(rank: number): string {
  const letter = ['E', 'S', 'W', 'N'][rank - 1] ?? 'E';
  return svgWrap(`
    <g opacity=".5"><use href="#mj-wind-frame" width="60" height="60" y="10"/></g>
    <text x="30" y="56" text-anchor="middle" font-family="Georgia,'Times New Roman',serif"
          font-size="42" font-weight="700" fill="#1f4f8f" letter-spacing="1">${letter}</text>
    <text x="30" y="70" text-anchor="middle" font-family="Georgia,serif" font-size="9"
          fill="#1f4f8f" opacity=".75">${['EAST', 'SOUTH', 'WEST', 'NORTH'][rank - 1] ?? ''}</text>
  `);
}

function dragonFace(rank: number): string {
  if (rank === 1)
    return svgWrap(`<g transform="translate(2 -2)"><use href="#mj-chung" width="56" height="56"/></g>`);
  if (rank === 2)
    return svgWrap(`<g transform="translate(2 -2)"><use href="#mj-fa" width="56" height="56"/></g>`);
  // White dragon: traditional engraved empty frame
  return svgWrap(`
    <rect x="14" y="20" width="32" height="42" rx="3" fill="none" stroke="#1f4f8f" stroke-width="3.4"/>
    <rect x="20" y="26" width="20" height="30" rx="2" fill="none" stroke="#1f4f8f" stroke-width="1.6" opacity=".6"/>
  `);
}

/** Full face SVG for a tile id. */
export function tileFaceSvg(id: TileId): string {
  const t = info(id);
  switch (t.suit) {
    case 'dot':
      return dotFace(t.rank);
    case 'bam':
      return bamFace(t.rank);
    case 'crack':
      return crackFace(t.rank);
    case 'wind':
      return windFace(t.rank);
    default:
      return dragonFace(t.rank);
  }
}

/* --------------------------- sorting / helpers ---------------------------- */

const ORDER: TileSuit[] = ['dot', 'bam', 'crack', 'wind', 'dragon'];

/** Canonical sort: suits in order, then rank. */
export function sortTiles(ids: TileId[]): TileId[] {
  return [...ids].sort((a, b) => {
    const A = info(a);
    const B = info(b);
    const d = ORDER.indexOf(A.suit) - ORDER.indexOf(B.suit);
    return d !== 0 ? d : A.rank - B.rank;
  });
}

export const tileName = (id: TileId) => info(id).name;

/** Counts of each tile id in a list, e.g. { d1: 2, we: 3 } */
export function countTiles(ids: TileId[]): Record<TileId, number> {
  const m: Record<TileId, number> = {};
  for (const id of ids) m[id] = (m[id] ?? 0) + 1;
  return m;
}
