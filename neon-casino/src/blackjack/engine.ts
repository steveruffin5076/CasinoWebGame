/* =============================================================================
   engine.ts — Blackjack rules engine (headless: no DOM, fully testable).

   Vegas rules:
     • 6-deck shoe, reshuffle at 75% penetration
     • Blackjack pays 3:2, insurance pays 2:1
     • Dealer stands on all 17s (including soft 17)
     • Double Down on any first two cards
     • Split once (any pair of equal-value cards; split aces get one card each)
   ========================================================================== */

import { Shoe, handValue, isBlackjack, type Card } from '../core/deck';

export type Phase = 'betting' | 'dealing' | 'insurance' | 'player' | 'bots' | 'dealer' | 'payout';

export interface Hand {
  cards: Card[];
  bet: number;
  doubled: boolean;
  fromSplit: boolean;
  done: boolean;
  surrendered?: boolean;
  /** result after settlement: 'win' | 'lose' | 'push' | 'bj' */
  result?: 'win' | 'lose' | 'push' | 'bj';
}

export interface SeatPlayer {
  name: string;
  isHuman: boolean;
  active: boolean; // bots can go bust and sit out a round (bankroll)
  bankroll: number;
  hand: Hand | null;
  /** fixed table spot (0..n-1) — survives split-seat splicing */
  slot: number;
}

const hand = (bet: number): Hand => ({
  cards: [],
  bet,
  doubled: false,
  fromSplit: false,
  done: false,
});

export class BlackjackEngine {
  shoe = new Shoe(6, 0.75);
  dealer: Card[] = [];
  dealerHoleHidden = true;
  players: SeatPlayer[] = [];
  phase: Phase = 'betting';
  insurancePot = 0;

  constructor(
    public seatNames: string[],
    public humanIndex = 0,
  ) {
    this.players = seatNames.map((name, i) => ({
      name,
      isHuman: i === humanIndex,
      active: true,
      bankroll: i === humanIndex ? -1 : 1000, // human uses the global wallet
      hand: null,
      slot: i,
    }));
  }

  /* ------------------------------- betting -------------------------------- */

  placeBet(seat: number, amount: number): boolean {
    const p = this.players[seat];
    if (!p || this.phase !== 'betting') return false;
    const cur = p.hand?.bet ?? 0;
    const total = cur + amount;
    if (amount <= 0 || total > 5000) return false;
    // bots carry a fake table bankroll so they never wedge the round
    if (!p.isHuman && p.bankroll < total) return false;
    p.hand = hand(total);
    return true;
  }

  clearBet(seat: number) {
    this.players[seat].hand = null;
  }

  get allBetsPlaced() {
    return this.players.some((p) => p.active && p.hand);
  }

  autoBetBots() {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (p.isHuman || !p.active) continue;
      if (p.bankroll < 10) {
        p.active = false;
        continue;
      }
      const base = [10, 10, 25, 50, 50, 100][Math.floor(Math.random() * 6)];
      const bet = Math.min(base, p.bankroll);
      this.placeBet(i, bet);
    }
  }

  /* ------------------------------- dealing -------------------------------- */

  /** Initial deal: one card to each player (with bets), dealer, second pass. */
  dealRound(): Card[][] {
    const order: Card[][] = [];
    for (let pass = 0; pass < 2; pass++) {
      for (const p of this.players) {
        if (p.active && p.hand && p.hand.cards.length < 2) {
          const c = this.shoe.draw();
          p.hand.cards.push(c);
          order.push([c]);
        }
      }
      if (pass === 0) {
        const c = this.shoe.draw();
        this.dealer.push(c);
        order.push([c]);
      } else {
        const c = this.shoe.draw();
        this.dealer.push(c); // hole card — UI keeps it face down
        order.push([c]);
      }
    }
    this.dealerHoleHidden = true;
    this.phase = 'insurance';
    return order;
  }

  get dealerUp() {
    return this.dealer[0];
  }

  insuranceOffered(): boolean {
    return this.dealerUp?.r === 'A';
  }

  /** Insurance is half the bet, capped at reasonable table limits. */
  takeInsurance(seat: number, upTo: number): number {
    const p = this.players[seat];
    if (!p?.hand || !this.insuranceOffered() || this.insurancePot > 0) return 0;
    const amt = Math.min(Math.floor(p.hand.bet / 2), upTo);
    this.insurancePot += amt;
    return amt;
  }

  /* ------------------------------- actions -------------------------------- */

  canHit(seat: number): boolean {
    const h = this.players[seat]?.hand;
    if (!h || h.done || h.doubled) return false;
    if (h.fromSplit && h.cards[0]?.r === 'A') return false; // split aces: one card only
    return handValue(h.cards).total < 21;
  }

  canDouble(seat: number): boolean {
    const h = this.players[seat]?.hand;
    if (!h || h.done || h.cards.length !== 2) return false;
    if (h.fromSplit && h.cards[0]?.r === 'A') return false;
    return true;
  }

  canSplit(seat: number): boolean {
    const h = this.players[seat]?.hand;
    if (!h || h.done || h.cards.length !== 2 || h.fromSplit) return false;
    const [a, b] = h.cards;
    return cardVal(a) === cardVal(b);
  }

  hit(seat: number): Card {
    const h = this.players[seat].hand!;
    const c = this.shoe.draw();
    h.cards.push(c);
    if (handValue(h.cards).total >= 21) h.done = true;
    return c;
  }

  stand(seat: number) {
    this.players[seat].hand!.done = true;
  }

  double(seat: number): Card {
    const h = this.players[seat].hand!;
    const c = this.shoe.draw();
    h.cards.push(c);
    h.bet *= 2;
    h.doubled = true;
    h.done = true;
    return c;
  }

  /** Splits the pair into a second hand; returns the new card for hand 1. */
  split(seat: number): { newHand: Hand; cardA: Card } {
    const h = this.players[seat].hand!;
    const b = h.cards.pop()!;
    const nh = hand(h.bet);
    nh.fromSplit = true;
    nh.cards.push(b);
    h.fromSplit = true;
    const c = this.shoe.draw();
    h.cards.push(c);
    this.players.splice(seat + 1, 0, {
      ...this.players[seat],
      name: `${this.players[seat].name} (2)`,
      hand: nh,
    });
    // a split hand receiving an ace is auto-done (one card on split aces)
    if (c.r === 'A') h.done = true;
    return { newHand: nh, cardA: c };
  }

  /** True while the seat has a split hand pending its second card. */
  splitPending(seat: number): boolean {
    const h = this.players[seat]?.hand;
    return !!h && h.fromSplit && h.cards.length < 2;
  }

  /** Deal the second card to a pending split hand. */
  fillSplit(seat: number): Card {
    const h = this.players[seat].hand!;
    const c = this.shoe.draw();
    h.cards.push(c);
    if (c.r === 'A') h.done = true;
    return c;
  }

  /* ------------------------------- settlement ----------------------------- */

  /** Dealer plays: stands on all 17s. Returns the cards drawn. */
  playDealer(): Card[] {
    this.dealerHoleHidden = false;
    const drawn: Card[] = [];
    while (handValue(this.dealer).total < 17) {
      const c = this.shoe.draw();
      this.dealer.push(c);
      drawn.push(c);
    }
    return drawn;
  }

  /**
   * Settles every hand against the dealer.
   * Returns per-seat payouts (positive = player receives incl. stake back).
   */
  settle(): { seat: number; payout: number; bet: number; result: 'win' | 'lose' | 'push' | 'bj' }[] {
    const dv = handValue(this.dealer).total;
    const dBJ = isBlackjack(this.dealer);
    const out: { seat: number; payout: number; bet: number; result: 'win' | 'lose' | 'push' | 'bj' }[] = [];
    this.players.forEach((p, seat) => {
      const h = p.hand;
      if (!h) return;
      const v = handValue(h.cards).total;
      const pBJ = isBlackjack(h.cards) && !h.fromSplit;
      let payout = 0;
      let result: 'win' | 'lose' | 'push' | 'bj' = 'lose';
      if (v > 21) {
        payout = 0;
        result = 'lose';
      } else if (pBJ) {
        if (dBJ) {
          payout = h.bet;
          result = 'push';
        } else {
          payout = h.bet + Math.floor(h.bet * 1.5); // 3:2
          result = 'bj';
        }
      } else if (dBJ) {
        payout = 0;
        result = 'lose';
      } else if (dv > 21 || v > dv) {
        payout = h.bet * 2;
        result = 'win';
      } else if (v === dv) {
        payout = h.bet;
        result = 'push';
      }
      h.result = result;
      out.push({ seat, payout, bet: h.bet, result });
    });
    return out;
  }

  /** Insurance settlement (2:1 when the dealer has blackjack). */
  settleInsurance(): number {
    if (!this.insurancePot) return 0;
    const win = isBlackjack(this.dealer);
    const ret = win ? this.insurancePot * 3 : 0; // stake back + 2:1
    this.insurancePot = 0;
    return ret;
  }

  nextRound() {
    this.dealer = [];
    this.dealerHoleHidden = true;
    this.insurancePot = 0;
    for (const p of this.players) p.hand = null;
    // remove split ghost seats
    this.players = this.players.filter((p) => !p.name.includes('(2)'));
    this.phase = 'betting';
    if (this.shoe.needsShuffle) this.shoe.shuffle();
  }
}

const cardVal = (c: Card) => (c.r === 'A' ? 11 : ['J', 'Q', 'K', '10'].includes(c.r) ? 10 : parseInt(c.r, 10));

export { handValue, isBlackjack };
