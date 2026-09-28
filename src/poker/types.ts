import type { PlayingCard } from '../core/assets';

export interface PokerPlayer {
  name: string;
  human: boolean;
  stack: number;
  hole: PlayingCard[];
  folded: boolean;
  bet: number;
  allIn: boolean;
}
