/* =============================================================================
   engine.ts — No-Limit Texas Hold'em rules engine (headless).

   • 6-max table, starting stacks of 1,000
   • Blinds 10/20, doubling every 10 hands
   • Full streets: preflop / flop / turn / river / showdown
   • Side pots: computed from total committed amounts at showdown
   ========================================================================== */

import { freshDeck, type Card } from '../core/deck';
import { shuffle } from '../core/utils';
import { evaluate, compare, type HandRank } from './handEval';

export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown' | 'foldout';

export interface PokerPlayer {
  name: string;
  isHuman: boolean;
  seat: number; // fixed seat 0..5 (0 = you, bottom)
  stack: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  /** chips in front of the player during the current street */
  betStreet: number;
  /** total chips committed this hand (for side pots) */
  committed: number;
  hasActed: boolean;
  sittingOut: boolean; // busted / no chips
  lastAction: string;
  /** showdown info */
  rank?: HandRank;
  won?: number;
}

export type ActionKind = 'fold' | 'check' | 'call' | 'raise' | 'allin';
export interface PokerAction {
  kind: ActionKind;
  /** for raise: the total street bet being raised TO */
  to?: number;
}

export interface PotShare {
  amount: number;
  winners: number[]; // player indexes
  label: string; // "Main pot" / "Side pot 1"
  level: number; // committed level that defines eligibility
}

const START_STACK = 1000;

export class PokerEngine {
  players: PokerPlayer[] = [];
  deck: Card[] = [];
  board: Card[] = [];
  street: Street = 'idle';
  currentBet = 0;
  minRaise = 20;
  dealerSeat = 5; // rotates to 0 (you) first
  handNo = 0;
  lastAggressor: number | null = null;

  constructor(names: string[], public humanIndex = 0, public startStack = START_STACK) {
    this.players = names.map((name, i) => ({
      name,
      isHuman: i === humanIndex,
      seat: i,
      stack: startStack,
      hole: [],
      folded: false,
      allIn: false,
      betStreet: 0,
      committed: 0,
      hasActed: false,
      sittingOut: false,
      lastAction: '',
    }));
  }

  get blinds(): [number, number] {
    const lvl = Math.min(6, Math.floor(this.handNo / 10));
    const sb = 10 * Math.pow(2, lvl);
    return [sb, sb * 2];
  }
  get blindLabel(): string {
    const [a, b] = this.blinds;
    return `${a}/${b}`;
  }
  get bigBlind(): number {
    return this.blinds[1];
  }

  get inHand(): PokerPlayer[] {
    return this.players.filter((p) => !p.sittingOut && p.hole.length > 0);
  }

  activeNotFolded(): PokerPlayer[] {
    return this.players.filter((p) => !p.sittingOut && !p.folded && p.hole.length > 0);
  }

  canActPlayers(): PokerPlayer[] {
    return this.activeNotFolded().filter((p) => !p.allIn);
  }

  /** players still in the hand (for dealing) */
  dealable(): PokerPlayer[] {
    return this.players.filter((p) => !p.sittingOut);
  }

  get potOnTable(): number {
    // committed chips + current street bets in front
    return this.players.reduce((a, p) => a + p.committed + p.betStreet, 0);
  }

  /* -------------------------------- setup --------------------------------- */

  /** Starts a new hand; returns dealt hole cards per player index. */
  startHand(): { order: number[]; holes: Record<number, Card[]> } {
    this.handNo++;
    this.deck = shuffle(freshDeck());
    this.board = [];
    this.street = 'preflop';
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastAggressor = null;
    for (const p of this.players) {
      p.hole = [];
      p.folded = false;
      p.allIn = false;
      p.betStreet = 0;
      p.committed = 0;
      p.hasActed = false;
      p.lastAction = '';
      p.rank = undefined;
      p.won = undefined;
      if (p.stack <= 0) p.sittingOut = true;
    }

    // rotate the button among seated players
    const seated = this.players.filter((p) => !p.sittingOut);
    do {
      this.dealerSeat = (this.dealerSeat + 1) % this.players.length;
    } while (this.players[this.dealerSeat].sittingOut && seated.length > 1);

    const holes: Record<number, Card[]> = {};
    const order: number[] = [];
    const alive = this.players.filter((p) => !p.sittingOut);
    for (const p of alive) {
      p.hole = [this.deck.pop()!, this.deck.pop()!];
      holes[p.seat] = p.hole;
      order.push(p.seat);
    }

    // post blinds
    const [sb, bb] = this.blinds;
    const sbSeat = this.nextSeat(this.dealerSeat);
    const bbSeat = this.nextSeat(sbSeat);
    this.postBlind(sbSeat, sb, 'SB');
    this.postBlind(bbSeat, bb, 'BB');
    this.currentBet = bb;
    this.minRaise = bb;

    // first to act: after BB (UTG); heads-up: the button acts first preflop
    let first = this.nextSeat(bbSeat);
    if (alive.length === 2) first = this.dealerSeat;
    this.turn = first;
    return { order, holes };
  }

  /** index in this.players of the next seated, non-sitting-out seat after `seat` */
  nextSeat(seat: number): number {
    let s = seat;
    for (let i = 0; i < this.players.length; i++) {
      s = (s + 1) % this.players.length;
      if (!this.players[s].sittingOut) return s;
    }
    return seat;
  }

  turn = 0;

  private postBlind(seat: number, amt: number, label: string) {
    const p = this.players[seat];
    const a = Math.min(amt, p.stack);
    p.stack -= a;
    p.betStreet += a;
    p.committed += a;
    p.lastAction = label;
    if (p.stack === 0) p.allIn = true;
  }

  /* ------------------------------- legality -------------------------------- */

  legalActions(seat: number): PokerAction['kind'][] {
    const p = this.players[seat];
    if (p.sittingOut || p.folded || p.allIn || this.street === 'showdown') return [];
    const toCall = this.currentBet - p.betStreet;
    const out: PokerAction['kind'][] = [];
    if (toCall <= 0) out.push('check');
    else if (p.stack > 0) out.push('call', 'fold');
    if (p.stack > toCall) {
      const minTo = this.currentBet + this.minRaise;
      if (p.betStreet + p.stack >= minTo) out.push('raise');
      out.push('allin');
    }
    return out;
  }

  amountToCall(seat: number): number {
    const p = this.players[seat];
    return Math.max(0, Math.min(p.stack, this.currentBet - p.betStreet));
  }

  minRaiseTo(seat: number): number {
    const p = this.players[seat];
    return Math.min(p.betStreet + p.stack, this.currentBet + this.minRaise);
  }

  maxRaiseTo(seat: number): number {
    const p = this.players[seat];
    return p.betStreet + p.stack;
  }

  /* -------------------------------- actions -------------------------------- */

  apply(seat: number, action: PokerAction): void {
    const p = this.players[seat];
    const toCall = this.currentBet - p.betStreet;
    switch (action.kind) {
      case 'fold':
        p.folded = true;
        p.lastAction = 'Fold';
        break;
      case 'check':
        p.lastAction = 'Check';
        break;
      case 'call': {
        const a = Math.min(p.stack, toCall);
        p.stack -= a;
        p.betStreet += a;
        p.committed += a;
        p.lastAction = toCall >= p.stack ? 'All-In' : 'Call';
        if (p.stack === 0) p.allIn = true;
        break;
      }
      case 'raise':
      case 'allin': {
        const target = action.kind === 'allin' ? this.maxRaiseTo(seat) : Math.floor(action.to ?? 0);
        const t = Math.max(0, Math.min(target, this.maxRaiseTo(seat)));
        const delta = t - p.betStreet;
        p.stack -= delta;
        p.betStreet = t;
        p.committed += delta;
        if (t > this.currentBet) {
          const raiseSize = t - this.currentBet;
          if (raiseSize >= this.minRaise) {
            this.minRaise = raiseSize;
            this.lastAggressor = seat;
          }
          this.currentBet = t;
          // everyone else must respond again
          for (const o of this.players) if (o !== p && !o.folded && !o.sittingOut) o.hasActed = false;
          p.lastAction = delta + p.stack === 0 || p.stack === 0 ? 'All-In' : t >= p.stack + p.betStreet ? 'All-In' : `Raise ${t}`;
        } else {
          p.lastAction = p.stack === 0 ? 'All-In' : 'Call';
        }
        if (p.stack === 0) p.allIn = true;
        break;
      }
    }
    p.hasActed = true;
  }

  /** Is the betting round over? */
  bettingDone(): boolean {
    const alive = this.activeNotFolded();
    if (alive.length <= 1) return true;
    const actors = alive.filter((p) => !p.allIn);
    if (actors.length === 0) return true;
    // special case: everyone else all-in and the lone actor has matched
    return actors.every((p) => p.hasActed && p.betStreet === this.currentBet);
  }

  /** collect street bets into committed, reset for the next street */
  collectStreet() {
    for (const p of this.players) {
      p.betStreet = 0;
      p.hasActed = false;
    }
    this.currentBet = 0;
    this.minRaise = this.bigBlind;
    this.lastAggressor = null;
  }

  /** advance turn to the next player who can act (skips folded/all-in/out) */
  advanceTurn() {
    const n = this.players.length;
    for (let i = 1; i <= n; i++) {
      const s = (this.turn + i) % n;
      const p = this.players[s];
      if (!p.sittingOut && !p.folded && !p.allIn) {
        this.turn = s;
        return s;
      }
    }
    return this.turn;
  }

  /** first to act postflop: first non-folded seat after the button */
  firstPostflop(): number {
    const n = this.players.length;
    let s = this.dealerSeat;
    for (let i = 1; i <= n; i++) {
      s = (s + i) % n;
      const p = this.players[s];
      if (!p.sittingOut && !p.folded && !p.allIn) return s;
    }
    return this.dealerSeat;
  }

  /** Deal the next street card(s). Returns the newly dealt cards. */
  dealStreet(): Card[] {
    const burnt = this.deck.pop(); // burn card
    void burnt;
    const out: Card[] = [];
    if (this.street === 'preflop') {
      this.street = 'flop';
      for (let i = 0; i < 3; i++) out.push(this.deck.pop()!);
    } else if (this.street === 'flop') {
      this.street = 'turn';
      out.push(this.deck.pop()!);
    } else if (this.street === 'turn') {
      this.street = 'river';
      out.push(this.deck.pop()!);
    }
    this.board.push(...out);
    this.turn = this.firstPostflop();
    return out;
  }

  /* ------------------------------- showdown -------------------------------- */

  /** Build side pots from committed amounts. */
  buildPots(): PotShare[] {
    const levels = [...new Set(this.players.filter((p) => p.committed > 0).map((p) => p.committed))].sort((a, b) => a - b);
    const pots: PotShare[] = [];
    let prev = 0;
    levels.forEach((lvl, i) => {
      let amount = 0;
      const eligible: number[] = [];
      this.players.forEach((p, idx) => {
        amount += Math.max(0, Math.min(p.committed, lvl) - prev);
        if (!p.folded && p.committed >= lvl && p.hole.length > 0) eligible.push(idx);
      });
      if (amount > 0 && eligible.length > 0) {
        pots.push({ amount, winners: [], label: i === 0 ? 'Main pot' : `Side pot ${i}`, level: lvl });
      }
      prev = lvl;
    });
    return pots;
  }

  /** Run the showdown: fills player.rank / player.won, returns pot shares. */
  showdown(): { pots: PotShare[]; reveals: number[] } {
    const contenders = this.activeNotFolded();
    contenders.forEach((p) => (p.rank = evaluate([...p.hole, ...this.board])));
    const reveals = contenders.map((p) => p.seat);
    const pots = this.buildPots();
    for (const pot of pots) {
      // winners among eligible with committed >= level
      const lvl = 0; // eligibility encoded above; recompute properly:
      void lvl;
      const inPot = contenders.filter((p) => {
        // eligible if this player's committed reaches the pot's level
        const level = pots.indexOf(pot);
        const levels = [...new Set(this.players.filter((q) => q.committed > 0).map((q) => q.committed))].sort((a, b) => a - b);
        const target = levels[level];
        return p.committed >= target;
      });
      let best: PokerPlayer | null = null;
      for (const p of inPot) {
        if (!best || compare(p.rank!, best.rank!) > 0) best = p;
      }
      const winners = inPot.filter((p) => best && compare(p.rank!, best.rank!) === 0);
      pot.winners = winners.map((p) => p.seat);
      const share = Math.floor(pot.amount / winners.length);
      let remainder = pot.amount - share * winners.length;
      for (const w of winners) {
        let amt = share;
        if (remainder > 0) {
          amt += 1;
          remainder -= 1;
        }
        w.stack += amt;
        w.won = (w.won ?? 0) + amt;
      }
    }
    return { pots, reveals };
  }

  /** Everyone folded: last player standing takes the pot. */
  foldout(): number {
    const winner = this.activeNotFolded()[0];
    const total = this.players.reduce((a, p) => a + p.committed, 0);
    winner.stack += total;
    winner.won = total;
    this.street = 'foldout';
    return winner.seat;
  }

  /** true when the whole hand is done */
  get handOver(): boolean {
    return this.street === 'showdown' || this.street === 'foldout';
  }

  /** everyone remaining is all-in -> run out the board */
  get runoutNeeded(): boolean {
    const alive = this.activeNotFolded();
    return alive.length > 1 && alive.every((p) => p.allIn || p.stack === 0);
  }

  finishStreet() {
    this.collectStreet();
  }
}

export { evaluate, compare };
