/* =============================================================================
   storage.ts — localStorage persistence: chip balance, settings, stats.
   No backend, no database; everything is namespaced under one key and every
   read is defensive (private-mode / quota errors fall back to defaults).
   ========================================================================== */

import { clone } from './utils';

const KEY = 'neon-casino:v1';
export const START_BALANCE = 10_000;
export const DAILY_BONUS = 2_000;
export const BONUS_MS = 24 * 60 * 60 * 1000; // 24h
export const REFILL_AT = 100; // "FREE REFILL" appears below this balance

export type Difficulty = 'easy' | 'normal' | 'hard';
export type GameId = 'blackjack' | 'poker' | 'mahjong' | 'uno';

export interface Settings {
  sound: boolean;
  fx: 'full' | 'low'; // "60fps toggle" — low reduces particles/shadows
  difficulty: Record<GameId, Difficulty>;
}

export interface Stats {
  gamesPlayed: number;
  biggestWin: number;
  biggestWinGame: GameId | '';
  handsWon: number;
  handsLost: number;
  best: Record<GameId, number>; // best single win per game
}

export interface SaveData {
  balance: number;
  lastBonus: number; // epoch ms
  settings: Settings;
  stats: Stats;
}

const defaults = (): SaveData => ({
  balance: START_BALANCE,
  lastBonus: 0,
  settings: {
    sound: true,
    fx: 'full',
    difficulty: { blackjack: 'normal', poker: 'normal', mahjong: 'normal', uno: 'normal' },
  },
  stats: {
    gamesPlayed: 0,
    biggestWin: 0,
    biggestWinGame: '',
    handsWon: 0,
    handsLost: 0,
    best: { blackjack: 0, poker: 0, mahjong: 0, uno: 0 },
  },
});

let cache: SaveData | null = null;

function read(): SaveData {
  if (cache) return cache;
  let data = defaults();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      data = {
        ...data,
        ...parsed,
        settings: { ...data.settings, ...(parsed.settings ?? {}), difficulty: { ...data.settings.difficulty, ...(parsed.settings?.difficulty ?? {}) } },
        stats: { ...data.stats, ...(parsed.stats ?? {}), best: { ...data.stats.best, ...(parsed.stats?.best ?? {}) } },
      };
    }
  } catch {
    data = defaults();
  }
  if (!Number.isFinite(data.balance) || data.balance < 0) data.balance = START_BALANCE;
  cache = data;
  return cache;
}

function write() {
  if (!cache) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* storage disabled — game still playable in-memory */
  }
}

export const save = {
  get data(): SaveData {
    return read();
  },
  patch(p: Partial<SaveData>) {
    const d = read();
    Object.assign(d, p);
    write();
  },
  settings(): Settings {
    return read().settings;
  },
  setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
    const d = read();
    d.settings[k] = v;
    write();
  },
  setDifficulty(g: GameId, d: Difficulty) {
    const s = read();
    s.settings.difficulty[g] = d;
    write();
  },
  stats(): Stats {
    return read().stats;
  },
  /** Merge stat updates (positive numbers add, `biggestWin` is a max). */
  record(p: Partial<Pick<Stats, 'gamesPlayed' | 'biggestWin' | 'handsWon' | 'handsLost'>> & { biggestWinGame?: GameId; best?: Partial<Record<GameId, number>> }) {
    const s = read().stats;
    s.gamesPlayed += p.gamesPlayed ?? 0;
    s.handsWon += p.handsWon ?? 0;
    s.handsLost += p.handsLost ?? 0;
    if (p.biggestWin != null && p.biggestWin > s.biggestWin) {
      s.biggestWin = p.biggestWin;
      s.biggestWinGame = p.biggestWinGame ?? '';
    }
    if (p.best) {
      for (const g of Object.keys(p.best) as GameId[]) {
        const v = p.best[g] ?? 0;
        if (v > (s.best[g] ?? 0)) s.best[g] = v;
      }
    }
    write();
  },
  /**
   * Resets progression (used by "FREE REFILL" and the reset button in stats).
   */
  reset() {
    cache = defaults();
    write();
  },
};

/** Deep copy helper for table snapshots. */
export const deepCopy = clone;
