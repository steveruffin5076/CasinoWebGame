/* =============================================================================
   lobby.ts — the casino floor. Neon hero, four game cards (each with unique
   SVG gradient art), daily bonus, free refill, stats and difficulty pickers.
   ========================================================================== */

import './lobby.css';
import { el, fmt, on } from '../core/utils';
import { wallet } from '../core/chips';
import { sfx } from '../core/audio';
import { save, DAILY_BONUS, BONUS_MS, REFILL_AT, type GameId, type Difficulty } from '../core/storage';
import { fx, toast, bigWin } from '../core/fx';
import { topBar, modal, type TopBar } from '../core/ui';
import { go } from '../core/router';
import { ticker } from '../core/loop';
import { gameArt } from './gameArt';

/* ------------------------------ game registry ----------------------------- */

interface GameDef {
  id: GameId;
  name: string;
  emoji: string;
  tagline: string;
  desc: string;
  players: string;
  route: string;
  rules: string[];
}

const GAMES: GameDef[] = [
  {
    id: 'blackjack',
    name: 'Blackjack',
    emoji: '♠️',
    tagline: 'Pays 3 to 2',
    desc: 'Six-deck shoe, Vegas rules. Split, double, take insurance — beat the dealer to 21.',
    players: 'You vs 3 bots + dealer',
    route: 'blackjack',
    rules: [
      'Six-deck shoe, reshuffled at 75% penetration.',
      'Dealer stands on all 17s. Blackjack pays 3:2.',
      'Double Down on any first two cards.',
      'Split once (equal-value pairs).',
      'Insurance offered when the dealer shows an Ace (pays 2:1).',
      'Keyboard: H = Hit, S = Stand, D = Double.',
    ],
  },
  {
    id: 'poker',
    name: "Texas Hold'em",
    emoji: '♥️',
    tagline: 'Blinds 10 / 20',
    desc: 'Six-max table, rotating dealer button, side pots and showdown highlights.',
    players: 'You vs 5 bots',
    route: 'poker',
    rules: [
      'Six-max table. Everyone starts with 1,000 chips.',
      'Blinds 10/20, doubling every 10 hands.',
      'Preflop, Flop, Turn, River, Showdown.',
      'Fold / Check / Call / Raise (slider + presets) / All-In.',
      'Side pots supported when someone is all-in.',
      'Your current hand strength is shown live; the winning 5 cards glow at showdown.',
    ],
  },
  {
    id: 'mahjong',
    name: 'HK Mahjong',
    emoji: '🀄',
    tagline: 'Hong Kong rules',
    desc: 'Full 136-tile wall. Chow, Pung, Kong and Hu with simplified fan scoring.',
    players: 'You vs 3 bots',
    route: 'mahjong',
    rules: [
      'Full 136 tiles: Dots, Bams, Cracks, Winds, Dragons. No Flowers (simplified HK variant).',
      'Deal 13, win on the 14th tile.',
      'Turn: draw from the wall, then discard.',
      'Calls: Chow (only from the player to your left), Pung, Kong (concealed or called), Hu (win).',
      'Valid call buttons appear with an 8-second timer; auto-Pass when it expires.',
      'Simplified Hong Kong fan table, capped at 13 fan. Discarder pays for a win on discard; all players pay on a self-draw.',
      'The seat winds rotate each hand; a match ends after East-4.',
    ],
  },
  {
    id: 'uno',
    name: 'UNO Classic',
    emoji: '🃏',
    tagline: 'First to 500',
    desc: 'The classic 108-card deck. Match colour or symbol, shout UNO, dodge the +4.',
    players: 'You vs 3 bots',
    route: 'uno',
    rules: [
      'Classic 108 cards, 7 dealt to each player.',
      'Match the top card by colour, number or symbol.',
      'Specials: Skip, Reverse, +2, Wild, Wild +4.',
      'Wild +4 is only legal when you hold no card of the current colour.',
      'No stacking (classic rules) — one +2 does not answer another.',
      'Press UNO! when you are down to one card, or draw +2 as a penalty.',
      'First to 0 cards wins the round and scores the points in everyone else\'s hand. First to 500 wins the match.',
    ],
  },
];

/* --------------------------------- hero ----------------------------------- */

function buildHero(): HTMLElement {
  const hero = el('section', 'hero glass');
  hero.innerHTML = `
    <h1 class="sign neon-sign">NEON CASINO</h1>
    <div class="tag">Private Gaming Salon · Virtual Chips Only</div>
    <div class="underline"></div>
    <div class="suit-field" aria-hidden="true"></div>`;
  const field = hero.querySelector('.suit-field') as HTMLElement;
  // 40 floating suit particles, GPU transforms only (hidden in low-fx mode)
  const suits = ['♠', '♥', '♦', '♣'];
  for (let i = 0; i < 40; i++) {
    const s = el('span', '', suits[i % 4]);
    s.style.left = `${(i / 40) * 100 + Math.random() * 2}%`;
    s.style.color = i % 4 < 2 ? 'rgba(212,175,55,.9)' : 'rgba(34,211,238,.9)';
    s.style.animationDuration = `${9 + Math.random() * 10}s`;
    s.style.animationDelay = `${-Math.random() * 18}s`;
    s.style.fontSize = `${14 + Math.random() * 16}px`;
    s.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    s.style.setProperty('--rot', `${(Math.random() - 0.5) * 520}deg`);
    field.appendChild(s);
  }
  return hero;
}

/* ------------------------------ game cards -------------------------------- */

function buildGameCard(g: GameDef): HTMLElement {
  const card = el('article', 'gcard glass');
  const art = el('div', 'art');
  art.innerHTML = gameArt(g.id);

  const body = el('div', 'body');
  body.innerHTML = `
    <div class="hd">
      <h3>${g.name}</h3>
      <span class="emo" role="img" aria-label="${g.name}">${g.emoji}</span>
    </div>
    <p class="desc">${g.desc}</p>
    <div class="meta">
      <span class="badge">${g.tagline}</span>
      <span class="badge cyan">${g.players}</span>
      <span class="badge" data-best>Best: 0</span>
    </div>
    <div class="seg" role="group" aria-label="Bot difficulty">
      <button type="button" data-d="easy" aria-pressed="false">Easy</button>
      <button type="button" data-d="normal" aria-pressed="true">Normal</button>
      <button type="button" data-d="hard" aria-pressed="false">Hard</button>
    </div>
    <button class="btn btn-primary play" type="button">Play ${g.emoji}</button>`;

  // difficulty state
  const seg = body.querySelector('.seg') as HTMLElement;
  const syncSeg = () => {
    const cur = save.settings().difficulty[g.id];
    seg.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(b.dataset.d === cur));
    });
  };
  syncSeg();
  seg.querySelectorAll('button').forEach((b) =>
    on(b as HTMLElement, 'click', () => {
      sfx.click();
      save.setDifficulty(g.id, b.dataset.d as Difficulty);
      syncSeg();
      toast(`Bots set to ${b.dataset.d} for ${g.name}`);
    }),
  );

  // best win badge
  const bestEl = body.querySelector('[data-best]') as HTMLElement;
  const syncBest = () => {
    const b = save.stats().best[g.id] ?? 0;
    bestEl.textContent = `Best: ${b > 0 ? fmt(b) : '—'}`;
  };
  syncBest();
  on(window, 'neon:stats', syncBest);

  const play = () => {
    sfx.click();
    if (wallet.balance < 10 && wallet.balance < REFILL_AT) {
      toast('Out of chips — claim a free refill first!', 'bad');
      return;
    }
    go(g.route);
  };
  on(body.querySelector('.play') as HTMLElement, 'click', play);

  // info button on the art header
  const info = el('button', 'info', 'i');
  info.type = 'button';
  info.setAttribute('aria-label', `${g.name} rules`);
  on(info, 'click', (e) => {
    e.stopPropagation();
    sfx.click();
    modal({
      title: `${g.emoji} ${g.name} — House Rules`,
      body: `<ul class="rules">${g.rules.map((r) => `<li>${r}</li>`).join('')}</ul>`,
      actions: [{ label: 'Deal me in', kind: 'primary' }],
    });
  });
  art.appendChild(info);

  card.append(art, body);
  return card;
}

/* ------------------------------- stats strip ------------------------------ */

function buildStats(): HTMLElement {
  const wrap = el('section', 'stats glass');
  const items: [string, string, () => string][] = [
    ['games-played', 'Games played', () => fmt(save.stats().gamesPlayed)],
    ['biggest-win', 'Biggest win', () => (save.stats().biggestWin > 0 ? `+${fmt(save.stats().biggestWin)}` : '—')],
    ['hands-won', 'Hands won', () => fmt(save.stats().handsWon)],
    ['win-rate', 'Win rate', () => {
      const { handsWon, handsLost } = save.stats();
      const t = handsWon + handsLost;
      return t === 0 ? '—' : `${Math.round((handsWon / t) * 100)}%`;
    }],
  ];
  const syncs: (() => void)[] = [];
  for (const [k, label, fn] of items) {
    const s = el('div', 'stat');
    s.innerHTML = `<div class="v num" data-v>${fn()}</div><div class="k">${label}</div>`;
    const v = s.querySelector('[data-v]') as HTMLElement;
    syncs.push(() => (v.textContent = fn()));
    s.dataset.stat = k;
    wrap.appendChild(s);
  }
  const sync = () => syncs.forEach((f) => f());
  on(window, 'neon:stats', sync);
  return wrap;
}

/* --------------------------------- lobby ---------------------------------- */

export function mountLobby(root: HTMLElement): () => void {
  const bar: TopBar = topBar({
    title: 'Neon Casino',
    sub: 'VIP Salon · No real money',
  });

  const scroll = el('div', 'lobby-scroll');
  const hero = buildHero();

  // daily bonus
  const bonusBtn = el('button', 'btn btn-bonus btn-sm', '🎁 Daily Bonus');
  bonusBtn.type = 'button';
  const syncBonus = () => {
    const last = save.data.lastBonus;
    const left = last + BONUS_MS - Date.now();
    if (left <= 0) {
      bonusBtn.disabled = false;
      bonusBtn.classList.add('ready');
      bonusBtn.textContent = `🎁 Daily Bonus +${fmt(DAILY_BONUS)}`;
    } else {
      bonusBtn.disabled = true;
      bonusBtn.classList.remove('ready');
      const h = Math.floor(left / 3600000);
      const m = Math.floor((left % 3600000) / 60000);
      const s = Math.floor((left % 60000) / 1000);
      bonusBtn.textContent = `🎁 Next in ${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
    }
  };
  syncBonus();
  const bonusTimer = window.setInterval(syncBonus, 1000);
  on(bonusBtn, 'click', () => {
    if (Date.now() - save.data.lastBonus < BONUS_MS) return;
    save.patch({ lastBonus: Date.now() });
    wallet.payout(DAILY_BONUS);
    syncBonus();
    const r = bonusBtn.getBoundingClientRect();
    fx.bonusBurst(r.left + r.width / 2, r.top + r.height / 2);
    bigWin(DAILY_BONUS);
  });
  (bar.el.querySelector('.tb-right') as HTMLElement).insertBefore(
    bonusBtn,
    bar.el.querySelector('.chip-pill') as HTMLElement,
  );

  // free refill (only when broke-ish)
  const refill = el('button', 'btn btn-glass btn-sm', '🩸 FREE REFILL');
  refill.type = 'button';
  const syncRefill = () => {
    refill.classList.toggle('hidden', wallet.balance >= REFILL_AT);
  };
  syncRefill();
  const offWallet = wallet.onChange(syncRefill);
  on(refill, 'click', () => {
    wallet.refill();
    sfx.win();
    toast('Balance refilled to 10,000 chips. Good luck! 🍀', 'good');
  });
  (bar.el.querySelector('.tb-right') as HTMLElement).appendChild(refill);

  // game grid
  const games = el('section', 'games');
  for (const g of GAMES) games.appendChild(buildGameCard(g));

  // footer actions
  const foot = el('div', 'lobby-foot');
  const resetBtn = el('button', 'btn btn-ghost btn-sm', 'Reset stats & chips');
  resetBtn.type = 'button';
  on(resetBtn, 'click', () => {
    modal({
      title: 'Reset everything?',
      body: `<p class="muted" style="margin:0;line-height:1.55">This clears your chip balance, stats and settings back to a fresh 10,000-chip bankroll. This cannot be undone.</p>`,
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        {
          label: 'Reset',
          kind: 'danger',
          onClick: () => {
            save.reset();
            wallet.set(save.data.balance);
            window.dispatchEvent(new Event('neon:stats'));
            toast('Fresh start — 10,000 chips loaded', 'good');
          },
        },
      ],
    });
  });
  foot.appendChild(resetBtn);
  const fpsBtn = el('button', 'btn btn-ghost btn-sm', '?fps=1 — FPS meter');
  fpsBtn.type = 'button';
  fpsBtn.title = 'Append ?fps=1 to the URL to see the FPS meter';
  on(fpsBtn, 'click', () => {
    const u = new URL(location.href);
    u.searchParams.set('fps', '1');
    location.href = u.toString();
  });
  foot.appendChild(fpsBtn);

  const disclaimer = el('p', 'disclaimer');
  disclaimer.innerHTML =
    'Neon Casino is a free-to-play game with <b>virtual chips only</b> — no real money, no purchases, no prizes. ' +
    'All art is drawn in code. All opponents are robots. 🤖';

  scroll.append(hero, games, buildStats(), foot, disclaimer);
  root.append(bar.el, scroll);

  // low-fx mode also hides the suit field via CSS; nothing else to do here
  if (ticker.low) document.documentElement.classList.add('lowfx');

  return () => {
    window.clearInterval(bonusTimer);
    offWallet();
    bar.destroy();
  };
}
