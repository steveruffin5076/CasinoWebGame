import type { PokerPlayer } from './types';

/** Tracks who still must act after the last bet level change */
export class BettingRound {
  private pending = new Set<number>();
  private n: number;
  private players: PokerPlayer[];
  current: number;

  constructor(players: PokerPlayer[], startIdx: number) {
    this.players = players;
    this.n = players.length;
    this.current = startIdx;
    this.resetPending();
  }

  private resetPending(): void {
    this.pending.clear();
    for (let i = 0; i < this.n; i++) {
      const p = this.players[i];
      if (!p.folded && !p.allIn) this.pending.add(i);
    }
  }

  onRaise(raiserIdx: number): void {
    this.pending.clear();
    for (let i = 0; i < this.n; i++) {
      const p = this.players[i];
      if (!p.folded && !p.allIn) this.pending.add(i);
    }
    this.pending.delete(raiserIdx);
  }

  onFold(idx: number): void {
    this.pending.delete(idx);
  }

  onMatchedBet(idx: number): void {
    this.pending.delete(idx);
  }

  isComplete(): boolean {
    const inHand = this.players.filter((p) => !p.folded);
    if (inHand.length <= 1) return true;
    return this.pending.size === 0;
  }

  aliveCount(): number {
    return this.players.filter((p) => !p.folded).length;
  }
}
