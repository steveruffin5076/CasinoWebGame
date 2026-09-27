/* =============================================================================
   mahjong.ts — Hong Kong Mahjong table (UI + flow). Virtual stage 1000 x 700.
   You sit at the bottom (East in hand 1); bots at right / top / left.
   Turn order: bottom → right → top → left (counter-clockwise).
   ========================================================================== */

import './mahjong.css';
import { el, fmt, sleep, on, fitStage, reducedMotion, chance, buzz } from '../core/utils';
import { wallet } from '../core/chips';
import { sfx } from '../core/audio';
import { save } from '../core/storage';
import { fx, toast, bigWin } from '../core/fx';
import { topBar, Seat, modal } from '../core/ui';
import { go } from '../core/router';
import { roster } from '../core/personalities';
import { tileFaceSvg, sortTiles, info, tileName, isSuited, type TileId } from './tiles';
import {
  countsOf,
  decompose,
  canWin,
  shanten,
  scoreWin,
  tileIndex,
  type Meld,
  type ScoreResult,
} from './scoring';
import {
  mahjongBotDiscard,
  mahjongBotPung,
  mahjongBotKong,
  mahjongBotChow,
  mahjongBotChowTiles,
  concealedKongTile,
} from '../ai/mahjongBot';
import { MahjongGame, DEAD_WALL } from './engine';

const SW = 1000;
const SH = 700;

const WIND_LABEL = ['East', 'South', 'West', 'North'];
const WIND_LETTER = ['E', 'S', 'W', 'N'];

/** bot seats: 1 = right, 2 = top, 3 = left */
const BOT_POS = [
  { av: { x: 940, y: 330 }, tiles: { x: 880, y: 330 }, melds: { x: 880, y: 450 }, horiz: true },
  { av: { x: 700, y: 52 }, tiles: { x: 700, y: 132 }, melds: { x: 500, y: 132 }, horiz: false },
  { av: { x: 60, y: 330 }, tiles: { x: 120, y: 330 }, melds: { x: 120, y: 450 }, horiz: true },
];
const YOU_AV = { x: 210, y: 640 };
const RIVER = { x: 500, y: 330 };
const WALL_DRAW = { x: 500, y: 210 };

export function mountMahjong(root: HTMLElement): () => void {
  const difficulty = save.settings().difficulty.mahjong;
  const bots = roster(3, 'mj-' + difficulty);
  const game = new MahjongGame(['You', ...bots.map((b) => b.name)], 0);

  /* ------------------------------- skeleton ------------------------------ */
  const bar = topBar({ title: '🀄 HK Mahjong', sub: '136 tiles · No flowers', onBack: () => go('lobby') });
  const wrap = el('div', 'stage-wrap');
  const stage = el('div', 'stage');
  wrap.appendChild(stage);

  const table = el('div', 'mj-table');
  table.innerHTML = `
    <div class="mj-centre">
      <div class="mj-wind-disc"><span class="w">E</span><span class="lbl">Round Wind</span></div>
      <div class="mj-wall-count"><div class="n num">0</div><div class="l">Tiles in wall</div></div>
    </div>
    <div class="mj-river"></div>`;
  stage.appendChild(table);
  const windEl = table.querySelector('.mj-wind-disc .w') as HTMLElement;
  const wallEl = table.querySelector('.mj-wall-count .n') as HTMLElement;
  const riverEl = table.querySelector('.mj-river') as HTMLElement;

  // river slots (6 x 4)
  for (let i = 0; i < 24; i++) riverEl.appendChild(el('div', 'slot'));

  // seats
  const seats: Seat[] = [
    new Seat({ name: 'You', avatar: 'vic', x: YOU_AV.x, y: YOU_AV.y, you: true }),
    ...bots.map((b, i) => new Seat({ name: `${b.name} ${b.emoji}`, avatar: b.avatar, x: BOT_POS[i].av.x, y: BOT_POS[i].av.y })),
  ];
  seats.forEach((s) => stage.appendChild(s.el));

  // bot tile backs + melds
  const botTiles = BOT_POS.map((p) => {
    const r = el('div', `mj-bot-tiles${p.horiz ? ' horiz' : ''}`);
    r.style.left = `${p.tiles.x}px`;
    r.style.top = `${p.tiles.y}px`;
    stage.appendChild(r);
    return r;
  });
  const botMelds = BOT_POS.map((p) => {
    const r = el('div', 'mj-bot-melds');
    r.style.left = `${p.melds.x}px`;
    r.style.top = `${p.melds.y}px`;
    stage.appendChild(r);
    return r;
  });

  // your hand + melds
  const handRow = el('div', 'mj-hand-row');
  stage.appendChild(handRow);
  const meldsEl = el('div', 'mj-melds');
  meldsEl.style.cssText = `left:auto;right:26px;bottom:22px;`;
  stage.appendChild(meldsEl);

  /* -------------------------------- dock -------------------------------- */
  const dock = el('div', 'game-dock');
  const msg = el('div', 'msg-bar', 'Preparing the wall…');
  const tools = el('div', 'row');
  const sortBtn = el('button', 'btn btn-glass btn-sm', '⇅ Sort');
  sortBtn.type = 'button';
  tools.append(sortBtn);
  dock.append(msg, tools);
  root.append(bar.el, wrap, dock);

  const callBar = el('div', 'mj-call-bar hidden');
  const callTimer = el('div', 'mj-timer', '<i style="width:100%"></i>');
  dock.insertBefore(callBar, tools);

  /* ----------------------------- rendering ------------------------------- */

  let selected: TileId | null = null;
  let myTurn = false;

  const tileNode = (t: TileId, small = false): HTMLElement => {
    const d = el('div', 'mj-tile');
    d.style.setProperty('--tw', small ? '44px' : '50px');
    d.style.setProperty('--th', small ? '58px' : '66px');
    d.innerHTML = tileFaceSvg(t);
    d.title = tileName(t);
    return d;
  };

  function renderHand(interactive: boolean) {
    handRow.innerHTML = '';
    const hand = sortTiles(game.players[0].hand);
    game.players[0].hand = hand;
    const sh = shanten(hand, game.players[0].melds.length);
    hand.forEach((t) => {
      const d = tileNode(t);
      if (interactive) {
        d.classList.add('playable');
        const press = (e: PointerEvent) => {
          e.preventDefault();
          if (!myTurn) return;
          if (selected === t) {
            void humanDiscard(t);
          } else {
            selected = t;
            [...handRow.children].forEach((c) => c.classList.remove('sel'));
            d.classList.add('sel');
            sfx.click();
          }
        };
        on(d, 'pointerdown', press);
        // drag-up to discard
        let startY = 0;
        let dragging = false;
        on(d, 'pointerdown', (e) => {
          startY = e.clientY;
          dragging = true;
        });
        on(d, 'pointermove', (e) => {
          if (!dragging || !myTurn) return;
          if (startY - e.clientY > 46) {
            dragging = false;
            void humanDiscard(t);
          }
        });
        on(d, 'pointerup', () => (dragging = false));
      } else {
        d.classList.add('dim');
      }
      handRow.appendChild(d);
    });
    const hintTxt = sh <= 0 ? 'TENPAI — ready!' : sh === 1 ? '1 away' : `${sh} away`;
    msg.innerHTML = myTurn
      ? `Your turn — tap a tile twice (or drag up) to discard · <b class="cyan">${hintTxt}</b>`
      : `Hand: <b class="cyan">${hintTxt}</b>`;
  }

  function renderMelds() {
    meldsEl.innerHTML = '';
    game.players[0].melds.forEach((m) => {
      const g = el('div', `grp${m.kind === 'kong' ? ' kong' : ''}`);
      m.tiles.forEach((t) => g.appendChild(tileNode(t)));
      meldsEl.appendChild(g);
    });
    botMelds.forEach((r, i) => {
      const p = game.players[i + 1];
      r.innerHTML = '';
      p.melds.forEach((m) => {
        const g = el('div', 'grp');
        for (let k = 0; k < m.tiles.length; k++) g.appendChild(el('i'));
        r.appendChild(g);
      });
    });
  }

  function renderBots() {
    botTiles.forEach((r, i) => {
      const p = game.players[i + 1];
      r.innerHTML = '';
      const n = Math.min(p.hand.length, 13);
      for (let k = 0; k < n; k++) r.appendChild(el('i'));
    });
  }

  function renderRiver() {
    riverEl.querySelectorAll('.mj-tile').forEach((n) => n.remove());
    let seatIdx = game.lastDiscard ? game.lastDiscard.seat : 0;
    void seatIdx;
    // simple chronological fill: all discards in seat order slots
    const all: TileId[] = [];
    // interleave per seat so the river reads naturally (simplified: one shared river)
    game.players.forEach((p) => all.push(...p.discards));
    const slots = [...riverEl.children] as HTMLElement[];
    all.slice(-24).forEach((t, i) => {
      const d = tileNode(t, true);
      d.style.cursor = 'default';
      slots[i].appendChild(d);
    });
    setWind();
    wallEl.textContent = fmt(game.liveWall);
  }

  function setWind() {
    windEl.textContent = WIND_LETTER[game.roundWind];
  }

  function stageToClient(x: number, y: number) {
    const r = stage.getBoundingClientRect();
    const s = r.width / SW;
    return { x: r.left + x * s, y: r.top + y * s, scale: s };
  }

  /** flying tile animation */
  function flyTile(t: TileId, from: { x: number; y: number }, to: { x: number; y: number }, small = false) {
    if (reducedMotion()) return;
    const a = stageToClient(from.x, from.y);
    const b = stageToClient(to.x, to.y);
    const d = el('div', 'mj-fly');
    const w = (small ? 44 : 50) * a.scale;
    const h = (small ? 58 : 66) * a.scale;
    d.style.cssText += `width:${w}px;height:${h}px;left:0;top:0;`;
    const inner = el('div', 'mj-tile');
    inner.style.setProperty('--tw', `${w}px`);
    inner.style.setProperty('--th', `${h}px`);
    inner.innerHTML = tileFaceSvg(t);
    d.appendChild(inner);
    document.body.appendChild(d);
    const anim = d.animate(
      [
        { transform: `translate3d(${a.x - w / 2}px, ${a.y - h / 2}px, 0) rotate(0deg) scale(1.05)`, opacity: 0.95 },
        { transform: `translate3d(${b.x - w / 2}px, ${b.y - h / 2}px, 0) rotate(${(Math.random() - 0.5) * 14}deg) scale(1)`, opacity: 1 },
      ],
      { duration: 300, easing: 'cubic-bezier(.22,.85,.24,1)', fill: 'forwards' },
    );
    anim.onfinish = () => d.remove();
    anim.oncancel = () => d.remove();
  }

  const handAnchor = () => ({ x: SW / 2, y: SH - 50 });
  const botAnchor = (seat: number) =>
    seat === 0 ? handAnchor() : { x: BOT_POS[seat - 1].tiles.x, y: BOT_POS[seat - 1].tiles.y };

  /* -------------------------------- flow --------------------------------- */

  let busy = true;
  let timerId = 0;

  async function startHand() {
    busy = true;
    selected = null;
    myTurn = false;
    msg.textContent = 'Building the wall…';
    sfx.shuffle();
    const { hands } = game.startHand();
    void hands;
    renderBots();
    renderMelds();
    renderRiver();
    renderHand(false);
    setWind();
    seats.forEach((s) => s.setState(''));
    msg.innerHTML = `Hand <b>${game.handNo} of ${game.totalHands}</b> · Round wind <b>${WIND_LABEL[game.roundWind]}</b> · You are <b>${WIND_LABEL[game.seatWind(0)]}</b>`;
    await sleep(1200);
    busy = false;
    await turnLoop(game.turn, true);
  }

  /** One player's draw+discard cycle. Returns when the hand ends or passes on. */
  async function turnLoop(seat: number, first = false): Promise<void> {
    if (game.over) return;
    if (game.liveWall <= 0 && !first) {
      await exhaustiveDraw();
      return;
    }
    game.turn = seat;
    seats.forEach((s, i) => s.setState(i === seat ? 'active' : ''));

    // draw
    const tile = game.draw();
    if (!tile) {
      await exhaustiveDraw();
      return;
    }
    const p = game.players[seat];
    p.hand.push(tile);
    flyTile(tile, WALL_DRAW, botAnchor(seat));
    sfx.tile();
    if (seat === 0) {
      renderHand(false);
      await sleep(420);
      // concealed kong offer?
      const kongTile = concealedKongTile(p.hand);
      const canHu = canWin(p.hand.filter((_, i) => i !== p.hand.length - 1), p.melds.length, tile) ||
        canWinHand(p.hand, p.melds.length);
      const opts: string[] = [];
      if (canHu) opts.push('Hu');
      if (kongTile) opts.push('Kong');
      if (opts.length) {
        const choice = await askCalls(opts, `${tileName(tile)} drawn`);
        if (choice === 'Hu') {
          await winHand(0, tile, true);
          return;
        }
        if (choice === 'Kong' && kongTile) {
          await doConcealedKong(0, kongTile);
          return;
        }
      }
      myTurn = true;
      renderHand(true);
      msg.innerHTML = `Your turn — tap a tile twice (or drag up) to discard`;
      sfx.turn();
      buzz();
      return; // wait for human discard
    }
    // bot turn
    renderBots();
    await sleep(420);
    seats[seat].setState('think');
    await sleep(500 + Math.random() * 700);
    // bot self-draw win?
    if (canWinHand(p.hand, p.melds.length)) {
      await winHand(seat, tile, true);
      return;
    }
    const kongTile = concealedKongTile(p.hand);
    if (kongTile && mahjongBotKong({ hand: p.hand, melds: p.melds.length, visible: visibleTiles() }, kongTile, difficulty)) {
      await doConcealedKong(seat, kongTile);
      return;
    }
    const discard = mahjongBotDiscard({ hand: p.hand, melds: p.melds.length, visible: visibleTiles() }, difficulty);
    await doDiscard(seat, discard);
  }

  function canWinHand(hand: TileId[], melds: number): boolean {
    if (hand.length % 3 !== 2) return false;
    return decompose(hand) !== null && hand.length + melds * 3 === 14;
  }

  function visibleTiles(): TileId[] {
    const vis: TileId[] = [];
    game.players.forEach((p) => {
      vis.push(...p.discards);
      p.melds.forEach((m) => vis.push(...m.tiles));
    });
    vis.push(...game.players[0].hand);
    return vis;
  }

  async function humanDiscard(t: TileId) {
    if (!myTurn || busy) return;
    myTurn = false;
    busy = true;
    selected = null;
    await doDiscard(0, t);
    busy = false;
  }

  /** Discard + call resolution + advance. */
  async function doDiscard(seat: number, tile: TileId): Promise<void> {
    const p = game.players[seat];
    // remove ONE instance
    const i = p.hand.indexOf(tile);
    if (i >= 0) p.hand.splice(i, 1);
    p.discards.push(tile);
    game.lastDiscard = { tile, seat };
    flyTile(tile, botAnchor(seat), RIVER, true);
    sfx.tile();
    if (seat === 0) renderHand(false);
    else renderBots();
    renderRiver();
    await sleep(460);

    // ---- call resolution: win > pung/kong > chow ----
    const order = [1, 2, 3].map((k) => (seat + k) % 4);
    // 1) wins
    for (const s of order) {
      const q = game.players[s];
      if (q.hand.length + q.melds.length * 3 !== 13) continue;
      if (!canWin(q.hand, q.melds.length, tile)) continue;
      if (s === 0) {
        const take = await askCalls(['Hu', 'Pass'], `${tileName(tile)} discarded`);
        if (take === 'Hu') {
          await winHand(0, tile, false, seat);
          return;
        }
        continue;
      }
      await winHand(s, tile, false, seat);
      return;
    }
    // 2) pung / kong
    for (const s of order) {
      const q = game.players[s];
      const ctx = { hand: q.hand, melds: q.melds.length, visible: visibleTiles() };
      const hasTriple = q.hand.filter((t) => t === tile).length;
      if (s === 0) {
        const opts: string[] = [];
        if (hasTriple === 2) opts.push('Pung');
        if (hasTriple === 3) opts.push('Kong');
        if (opts.length) {
          const take = await askCalls([...opts, 'Pass'], `${tileName(tile)} discarded`);
          if (take === 'Pung') {
            await doCall(0, tile, 'pung', seat);
            return;
          }
          if (take === 'Kong') {
            await doCall(0, tile, 'kong', seat);
            return;
          }
        }
        continue;
      }
      if (hasTriple === 3 && mahjongBotKong(ctx, tile, difficulty)) {
        await doCall(s, tile, 'kong', seat);
        return;
      }
      if (hasTriple >= 2 && mahjongBotPung(ctx, tile, difficulty)) {
        await doCall(s, tile, 'pung', seat);
        return;
      }
    }
    // 3) chow (only from previous player in turn order)
    const prev = game.prevSeat(seat);
    const pq = game.players[prev];
    const canChow = (s: number, q: typeof pq) => {
      if (s !== prev || !isSuited(tile)) return false;
      const t = info(tile);
      const prefix = tile[0];
      for (let lo = t.rank - 2; lo <= t.rank; lo++) {
        if (lo < 1 || lo + 2 > 9) continue;
        const need: TileId[] = [];
        for (let x = lo; x <= lo + 2; x++) if (x !== t.rank) need.push(`${prefix}${x}`);
        if (need.every((n) => q.hand.includes(n))) return true;
      }
      return false;
    };
    if (canChow(prev, pq)) {
      if (prev === 0) {
        const take = await askCalls(['Chow', 'Pass'], `${tileName(tile)} discarded`);
        if (take === 'Chow') {
          await doCall(0, tile, 'chow', seat);
          return;
        }
      } else if (mahjongBotChow({ hand: pq.hand, melds: pq.melds.length, visible: visibleTiles() }, tile, difficulty)) {
        await doCall(prev, tile, 'chow', seat);
        return;
      }
    }

    // no calls: next player draws
    await turnLoop(game.nextSeat(seat));
  }

  /** Apply a called meld; caller then continues their turn. */
  async function doCall(seat: number, tile: TileId, kind: 'pung' | 'kong' | 'chow', from: number): Promise<void> {
    const p = game.players[seat];
    const word = kind === 'pung' ? 'Pung! 🀄' : kind === 'kong' ? 'KONG!! 🔥' : 'Chow~';
    seats[seat].say(word, 1500);
    sfx.call();
    fx.sparkle(...(Object.values(stageToClient(...(Object.values(botAnchor(seat)) as [number, number]))) as [number, number]), 12, '#22d3ee');

    // take the tile off the discarder's pile
    const dstack = game.players[from].discards;
    dstack.splice(dstack.lastIndexOf(tile), 1);

    let tiles: TileId[];
    if (kind === 'chow') {
      tiles = seat === 0 ? humanChowTiles(tile) : mahjongBotChowTiles({ hand: p.hand, melds: p.melds.length, visible: visibleTiles() }, tile);
    } else {
      tiles = [];
      const need = kind === 'pung' ? 2 : 3;
      for (let k = 0; k < need; k++) {
        const idx = p.hand.lastIndexOf(tile);
        tiles.push(p.hand.splice(idx, 1)[0]);
      }
    }
    const meld: Meld = { kind, tiles: [...tiles, tile], concealed: false, from: tile };
    p.melds.push(meld);
    if (seat === 0) {
      renderHand(false);
      renderMelds();
    } else {
      renderBots();
      renderMelds();
    }
    renderRiver();
    await sleep(650);

    if (kind === 'kong') {
      // replacement tile
      const rep = game.drawReplacement();
      if (!rep) {
        await exhaustiveDraw();
        return;
      }
      p.hand.push(rep);
      flyTile(rep, WALL_DRAW, botAnchor(seat));
      sfx.tile();
      if (seat === 0) renderHand(false);
      else renderBots();
      await sleep(420);
      if (canWinHand(p.hand, p.melds.length)) {
        await winHand(seat, rep, true);
        return;
      }
    }
    // caller must discard
    if (seat === 0) {
      myTurn = true;
      busy = false;
      renderHand(true);
      msg.textContent = 'Your call — now discard a tile';
      return;
    }
    seats[seat].setState('think');
    await sleep(600 + Math.random() * 500);
    const discard = mahjongBotDiscard({ hand: p.hand, melds: p.melds.length, visible: visibleTiles() }, difficulty);
    await doDiscard(seat, discard);
  }

  function humanChowTiles(tile: TileId): TileId[] {
    const t = info(tile);
    const prefix = tile[0];
    const hand = game.players[0].hand;
    for (let lo = t.rank - 2; lo <= t.rank; lo++) {
      if (lo < 1 || lo + 2 > 9) continue;
      const need: TileId[] = [];
      for (let x = lo; x <= lo + 2; x++) if (x !== t.rank) need.push(`${prefix}${x}`);
      if (need.every((n) => hand.includes(n))) return need;
    }
    return [];
  }

  async function doConcealedKong(seat: number, tile: TileId): Promise<void> {
    const p = game.players[seat];
    const tiles: TileId[] = [];
    for (let k = 0; k < 4; k++) {
      const idx = p.hand.lastIndexOf(tile);
      tiles.push(p.hand.splice(idx, 1)[0]);
    }
    p.melds.push({ kind: 'kong', tiles, concealed: true });
    seats[seat].say('Kong! (concealed) 🀄', 1500);
    sfx.call();
    if (seat === 0) {
      renderHand(false);
      renderMelds();
    } else {
      renderBots();
      renderMelds();
    }
    await sleep(500);
    const rep = game.drawReplacement();
    if (!rep) {
      await exhaustiveDraw();
      return;
    }
    p.hand.push(rep);
    flyTile(rep, WALL_DRAW, botAnchor(seat));
    sfx.tile();
    if (seat === 0) {
      renderHand(false);
      await sleep(380);
      if (canWinHand(p.hand, p.melds.length)) {
        await winHand(0, rep, true);
        return;
      }
      myTurn = true;
      busy = false;
      renderHand(true);
      msg.textContent = 'After your Kong — discard a tile';
      return;
    }
    renderBots();
    await sleep(500);
    if (canWinHand(p.hand, p.melds.length)) {
      await winHand(seat, rep, true);
      return;
    }
    const discard = mahjongBotDiscard({ hand: p.hand, melds: p.melds.length, visible: visibleTiles() }, difficulty);
    await doDiscard(seat, discard);
  }

  /* ------------------------------ call prompt ---------------------------- */

  function askCalls(options: string[], reason: string): Promise<string> {
    return new Promise((resolve) => {
      callBar.innerHTML = '';
      const lbl = el('span', 'tiny', reason);
      lbl.style.color = 'var(--gold-hi)';
      callBar.appendChild(lbl);
      const timerWrap = callTimer.cloneNode(true) as HTMLElement;
      const barFill = timerWrap.querySelector('i') as HTMLElement;
      options.forEach((opt) => {
        const b = el(
          'button',
          `btn btn-sm ${opt === 'Hu' ? 'btn-primary btn-pulse' : opt === 'Pass' ? 'btn-ghost' : 'btn-glass'}`,
          opt,
        );
        b.type = 'button';
        b.addEventListener('click', () => {
          window.clearInterval(timerId);
          callBar.classList.add('hidden');
          sfx.click();
          resolve(opt);
        });
        callBar.appendChild(b);
      });
      callBar.appendChild(timerWrap);
      callBar.classList.remove('hidden');
      sfx.turn();
      // 8 second countdown, auto-Pass at 0
      const T0 = performance.now();
      const DUR = 8000;
      let lastTick = 8;
      timerId = window.setInterval(() => {
        const left = DUR - (performance.now() - T0);
        const pct = Math.max(0, left / DUR);
        barFill.style.width = `${pct * 100}%`;
        timerWrap.classList.toggle('low', pct < 0.3);
        const secs = Math.ceil(left / 1000);
        if (secs < lastTick && secs <= 3 && secs > 0) {
          sfx.tick();
          lastTick = secs;
        }
        if (left <= 0) {
          window.clearInterval(timerId);
          callBar.classList.add('hidden');
          resolve('Pass');
        }
      }, 80);
    });
  }

  /* ------------------------------ hand ending ---------------------------- */

  async function winHand(seat: number, winTile: TileId, selfDraw: boolean, discarder = -1): Promise<void> {
    game.over = true;
    busy = true;
    myTurn = false;
    const p = game.players[seat];
    // on a self-draw the tile is already in the hand; on a discard win it isn't
    if (!selfDraw) p.hand.push(winTile);
    if (seat === 0) renderHand(false);
    else renderBots();

    // arrange + score
    const fullHand = [...p.hand];
    const decomp = decompose(fullHand);
    let result: ScoreResult;
    if (decomp) {
      const sets = [
        ...p.melds,
        ...decomp.sets.map((s) => ({ ...s, concealed: true })),
      ];
      result = scoreWin(sets, decomp.pair, game.seatWind(seat), game.roundWind, selfDraw);
    } else {
      result = { fan: 1, lines: [{ name: 'Winning Hand', fan: 1 }], points: 10, handName: 'Winning Hand' };
    }

    // payments
    const per = result.points;
    const payerTxt = selfDraw ? 'everyone pays' : `${game.players[discarder]?.name ?? '?'} pays`;
    const totalWin = per * 3;
    const lines = result.lines.map((l) => `<tr><td>${l.name}</td><td>${l.fan} fan</td></tr>`).join('');
    const isMe = seat === 0;

    seats[seat].setState('win');
    seats[seat].say(selfDraw ? 'Zimo! 🀄' : 'Hu! 🎉', 2200);

    if (isMe) {
      wallet.payout(totalWin);
      matchProfit += totalWin;
      sfx.win();
      fx.flash();
      fx.banner('MAHJONG!');
      const rc = stageToClient(SW / 2, SH / 2);
      fx.celebrate(rc.x, rc.y, 1.25);
      if (result.fan >= 8) bigWin(totalWin);
      save.record({
        gamesPlayed: 1,
        handsWon: 1,
        biggestWin: totalWin,
        biggestWinGame: 'mahjong',
        best: { mahjong: totalWin },
      });
    } else {
      let paid = 0;
      if (!selfDraw && discarder === 0) {
        paid = Math.min(wallet.balance, totalWin);
        wallet.spend(paid);
        seats[0].setState('lose');
      } else if (selfDraw) {
        paid = Math.min(wallet.balance, per);
        wallet.spend(paid);
      }
      matchProfit -= paid;
      game.players.forEach((q, i) => {
        if (i === seat) return;
        if (!selfDraw && i !== discarder) return;
        if (i !== 0) q.chips -= per;
      });
      game.players[seat].chips += totalWin;
      sfx.lose();
      seats[0].setState(discarder === 0 || selfDraw ? 'lose' : '');
      save.record({ gamesPlayed: 1, handsLost: discarder === 0 || selfDraw ? 1 : 0 });
    }
    window.dispatchEvent(new Event('neon:stats'));

    msg.innerHTML = `<b>${isMe ? 'You' : p.name}</b> win${isMe ? '' : 's'} — <b>${result.handName}</b> (${result.fan} fan, +${fmt(totalWin)})`;

    await sleep(1600);
    modal({
      title: `🀄 ${isMe ? 'You win' : `${p.name} wins`} — ${result.handName}`,
      body: `
        <table class="fan-table">
          ${lines}
          <tr class="total"><td>Total</td><td>${result.fan} fan</td></tr>
          <tr><td>Payout</td><td>${fmt(per)} × 3 = ${fmt(totalWin)} chips</td></tr>
          <tr><td>Payment</td><td>${payerTxt}</td></tr>
        </table>`,
      actions: [
        { label: 'Leave table', kind: 'ghost', onClick: () => go('lobby') },
        { label: game.matchOver ? 'See leaderboard' : 'Next hand', kind: 'primary', onClick: () => nextAfterHand() },
      ],
      dismissable: false,
    });
  }

  async function exhaustiveDraw(): Promise<void> {
    game.over = true;
    game.drawDead = true;
    busy = true;
    myTurn = false;
    msg.textContent = 'Wall exhausted — draw, no payment.';
    toast('Draw — the wall ran out');
    sfx.push();
    await sleep(1300);
    nextAfterHand();
  }

  function nextAfterHand() {
    if (game.matchOver) {
      showLeaderboard();
      return;
    }
    void startHand();
  }

  function showLeaderboard() {
    const rows = game.players
      .map((p, i) => ({ i, name: i === 0 ? 'You 💰' : `${bots[i - 1].name} ${bots[i - 1].emoji}`, chips: i === 0 ? tableProfit() : p.chips - 2000 }))
      .sort((a, b) => b.chips - a.chips);
    const medals = ['🥇', '🥈', '🥉', '🏅'];
    const meRank = rows.findIndex((r) => r.i === 0) + 1;
    const profit = tableProfit();
    modal({
      title: '🏁 Match complete — East-4',
      body: `<div>${rows
        .map((r, i) => `<div class="lb-row ${r.i === 0 ? 'me' : ''}"><span class="rank">${medals[i]}</span><span>${r.name}</span><b class="num">${r.chips >= 0 ? '+' : ''}${fmt(r.chips)}</b></div>`)
        .join('')}</div>
        <p class="muted" style="margin-top:10px">You finished #${meRank} with ${profit >= 0 ? '+' : ''}${fmt(profit)} chips.</p>`,
      actions: [
        { label: 'Back to lobby', kind: 'glass', onClick: () => go('lobby') },
        { label: 'New match', kind: 'primary', onClick: () => { game.handNo = 0; void startHand(); } },
      ],
      dismissable: false,
    });
  }

  /** your net chips for the match so far (wallet already updated live) */
  function tableProfit(): number {
    // track via stats: simplest is a running counter
    return matchProfit;
  }
  let matchProfit = 0;
  const origPayout = wallet.payout.bind(wallet);
  const origSpend = wallet.spend.bind(wallet);
  // wrap wallet to measure this table's profit
  wallet.payout = (n: number) => {
    matchProfit += n;
    origPayout(n);
  };
  wallet.spend = (n: number) => {
    const ok = origSpend(n);
    if (ok) matchProfit -= n;
    return ok;
  };

  /* ------------------------------ interactions --------------------------- */
  on(sortBtn, 'click', () => {
    sfx.click();
    game.players[0].hand = sortTiles(game.players[0].hand);
    handRow.classList.add('sorting');
    setTimeout(() => handRow.classList.remove('sorting'), 420);
    renderHand(myTurn);
  });

  /* -------------------------------- boot --------------------------------- */
  const unFit = fitStage(stage, wrap, SW, SH, 0);

  modal({
    title: '🀄 Hong Kong Mahjong',
    body: `<ul class="rules">
      <li>Full <b>136-tile</b> wall — Dots, Bams, Cracks, Winds and Dragons. <b>No flowers</b> (simplified HK variant).</li>
      <li>You start as <b>East</b>; the round wind rotates each hand. Match = 4 hands (East-1 → East-4).</li>
      <li>Turn: draw from the wall, then discard. Tap a tile twice — or drag it up — to discard.</li>
      <li>Calls: <b>Chow</b> (runs, only from the player before you), <b>Pung</b>, <b>Kong</b>, <b>Hu</b> (win). You get 8 seconds — otherwise auto-Pass.</li>
      <li>Scoring: simplified HK fan table, capped at 13 fan. Discarder pays on a win by discard; everyone pays on a self-draw.</li>
    </ul>`,
    actions: [
      { label: 'Back to lobby', kind: 'ghost', onClick: () => go('lobby') },
      { label: 'Break the wall', kind: 'primary', onClick: () => void startHand() },
    ],
    dismissable: false,
  });

  return () => {
    // restore wallet wrappers
    wallet.payout = origPayout;
    wallet.spend = origSpend;
    unFit();
    bar.destroy();
    window.clearInterval(timerId);
    seats.forEach((s) => s.destroy());
  };
}

/** helper: count copies of a tile in hand (UI convenience) */
const countIn = (hand: TileId[], t: TileId) => hand.filter((x) => x === t).length;
void countIn;
void DEAD_WALL;
void countsOf;
void tileIndex;
