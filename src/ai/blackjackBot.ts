import type { PlayingCard } from '../core/assets';
import { cardValue } from '../core/assets';
import type { BotDifficulty } from '../core/storage';

export function handTotal(cards: PlayingCard[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') aces++;
    total += cardValue(c.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 && total <= 21 };
}

export type BJAction = 'hit' | 'stand' | 'double' | 'split';

export function basicStrategy(
  player: PlayingCard[],
  dealerUp: PlayingCard,
  canDouble: boolean,
  canSplit: boolean,
): BJAction {
  const { total, soft } = handTotal(player);
  const d = dealerUp.rank === 'A' ? 11 : cardValue(dealerUp.rank);

  if (canSplit && player.length === 2 && player[0].rank === player[1].rank) {
    const r = player[0].rank;
    if (['A', '8'].includes(r)) return 'split';
    if (r === '9' && ![7, 10, 11].includes(d)) return 'split';
    if (r === '7' && d <= 7) return 'split';
    if (r === '6' && d <= 6) return 'split';
    if (r === '4' && d === 5 || d === 6) return 'split';
    if (r === '3' || r === '2') {
      if (d <= 7) return 'split';
    }
  }

  if (soft) {
    if (total >= 19) return 'stand';
    if (total === 18) return d >= 9 ? 'stand' : canDouble && d <= 6 ? 'double' : 'stand';
    if (total === 17) return canDouble && d >= 3 && d <= 6 ? 'double' : 'hit';
    if (total <= 16) return canDouble && d >= 4 && d <= 6 ? 'double' : 'hit';
  }

  if (total >= 17) return 'stand';
  if (total <= 8) return 'hit';
  if (total === 9) return canDouble && d >= 3 && d <= 6 ? 'double' : 'hit';
  if (total === 10) return canDouble && d <= 9 ? 'double' : 'hit';
  if (total === 11) return canDouble ? 'double' : 'hit';
  if (total === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
  if (total >= 13 && total <= 16) return d <= 6 ? 'stand' : 'hit';
  return 'hit';
}

export function botAction(
  player: PlayingCard[],
  dealerUp: PlayingCard,
  canDouble: boolean,
  canSplit: boolean,
  difficulty: BotDifficulty,
): BJAction {
  let action = basicStrategy(player, dealerUp, canDouble, canSplit);
  if (difficulty === 'easy' && Math.random() < 0.2) {
    const opts: BJAction[] = ['hit', 'stand'];
    if (canDouble) opts.push('double');
    action = opts[Math.floor(Math.random() * opts.length)];
  }
  return action;
}

export function isBlackjack(cards: PlayingCard[]): boolean {
  return cards.length === 2 && handTotal(cards).total === 21;
}
