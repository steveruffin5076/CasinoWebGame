import { loadSave, writeSave, REFILL_AMOUNT, LOW_CHIP_THRESHOLD } from './storage';

export function getChips(): number {
  return loadSave().chips;
}

export function setChips(amount: number): void {
  const s = loadSave();
  s.chips = Math.max(0, Math.floor(amount));
  writeSave(s);
}

export function addChips(delta: number): number {
  const s = loadSave();
  s.chips = Math.max(0, s.chips + Math.floor(delta));
  writeSave(s);
  return s.chips;
}

export function needsFreeRefill(): boolean {
  return getChips() < LOW_CHIP_THRESHOLD;
}

export function freeRefill(): void {
  setChips(REFILL_AMOUNT);
}

export function recordWin(amount: number, gameId: string): void {
  const s = loadSave();
  if (amount > 0) {
    s.stats.biggestWin = Math.max(s.stats.biggestWin, amount);
    s.stats.winsByGame[gameId] = (s.stats.winsByGame[gameId] ?? 0) + 1;
  }
  writeSave(s);
}

export function recordGamePlayed(): void {
  const s = loadSave();
  s.stats.gamesPlayed += 1;
  writeSave(s);
}
