import type { UnoCard, UnoColor } from '../core/assets';
import type { BotDifficulty } from '../core/storage';
import { pick } from '../core/utils';

export function canPlay(card: UnoCard, top: UnoCard, currentColor: UnoColor): boolean {
  if (card.kind === 'wild' || card.kind === 'wild4') return true;
  if (card.color === currentColor) return true;
  if (top.kind === 'number' && card.kind === 'number' && card.value === top.value) return true;
  if (card.kind !== 'number' && card.kind === top.kind) return true;
  return false;
}

export function botPickCard(
  hand: UnoCard[],
  top: UnoCard,
  currentColor: UnoColor,
  difficulty: BotDifficulty,
): UnoCard | null {
  const valid = hand.filter((c) => canPlay(c, top, currentColor));
  if (!valid.length) return null;

  if (difficulty === 'easy') return pick(valid);

  const nonWild = valid.filter((c) => c.kind !== 'wild' && c.kind !== 'wild4');
  if (nonWild.length) {
    if (difficulty === 'hard') {
      const punish = valid.find((c) => c.kind === 'draw2' || c.kind === 'skip');
      if (punish) return punish;
    }
    const colorMatch = nonWild.filter((c) => c.color === currentColor);
    if (colorMatch.length) return colorMatch[0];
    return nonWild[0];
  }
  return valid[0];
}

export function botWildColor(hand: UnoCard[]): UnoColor {
  const counts: Record<UnoColor, number> = { red: 0, yellow: 0, green: 0, blue: 0, wild: 0 };
  for (const c of hand) {
    if (c.color !== 'wild') counts[c.color]++;
  }
  let best: UnoColor = 'red';
  let max = -1;
  for (const col of ['red', 'yellow', 'green', 'blue'] as UnoColor[]) {
    if (counts[col] > max) {
      max = counts[col];
      best = col;
    }
  }
  return best;
}

export function handPoints(hand: UnoCard[]): number {
  let sum = 0;
  for (const c of hand) {
    if (c.kind === 'wild' || c.kind === 'wild4') sum += 50;
    else if (c.kind === 'draw2' || c.kind === 'skip' || c.kind === 'reverse') sum += 20;
    else sum += c.value;
  }
  return sum;
}
