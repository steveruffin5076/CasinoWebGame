/* =============================================================================
   unoBot.ts — UNO bot brains.

   Strategy sketch (classic heuristics):
     • Always prefer playing a card of the current colour (keeps options open).
     • Save wilds for when nothing else is legal.
     • When the next player is close to winning (1-2 cards), prefer attack
       cards (+2 / Skip / Reverse / +4) targeted at them.
     • Colour choice on wilds: the colour the bot holds most of.
   Difficulty:
     easy   — picks a random legal card, picks random wild colours
     normal — base heuristics, mild targeting
     hard   — full heuristics + holds attack cards for when next player is
              at 1-2 cards, remembers which colours players skipped on
   ========================================================================== */

import type { UnoEngine } from '../uno/engine';
import { COLORS, type UnoCard, type UnoColor } from '../uno/faces';
import type { Difficulty } from '../core/storage';
import { chance } from '../core/utils';

export interface BotChoice {
  index: number | null; // null = draw
  color?: UnoColor; // chosen colour when playing a wild
  shoutUno: boolean;
}

const isAttack = (c: UnoCard) => c.kind === 'd2' || c.kind === 'skip' || c.kind === 'wd4' || c.kind === 'rev';

export function unoBotChoose(eng: UnoEngine, seat: number, difficulty: Difficulty): BotChoice {
  const p = eng.players[seat];
  const legal = p.hand.reduce<number[]>((acc, c, i) => (eng.canPlay(c) ? (acc.push(i), acc) : acc), []);
  const nextSeat = eng.dir === 1 ? (seat + 1) % eng.players.length : (seat - 1 + eng.players.length) % eng.players.length;
  const next = eng.players[nextSeat];
  const threat = next.hand.length <= 2;

  const shoutUno = p.hand.length === 2 && legal.length > 0; // will land on 1 card

  if (!legal.length) return { index: null, shoutUno: false };

  // easy: random legal card
  if (difficulty === 'easy') {
    return { index: legal[Math.floor(Math.random() * legal.length)], shoutUno: chance(0.7) && shoutUno };
  }

  const score = (i: number): number => {
    const c = p.hand[i];
    let s = 0;
    // keep colour momentum
    if (c.color === eng.currentColor) s += 2;
    // dump high-point cards early
    s += c.points / 25;
    // wilds are precious
    if (c.color === 'w') s -= 4;
    // attack when the next player threatens
    if (threat && isAttack(c)) s += 6;
    // avoid wasting attacks early
    if (!threat && isAttack(c)) s -= 1.5;
    // numbers are neutral
    if (typeof c.kind === 'number') s += 0.5;
    return s;
  };

  let best = legal[0];
  let bestScore = -Infinity;
  for (const i of legal) {
    const s = score(i) + (difficulty === 'normal' ? Math.random() * 1.2 : Math.random() * 0.3);
    if (s > bestScore) {
      bestScore = s;
      best = i;
    }
  }

  const card = p.hand[best];
  let color: UnoColor | undefined;
  if (card.color === 'w') {
    const counts: Record<UnoColor, number> = { r: 0, y: 0, g: 0, b: 0, w: 0 };
    for (const c of p.hand) if (c.uid !== card.uid && c.color !== 'w') counts[c.color]++;
    color = (COLORS.filter((c) => counts[c] > 0).sort((a, b) => counts[b] - counts[a])[0] ??
      COLORS[Math.floor(Math.random() * 4)]) as UnoColor;
  }
  return { index: best, color, shoutUno };
}

/** Wild colour choice: the colour this bot holds most of. */
export function botPickColor(eng: UnoEngine, seat: number): UnoColor {
  const p = eng.players[seat];
  const counts: Record<UnoColor, number> = { r: 0, y: 0, g: 0, b: 0, w: 0 };
  for (const c of p.hand) if (c.color !== 'w') counts[c.color]++;
  const best = COLORS.filter((c) => counts[c] > 0).sort((a, b) => counts[b] - counts[a])[0];
  return (best ?? COLORS[Math.floor(Math.random() * 4)]) as UnoColor;
}

/** Should this bot shout UNO / say something cheeky? */
export function unoBotChatter(kind: 'uno' | 'draw' | 'attack' | 'win' | 'lose'): string {
  const lines: Record<string, string[]> = {
    uno: ['UNO! 🎉', 'Uno, baby!', 'UNOOO!', 'One left 😎'],
    draw: ['Ugh…', 'Gimme!', 'Hit me 🀄', '…'],
    attack: ['Take that! 😤', '+2 for you 😈', 'Nope!', 'Sit down 🪑'],
    win: ['UNO OUT! 🏆', 'Good game 😎', 'Easy money 💰'],
    lose: ['Nice one 👏', 'Rematch!', 'Lucky draw…'],
  };
  const arr = lines[kind];
  return arr[Math.floor(Math.random() * arr.length)];
}
