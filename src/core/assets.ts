/** Procedural card / tile textures — no external images */

export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface PlayingCard {
  suit: Suit;
  rank: Rank;
  faceUp: boolean;
  id: string;
}

const SUIT_SYM: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const SUIT_COLOR: Record<Suit, string> = {
  spades: '#e8e8ff',
  hearts: '#ff4d8d',
  diamonds: '#ff4d8d',
  clubs: '#e8e8ff',
};

let progress = 0;
let ready = false;

export function isAssetsReady(): boolean {
  return ready;
}

export function getLoadProgress(): number {
  return progress;
}

export async function preloadAssets(onProgress: (p: number, label: string) => void): Promise<void> {
  const steps = ['Cards', 'Chips', 'Mahjong', 'Tables'];
  for (let i = 0; i < steps.length; i++) {
    progress = (i + 1) / steps.length;
    onProgress(progress, steps[i]);
    await new Promise((r) => setTimeout(r, 60));
  }
  ready = true;
}

export function drawPlayingCard(
  ctx: CanvasRenderingContext2D,
  card: PlayingCard,
  x: number,
  y: number,
  w: number,
  h: number,
  scaleX = 1,
): void {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(scaleX, 1);
  ctx.translate(-w / 2, -h / 2);

  const r = 8;
  ctx.fillStyle = card.faceUp ? '#fffef8' : '#1a3a6e';
  ctx.strokeStyle = card.faceUp ? '#333' : '#c9a227';
  ctx.lineWidth = card.faceUp ? 1 : 2;
  roundRect(ctx, 0, 0, w, h, r);
  ctx.fill();
  ctx.stroke();

  if (card.faceUp) {
    const col = SUIT_COLOR[card.suit];
    ctx.fillStyle = col;
    ctx.font = `bold ${Math.floor(h * 0.22)}px system-ui`;
    ctx.textAlign = 'left';
    ctx.fillText(card.rank, 6, h * 0.28);
    ctx.font = `${Math.floor(h * 0.35)}px system-ui`;
    ctx.fillText(SUIT_SYM[card.suit], 6, h * 0.62);
    ctx.textAlign = 'right';
    ctx.font = `bold ${Math.floor(h * 0.22)}px system-ui`;
    ctx.fillText(card.rank, w - 6, h - 8);
  } else {
    ctx.strokeStyle = '#ffffff44';
    for (let i = 0; i < 3; i++) {
      ctx.strokeRect(10 + i * 4, 10 + i * 4, w - 20 - i * 8, h - 20 - i * 8);
    }
  }
  ctx.restore();
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createDeck(count = 1): PlayingCard[] {
  const suits: Suit[] = ['spades', 'hearts', 'diamonds', 'clubs'];
  const ranks: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck: PlayingCard[] = [];
  let id = 0;
  for (let d = 0; d < count; d++) {
    for (const suit of suits) {
      for (const rank of ranks) {
        deck.push({ suit, rank, faceUp: false, id: `c${id++}` });
      }
    }
  }
  return deck;
}

export function cardValue(rank: Rank): number {
  if (rank === 'A') return 11;
  if (['K', 'Q', 'J'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

export function drawChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  color: string,
  label?: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#fff8';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(8, r * 0.9)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (label) ctx.fillText(label, x, y);
  ctx.restore();
}

export type MahjongSuit = 'dots' | 'bams' | 'cracks' | 'wind' | 'dragon';
export type Wind = 'E' | 'S' | 'W' | 'N';
export type Dragon = 'red' | 'green' | 'white';

export interface MahjongTile {
  suit: MahjongSuit;
  value: number | Wind | Dragon;
  id: string;
}

export function createMahjongWall(): MahjongTile[] {
  const tiles: MahjongTile[] = [];
  let id = 0;
  for (const suit of ['dots', 'bams', 'cracks'] as MahjongSuit[]) {
    for (let v = 1; v <= 9; v++) {
      for (let c = 0; c < 4; c++) tiles.push({ suit, value: v, id: `m${id++}` });
    }
  }
  for (const w of ['E', 'S', 'W', 'N'] as Wind[]) {
    for (let c = 0; c < 4; c++) tiles.push({ suit: 'wind', value: w, id: `m${id++}` });
  }
  for (const d of ['red', 'green', 'white'] as Dragon[]) {
    for (let c = 0; c < 4; c++) tiles.push({ suit: 'dragon', value: d, id: `m${id++}` });
  }
  return tiles;
}

export function tileLabel(t: MahjongTile): string {
  if (t.suit === 'wind') return String(t.value);
  if (t.suit === 'dragon') return ({ red: '中', green: '發', white: '白' } as Record<string, string>)[t.value as string];
  const sym = { dots: '🀙', bams: '🀇', cracks: '🀀' }[t.suit];
  return `${sym}${t.value}`;
}

export function drawMahjongTile(ctx: CanvasRenderingContext2D, t: MahjongTile, x: number, y: number, w: number, h: number): void {
  ctx.save();
  ctx.fillStyle = '#f5f0e6';
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, 4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = t.suit === 'dragon' && t.value === 'red' ? '#c00' : t.suit === 'dragon' && t.value === 'green' ? '#060' : '#222';
  ctx.font = `bold ${Math.floor(h * 0.35)}px system-ui`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const label =
    t.suit === 'wind'
      ? String(t.value)
      : t.suit === 'dragon'
        ? ({ red: '中', green: '發', white: '白' } as Record<string, string>)[t.value as string]
        : `${t.value}`;
  ctx.fillText(label, x + w / 2, y + h / 2);
  ctx.restore();
}
