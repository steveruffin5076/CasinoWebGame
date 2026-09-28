import type { MahjongTile } from '../core/assets';

/** Simplified HK Mahjong — 136 tiles, no Flowers/Seasons */

export function tileKey(t: MahjongTile): string {
  return `${t.suit}:${t.value}`;
}

export function sortHand(hand: MahjongTile[]): MahjongTile[] {
  return [...hand].sort((a, b) => {
    const sa = a.suit.localeCompare(b.suit);
    if (sa !== 0) return sa;
    return String(a.value).localeCompare(String(b.value));
  });
}

export function canWinHand(hand: MahjongTile[]): boolean {
  if (hand.length % 3 !== 2) return false;
  const keys = hand.map(tileKey);
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const [pairKey, c] of counts) {
    if (c >= 2) {
      const rem = decrementCounts(counts, pairKey, 2);
      if (rem && canFormSets(rem)) return true;
    }
  }
  return false;
}

function decrementCounts(counts: Map<string, number>, key: string, n: number): Map<string, number> | null {
  const m = new Map(counts);
  m.set(key, (m.get(key) ?? 0) - n);
  if (m.get(key)! < 0) return null;
  if (m.get(key) === 0) m.delete(key);
  return m;
}

function canFormSets(counts: Map<string, number>): boolean {
  const keys = [...counts.keys()].filter((k) => (counts.get(k) ?? 0) > 0);
  if (keys.length === 0) return true;
  keys.sort();
  const k = keys[0];
  const c = counts.get(k)!;
  if (c >= 3) {
    const rem = decrementCounts(counts, k, 3);
    if (rem && canFormSets(rem)) return true;
  }
  if (k.startsWith('dots:') || k.startsWith('bams:') || k.startsWith('cracks:')) {
    const [, v] = k.split(':');
    const n = parseInt(v, 10);
    if (n <= 7) {
      const k2 = k.replace(`:${n}`, `:${n + 1}`);
      const k3 = k.replace(`:${n}`, `:${n + 2}`);
      if ((counts.get(k2) ?? 0) > 0 && (counts.get(k3) ?? 0) > 0) {
        let m = decrementCounts(counts, k, 1)!;
        m = decrementCounts(m, k2, 1)!;
        m = decrementCounts(m, k3, 1)!;
        if (canFormSets(m)) return true;
      }
    }
  }
  return false;
}

export function shantenEstimate(hand: MahjongTile[]): number {
  return canWinHand(hand.length % 3 === 2 ? hand : [...hand, hand[0]]) ? 0 : Math.min(8, Math.ceil((14 - hand.length) / 3));
}

export interface FanBreakdown {
  name: string;
  fan: number;
}

export function scoreHand(hand: MahjongTile[], selfDraw: boolean): { total: number; breakdown: FanBreakdown[] } {
  const breakdown: FanBreakdown[] = [{ name: 'Base', fan: 1 }];
  const suits = new Set(hand.map((t) => t.suit));
  const numSuits = suits.has('wind') || suits.has('dragon') ? suits.size : suits.size;
  if (numSuits === 1 && !suits.has('wind') && !suits.has('dragon')) {
    breakdown.push({ name: 'Pure Suit', fan: 7 });
  }
  const keys = hand.map(tileKey);
  const counts = new Map<string, number>();
  for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
  const pungs = [...counts.values()].filter((c) => c >= 3).length;
  if (pungs >= 4) breakdown.push({ name: 'All Pungs', fan: 3 });
  if (selfDraw) breakdown.push({ name: 'Self Draw', fan: 1 });
  let total = breakdown.reduce((s, b) => s + b.fan, 0);
  total = Math.min(13, total);
  return { total, breakdown };
}

export function pointsFromFan(fan: number): number {
  return Math.pow(2, fan) * 10;
}

/** Tiles to remove from hand for a chow including the called discard */
export function findChowTiles(hand: MahjongTile[], called: MahjongTile): MahjongTile[] | null {
  if (called.suit === 'wind' || called.suit === 'dragon') return null;
  const v = called.value as number;
  const suit = called.suit;
  const fromHand = (value: number): MahjongTile | undefined =>
    hand.find((t) => t.suit === suit && t.value === value);

  const tries: [number, number][] = [
    [v - 2, v - 1],
    [v - 1, v + 1],
    [v + 1, v + 2],
  ];
  for (const [a, b] of tries) {
    if (a < 1 || b > 9) continue;
    const t1 = fromHand(a);
    const t2 = fromHand(b);
    if (t1 && t2 && t1.id !== t2.id) return [t1, t2];
  }
  return null;
}
