/** localStorage persistence for chips, settings, stats, daily bonus */

export type BotDifficulty = 'easy' | 'normal' | 'hard';

export interface GameSettings {
  soundMuted: boolean;
  highFps: boolean;
  difficulties: Record<string, BotDifficulty>;
}

export interface PlayerStats {
  gamesPlayed: number;
  biggestWin: number;
  winsByGame: Record<string, number>;
}

export interface SaveData {
  chips: number;
  lastDailyBonus: number;
  settings: GameSettings;
  stats: PlayerStats;
}

const KEY = 'neon-casino-save-v1';

const DEFAULT: SaveData = {
  chips: 10000,
  lastDailyBonus: 0,
  settings: {
    soundMuted: false,
    highFps: true,
    difficulties: {
      blackjack: 'normal',
      poker: 'normal',
      mahjong: 'normal',
      uno: 'normal',
    },
  },
  stats: {
    gamesPlayed: 0,
    biggestWin: 0,
    winsByGame: {},
  },
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT, settings: { ...DEFAULT.settings, difficulties: { ...DEFAULT.settings.difficulties } } };
    const parsed = JSON.parse(raw) as SaveData;
    return {
      ...DEFAULT,
      ...parsed,
      settings: { ...DEFAULT.settings, ...parsed.settings, difficulties: { ...DEFAULT.settings.difficulties, ...parsed.settings?.difficulties } },
      stats: { ...DEFAULT.stats, ...parsed.stats },
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeSave(data: SaveData): void {
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function getDifficulty(game: string): BotDifficulty {
  return loadSave().settings.difficulties[game] ?? 'normal';
}

export function setDifficulty(game: string, d: BotDifficulty): void {
  const s = loadSave();
  s.settings.difficulties[game] = d;
  writeSave(s);
}

export const DAILY_BONUS = 2000;
export const REFILL_AMOUNT = 10000;
export const LOW_CHIP_THRESHOLD = 100;

export function canClaimDaily(data: SaveData): boolean {
  return Date.now() - data.lastDailyBonus >= 24 * 60 * 60 * 1000;
}

export function msUntilDaily(data: SaveData): number {
  const left = 24 * 60 * 60 * 1000 - (Date.now() - data.lastDailyBonus);
  return Math.max(0, left);
}
