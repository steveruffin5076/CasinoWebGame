/* =============================================================================
   mahjongBot.ts — Mahjong bot AI.

   Discard selection: compute shanten after each candidate discard, then
   break ties with tile usefulness (how many live copies remain, keeping
   dragon/terminal pairs, avoiding lone honours).
   Calls: Pung/Kong when they reduce shanten; Chow only on Normal+ and rarely
   (spec); Hu (win) always taken when legal.
   Difficulty:
     easy   — random-ish discards from the worst half, calls pungs loosely
     normal — solid shanten play, chows occasionally
     hard   — fast hand building + safety awareness (tracks visible tiles)
   ========================================================================== */

import { shanten, countsOf, tileIndex } from '../mahjong/scoring';
import { info, isSuited, type TileId } from '../mahjong/tiles';
import type { Difficulty } from '../core/storage';
import { chance } from '../core/utils';

export interface BotContext {
  hand: TileId[];
  melds: number;
  visible: TileId[]; // all discards + exposed melds + our hand
}

/** Value of keeping a tile (higher = more useful). */
function keepValue(tile: TileId, ctx: BotContext): number {
  const t = info(tile);
  const idx = tileIndex(tile);
  const visibleCount = ctx.visible.filter((v) => v === tile).length;
  const live = 4 - visibleCount; // copies still unseen
  let v = live * 2;
  if (!isSuited(tile)) v += 3; // honours are pung-friendly
  if (t.suit === 'dragon') v += 5;
  if (t.terminal) v += 1.5;
  // pair in hand?
  const inHand = ctx.hand.filter((h) => h === tile).length;
  if (inHand >= 2) v += 6;
  if (inHand === 1 && live >= 2) v += 2;
  // connectivity for suited tiles
  if (isSuited(tile)) {
    const r = t.rank;
    for (const d of [-2, -1, 1, 2]) {
      const nr = r + d;
      if (nr >= 1 && nr <= 9) {
        const nid = `${tile[0]}${nr}`;
        if (ctx.hand.includes(nid)) v += d % 2 === 0 ? 1 : 2;
      }
    }
  }
  return v;
}

/** Choose a discard for a bot. */
export function mahjongBotDiscard(ctx: BotContext, difficulty: Difficulty): TileId {
  const hand = ctx.hand;
  if (!hand.length) throw new Error('empty hand');
  if (difficulty === 'easy' && chance(0.35)) {
    return hand[Math.floor(Math.random() * hand.length)];
  }
  const scored = hand.map((tile) => {
    // remove ONE instance of the tile
    const idx = hand.indexOf(tile);
    const copy = [...hand];
    copy.splice(idx, 1);
    const sh = shanten(copy, ctx.melds);
    const kv = keepValue(tile, ctx);
    // lower shanten first, then lower keep-value = discard first
    return { tile, sh, kv };
  });
  const minSh = Math.min(...scored.map((s) => s.sh));
  const candidates = scored.filter((s) => s.sh === minSh);
  candidates.sort((a, b) => a.kv - b.kv);
  if (difficulty === 'hard' && candidates.length > 1 && chance(0.25)) {
    // sometimes pick 2nd-best for unpredictability
    return candidates[1].tile;
  }
  return candidates[0].tile;
}

/** Should the bot call Pung on `tile`? */
export function mahjongBotPung(ctx: BotContext, tile: TileId, difficulty: Difficulty): boolean {
  const inHand = ctx.hand.filter((t) => t === tile).length;
  if (inHand < 2) return false;
  const after = [...ctx.hand];
  // remove the two tiles
  let removed = 0;
  for (let i = after.length - 1; i >= 0 && removed < 2; i--) {
    if (after[i] === tile) {
      after.splice(i, 1);
      removed++;
    }
  }
  const before = shanten(ctx.hand, ctx.melds);
  const afterSh = shanten(after, ctx.melds + 1);
  if (difficulty === 'easy') return afterSh <= before || chance(0.25);
  return afterSh < before || (afterSh === before && info(tile).suit === 'dragon' && chance(0.6));
}

/** Should the bot call Kong on `tile`? */
export function mahjongBotKong(ctx: BotContext, tile: TileId, _difficulty: Difficulty): boolean {
  const inHand = ctx.hand.filter((t) => t === tile).length;
  if (inHand < 3) return false;
  const after = [...ctx.hand];
  let removed = 0;
  for (let i = after.length - 1; i >= 0 && removed < 3; i--) {
    if (after[i] === tile) {
      after.splice(i, 1);
      removed++;
    }
  }
  // kong keeps the same set count but loses a tile toward the pair; accept if
  // shanten doesn't get worse (kongs pay extra at showdown in many rulesets)
  return shanten(after, ctx.melds + 1) <= shanten(ctx.hand, ctx.melds);
}

/** Should the bot Chow `tile` (only legal from the upper player anyway)? */
export function mahjongBotChow(ctx: BotContext, tile: TileId, difficulty: Difficulty): boolean {
  if (difficulty === 'easy') return false;
  const t = info(tile);
  if (!isSuited(tile)) return false;
  const prefix = tile[0];
  const r = t.rank;
  const options: TileId[][] = [];
  for (let lo = r - 2; lo <= r; lo++) {
    if (lo < 1 || lo + 2 > 9) continue;
    const need: TileId[] = [];
    for (let x = lo; x <= lo + 2; x++) if (x !== r) need.push(`${prefix}${x}`);
    if (need.every((n) => ctx.hand.includes(n))) options.push(need);
  }
  if (!options.length) return false;
  const best = options[0];
  const after = [...ctx.hand];
  for (const n of best) after.splice(after.indexOf(n), 1);
  const improves = shanten(after, ctx.melds + 1) < shanten(ctx.hand, ctx.melds);
  const rate = difficulty === 'hard' ? 0.85 : 0.5;
  return improves && chance(rate);
}

/** Pick which chow combination to use (returns the two tiles to expose). */
export function mahjongBotChowTiles(ctx: BotContext, tile: TileId): TileId[] {
  const t = info(tile);
  const prefix = tile[0];
  const r = t.rank;
  for (let lo = r - 2; lo <= r; lo++) {
    if (lo < 1 || lo + 2 > 9) continue;
    const need: TileId[] = [];
    for (let x = lo; x <= lo + 2; x++) if (x !== r) need.push(`${prefix}${x}`);
    if (need.every((n) => ctx.hand.includes(n))) return need;
  }
  return [];
}

/** Concealed kong in hand? Returns one tile id with 4 copies, or null. */
export function concealedKongTile(hand: TileId[]): TileId | null {
  const c = countsOf(hand);
  for (let i = 0; i < 34; i++) if (c[i] === 4) return hand.find((t) => tileIndex(t) === i) ?? null;
  return null;
}
