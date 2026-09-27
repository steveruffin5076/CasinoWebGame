/* =============================================================================
   pokerBot.ts — Texas Hold'em bot AI.

   Core: Monte-Carlo equity (80 rollouts vs random opponent hands) + pot odds.
   Personality knobs per difficulty:
     easy   — loose-passive, tiny sample noise, rarely raises
     normal — tight-passive: calls with made hands, raises only strong
     hard   — tight-aggressive: raises thin, c-bets, ~10% bluffs, traps slow
   Each bot also blends its character aggression from personalities.ts.
   ========================================================================== */

import type { PokerEngine, PokerAction } from '../poker/engine';
import { evaluate, compare, quickStrength, preflopStrength } from '../poker/handEval';
import type { Difficulty } from '../core/storage';
import type { Card } from '../core/deck';
import { freshDeck } from '../core/deck';
import { chance } from '../core/utils';

export interface BotDecision {
  action: PokerAction;
  say?: string;
}

/** Monte-Carlo equity vs `opps` random opponents (fast, 60-120 rollouts). */
export function equityVs(hole: Card[], board: Card[], opps: number, rollouts = 80): number {
  if (!hole.length) return 0;
  const known = new Set([...hole, ...board].map((c) => c.id));
  const rest = freshDeck().filter((c) => !known.has(c.id));
  let wins = 0;
  let ties = 0;
  for (let r = 0; r < rollouts; r++) {
    // shuffle (partial Fisher-Yates for the cards we need)
    const need = (5 - board.length) + opps * 2;
    const pool = rest.slice();
    for (let i = 0; i < need; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const runout = pool.slice(0, 5 - board.length);
    const full = [...board, ...runout];
    const mine = evaluate([...hole, ...full]);
    let best = 1;
    for (let o = 0; o < opps; o++) {
      const oh = [pool[5 - board.length + o * 2], pool[5 - board.length + o * 2 + 1]];
      const theirs = evaluate([...oh, ...full]);
      const c = compare(mine, theirs);
      if (c < 0) {
        best = -1;
        break;
      }
      if (c === 0) best = 0;
    }
    if (best > 0) wins++;
    else if (best === 0) ties++;
  }
  return (wins + ties * 0.5) / rollouts;
}

export function pokerBotDecide(
  eng: PokerEngine,
  seat: number,
  difficulty: Difficulty,
  aggression: number,
): BotDecision {
  const p = eng.players[seat];
  const legal = new Set(eng.legalActions(seat));
  const toCall = eng.amountToCall(seat);
  const pot = eng.potOnTable;
  const opps = Math.max(1, eng.activeNotFolded().length - 1);
  const bb = eng.bigBlind;

  // raw strength
  const eq = eng.street === 'preflop'
    ? preflopStrength(p.hole) * 0.9
    : equityVs(p.hole, eng.board, Math.min(opps, 3), difficulty === 'hard' ? 120 : 60);
  const strength = Math.max(0, Math.min(1, eq));

  // difficulty shaping
  const noise = difficulty === 'easy' ? 0.18 : difficulty === 'normal' ? 0.08 : 0.03;
  const s = Math.max(0, Math.min(1, strength + (Math.random() - 0.5) * noise));
  const aggr = Math.max(0, Math.min(1, aggression * (difficulty === 'hard' ? 1.25 : difficulty === 'normal' ? 0.8 : 0.55)));

  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

  // ---- preflop ----
  if (eng.street === 'preflop') {
    const openRaise = toCall <= bb; // facing no raise
    if (openRaise) {
      if (s > 0.62 - aggr * 0.12 && legal.has('raise')) {
        const to = Math.round(bb * 2 + Math.random() * bb);
        return { action: { kind: 'raise', to: Math.min(to, eng.maxRaiseTo(seat)) }, say: chance(0.25) ? 'Raise it up 💪' : undefined };
      }
      if (s > 0.34 && legal.has('call')) return { action: { kind: 'call' } };
      if (legal.has('check')) return { action: { kind: 'check' } };
      if (s > 0.28 && toCall <= bb * 2 && legal.has('call')) return { action: { kind: 'call' } };
      return { action: { kind: 'fold' } };
    }
    // facing a raise
    const price = potOdds;
    if (s > 0.78 && legal.has('raise') && chance(aggr)) {
      const to = Math.round(eng.currentBet * 2.5);
      return { action: { kind: 'raise', to: Math.min(Math.max(to, eng.minRaiseTo(seat)), eng.maxRaiseTo(seat)) }, say: chance(0.3) ? 'All this action? 😏' : undefined };
    }
    if (s > 0.55 || (s > 0.42 && price < 0.4) || (s > 0.32 && price < 0.18)) {
      if (legal.has('call')) return { action: { kind: 'call' } };
      if (legal.has('check')) return { action: { kind: 'check' } };
    }
    // easy bots call too much
    if (difficulty === 'easy' && price < 0.35 && chance(0.4) && legal.has('call'))
      return { action: { kind: 'call' }, say: chance(0.3) ? 'Feeling lucky 🍀' : undefined };
    return { action: { kind: legal.has('check') ? 'check' : 'fold' } };
  }

  // ---- postflop ----
  const quick = quickStrength(p.hole, eng.board);
  const canBluff = difficulty === 'hard' && chance(0.1 * aggr + 0.04);
  const effective = Math.max(s, canBluff ? 0.55 : 0);

  if (toCall === 0) {
    // option to bet
    if ((effective > 0.62 - aggr * 0.1 || (quick > 0.5 && chance(aggr))) && legal.has('raise')) {
      const size = Math.round(pot * (0.4 + Math.random() * 0.4 + aggr * 0.2));
      const to = Math.max(
        eng.minRaiseTo(seat),
        Math.min(eng.currentBet + Math.max(bb, size), eng.maxRaiseTo(seat)),
      );
      return { action: { kind: 'raise', to }, say: canBluff ? 'Bluff… maybe 😎' : undefined };
    }
    return { action: { kind: 'check' } };
  }

  // facing a bet
  const callEV = effective - potOdds;
  if (effective > 0.82 && legal.has('raise') && chance(0.45 + aggr * 0.3)) {
    const to = Math.round(eng.currentBet * 2.4 + pot * 0.2);
    return { action: { kind: 'raise', to: Math.max(eng.minRaiseTo(seat), Math.min(to, eng.maxRaiseTo(seat))) }, say: chance(0.4) ? 'All in! 😤' : undefined };
  }
  if (callEV > 0.02 || (effective > 0.5 && potOdds < 0.45)) {
    if (legal.has('call')) return { action: { kind: 'call' } };
  }
  if (effective > 0.45 && potOdds < 0.12 && legal.has('call')) return { action: { kind: 'call' } };
  if (difficulty === 'easy' && chance(0.25) && legal.has('call')) return { action: { kind: 'call' } };
  return { action: { kind: legal.has('fold') ? 'fold' : 'check' } };
}

/** short preflop hand-strength hint for the human HUD */
export function handHint(hole: Card[], board: Card[]): string {
  if (!board.length) return '';
  const ev = evaluate([...hole, ...board]);
  return ev.name;
}
