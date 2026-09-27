/* =============================================================================
   engine.ts — Hong Kong Mahjong round state (headless).

   Simplifications (documented in the README):
     • 136 tiles, NO flowers/seasons
     • dead wall = last 14 tiles (no bonus draws from it beyond kong replacements)
     • a match = 4 hands (East-1 … East-4): the dealer/prevailing wind rotates
       E → S → W → N and the match ends after North's hand
     • exhaustive draw = no payment, dealer still rotates
   Turn order on screen: you (bottom) → right → top → left (counter-clockwise).
   Chow is only legal on a discard from the previous player in turn order
   (the player to your left on screen).
   ========================================================================== */

import { buildWall, sortTiles, type TileId } from './tiles';
import type { Meld } from './scoring';

export interface MJPlayer {
  name: string;
  isHuman: boolean;
  hand: TileId[];
  melds: Meld[];
  discards: TileId[];
  chips: number; // table chips (human mirrors the wallet)
}

export const DEAD_WALL = 14;

export class MahjongGame {
  wall: TileId[] = [];
  players: MJPlayer[] = [];
  turn = 0; // index of player to act
  handNo = 0; // 1-based once the first hand starts
  lastDiscard: { tile: TileId; seat: number } | null = null;
  over = false;
  drawDead = false;

  constructor(names: string[], public humanIndex = 0) {
    this.players = names.map((name, i) => ({
      name,
      isHuman: i === humanIndex,
      hand: [],
      melds: [],
      discards: [],
      chips: i === humanIndex ? 0 : 2000,
    }));
  }

  /** dealer seat for the current handNo */
  get dealer(): number {
    return (this.handNo - 1) % this.players.length;
  }
  /** 0=E 1=S 2=W 3=N */
  get roundWind(): number {
    return (this.handNo - 1) % 4;
  }
  seatWind(seat: number): number {
    return (seat - this.dealer + 4) % 4;
  }
  get totalHands(): number {
    return 4; // East-1 .. East-4 (one full wind rotation)
  }
  get matchOver(): boolean {
    return this.handNo >= this.totalHands;
  }

  /** Starts a hand: fresh wall, 13 tiles each, dealer draws first. */
  startHand(): { hands: TileId[][] } {
    this.handNo++;
    this.wall = buildWall();
    this.over = false;
    this.drawDead = false;
    this.lastDiscard = null;
    for (const p of this.players) {
      p.hand = [];
      p.melds = [];
      p.discards = [];
    }
    const hands: TileId[][] = [];
    for (const p of this.players) {
      p.hand = sortTiles(this.wall.splice(0, 13));
      hands.push([...p.hand]);
    }
    this.turn = this.dealer;
    return { hands };
  }

  get liveWall(): number {
    return Math.max(0, this.wall.length - DEAD_WALL);
  }

  /** draw from the live wall front */
  draw(): TileId | null {
    if (this.liveWall <= 0) {
      this.drawDead = true;
      this.over = true;
      return null;
    }
    return this.wall.shift() ?? null;
  }

  /** replacement tile after a kong (back of the wall, like real rules) */
  drawReplacement(): TileId | null {
    if (this.wall.length <= 0) {
      this.drawDead = true;
      this.over = true;
      return null;
    }
    return this.wall.pop() ?? null;
  }

  discard(seat: number, tile: TileId) {
    const p = this.players[seat];
    const i = p.hand.indexOf(tile);
    if (i >= 0) p.hand.splice(i, 1);
    p.discards.push(tile);
    this.lastDiscard = { tile, seat };
  }

  nextSeat(from = this.turn): number {
    return (from + 1) % this.players.length;
  }
  prevSeat(from = this.turn): number {
    return (from + 3) % this.players.length;
  }
}
