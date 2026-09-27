/* =============================================================================
   handEval.ts — 5/7-card hand evaluator + readable hand names.
   Cards use rank 2..14 (A = 14) and suit chars, straight from core/deck.
   ========================================================================== */

import type { Card } from '../core/deck';

export interface HandRank {
  cat: number; // 8 straight-flush .. 0 high card
  tie: number[]; // tiebreakers, compared lexicographically
  best: Card[]; // the 5 cards forming the hand
  name: string; // "Two Pair, Kings and Fours"
}

const RANK_NAME: Record<number, string> = {
  2: 'Two',
  3: 'Three',
  4: 'Four',
  5: 'Five',
  6: 'Six',
  7: 'Seven',
  8: 'Eight',
  9: 'Nine',
  10: 'Ten',
  11: 'Jack',
  12: 'Queen',
  13: 'King',
  14: 'Ace',
};
const RANK_PLURAL: Record<number, string> = {
  2: 'Twos',
  3: 'Threes',
  4: 'Fours',
  5: 'Fives',
  6: 'Sixes',
  7: 'Sevens',
  8: 'Eights',
  9: 'Nines',
  10: 'Tens',
  11: 'Jacks',
  12: 'Queens',
  13: 'Kings',
  14: 'Aces',
};
export const rankName = (r: number) => RANK_NAME[r] ?? '?';
export const rankPlural = (r: number) => RANK_PLURAL[r] ?? '?';

/** Evaluate exactly 5 cards. */
export function evaluate5(cards: Card[]): HandRank {
  const rs = cards.map((c) => (c.r === 'A' ? 14 : c.r === 'K' ? 13 : c.r === 'Q' ? 12 : c.r === 'J' ? 11 : parseInt(c.r, 10))).sort((a, b) => b - a);
  const suits = cards.map((c) => c.s);
  const isFlush = suits.every((s) => s === suits[0]);

  // straight (wheel A-5 allowed)
  let straightHigh = 0;
  const uniq = [...new Set(rs)];
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[4] === 2) straightHigh = 5; // A2345
  }

  // rank groups
  const count: Record<number, number> = {};
  for (const r of rs) count[r] = (count[r] ?? 0) + 1;
  const groups = Object.entries(count)
    .map(([r, n]) => ({ r: +r, n }))
    .sort((a, b) => b.n - a.n || b.r - a.r);

  const kick = (n: number) => groups.filter((g) => g.n === n).map((g) => g.r);

  let cat: number;
  let tie: number[];
  let name: string;
  if (isFlush && straightHigh) {
    cat = 8;
    tie = [straightHigh];
    name = straightHigh === 14 ? 'Royal Flush' : `Straight Flush, ${rankName(straightHigh)} high`;
  } else if (groups[0].n === 4) {
    cat = 7;
    tie = [groups[0].r, groups[1].r];
    name = `Four of a Kind, ${rankPlural(groups[0].r)}`;
  } else if (groups[0].n === 3 && groups[1]?.n === 2) {
    cat = 6;
    tie = [groups[0].r, groups[1].r];
    name = `Full House, ${rankPlural(groups[0].r)} over ${rankPlural(groups[1].r)}`;
  } else if (isFlush) {
    cat = 5;
    tie = rs;
    name = `Flush, ${rankName(rs[0])} high`;
  } else if (straightHigh) {
    cat = 4;
    tie = [straightHigh];
    name = `Straight, ${rankName(straightHigh)} high`;
  } else if (groups[0].n === 3) {
    cat = 3;
    tie = [groups[0].r, ...kick(1)];
    name = `Three of a Kind, ${rankPlural(groups[0].r)}`;
  } else if (groups[0].n === 2 && groups[1]?.n === 2) {
    cat = 2;
    tie = [groups[0].r, groups[1].r, groups[2].r];
    name = `Two Pair, ${rankPlural(groups[0].r)} and ${rankPlural(groups[1].r)}`;
  } else if (groups[0].n === 2) {
    cat = 1;
    tie = [groups[0].r, ...kick(1)];
    name = `Pair of ${rankPlural(groups[0].r)}`;
  } else {
    cat = 0;
    tie = rs;
    name = `${rankName(rs[0])} high`;
  }
  return { cat, tie, best: [...cards], name };
}

function better(a: HandRank, b: HandRank): HandRank {
  if (a.cat !== b.cat) return a.cat > b.cat ? a : b;
  for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++) {
    const x = a.tie[i] ?? 0;
    const y = b.tie[i] ?? 0;
    if (x !== y) return x > y ? a : b;
  }
  return a;
}

/** Best 5-card hand from 5-7 cards. */
export function evaluate(cards: Card[]): HandRank {
  if (cards.length <= 5) return evaluate5(cards);
  let best: HandRank | null = null;
  const n = cards.length;
  // all C(n,5) combinations
  const idx = [0, 1, 2, 3, 4];
  const combos: number[][] = [];
  const rec = (start: number, depth: number) => {
    if (depth === 5) {
      combos.push([...idx]);
      return;
    }
    for (let i = start; i < n; i++) {
      idx[depth] = i;
      rec(i + 1, depth + 1);
    }
  };
  rec(0, 0);
  for (const c of combos) {
    const h = evaluate5(c.map((i) => cards[i]));
    best = best ? better(best, h) : h;
  }
  return best!;
}

/** Compare two evaluated hands: 1 a wins, -1 b wins, 0 tie. */
export function compare(a: HandRank, b: HandRank): number {
  if (a.cat !== b.cat) return a.cat > b.cat ? 1 : -1;
  for (let i = 0; i < Math.max(a.tie.length, b.tie.length); i++) {
    const x = a.tie[i] ?? 0;
    const y = b.tie[i] ?? 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/* ------------------------- preflop descriptions --------------------------- */

/** Short label for a 2-card holding ("A♠K♦ suited" style). */
export function holeLabel(cards: Card[]): string {
  if (cards.length !== 2) return '';
  const v = (c: Card) => (c.r === 'A' ? 14 : c.r === 'K' ? 13 : c.r === 'Q' ? 12 : c.r === 'J' ? 11 : parseInt(c.r, 10));
  const [a, b] = cards[0] && v(cards[0]) >= v(cards[1]) ? cards : [cards[1], cards[0]];
  if (a.r === b.r) return `Pocket ${rankPlural(v(a))}`;
  const suited = a.s === b.s ? ' suited' : '';
  return `${a.r}${b.r}${suited}`;
}

/** Chen-style preflop strength, 0..1 (used by bots + your hand-strength hint). */
export function preflopStrength(cards: Card[]): number {
  const v = (c: Card) => (c.r === 'A' ? 14 : c.r === 'K' ? 13 : c.r === 'Q' ? 12 : c.r === 'J' ? 11 : parseInt(c.r, 10));
  const [hi, lo] = [v(cards[0]), v(cards[1])].sort((x, y) => y - x);
  const suited = cards[0].s === cards[1].s;
  const gap = hi - lo;
  let pts = hi === 14 ? 10 : hi === 13 ? 8 : hi === 12 ? 7 : hi === 11 ? 6 : hi / 2;
  if (hi === lo) {
    pts = Math.max(5, pts * 2);
    if (pts < 12) pts += 1;
  }
  if (suited) pts += 2;
  if (gap === 1) pts += 1;
  else if (gap === 2) pts -= 1;
  else if (gap === 3) pts -= 2;
  else if (gap === 4) pts -= 4;
  else if (gap > 4) pts -= 5;
  if (gap <= 1 && hi < 12 && !suited) pts -= 1;
  return Math.max(0, Math.min(1, pts / 20));
}

/** Rough 0..1 strength postflop: made-hand category + draw bonus. */
export function quickStrength(hole: Card[], board: Card[]): number {
  if (!board.length) return preflopStrength(hole);
  const ev = evaluate([...hole, ...board]);
  let s = ev.cat / 5; // pair=0.2 ... straight-flush=1.6
  if (ev.cat === 1) s = 0.34 + ev.tie[0] / 42; // pair rank matters
  if (ev.cat === 0) s = 0.08 + Math.min(0.16, (ev.tie[0] - 7) / 40);
  // nut-ish bonus
  if (ev.cat >= 3) s = 0.72 + ev.cat * 0.05;
  // draw bonus: 4-flush or open-ended on turn/river pending
  if (board.length < 5) {
    const suits = [...hole, ...board].map((c) => c.s);
    const counts: Record<string, number> = {};
    for (const s of suits) counts[s] = (counts[s] ?? 0) + 1;
    if (Object.values(counts).some((n) => n === 4)) s += 0.18;
    const rs = [...new Set([...hole, ...board].map((c) => (c.r === 'A' ? 14 : c.r === 'K' ? 13 : c.r === 'Q' ? 12 : c.r === 'J' ? 11 : parseInt(c.r, 10))).sort((a, b) => a - b))];
    for (let i = 0; i + 1 < rs.length; i++) {
      if (rs[i + 1] - rs[i] === 1 && i + 2 < rs.length && rs[i + 2] - rs[i + 1] === 1) {
        s += 0.12; // open-ended-ish
        break;
      }
    }
  }
  return Math.max(0.02, Math.min(0.98, s));
}
