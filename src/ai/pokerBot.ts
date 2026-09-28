import type { PlayingCard } from '../core/assets';
import type { BotDifficulty } from '../core/storage';
import { pick } from '../core/utils';
import { evaluateHand, handStrengthScore, type HandRank } from '../poker/handEval';

export type PokerAction = 'fold' | 'check' | 'call' | 'raise' | 'allin';

export interface BotContext {
  hole: PlayingCard[];
  community: PlayingCard[];
  pot: number;
  toCall: number;
  stack: number;
  minRaise: number;
  difficulty: BotDifficulty;
}

export function botPokerAction(ctx: BotContext): { action: PokerAction; raiseTo?: number } {
  const score = handStrengthScore(ctx.hole, ctx.community);
  const potOdds = ctx.toCall / (ctx.pot + ctx.toCall + 1);

  if (ctx.difficulty === 'easy') {
    if (Math.random() < 0.25) {
      const r = pick(['fold', 'call', 'raise', 'check'] as PokerAction[]);
      if (r === 'raise') return { action: 'raise', raiseTo: Math.min(ctx.stack, ctx.minRaise * 2) };
      if (r === 'call' && ctx.toCall > 0) return { action: 'call' };
      if (ctx.toCall === 0) return { action: 'check' };
      return { action: Math.random() < 0.4 ? 'fold' : 'call' };
    }
  }

  const bluff = ctx.difficulty === 'hard' && Math.random() < 0.1;

  if (score < 0.25 && !bluff) {
    if (ctx.toCall === 0) return { action: 'check' };
    if (ctx.toCall > ctx.stack * 0.3) return { action: 'fold' };
    return { action: ctx.difficulty === 'hard' && bluff ? 'raise' : 'fold' };
  }

  if (score > 0.7) {
    const raiseTo = Math.min(ctx.stack, ctx.pot + ctx.minRaise);
    return ctx.toCall === 0 ? { action: 'raise', raiseTo } : { action: 'raise', raiseTo };
  }

  if (score > potOdds || ctx.toCall < ctx.stack * 0.1) {
    if (ctx.toCall === 0) return { action: 'check' };
    return { action: 'call' };
  }

  if (ctx.toCall === 0) return { action: 'check' };
  return { action: 'fold' };
}

export function describePlayerHand(hole: PlayingCard[], community: PlayingCard[]): string {
  if (community.length === 0) {
    const suited = hole[0].suit === hole[1].suit;
    const hi = Math.max(rankVal(hole[0].rank), rankVal(hole[1].rank));
    if (hole[0].rank === hole[1].rank) return `Pocket ${hole[0].rank}s`;
    if (suited) return 'Suited connector';
    return hi >= 11 ? 'High card' : 'Weak hand';
  }
  const ev = evaluateHand([...hole, ...community]);
  return rankLabel(ev.rank);
}

function rankVal(r: string): number {
  const m: Record<string, number> = { A: 14, K: 13, Q: 12, J: 11 };
  return m[r] ?? parseInt(r, 10);
}

function rankLabel(r: HandRank): string {
  const labels: Record<HandRank, string> = {
    high_card: 'High Card',
    pair: 'Pair',
    two_pair: 'Two Pair',
    three_kind: 'Three of a Kind',
    straight: 'Straight',
    flush: 'Flush',
    full_house: 'Full House',
    four_kind: 'Four of a Kind',
    straight_flush: 'Straight Flush',
  };
  return labels[r];
}
