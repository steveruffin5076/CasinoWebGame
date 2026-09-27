/* =============================================================================
   deck.ts — standard 52-card deck + a multi-deck blackjack shoe.
   Cards are plain data; rendering lives in src/assets/cards.ts.
   ========================================================================== */

import { shuffle } from './utils';

export type Suit = 's' | 'h' | 'd' | 'c';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: number; // stable unique id — used for DOM reuse/pooling
  r: Rank;
  s: Suit;
  v: number; // blackjack/poker numeric value (A = 14 for poker, 11 for BJ logic)
}

const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS: Suit[] = ['s', 'h', 'd', 'c'];

export const SUIT_NAME: Record<Suit, string> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' };
export const SUIT_CHAR: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
export const isRed = (s: Suit) => s === 'h' || s === 'd';

let nextId = 1;

export function freshDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS)
    for (let i = 0; i < RANKS.length; i++) d.push({ id: nextId++, r: RANKS[i], s, v: i + 1 });
  return d;
}

/**
 * A shoe of `n` decks. Reshuffles once `penetration` of the cards have been
 * dealt (Vegas rule of thumb: 75%).
 */
export class Shoe {
  cards: Card[] = [];
  private pos = 0;

  constructor(
    public decks = 6,
    public penetration = 0.75,
  ) {
    this.shuffle();
  }

  shuffle() {
    this.cards = shuffle(freshDeck().flatMap((c) => Array.from({ length: this.decks }, () => ({ ...c, id: nextId++ }))));
    this.pos = 0;
  }

  get remaining() {
    return this.cards.length - this.pos;
  }
  get dealt() {
    return this.pos;
  }
  get needsShuffle() {
    return this.pos >= this.cards.length * this.penetration;
  }

  draw(): Card {
    if (this.pos >= this.cards.length) this.shuffle();
    return this.cards[this.pos++];
  }

  /** 0..1 progress used by the shoe meter UI. */
  get used() {
    return this.pos / this.cards.length;
  }
}

/** Blackjack hand value: Aces count 11 while it helps (soft totals). */
export function handValue(cards: Card[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 'A') {
      aces++;
      total += 11;
    } else if (c.r === 'J' || c.r === 'Q' || c.r === 'K') total += 10;
    else total += parseInt(c.r, 10);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0 };
}

export const isBlackjack = (cards: Card[]) => cards.length === 2 && handValue(cards).total === 21;

/** "A♠" style label. */
export const cardLabel = (c: Card) => `${c.r}${SUIT_CHAR[c.s]}`;
