import type { MahjongTile } from '../core/assets';
import type { BotDifficulty } from '../core/storage';
import { tileKey, canWinHand, shantenEstimate } from '../mahjong/rules';

export function botDiscard(hand: MahjongTile[], difficulty: BotDifficulty): MahjongTile {
  if (difficulty === 'easy' && Math.random() < 0.2) {
    return hand[Math.floor(Math.random() * hand.length)];
  }
  let worst = hand[0];
  let worstScore = Infinity;
  for (const t of hand) {
    const rest = hand.filter((x) => x.id !== t.id);
    const s = shantenEstimate(rest);
    if (s < worstScore) {
      worstScore = s;
      worst = t;
    }
  }
  return worst;
}

export function botShouldPung(hand: MahjongTile[], tile: MahjongTile, difficulty: BotDifficulty): boolean {
  if (difficulty === 'easy') return Math.random() < 0.3;
  const key = tileKey(tile);
  const count = hand.filter((t) => tileKey(t) === key).length;
  return count >= 2;
}

export function botShouldKong(hand: MahjongTile[], tile: MahjongTile, difficulty: BotDifficulty): boolean {
  if (difficulty === 'easy') return Math.random() < 0.2;
  const key = tileKey(tile);
  return hand.filter((t) => tileKey(t) === key).length >= 3;
}

export function botShouldChow(hand: MahjongTile[], tile: MahjongTile, difficulty: BotDifficulty): boolean {
  if (difficulty !== 'hard') return Math.random() < 0.1;
  return shantenEstimate([...hand, tile]) < shantenEstimate(hand);
}

export function botShouldWin(hand: MahjongTile[], tile: MahjongTile): boolean {
  return canWinHand([...hand, tile]);
}
