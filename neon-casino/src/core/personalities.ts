/* =============================================================================
   personalities.ts — the bot roster. One entry per AI opponent; games pull
   from this list so "Vegas Vic" is the same character at every table.
   ========================================================================== */

import type { AvatarId } from '../assets/avatars';

export interface Bot {
  id: string;
  name: string;
  emoji: string;
  avatar: AvatarId;
  /** one-line character note shown in tooltips / modals */
  blurb: string;
  /** per-character quirks used by the bots (0..1) */
  aggression: number;
  chattiness: number;
}

export const BOTS: Bot[] = [
  {
    id: 'vic',
    name: 'Vegas Vic',
    emoji: '😎',
    avatar: 'vic',
    blurb: 'Old-school card counter. Never ruffled, always doubling.',
    aggression: 0.6,
    chattiness: 0.5,
  },
  {
    id: 'lin',
    name: 'Lucky Lin',
    emoji: '🍀',
    avatar: 'lin',
    blurb: 'Runs hot and cold — but the clover stays green.',
    aggression: 0.45,
    chattiness: 0.7,
  },
  {
    id: 'bella',
    name: 'Bluff Bella',
    emoji: '🕶️',
    avatar: 'bella',
    blurb: 'Bets big on nothing. Reads you better than you read her.',
    aggression: 0.85,
    chattiness: 0.85,
  },
  {
    id: 'charlie',
    name: 'Chip Charlie',
    emoji: '🤖',
    avatar: 'charlie',
    blurb: 'Probability engine with a poker face of steel.',
    aggression: 0.7,
    chattiness: 0.35,
  },
  {
    id: 'rae',
    name: 'Ruby Rae',
    emoji: '💎',
    avatar: 'rae',
    blurb: 'High-roller who loves a slow-played monster.',
    aggression: 0.55,
    chattiness: 0.6,
  },
  {
    id: 'nick',
    name: 'Neon Nick',
    emoji: '🎲',
    avatar: 'nick',
    blurb: 'Plays the odds, tips the dealer, wins the pot.',
    aggression: 0.5,
    chattiness: 0.65,
  },
];

export const bot = (id: string): Bot => BOTS.find((b) => b.id === id) ?? BOTS[0];

/** Picks `n` distinct bots, deterministic for a given seed string. */
export function roster(n: number, seed = 'neon'): Bot[] {
  const out: Bot[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const pool = [...BOTS];
  for (let i = 0; i < n; i++) {
    const idx = (h + i * 7) % pool.length;
    out.push(pool.splice(idx, 1)[0] ?? BOTS[i % BOTS.length]);
  }
  return out;
}
