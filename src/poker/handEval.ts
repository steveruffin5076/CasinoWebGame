import type { PlayingCard, Rank } from '../core/assets';

export type HandRank =
  | 'high_card'
  | 'pair'
  | 'two_pair'
  | 'three_kind'
  | 'straight'
  | 'flush'
  | 'full_house'
  | 'four_kind'
  | 'straight_flush';

export interface EvalResult {
  rank: HandRank;
  score: number;
  cards: PlayingCard[];
}

const RANK_ORDER: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

function rv(r: Rank): number {
  return RANK_ORDER.indexOf(r);
}

function combos<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combos(rest, k - 1).map((c) => [first, ...c]);
  const without = combos(rest, k);
  return [...withFirst, ...without];
}

export function evaluateHand(cards: PlayingCard[]): EvalResult {
  if (cards.length < 5) {
    return { rank: 'high_card', score: rv(cards[0]?.rank ?? '2'), cards: cards.slice(0, 5) };
  }
  let best: EvalResult = { rank: 'high_card', score: 0, cards: [] };
  for (const five of combos(cards, 5)) {
    const e = evalFive(five);
    if (e.score > best.score) best = e;
  }
  return best;
}

function evalFive(cards: PlayingCard[]): EvalResult {
  const ranks = cards.map((c) => rv(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const straight = isStraight(ranks);
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  let rank: HandRank = 'high_card';
  let base = ranks[0];

  if (flush && straight) rank = 'straight_flush';
  else if (groups[0][1] === 4) rank = 'four_kind';
  else if (groups[0][1] === 3 && groups[1]?.[1] === 2) rank = 'full_house';
  else if (flush) rank = 'flush';
  else if (straight) rank = 'straight';
  else if (groups[0][1] === 3) rank = 'three_kind';
  else if (groups[0][1] === 2 && groups[1]?.[1] === 2) rank = 'two_pair';
  else if (groups[0][1] === 2) rank = 'pair';

  const rankScore: Record<HandRank, number> = {
    high_card: 1,
    pair: 2,
    two_pair: 3,
    three_kind: 4,
    straight: 5,
    flush: 6,
    full_house: 7,
    four_kind: 8,
    straight_flush: 9,
  };

  const score = rankScore[rank] * 1e6 + base * 1000 + groups.map((g) => g[0] * g[1]).reduce((a, b) => a + b, 0);
  return { rank, score, cards };
}

function isStraight(sortedDesc: number[]): boolean {
  const uniq = [...new Set(sortedDesc)].sort((a, b) => b - a);
  if (uniq.length < 5) return false;
  for (let i = 0; i <= uniq.length - 5; i++) {
    if (uniq[i] - uniq[i + 4] === 4) return true;
  }
  if (uniq.includes(12) && uniq.includes(3) && uniq.includes(2) && uniq.includes(1) && uniq.includes(0)) return true;
  return false;
}

export function handStrengthScore(hole: PlayingCard[], community: PlayingCard[]): number {
  const all = [...hole, ...community];
  if (all.length < 2) return 0.3;
  if (community.length === 0) {
    const p = hole[0].rank === hole[1].rank;
    const hi = Math.max(rv(hole[0].rank), rv(hole[1].rank));
    return p ? 0.75 : hi / 13;
  }
  const ev = evaluateHand(all);
  const rankScore: Record<HandRank, number> = {
    high_card: 0.1,
    pair: 0.35,
    two_pair: 0.5,
    three_kind: 0.65,
    straight: 0.72,
    flush: 0.78,
    full_house: 0.88,
    four_kind: 0.95,
    straight_flush: 1,
  };
  return rankScore[ev.rank];
}

export function compareHands(a: PlayingCard[], b: PlayingCard[]): number {
  return evaluateHand(a).score - evaluateHand(b).score;
}

export function findShowdownWinners(
  contenders: { playerIndex: number; cards: PlayingCard[] }[],
): number[] {
  if (!contenders.length) return [];
  let best = evaluateHand(contenders[0].cards).score;
  for (const c of contenders) {
    best = Math.max(best, evaluateHand(c.cards).score);
  }
  return contenders.filter((c) => evaluateHand(c.cards).score === best).map((c) => c.playerIndex);
}
