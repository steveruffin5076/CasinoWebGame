/* =============================================================================
   engine.ts — UNO rules engine (classic 108 cards, no stacking).

   Turn flow: play a matching card (colour / number / symbol), or draw one
   card (playing the drawn card is allowed if it matches), else pass.
   Specials: Skip, Reverse, +2, Wild, Wild +4 (Wild +4 only legal when you
   hold no card in the current colour).
   ========================================================================== */

import { buildUnoDeck, type UnoCard, type UnoColor } from './faces';

export interface Player {
  name: string;
  isHuman: boolean;
  hand: UnoCard[];
  /** true when this player is down to exactly one card and hasn't shouted */
  unoRisk: boolean;
  saidUno: boolean;
}

export interface Move {
  card: UnoCard | null; // null = draw/pass
  chosenColor?: UnoColor; // for wilds
}

export class UnoEngine {
  deck: UnoCard[] = [];
  discard: UnoCard[] = [];
  players: Player[] = [];
  turn = 0;
  dir = 1; // 1 = clockwise, -1 = counter-clockwise
  currentColor: UnoColor = 'r';
  pendingDraw = 0; // unused in classic (no stacking) but kept for clarity
  over = false;
  roundWinner: number | null = null;

  constructor(names: string[], public humanIndex = 0) {
    this.players = names.map((name, i) => ({
      name,
      isHuman: i === humanIndex,
      hand: [],
      unoRisk: false,
      saidUno: false,
    }));
  }

  /* ------------------------------- setup ---------------------------------- */

  startRound(): { hands: UnoCard[][]; first: UnoCard } {
    this.deck = buildUnoDeck();
    this.discard = [];
    this.turn = Math.floor(Math.random() * this.players.length);
    this.dir = 1;
    this.over = false;
    this.roundWinner = null;
    for (const p of this.players) {
      p.hand = [];
      p.unoRisk = false;
      p.saidUno = false;
    }
    const hands: UnoCard[][] = [];
    for (let i = 0; i < 7; i++)
      for (const p of this.players) {
        const c = this.draw();
        p.hand.push(c);
      }
    for (const p of this.players) hands.push([...p.hand]);
    // flip a non-wild starter
    let first = this.draw();
    while (first.color === 'w') {
      this.deck.unshift(first); // put it back near the bottom
      first = this.draw();
    }
    this.discard.push(first);
    this.currentColor = first.color;
    return { hands, first };
  }

  draw(): UnoCard {
    if (!this.deck.length) this.reshuffle();
    return this.deck.pop()!;
  }

  private reshuffle() {
    // everything except the top card goes back in
    const top = this.discard.pop()!;
    const rest = this.discard.splice(0);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.deck = rest;
    this.discard = [top];
    if (!this.deck.length) {
      // pathological: nothing left — fabricate a fresh deck
      this.deck = buildUnoDeck().filter((c) => c.color === 'w' || c.kind !== this.top.kind);
    }
  }

  get top(): UnoCard {
    return this.discard[this.discard.length - 1];
  }

  /* ------------------------------- legality -------------------------------- */

  canPlay(card: UnoCard): boolean {
    if (card.color === 'w') {
      // Wild +4 rule: only when you hold no card of the current colour
      if (card.kind === 'wd4') {
        return !this.players[this.turn].hand.some((c) => c.color === this.currentColor);
      }
      return true;
    }
    if (card.color === this.currentColor) return true;
    if (typeof card.kind === 'number' && typeof this.top.kind === 'number' && card.kind === this.top.kind)
      return true;
    if (card.kind === this.top.kind && card.kind !== 'wild' && card.kind !== 'wd4') return true;
    return false;
  }

  playableIndices(): number[] {
    const p = this.players[this.turn];
    return p.hand.reduce<number[]>((acc, c, i) => (this.canPlay(c) ? (acc.push(i), acc) : acc), []);
  }

  /* ------------------------------- actions --------------------------------- */

  /** Play a card from the current player's hand. Returns the advanced turn. */
  play(index: number, chosenColor?: UnoColor): { played: UnoCard; next: number; skipped?: number } {
    const p = this.players[this.turn];
    const card = p.hand.splice(index, 1)[0];
    this.discard.push(card);
    this.currentColor = card.color === 'w' ? chosenColor ?? 'r' : card.color;

    if (p.hand.length === 1) p.unoRisk = !p.saidUno;
    else p.unoRisk = false;
    if (p.hand.length === 0) {
      this.over = true;
      this.roundWinner = this.turn;
      return { played: card, next: this.turn };
    }

    let skipped: number | undefined;
    let steps = 1;
    switch (card.kind) {
      case 'skip':
        steps = 2; // skip the next player
        skipped = this.peek(1);
        break;
      case 'rev':
        this.dir *= -1;
        if (this.players.length === 2) steps = 2; // reverse acts as skip HU
        break;
      case 'd2':
        this.pendingDraw = 0; // classic: no stacking — penalty applies now
        const victim = this.peek(1);
        this.drawTo(victim, 2);
        steps = 2;
        skipped = victim;
        break;
      case 'wd4':
        const v4 = this.peek(1);
        this.drawTo(v4, 4);
        steps = 2;
        skipped = v4;
        break;
      default:
        break;
    }
    const next = this.advance(steps);
    return { played: card, next, skipped };
  }

  /** Draw for the current player; returns the card (null only on dry deck). */
  drawOne(): UnoCard {
    const p = this.players[this.turn];
    const c = this.draw();
    p.hand.push(c);
    p.unoRisk = false;
    return c;
  }

  /** After drawing, the player may play the drawn card if legal. */
  canPlayDrawn(c: UnoCard): boolean {
    return this.canPlay(c);
  }

  private drawTo(seat: number, n: number) {
    for (let i = 0; i < n; i++) this.players[seat].hand.push(this.draw());
    this.players[seat].unoRisk = false;
  }

  private peek(steps: number): number {
    const n = this.players.length;
    return (this.turn + this.dir * steps + n * 4) % n;
  }

  private advance(steps = 1): number {
    const n = this.players.length;
    this.turn = (this.turn + this.dir * steps + n * 4) % n;
    return this.turn;
  }

  /** Pass the turn (after drawing). */
  pass(): number {
    return this.advance(1);
  }

  /** UNO shout mechanics: catch another player who is at risk. */
  catchUno(seat: number): boolean {
    const p = this.players[seat];
    if (p.unoRisk) {
      this.drawTo(seat, 2);
      p.unoRisk = false;
      return true;
    }
    return false;
  }

  /** The player announces UNO (before/at the moment they hit one card). */
  shoutUno(seat: number) {
    const p = this.players[seat];
    p.saidUno = true;
    if (p.hand.length === 1) p.unoRisk = false;
  }

  /** Round points: winner scores the sum of the others' hand values. */
  scoreRound(): number {
    let pts = 0;
    this.players.forEach((p, i) => {
      if (i !== this.roundWinner) pts += p.hand.reduce((a, c) => a + c.points, 0);
    });
    return pts;
  }

  handPoints(seat: number): number {
    return this.players[seat].hand.reduce((a, c) => a + c.points, 0);
  }
}
