/* =============================================================================
   scoring.ts — Hong Kong Mahjong win detection, shanten estimation and the
   simplified fan table.

   Hand shapes
   -----------
   Standard: 4 sets (pung / kong / chow) + 1 pair, across hand + exposed melds.

   Fan table (simplified HK, capped at 13 fan):
     Winning hand ..........................  1
     All Pungs .............................  3
     Mixed One Suit (one suit + honours) ...  3
     Pure Suit .............................  7
     All Honours ........................... 10
     All Terminals & Honours ...............  6
     Pure Terminals ......................... 6
     Little Three Dragons ..................  6
     Big Three Dragons .....................  8
     All Kongs .............................  8
     Each Dragon set ....................... +2
     Round-wind set ......................... +2
     Seat-wind set .......................... +2
     Fully Concealed (self-draw) ........... +1
     Self-draw ............................. +1

   Payout (documented simplification):
     points = fan × 10 chips
     • win on discard: the discarder pays 3× points (covers the table)
     • win on self-draw: every player pays points (winner gets 3× points)
   ========================================================================== */

import { info, isSuited, suitOf, rankOf, type TileId, type TileSuit } from './tiles';

/* ------------------------------ index helpers ----------------------------- */
/** canonical index 0..33 for a tile id (dots 0-8, bams 9-17, cracks 18-26, winds 27-30, dragons 31-33) */
export function tileIndex(id: TileId): number {
  const t = info(id);
  switch (t.suit) {
    case 'dot':
      return t.rank - 1;
    case 'bam':
      return 9 + t.rank - 1;
    case 'crack':
      return 18 + t.rank - 1;
    case 'wind':
      return 27 + t.rank - 1;
    default:
      return 31 + t.rank - 1;
  }
}
const INDEX_TO_ID = (): TileId[] => {
  const out: TileId[] = [];
  for (let n = 1; n <= 9; n++) out.push(`d${n}`);
  for (let n = 1; n <= 9; n++) out.push(`b${n}`);
  for (let n = 1; n <= 9; n++) out.push(`c${n}`);
  ['e', 's', 'w', 'n'].forEach((w) => out.push(`w${w}`));
  ['r', 'g', 'w2'].forEach((d, i) => out.push(i === 0 ? 'dr' : i === 1 ? 'dg' : 'dw'));
  return out;
};
const ID_BY_INDEX = INDEX_TO_ID();

export function countsOf(tiles: TileId[]): number[] {
  const c = new Array(34).fill(0);
  for (const t of tiles) c[tileIndex(t)]++;
  return c;
}

/* -------------------------------- sets ------------------------------------ */

export type SetKind = 'chow' | 'pung' | 'kong';
export interface Meld {
  kind: SetKind;
  tiles: TileId[];
  /** concealed (drawn yourself) vs exposed (called from a discard) */
  concealed: boolean;
  /** tile the meld was called on (for highlight) */
  from?: TileId;
}

/**
 * Decompose a 3n+2 tile list into sets + pair; returns null if impossible.
 * The pair is extracted FIRST (every tile must belong to a set or the pair).
 */
export function decompose(tiles: TileId[]): { sets: Meld[]; pair: TileId } | null {
  if (tiles.length % 3 !== 2) return null;
  const c = countsOf(tiles);
  const needSets = (tiles.length - 2) / 3;
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const sets = solveSets(c, needSets);
    c[p] += 2;
    if (sets) return { sets, pair: ID_BY_INDEX[p] };
  }
  return null;
}

/** Solve counts into exactly `need` sets (pungs/chows), consuming everything. */
function solveSets(c: number[], need: number): Meld[] | null {
  if (need === 0) return c.every((x) => x === 0) ? [] : null;
  let i = 0;
  while (i < 34 && c[i] === 0) i++;
  if (i >= 34) return null;
  if (c[i] >= 3) {
    c[i] -= 3;
    const r = solveSets(c, need - 1);
    c[i] += 3;
    if (r) {
      r.push({ kind: 'pung', tiles: [ID_BY_INDEX[i], ID_BY_INDEX[i], ID_BY_INDEX[i]], concealed: true });
      return r;
    }
  }
  if (isSuited(ID_BY_INDEX[i]) && rankOf(ID_BY_INDEX[i]) <= 7 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    const r = solveSets(c, need - 1);
    c[i]++; c[i + 1]++; c[i + 2]++;
    if (r) {
      r.push({ kind: 'chow', tiles: [ID_BY_INDEX[i], ID_BY_INDEX[i + 1], ID_BY_INDEX[i + 2]], concealed: true });
      return r;
    }
  }
  return null;
}

/** Does adding `tile` to `hand` complete a winning 14-tile hand? */
export function canWin(hand: TileId[], meldsCalled: number, tile: TileId): boolean {
  const total = hand.length + 1 + meldsCalled * 3;
  if (total !== 14) return false;
  const need = 4 - meldsCalled;
  const c = countsOf([...hand, tile]);
  // the pair can also come from a called meld structure; here hand supplies
  // `need` sets + the pair
  for (let p = 0; p < 34; p++) {
    if (c[p] < 2) continue;
    c[p] -= 2;
    const ok = solveSets(c, need) !== null;
    c[p] += 2;
    if (ok) return true;
  }
  return false;
}

/* ------------------------------- shanten ---------------------------------- */

/**
 * Standard shanten estimate for a 3n+1 (or 3n+2) tile hand with `meldsCalled`
 * exposed melds. Lower = closer to winning; 0 = tenpai (ready).
 */
export function shanten(hand: TileId[], meldsCalled: number): number {
  const c = countsOf(hand);
  const need = 4 - meldsCalled;
  let best = 8;
  // with a committed pair (bestPartial already carries the +1 pair bonus)
  for (let i = 0; i < 34; i++) {
    if (c[i] >= 2) {
      c[i] -= 2;
      best = Math.min(best, 8 - 2 * meldsCalled - bestPartial(c, need, true));
      c[i] += 2;
    }
  }
  // without a pair
  best = Math.min(best, 8 - 2 * meldsCalled - bestPartial(c, need, false));
  return Math.max(-1, best);
}

/**
 * Max of 2*sets + partials + (pair already committed ? 1 : 0) over all
 * arrangements, with sets+partials capped at `need`.
 */
function bestPartial(c: number[], need: number, pairDone: boolean): number {
  let best = 0;
  const rec = (idx: number, sets: number, partials: number, score: number) => {
    if (idx >= 34) {
      best = Math.max(best, score);
      return;
    }
    if (c[idx] === 0) {
      rec(idx + 1, sets, partials, score);
      return;
    }
    // prune: cannot exceed need
    if (sets + partials < need) {
      if (c[idx] >= 3) {
        c[idx] -= 3;
        rec(idx, sets + 1, partials, score + 2);
        c[idx] += 3;
      }
      if (isSuited(ID_BY_INDEX[idx]) && rankOf(ID_BY_INDEX[idx]) <= 7 && idx % 9 <= 6 && c[idx + 1] > 0 && c[idx + 2] > 0) {
        c[idx]--; c[idx + 1]--; c[idx + 2]--;
        rec(idx, sets + 1, partials, score + 2);
        c[idx]++; c[idx + 1]++; c[idx + 2]++;
      }
      if (c[idx] >= 2) {
        c[idx] -= 2;
        rec(idx, sets, partials + 1, score + 1);
        c[idx] += 2;
      }
      if (isSuited(ID_BY_INDEX[idx]) && rankOf(ID_BY_INDEX[idx]) <= 8 && idx % 9 <= 7 && c[idx + 1] > 0) {
        c[idx]--; c[idx + 1]--;
        rec(idx, sets, partials + 1, score + 1);
        c[idx]++; c[idx + 1]++;
      }
      if (isSuited(ID_BY_INDEX[idx]) && rankOf(ID_BY_INDEX[idx]) <= 7 && idx % 9 <= 6 && c[idx + 2] > 0) {
        c[idx]--; c[idx + 2]--;
        rec(idx, sets, partials + 1, score + 1);
        c[idx]++; c[idx + 2]++;
      }
    }
    // skip this tile entirely
    rec(idx + 1, sets, partials, score);
  };
  rec(0, 0, 0, pairDone ? 1 : 0);
  return Math.min(best, 2 * need + 1);
}

/* --------------------------------- fan ------------------------------------ */

export interface FanLine {
  name: string;
  fan: number;
}
export interface ScoreResult {
  fan: number;
  lines: FanLine[];
  points: number; // chips per paying player (before multipliers)
  handName: string;
}

const WIND_LETTER = ['e', 's', 'w', 'n'];

/**
 * Scores a winning hand.
 * @param sets the four sets + pair (from decompose, melds marked concealed/exposed)
 */
export function scoreWin(
  sets: Meld[],
  pair: TileId,
  seatWind: number, // 0=E 1=S 2=W 3=N
  roundWind: number,
  selfDraw: boolean,
): ScoreResult {
  const lines: FanLine[] = [];
  const allTiles = [...sets.flatMap((s) => s.tiles), pair, pair];
  const suitsIn = new Set(allTiles.map((t) => suitOf(t)).filter((s) => s !== 'wind' && s !== 'dragon'));
  const honourCount = allTiles.filter((t) => !isSuited(t)).length;
  const terminalCount = allTiles.filter((t) => info(t).terminal).length;
  const pungsKongs = sets.filter((s) => s.kind === 'pung' || s.kind === 'kong');
  const chows = sets.filter((s) => s.kind === 'chow');
  const allConcealed = sets.every((s) => s.concealed);

  lines.push({ name: 'Winning Hand', fan: 1 });

  // ---- shape patterns (take the best single shape pattern) ----
  const shapePatterns: FanLine[] = [];
  if (pungsKongs.length === 4) shapePatterns.push({ name: 'All Pungs', fan: 3 });
  if (suitsIn.size === 1 && honourCount === 0) shapePatterns.push({ name: 'Pure Suit', fan: 7 });
  if (suitsIn.size === 1 && honourCount > 0) shapePatterns.push({ name: 'Mixed One Suit', fan: 3 });
  if (honourCount === allTiles.length) shapePatterns.push({ name: 'All Honours', fan: 10 });
  if (terminalCount + honourCount === allTiles.length) {
    shapePatterns.push({ name: honourCount === 0 ? 'Pure Terminals' : 'All Terminals & Honours', fan: 6 });
  }
  if (sets.every((s) => s.kind === 'kong')) shapePatterns.push({ name: 'All Kongs', fan: 8 });
  shapePatterns.sort((a, b) => b.fan - a.fan);
  if (shapePatterns[0]) lines.push(shapePatterns[0]);

  // ---- dragons ----
  const dragonSets = sets.filter((s) => suitOf(s.tiles[0]) === 'dragon');
  const dragonPair = suitOf(pair) === 'dragon';
  let dragonFan = 0;
  if (dragonSets.length === 3) dragonFan = 8; // Big Three Dragons
  else if (dragonSets.length === 2 && dragonPair) dragonFan = 6; // Little Three Dragons
  if (dragonFan) lines.push({ name: dragonFan === 8 ? 'Big Three Dragons' : 'Little Three Dragons', fan: dragonFan });
  else dragonSets.forEach(() => lines.push({ name: 'Dragon Pung/Kong', fan: 2 }));
  void dragonFan;

  // ---- winds ----
  const roundWindId = `w${WIND_LETTER[roundWind]}`;
  const seatWindId = `w${WIND_LETTER[seatWind]}`;
  sets.forEach((s) => {
    if (s.tiles[0] === roundWindId) lines.push({ name: 'Round Wind Set', fan: 2 });
    if (s.tiles[0] === seatWindId && seatWindId !== roundWindId) lines.push({ name: 'Seat Wind Set', fan: 2 });
  });

  // ---- concealment / self draw ----
  if (allConcealed && selfDraw) lines.push({ name: 'Fully Concealed Hand', fan: 1 });
  if (selfDraw) lines.push({ name: 'Self-Draw (Zimo)', fan: 1 });

  const fan = Math.min(13, lines.reduce((a, l) => a + l.fan, 0));
  const points = fan * 10;
  const shapeName = shapePatterns[0]?.name ?? (chows.length ? 'Common Hand' : 'Winning Hand');
  return { fan, lines, points, handName: shapeName };
}

/** Which suit a run of indexes belongs to (sanity helper). */
export function suitOfIndex(i: number): TileSuit {
  return i < 9 ? 'dot' : i < 18 ? 'bam' : i < 27 ? 'crack' : i < 31 ? 'wind' : 'dragon';
}

export { ID_BY_INDEX };
