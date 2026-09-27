/* =============================================================================
   blackjackBot.ts — bot strategy for Blackjack.

   Base strategy follows the classic basic-strategy chart (S17, 6 decks):
     • Hard totals: hit to 17 vs weak upcards, stand on 12+ vs 4-6, etc.
     • Soft totals: hit soft 17 and below, stand on soft 18+ (vs non-9/10/A).
     • Pairs: split 8s and aces, never split 10s or 5s, double 11 vs anything.
   Difficulty:
     easy   — 20% of decisions are replaced with a random legal move
     normal — basic strategy, slightly softened (5% noise)
     hard   — perfect basic strategy + correct doubling insurance take
   ========================================================================== */

import type { Card } from '../core/deck';
import { handValue } from '../core/deck';
import type { Difficulty } from '../core/storage';
import { chance } from '../core/utils';

export type BotAction = 'hit' | 'stand' | 'double' | 'split';

const upVal = (c: Card) => (c.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : parseInt(c.r, 10));

/** Basic strategy decision for one hand vs the dealer upcard. */
export function basicStrategy(cards: Card[], up: Card, canDouble: boolean, canSplit: boolean): BotAction {
  const { total, soft } = handValue(cards);
  const u = upVal(up);

  // --- pairs ---------------------------------------------------------------
  if (canSplit && cards.length === 2 && pairValue(cards) !== null) {
    const pv = pairValue(cards)!;
    if (pv === 11 || pv === 8) return 'split'; // aces & eights, always
    if (pv === 10) return 'stand'; // never split tens
    if (pv === 9) return u === 7 || u >= 10 ? 'stand' : 'split';
    if (pv === 7) return u <= 7 ? 'split' : 'hit';
    if (pv === 6) return u <= 6 ? 'split' : 'hit';
    if (pv === 4) return u === 5 || u === 6 ? 'split' : 'hit';
    if (pv === 3 || pv === 2) return u <= 7 ? 'split' : 'hit';
    if (pv === 5) return u <= 9 && canDouble ? 'double' : 'hit'; // never split 5s
  }

  // --- soft totals -----------------------------------------------------------
  if (soft) {
    if (total >= 19) return 'stand';
    if (total === 18) {
      if (u >= 9) return 'hit';
      if (u >= 3 && u <= 6 && canDouble) return 'double';
      return 'stand';
    }
    if (total === 17) return u >= 3 && u <= 6 && canDouble ? 'double' : 'hit';
    if (total >= 15) return u >= 4 && u <= 6 && canDouble ? 'double' : 'hit';
    if (total >= 13) return u >= 5 && u <= 6 && canDouble ? 'double' : 'hit';
    return 'hit';
  }

  // --- hard totals -----------------------------------------------------------
  if (total >= 17) return 'stand';
  if (total >= 13) return u <= 6 ? 'stand' : 'hit';
  if (total === 12) return u >= 4 && u <= 6 ? 'stand' : 'hit';
  if (total === 11) return canDouble ? 'double' : 'hit';
  if (total === 10) return u <= 9 && canDouble ? 'double' : 'hit';
  if (total === 9) return u >= 3 && u <= 6 && canDouble ? 'double' : 'hit';
  return 'hit';
}

function pairValue(cards: Card[]): number | null {
  const [a, b] = cards;
  if (a.r !== b.r) return null;
  return a.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(a.r) ? 10 : parseInt(a.r, 10);
}

/** Bot decision with difficulty noise. */
export function botDecide(
  cards: Card[],
  up: Card,
  canDouble: boolean,
  canSplit: boolean,
  difficulty: Difficulty,
): BotAction {
  let act = basicStrategy(cards, up, canDouble, canSplit);
  if (act === 'double' && !canDouble) act = 'hit';
  if (act === 'split' && !canSplit) act = pairValue(cards) === 11 ? 'hit' : 'stand';
  const noise = difficulty === 'easy' ? 0.2 : difficulty === 'normal' ? 0.05 : 0;
  if (noise > 0 && chance(noise)) {
    const opts: BotAction[] = ['hit', 'stand'];
    if (canDouble) opts.push('double');
    if (canSplit) opts.push('split');
    act = opts[Math.floor(Math.random() * opts.length)];
  }
  return act;
}

/** Insurance is a bad bet long-run, but Hard bots take it with 10-heavy shoes. */
export function botTakesInsurance(difficulty: Difficulty): boolean {
  return difficulty === 'easy' ? chance(0.35) : difficulty === 'hard' ? chance(0.15) : chance(0.25);
}
