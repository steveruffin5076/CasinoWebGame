/* =============================================================================
   poker.ts — Texas Hold'em table (UI layer). Virtual stage 1100 x 700.
   You sit at seat 0 (bottom); five bots fill the rest of the 6-max table.
   ========================================================================== */

import './poker.css';
import { el, fmt, sleep, on, fitStage, buzz, reducedMotion } from '../core/utils';
import { wallet } from '../core/chips';
import { sfx } from '../core/audio';
import { save } from '../core/storage';
import { fx, toast, bigWin } from '../core/fx';
import { topBar, Seat, modal } from '../core/ui';
import { go } from '../core/router';
import { roster } from '../core/personalities';
import { CardPool, type CardView } from '../assets/cards';
import { chipStackEl } from '../assets/chips';
import type { Card } from '../core/deck';
import { PokerEngine, type PokerAction } from './engine';
import { pokerBotDecide } from '../ai/pokerBot';
import { evaluate, holeLabel } from './handEval';

const SW = 1100;
const SH = 700;

/** table geometry in stage coords */
const SEAT_POS = [
  { av: { x: 430, y: 652 }, hole: { x: 640, y: 648 }, bet: { x: 550, y: 516 }, puck: { x: 330, y: 585 }, cw: 86 },
  { av: { x: 132, y: 555 }, hole: { x: 238, y: 548 }, bet: { x: 318, y: 468 }, puck: { x: 175, y: 470 }, cw: 56 },
  { av: { x: 102, y: 295 }, hole: { x: 195, y: 330 }, bet: { x: 268, y: 350 }, puck: { x: 160, y: 400 }, cw: 56 },
  { av: { x: 330, y: 62 }, hole: { x: 330, y: 152 }, bet: { x: 425, y: 235 }, puck: { x: 420, y: 110 }, cw: 56 },
  { av: { x: 770, y: 62 }, hole: { x: 770, y: 152 }, bet: { x: 675, y: 235 }, puck: { x: 680, y: 110 }, cw: 56 },
  { av: { x: 998, y: 295 }, hole: { x: 905, y: 330 }, bet: { x: 832, y: 350 }, puck: { x: 940, y: 400 }, cw: 56 },
];
const BOARD_Y = 330;
const DECK_SRC = { x: 985, y: 200 };

export function mountPoker(root: HTMLElement): () => void {
  const difficulty = save.settings().difficulty.poker;
  const bots = roster(5, 'pk-' + difficulty);
  const eng = new PokerEngine(['You', ...bots.map((b) => b.name)], 0);

  /* ------------------------------- skeleton ------------------------------ */
  const bar = topBar({
    title: '♥️ Texas Hold’em',
    sub: '6-max · No limit',
    onBack: () => go('lobby'),
  });
  const wrap = el('div', 'stage-wrap');
  const stage = el('div', 'stage');
  wrap.appendChild(stage);

  const table = el('div', 'pk-table');
  table.innerHTML = `<div class="pk-rails"></div>
    <div class="pk-pot"><div class="glow"></div><div class="amt num">0</div><div class="lbl">Pot</div></div>
    <div class="pk-board"></div>
    <div class="pk-info"></div>`;
  stage.appendChild(table);
  const potAmt = table.querySelector('.pk-pot .amt') as HTMLElement;
  const boardEl = table.querySelector('.pk-board') as HTMLElement;
  const infoEl = table.querySelector('.pk-info') as HTMLElement;

  // board slots
  const slots: HTMLElement[] = [];
  for (let i = 0; i < 5; i++) {
    const s = el('div', 'slot');
    boardEl.appendChild(s);
    slots.push(s);
  }

  // dealer puck
  const puck = el('div', 'pk-puck', 'D');
  stage.appendChild(puck);

  // seats + hole anchors + bet chips + action tags
  const seats: Seat[] = [];
  const betEls: HTMLElement[] = [];
  const actEls: HTMLElement[] = [];
  SEAT_POS.forEach((sp, i) => {
    const s = new Seat({
      name: i === 0 ? 'You' : `${bots[i - 1].name} ${bots[i - 1].emoji}`,
      avatar: i === 0 ? 'vic' : bots[i - 1].avatar,
      x: sp.av.x,
      y: sp.av.y,
      you: i === 0,
      max: 2000,
    });
    stage.appendChild(s.el);
    seats.push(s);

    const bet = el('div', 'pk-bet');
    bet.style.left = `${sp.bet.x}px`;
    bet.style.top = `${sp.bet.y}px`;
    stage.appendChild(bet);
    betEls.push(bet);

    const act = el('div', 'pk-act hidden', '');
    act.style.left = `${sp.bet.x}px`;
    act.style.top = `${sp.bet.y + 34}px`;
    stage.appendChild(act);
    actEls.push(act);
  });

  // cards
  const pool = new CardPool(stage);
  const holeViews = new Map<string, CardView>(); // `${seat}-${cardId}`
  const boardViews: (CardView | null)[] = [null, null, null, null, null];

  // your hand-strength hint
  const hint = el('div', 'pk-hint hidden', '');
  stage.appendChild(hint);

  /* -------------------------------- dock -------------------------------- */
  const dock = el('div', 'game-dock');
  const msg = el('div', 'msg-bar', 'Welcome to the table');
  const btnRow = el('div', 'row');
  const foldBtn = el('button', 'btn btn-danger', 'Fold');
  const checkBtn = el('button', 'btn btn-glass', 'Check');
  const raiseBtn = el('button', 'btn btn-primary', 'Raise');
  foldBtn.type = checkBtn.type = raiseBtn.type = 'button';
  btnRow.append(foldBtn, checkBtn, raiseBtn);

  const raiseBox = el('div', 'pk-raise-box hidden');
  const raiseVal = el('div', 'val num', '0');
  const slider = el('input', 'pk-slider') as HTMLInputElement;
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = '0';
  slider.step = '10';
  const presets = el('div', 'pk-presets');
  const presetDefs: [string, () => number][] = [];
  raiseBox.append(raiseVal, slider, presets);
  dock.append(msg, btnRow, raiseBox);
  root.append(bar.el, wrap, dock);

  let sliderTo = 0;
  const syncSliderFill = () => {
    const min = Number(slider.min);
    const max = Number(slider.max);
    slider.style.setProperty('--fill', `${max > min ? ((sliderTo - min) / (max - min)) * 100 : 0}%`);
  };

  /* ------------------------------ rendering ------------------------------ */

  function setPot() {
    potAmt.textContent = fmt(eng.potOnTable);
  }

  function setInfo() {
    const hand = eng.handNo;
    infoEl.innerHTML = `<span class="badge">Hand #${hand}</span><span class="badge cyan">Blinds ${eng.blindLabel}</span>${
      eng.minRaise > eng.bigBlind ? `<span class="badge mag">Min raise ${fmt(eng.minRaise)}</span>` : ''
    }`;
  }

  function setPuck() {
    const p = SEAT_POS[eng.dealerSeat];
    puck.style.left = `${p.puck.x}px`;
    puck.style.top = `${p.puck.y}px`;
  }

  function setBets() {
    eng.players.forEach((p) => {
      const bet = betEls[p.seat];
      bet.innerHTML = '';
      if (p.betStreet > 0) {
        bet.appendChild(chipStackEl(p.betStreet, 34));
        const a = el('span', 'amt num', fmt(p.betStreet));
        bet.appendChild(a);
      }
    });
    setPot();
  }

  function setStacks() {
    eng.players.forEach((p) => seats[p.seat].setStack(p.stack, 2000));
  }

  function showAction(seat: number, text: string) {
    const a = actEls[seat];
    a.textContent = text;
    a.classList.remove('hidden', 'fold', 'raise', 'allin');
    if (text === 'Fold') a.classList.add('fold');
    else if (text.startsWith('Raise') || text.startsWith('Bet')) a.classList.add('raise');
    else if (text === 'All-In') a.classList.add('allin');
  }
  const clearActions = () => actEls.forEach((a) => a.classList.add('hidden'));

  function updateHint() {
    const me = eng.players[0];
    if (!me.hole.length || me.folded) {
      hint.classList.add('hidden');
      return;
    }
    hint.classList.remove('hidden');
    if (!eng.board.length) {
      hint.textContent = holeLabel(me.hole);
      return;
    }
    const ev = evaluate([...me.hole, ...eng.board]);
    // draw detection (flush draw)
    const suits = [...me.hole, ...eng.board];
    const cnt: Record<string, number> = {};
    for (const c of suits) cnt[c.s] = (cnt[c.s] ?? 0) + 1;
    const draw = eng.board.length < 5 && Object.values(cnt).some((n) => n === 4) ? ' · Flush Draw' : '';
    hint.textContent = `${ev.name}${draw}`;
  }

  /** place a player's hole cards */
  function layoutHole(seat: number, faceUp: boolean) {
    const p = eng.players[seat];
    const sp = SEAT_POS[seat];
    p.hole.forEach((c, i) => {
      const key = `${seat}-${c.id}`;
      let v = holeViews.get(key);
      if (!v) {
        v = pool.take();
        v.setSize(sp.cw);
        holeViews.set(key, v);
      }
      v.set(c, faceUp);
      const rot = seat === 0 ? (i === 0 ? -6 : 6) : i === 0 ? -5 : 5;
      const x = sp.hole.x - sp.cw / 2 + i * (sp.cw * 0.55);
      const y = sp.hole.y - sp.cw * 0.7;
      v.el.style.zIndex = String(10 + i);
      v.place(x, y, rot, { duration: 300 });
    });
  }

  async function dealHoleAnimated() {
    for (let round = 0; round < 2; round++) {
      for (const p of eng.dealable()) {
        const c = p.hole[round];
        const sp = SEAT_POS[p.seat];
        const key = `${p.seat}-${c.id}`;
        const v = pool.take();
        v.setSize(sp.cw);
        v.set(c, p.isHuman);
        holeViews.set(key, v);
        const rot = p.seat === 0 ? (round === 0 ? -6 : 6) : round === 0 ? -5 : 5;
        const x = sp.hole.x - sp.cw / 2 + round * (sp.cw * 0.55);
        const y = sp.hole.y - sp.cw * 0.7;
        v.el.style.zIndex = String(10 + round);
        v.dealFrom(DECK_SRC.x, DECK_SRC.y, x, y, rot, 0);
        if (p.isHuman) v.flip(true, 200);
        sfx.deal();
        await sleep(reducedMotion() ? 24 : 90);
      }
    }
  }

  async function dealBoardAnimated(cards: Card[]) {
    const start = eng.board.length - cards.length;
    for (let i = 0; i < cards.length; i++) {
      const v = pool.take();
      v.setSize(76);
      v.set(cards[i], false);
      boardViews[start + i] = v;
      const slotRect = slots[start + i];
      // place over the slot
      const x = BOARD_X(start + i);
      v.el.style.zIndex = '8';
      v.dealFrom(DECK_SRC.x, DECK_SRC.y, x, slotRectTop(), 0, 0);
      v.flip(true, 220);
      sfx.deal();
      sfx.flip();
      await sleep(reducedMotion() ? 30 : 240);
    }
    updateHint();
  }

  /** board slot x in stage coords (board is centred at 550) */
  const BOARD_X = (i: number) => 550 - (5 * 76 + 4 * 10) / 2 + i * (76 + 10);
  const slotRectTop = () => {
    const r = boardEl.getBoundingClientRect();
    const s = r.width / (5 * 76 + 4 * 10);
    void s;
    // board element is positioned by CSS at the table; compute stage coords:
    return BOARD_Y;
  };

  function clearHand() {
    holeViews.forEach((v) => pool.release(v));
    holeViews.clear();
    boardViews.forEach((v, i) => {
      if (v) pool.release(v);
      boardViews[i] = null;
    });
    clearActions();
    betEls.forEach((b) => (b.innerHTML = ''));
    hint.classList.add('hidden');
  }

  /* -------------------------------- flow --------------------------------- */

  let handRunning = false;
  let humanResolve: (() => void) | null = null;

  async function playHand() {
    handRunning = true;
    hideDock();
    clearHand();
    const { holes } = eng.startHand();
    void holes;
    setPuck();
    setInfo();
    setStacks();
    setBets();
    msg.innerHTML = `Hand #${eng.handNo} — blinds <b>${eng.blindLabel}</b>`;
    // blind chip fx
    eng.players.forEach((p) => {
      if (p.lastAction === 'SB' || p.lastAction === 'BB') {
        showAction(p.seat, p.lastAction);
        const r = stagePt(betEls[p.seat]);
        fx.flyChips({ x: r.x - 60, y: r.y - 60 }, r, 10, 2, 0);
        sfx.chip();
      }
    });
    await sleep(500);
    sfx.shuffle();
    await dealHoleAnimated();
    setStacks();
    setBets();
    updateHint();

    // betting + streets
    while (true) {
      if (eng.activeNotFolded().length <= 1) break;
      await bettingRound();
      if (eng.activeNotFolded().length <= 1) break;
      if (eng.street === 'river') break;
      if (eng.runoutNeeded) {
        // all-in runout: reveal everything
        revealAll();
        msg.innerHTML = `<b>All-In!</b> Running out the board…`;
        await sleep(900);
      }
      const cards = eng.dealStreet();
      eng.finishStreet();
      setBets();
      sfx.flip();
      await dealBoardAnimated(cards);
      msg.textContent = `Board: ${eng.board.map((c) => c.r).join(' ')} — ${eng.street}`;
      await sleep(500);
    }

    if (eng.activeNotFolded().length <= 1) {
      await foldoutEnd();
    } else {
      await showdownEnd();
    }
    handRunning = false;
  }

  async function bettingRound() {
    clearActions();
    while (!eng.bettingDone()) {
      if (eng.activeNotFolded().length <= 1) return;
      const seat = eng.turn;
      const p = eng.players[seat];
      if (p.folded || p.allIn || p.sittingOut) {
        eng.advanceTurn();
        continue;
      }
      seats.forEach((s, i) => s.setState(i === seat ? 'active' : ''));
      if (p.isHuman) {
        msg.innerHTML = `Your turn — pot <b class="num">${fmt(eng.potOnTable)}</b>`;
        sfx.turn();
        buzz();
        await humanAction(seat);
      } else {
        await botAction(seat);
      }
      setBets();
      setStacks();
      if (eng.activeNotFolded().length <= 1) return;
      eng.advanceTurn();
      await sleep(180);
    }
    clearActions();
    seats.forEach((s) => s.setState(''));
  }

  async function botAction(seat: number) {
    const p = eng.players[seat];
    seats[seat].setState('think');
    seats[seat].say('…', 1200);
    // 1.5-3s "thinking" delay so it feels real (spec)
    await sleep(1500 + Math.random() * 1500);
    const bot = bots[seat - 1];
    const dec = pokerBotDecide(eng, seat, difficulty, bot.aggression);
    eng.apply(seat, dec.action);
    showAction(seat, p.lastAction);
    seats[seat].say(dec.say ?? '', 1400);
    if (dec.action.kind === 'fold') {
      seats[seat].setState('lose');
      ghostHole(seat);
    } else if (dec.action.kind === 'raise' || dec.action.kind === 'allin') {
      sfx.chip();
      const r = stagePt(betEls[seat]);
      fx.flyChips({ x: r.x - 70, y: r.y - 70 }, r, 100, 3, 0);
    } else if (dec.action.kind === 'call') {
      sfx.chip();
    }
  }

  function ghostHole(seat: number) {
    holeViews.forEach((v, key) => {
      if (key.startsWith(`${seat}-`)) v.ghost(true);
    });
  }

  function revealAll() {
    eng.players.forEach((p) => {
      if (!p.folded && p.hole.length) layoutHole(p.seat, true);
    });
  }

  /* ------------------------------ human action --------------------------- */

  function hideDock() {
    btnRow.classList.add('hidden');
    raiseBox.classList.add('hidden');
  }
  function showDock() {
    btnRow.classList.remove('hidden');
  }

  function humanAction(seat: number): Promise<void> {
    return new Promise((resolve) => {
      humanResolve = resolve;
      showDock();
      const legal = new Set(eng.legalActions(seat));
      const toCall = eng.amountToCall(seat);

      // fold / check-call
      foldBtn.disabled = !legal.has('fold');
      checkBtn.disabled = !(legal.has('check') || legal.has('call'));
      checkBtn.innerHTML = toCall > 0 ? `Call ${fmt(toCall)}` : 'Check';

      // raise
      const canRaise = legal.has('raise') || legal.has('allin');
      raiseBtn.classList.toggle('hidden', !canRaise);
      if (canRaise) {
        const min = Math.min(eng.minRaiseTo(seat), eng.maxRaiseTo(seat));
        const max = eng.maxRaiseTo(seat);
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(Math.max(1, eng.bigBlind / 2));
        sliderTo = min;
        slider.value = String(min);
        raiseVal.textContent = fmt(min);
        syncSliderFill();
        const isAllIn = min >= max;
        raiseBtn.innerHTML = isAllIn ? `All-In ${fmt(max)}` : `Raise to ${fmt(min)}`;
        // presets
        presets.innerHTML = '';
        presetDefs.length = 0;
        const addPreset = (label: string, fn: () => number) => {
          const b = el('button', '', label);
          b.type = 'button';
          b.addEventListener('click', () => {
            sliderTo = Math.max(min, Math.min(max, fn()));
            slider.value = String(sliderTo);
            raiseVal.textContent = fmt(sliderTo);
            syncSliderFill();
            sfx.click();
          });
          presets.appendChild(b);
        };
        addPreset('Min', () => min);
        addPreset('½ Pot', () => eng.currentBet + Math.round((eng.potOnTable + toCall) / 2));
        addPreset('Pot', () => eng.currentBet + eng.potOnTable + toCall);
        addPreset('All-In', () => max);
        raiseBox.classList.remove('hidden');
      } else {
        raiseBox.classList.add('hidden');
      }
    });
  }

  const applyHuman = (kind: PokerAction['kind'], to?: number) => {
    if (!humanResolve) return;
    const seat = 0;
    const legal = new Set(eng.legalActions(seat));
    if (!legal.has(kind)) return;
    const p = eng.players[seat];
    eng.apply(seat, { kind, to });
    showAction(seat, p.lastAction);
    if (kind === 'fold') {
      seats[0].setState('lose');
      ghostHole(0);
      sfx.click();
    } else if (kind === 'raise' || kind === 'allin') {
      sfx.chip();
      const r = stagePt(betEls[0]);
      fx.flyChips({ x: r.x - 70, y: r.y - 70 }, r, 100, 3, 0);
      seats[0].say(p.lastAction === 'All-In' ? 'All in! 😤' : '', 1300);
    } else if (kind === 'call') {
      sfx.chip();
    }
    hideDock();
    const done = humanResolve;
    humanResolve = null;
    done();
  };

  foldBtn.addEventListener('click', () => applyHuman('fold'));
  checkBtn.addEventListener('click', () => applyHuman(eng.amountToCall(0) > 0 ? 'call' : 'check'));
  raiseBtn.addEventListener('click', () => applyHuman(sliderTo >= eng.maxRaiseTo(0) ? 'allin' : 'raise', sliderTo));
  slider.addEventListener('input', () => {
    sliderTo = Number(slider.value);
    raiseVal.textContent = fmt(sliderTo);
    const max = eng.maxRaiseTo(0);
    raiseBtn.innerHTML = sliderTo >= max ? `All-In ${fmt(max)}` : `Raise to ${fmt(sliderTo)}`;
    syncSliderFill();
  });

  /* ------------------------------- endings ------------------------------- */

  async function foldoutEnd() {
    const winnerSeat = eng.foldout();
    const w = eng.players[winnerSeat];
    seats[winnerSeat].setState('win');
    seats[winnerSeat].say('Thank you 🤑', 1600);
    setStacks();
    setPot();
    msg.innerHTML = `<b>${winnerSeat === 0 ? 'You' : w.name}</b> take${winnerSeat === 0 ? '' : 's'} the pot (<b class="num">${fmt(w.won ?? 0)}</b>)`;
    sfx.coins();
    await payoutFx(winnerSeat, w.won ?? 0);
    await endHand();
  }

  async function showdownEnd() {
    revealAll();
    msg.textContent = 'Showdown!';
    await sleep(900);
    const { pots, reveals } = eng.showdown();
    void reveals;
    setStacks();
    setPot();

    // highlight the winning 5 cards
    const winners = [...new Set(pots.flatMap((pot) => pot.winners))];
    const bestSeat = winners[0];
    const bestRank = eng.players[bestSeat]?.rank;
    if (bestRank) {
      const ids = new Set(bestRank.best.map((c) => c.id));
      holeViews.forEach((v) => {
        const cardId = v.card?.id;
        if (!cardId) return;
        if (ids.has(cardId)) v.highlight(true);
        else v.ghost(true);
      });
    }
    // reveal winners' names + hands
    const lines = pots
      .map((pot) => {
        const names = pot.winners.map((i) => (i === 0 ? 'You' : eng.players[i].name)).join(' & ');
        const hand = eng.players[pot.winners[0]]?.rank?.name ?? '';
        return `<div class="pk-winner-row"><span class="nm">${names}</span><span class="spacer"></span><span class="hand">${hand}</span><b class="num">+${fmt(pot.amount)}</b></div>`;
      })
      .join('');
    msg.innerHTML = `<b>${pots.map((p) => p.winners.map((i) => (i === 0 ? 'You' : eng.players[i].name)).join(' & ')).join(', ')}</b> win the pot`;

    winners.forEach((i) => {
      seats[i].setState('win');
      seats[i].say(i === 0 ? 'Ship it! 🚀' : 'Read you like a book 😎', 1800);
    });
    if (winners.includes(0)) {
      sfx.win();
      fx.flash();
      const r = stagePt(betEls[0]);
      fx.celebrate(r.x, r.y, 1);
      const profit = (eng.players[0].won ?? 0) - eng.players[0].committed;
      if (profit > 0) fx.floatText(r.x, r.y - 40, `+${fmt(profit)}`);
      if (profit >= eng.bigBlind * 25) bigWin(profit);
    } else {
      sfx.lose();
      seats[0].setState('lose');
    }
    await payoutFx(winners[0], eng.players[winners[0]]?.won ?? 0);
    await sleep(400);
    modal({
      title: '🏆 Showdown',
      body: `<div>${lines}</div>`,
      actions: [
        { label: 'Leave table', kind: 'ghost', onClick: () => leaveTable() },
        { label: 'Next hand', kind: 'primary' },
      ],
    });
    await endHand();
  }

  async function payoutFx(seat: number, amount: number) {
    if (amount <= 0) return;
    const r = stagePt(betEls[seat]);
    fx.flyChips({ x: SW / 2, y: BOARD_Y }, r, amount >= 500 ? 500 : 100, 5, 0);
    sfx.coins();
    await sleep(500);
  }

  async function endHand() {
    // stats
    const me = eng.players[0];
    const profit = (me.won ?? 0) - me.committed;
    save.record({
      gamesPlayed: 1,
      handsWon: me.won != null && me.won > 0 ? 1 : 0,
      handsLost: me.won == null || me.won === 0 ? (me.committed > 0 ? 1 : 0) : 0,
      biggestWin: profit > 0 ? profit : 0,
      biggestWinGame: profit > 0 ? 'poker' : undefined,
      best: { poker: profit > 0 ? profit : 0 },
    });
    window.dispatchEvent(new Event('neon:stats'));
    setStacks();

    // blinds-up toast
    if (eng.handNo % 10 === 0) toast(`Blinds up! Now ${eng.blindLabel}`, '', 2600);

    // bust handling
    const broke = eng.players.filter((p) => p.stack <= 0 && !p.sittingOut);
    broke.forEach((p) => {
      p.sittingOut = true;
      seats[p.seat].setState('lose');
      seats[p.seat].setName(`${p.name} 💺`);
    });
    if (me.stack <= 0) {
      modal({
        title: 'You busted',
        body: `<p class="muted" style="margin:0;line-height:1.55">Your table stack is gone. Buy back in for 1,000 chips or cash out and head to the lobby.</p>`,
        actions: [
          { label: 'Leave table', kind: 'glass', onClick: () => leaveTable() },
          {
            label: 'Buy in again',
            kind: 'primary',
            onClick: () => {
              if (wallet.spend(1000)) {
                me.stack = 1000;
                me.sittingOut = false;
                seats[0].setName('You');
                seats[0].setState('');
                setStacks();
                void playHand();
              } else {
                toast('Not enough chips in your wallet — grab a refill in the lobby', 'bad');
                leaveTable();
              }
            },
          },
        ],
        dismissable: false,
      });
      return;
    }
    const others = eng.players.filter((p) => p.seat !== 0 && !p.sittingOut);
    if (!others.length) {
      bigWin(me.stack);
      modal({
        title: '👑 You cleared the table!',
        body: `<p style="margin:0;line-height:1.55">Every bot busted. You cash out with <b class="num">${fmt(me.stack)}</b> chips.</p>`,
        actions: [{ label: 'Cash out', kind: 'primary', onClick: () => leaveTable() }],
        dismissable: false,
      });
      return;
    }
    // auto-continue with a comfortable pause (modal already has Next hand)
    const cont = () => {
      if (!handRunning) void playHand();
    };
    window.setTimeout(cont, 400);
  }

  function stagePt(elm: HTMLElement) {
    const r = elm.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ------------------------------- keyboard ------------------------------ */
  const keyHandler = (e: KeyboardEvent) => {
    if (!humanResolve) return;
    const k = e.key.toLowerCase();
    if (k === 'f') applyHuman('fold');
    else if (k === 'c') applyHuman(eng.amountToCall(0) > 0 ? 'call' : 'check');
    else if (k === 'r') raiseBtn.click();
  };
  window.addEventListener('keydown', keyHandler);

  /* -------------------------------- leave -------------------------------- */

  let left = false;
  function leaveTable() {
    if (left) return;
    left = true;
    const me = eng.players[0];
    if (me.stack > 0) wallet.payout(me.stack);
    go('lobby');
  }

  /* -------------------------------- boot --------------------------------- */
  const unFit = fitStage(stage, wrap, SW, SH, 0);

  const buyIn = Math.min(1000, wallet.balance);
  const canSit = wallet.balance >= 200;

  if (!canSit) {
    modal({
      title: 'Not enough chips',
      body: `<p class="muted" style="margin:0;line-height:1.55">The Hold'em table needs at least <b>200</b> chips to sit down. Grab your daily bonus or a free refill in the lobby first.</p>`,
      actions: [{ label: 'Back to lobby', kind: 'primary', onClick: () => go('lobby') }],
      dismissable: false,
    });
  } else {
    modal({
      title: '♥️ Texas Hold’em — 6-max',
      body: `<ul class="rules">
        <li>Everyone starts with <b>1,000</b> chips. Blinds <b>10/20</b>, doubling every 10 hands.</li>
        <li>Your buy-in: <b class="num">${fmt(buyIn)}</b> chips (cash out any time from the top bar).</li>
        <li>Actions: Fold / Check / Call / Raise (slider + presets) / All-In.</li>
        <li>Side pots are handled automatically when someone is all-in.</li>
        <li>Keyboard: <span class="kbd">F</span> fold · <span class="kbd">C</span> check/call · <span class="kbd">R</span> raise.</li>
      </ul>`,
      actions: [
        { label: 'Back out', kind: 'ghost', onClick: () => go('lobby') },
        {
          label: 'Take a seat',
          kind: 'primary',
          onClick: () => {
            wallet.spend(buyIn);
            eng.players[0].stack = buyIn;
            setStacks();
            void playHand();
          },
        },
      ],
      dismissable: false,
    });
  }

  return () => {
    unFit();
    window.removeEventListener('keydown', keyHandler);
    bar.destroy();
    clearHand();
    seats.forEach((s) => s.destroy());
    // cash out if leaving mid-session
    if (!left && eng.players[0]?.stack > 0) {
      wallet.payout(eng.players[0].stack);
      left = true;
    }
  };
}
