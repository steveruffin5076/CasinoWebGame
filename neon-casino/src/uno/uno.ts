/* =============================================================================
   uno.ts — the UNO arena (UI layer). Virtual stage 1000 x 640.
   ========================================================================== */

import './uno.css';
import { el, fmt, sleep, on, fitStage, reducedMotion, chance, buzz } from '../core/utils';
import { sfx } from '../core/audio';
import { save } from '../core/storage';
import { fx, toast } from '../core/fx';
import { topBar, Seat, modal } from '../core/ui';
import { go } from '../core/router';
import { roster } from '../core/personalities';
import {
  unoFaceSvg,
  unoBackSvg,
  cardLabel,
  COLOR_HEX,
  COLOR_NAME,
  COLOR_SHAPE,
  sortByColor,
  sortByNumber,
  type UnoCard,
  type UnoColor,
} from './faces';
import { UnoEngine } from './engine';
import { unoBotChoose, unoBotChatter, botPickColor } from '../ai/unoBot';

const SW = 1000;
const SH = 640;

const DECK_POS = { x: 362, y: 308 };
const DISCARD_POS = { x: 508, y: 308 };
const ORB_POS = { x: 648, y: 308 };
const DIR_POS = { x: 508, y: 172 };

/** bot seats: [left, top, right] */
const BOT_POS = [
  { av: { x: 78, y: 295 }, cards: { x: 78, y: 378 } },
  { av: { x: 508, y: 58 }, cards: { x: 508, y: 132 } },
  { av: { x: 922, y: 295 }, cards: { x: 922, y: 378 } },
];
const YOU_AV = { x: 84, y: 560 };

const CARD_W = 78;
const CARD_H = 117;

export function mountUno(root: HTMLElement): () => void {
  const difficulty = save.settings().difficulty.uno;
  const bots = roster(3, 'uno-' + difficulty);
  const eng = new UnoEngine(['You', ...bots.map((b) => b.name)], 0);

  /* ------------------------------- skeleton ------------------------------ */
  const bar = topBar({ title: '🃏 UNO Classic', sub: 'First to 500 · No stacking', onBack: () => go('lobby') });
  const wrap = el('div', 'stage-wrap');
  const stage = el('div', 'stage');
  wrap.appendChild(stage);

  const ambient = el('div', 'uno-ambient');
  stage.appendChild(ambient);

  const table = el('div', 'uno-table');
  table.innerHTML = `<div class="ring-mark"></div>`;
  stage.appendChild(table);

  // direction indicator
  const dir = el('div', 'uno-dir spin', '↻');
  dir.style.left = `${DIR_POS.x}px`;
  dir.style.top = `${DIR_POS.y}px`;
  stage.appendChild(dir);

  // colour orb
  const orb = el('div', 'uno-color-orb', '');
  orb.style.left = `${ORB_POS.x}px`;
  orb.style.top = `${ORB_POS.y}px`;
  stage.appendChild(orb);

  // deck
  const deckEl = el('div', 'uno-deck pulse');
  deckEl.innerHTML = `<span class="em">🂠</span><span class="count num"></span>`;
  deckEl.style.left = `${DECK_POS.x}px`;
  deckEl.style.top = `${DECK_POS.y}px`;
  stage.appendChild(deckEl);
  const deckCount = deckEl.querySelector('.count') as HTMLElement;

  // discard stack
  const discardEl = el('div');
  discardEl.style.cssText = `position:absolute;left:${DISCARD_POS.x}px;top:${DISCARD_POS.y}px;width:0;height:0;`;
  stage.appendChild(discardEl);

  // seats
  const seats: Seat[] = [
    new Seat({ name: 'You', avatar: 'vic', x: YOU_AV.x, y: YOU_AV.y, you: true }),
    ...bots.map((b, i) => new Seat({ name: `${b.name} ${b.emoji}`, avatar: b.avatar, x: BOT_POS[i].av.x, y: BOT_POS[i].av.y })),
  ];
  seats.forEach((s) => stage.appendChild(s.el));

  // bot mini card rows
  const botRows = BOT_POS.map((p) => {
    const r = el('div', 'uno-bot-cards');
    r.style.left = `${p.cards.x}px`;
    r.style.top = `${p.cards.y}px`;
    stage.appendChild(r);
    return r;
  });

  // your hand
  const handZone = el('div', 'uno-hand-zone');
  handZone.style.cssText = `bottom:4px;height:${CARD_H + 44}px;`;
  stage.appendChild(handZone);

  /* -------------------------------- dock -------------------------------- */
  const dock = el('div', 'game-dock');
  const msg = el('div', 'msg-bar', 'Shuffling…');
  const toolbar = el('div', 'uno-toolbar');
  const unoBtn = el('button', 'btn btn-uno', 'UNO!');
  unoBtn.type = 'button';
  const passBtn = el('button', 'btn btn-glass hidden', 'Pass');
  passBtn.type = 'button';
  const sortBtn = el('button', 'btn btn-glass btn-sm', '⇅ Sort: Colour');
  sortBtn.type = 'button';
  const targetBtn = el('button', 'btn btn-glass btn-sm', '🎯 First to 500');
  targetBtn.type = 'button';
  const scoreBtn = el('button', 'btn btn-glass btn-sm', '🏆 0 · 0 · 0 · 0');
  scoreBtn.type = 'button';
  toolbar.append(unoBtn, passBtn, sortBtn, targetBtn, scoreBtn);
  dock.append(msg, toolbar);
  root.append(bar.el, wrap, dock);

  let sortBy: 'color' | 'number' = 'color';
  let target: 'points' | 'best5' = 'points';
  const scores = [0, 0, 0, 0];
  let roundsPlayed = 0;
  let matchOver = false;
  let busy = true;
  /** set when the player pressed UNO while holding 2 cards (applies to next play) */
  let unoArmed = false;

  const syncScoreBtn = () => (scoreBtn.textContent = `🏆 ${scores.map((s) => fmt(s)).join(' · ')}`);

  /* ----------------------------- rendering ------------------------------- */

  function setAmbient() {
    const hex = COLOR_HEX[eng.currentColor];
    ambient.style.background = `radial-gradient(60% 60% at 50% 42%, ${hex.glow}, transparent 70%)`;
    orb.style.background = `radial-gradient(circle at 34% 30%, ${hex.a}, ${hex.b})`;
    orb.style.setProperty('--glow', hex.glow);
    orb.textContent = COLOR_SHAPE[eng.currentColor];
    orb.title = COLOR_NAME[eng.currentColor];
  }

  function setDir() {
    dir.classList.toggle('ccw', eng.dir === -1);
  }

  function syncDeck() {
    deckCount.textContent = `${eng.deck.length} left`;
    deckEl.classList.toggle('pulse', eng.turn === 0 && !busy && eng.playableIndices().length === 0 && !eng.over);
  }

  function sortHand(): UnoCard[] {
    const hand = sortBy === 'color' ? sortByColor(eng.players[0].hand) : sortByNumber(eng.players[0].hand);
    eng.players[0].hand = hand;
    return hand;
  }

  /** full re-render of your hand; `interactive` highlights legal taps */
  function renderHand(interactive: boolean) {
    handZone.innerHTML = '';
    const hand = sortHand();
    const n = hand.length;
    const maxW = 940;
    const spacing = n > 1 ? Math.min(58, (maxW - CARD_W) / (n - 1)) : 0;
    const total = CARD_W + spacing * (n - 1);
    const x0 = (SW - total) / 2;
    const mid = (n - 1) / 2;
    hand.forEach((c, i) => {
      const d = el('div', 'uno-card');
      d.innerHTML = unoFaceSvg(c);
      d.style.setProperty('--uw', `${CARD_W}px`);
      d.style.setProperty('--uh', `${CARD_H}px`);
      const rot = (i - mid) * Math.min(2.4, 24 / Math.max(1, n));
      const ty = Math.abs(i - mid) * Math.min(2.6, 26 / Math.max(1, n));
      const tx = x0 + i * spacing;
      d.style.setProperty('--tx', `${tx}px`);
      d.style.setProperty('--ty', `${ty}px`);
      d.style.setProperty('--rot', `${rot}deg`);
      d.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg)`;
      const playable = interactive && eng.canPlay(c);
      d.classList.toggle('playable', playable);
      d.classList.toggle('dim', interactive && !playable);
      if (playable) d.addEventListener('click', () => void humanPlay(c));
      handZone.appendChild(d);
    });
    // UNO button urgency
    const risk = eng.players[0].unoRisk;
    unoBtn.classList.toggle('urgent', risk || (n === 2 && eng.playableIndices().length > 0 && eng.turn === 0));
    unoBtn.disabled = !(n === 1 || n === 2);
  }

  function renderBotRows() {
    botRows.forEach((r, i) => {
      const p = eng.players[i + 1];
      r.innerHTML = '';
      const n = Math.min(p.hand.length, 7);
      for (let k = 0; k < n; k++) r.appendChild(el('i'));
      if (p.hand.length > 7) {
        const more = el('i');
        more.style.background = 'rgba(212,175,55,.25)';
        more.style.width = '22px';
        r.appendChild(more);
      }
      const tag = el('span', 'tiny num', `${p.hand.length}`);
      tag.style.cssText = 'margin-left:6px;color:var(--gold-hi);text-shadow:0 1px 3px #000;font-size:11px';
      r.appendChild(tag);
    });
  }

  /** adds a card visual to the discard stack (keeps last 6) */
  function pushDiscard(card: UnoCard, rot: number) {
    const d = el('div', 'uno-card');
    d.innerHTML = unoFaceSvg(card);
    d.style.setProperty('--uw', `${CARD_W}px`);
    d.style.setProperty('--uh', `${CARD_H}px`);
    d.style.position = 'absolute';
    d.style.transform = `translate3d(${-CARD_W / 2}px, ${-CARD_H / 2}px, 0) rotate(${rot}deg)`;
    d.style.zIndex = String(discardEl.childElementCount + 1);
    discardEl.appendChild(d);
    while (discardEl.childElementCount > 6) discardEl.firstElementChild?.remove();
  }

  function stageToClientXY(x: number, y: number) {
    const r = stage.getBoundingClientRect();
    const s = r.width / SW;
    return { x: r.left + x * s, y: r.top + y * s, scale: s };
  }

  const yourHandCenter = () => ({ x: SW / 2, y: SH - 76 });
  const botCardsPos = (seat: number) =>
    seat === 0 ? yourHandCenter() : { x: BOT_POS[seat - 1].cards.x, y: BOT_POS[seat - 1].cards.y };

  /** flying card-face animation between two stage points (viewport layer) */
  function flyFace(card: UnoCard, from: { x: number; y: number }, to: { x: number; y: number }, rot = 0) {
    const src = stageToClientXY(from.x, from.y);
    const dst = stageToClientXY(to.x, to.y);
    const d = el('div', 'uno-card');
    d.innerHTML = unoFaceSvg(card);
    d.style.position = 'fixed';
    d.style.left = '0';
    d.style.top = '0';
    d.style.width = `${src.scale * CARD_W}px`;
    d.style.height = `${src.scale * CARD_H}px`;
    d.style.setProperty('--uw', `${src.scale * CARD_W}px`);
    d.style.setProperty('--uh', `${src.scale * CARD_H}px`);
    d.style.zIndex = '860';
    d.style.pointerEvents = 'none';
    document.body.appendChild(d);
    const anim = d.animate(
      [
        {
          transform: `translate3d(${src.x - (src.scale * CARD_W) / 2}px, ${src.y - (src.scale * CARD_H) / 2}px, 0) rotate(0deg)`,
          opacity: 0.9,
        },
        {
          transform: `translate3d(${dst.x - (src.scale * CARD_W) / 2}px, ${dst.y - (src.scale * CARD_H) / 2}px, 0) rotate(${rot}deg)`,
          opacity: 1,
        },
      ],
      { duration: reducedMotion() ? 90 : 380, easing: 'cubic-bezier(.22,.85,.24,1)', fill: 'forwards' },
    );
    anim.onfinish = () => d.remove();
    anim.oncancel = () => d.remove();
  }

  /** flying card-BACK animation (draws, deals) */
  function flyBack(from: { x: number; y: number }, to: { x: number; y: number }) {
    const src = stageToClientXY(from.x, from.y);
    const dst = stageToClientXY(to.x, to.y);
    const d = el('div', 'uno-card');
    d.innerHTML = unoBackSvg();
    d.style.position = 'fixed';
    d.style.left = '0';
    d.style.top = '0';
    d.style.width = `${src.scale * CARD_W}px`;
    d.style.height = `${src.scale * CARD_H}px`;
    d.style.setProperty('--uw', `${src.scale * CARD_W}px`);
    d.style.setProperty('--uh', `${src.scale * CARD_H}px`);
    d.style.zIndex = '860';
    d.style.pointerEvents = 'none';
    document.body.appendChild(d);
    const anim = d.animate(
      [
        {
          transform: `translate3d(${src.x - (src.scale * CARD_W) / 2}px, ${src.y - (src.scale * CARD_H) / 2}px, 0) rotate(0deg)`,
        },
        {
          transform: `translate3d(${dst.x - (src.scale * CARD_W) / 2}px, ${dst.y - (src.scale * CARD_H) / 2}px, 0) rotate(${(Math.random() - 0.5) * 40}deg)`,
        },
      ],
      { duration: reducedMotion() ? 90 : 340, easing: 'cubic-bezier(.22,.85,.24,1)', fill: 'forwards' },
    );
    anim.onfinish = () => d.remove();
    anim.oncancel = () => d.remove();
  }

  /* -------------------------------- flow --------------------------------- */

  async function startRound() {
    busy = true;
    matchOver = false;
    msg.textContent = 'Dealing seven each…';
    sfx.shuffle();
    discardEl.innerHTML = '';
    handZone.innerHTML = '';
    passBtn.classList.add('hidden');
    const { first } = eng.startRound();
    setAmbient();
    setDir();
    syncDeck();
    renderBotRows();
    for (let r = 0; r < 7; r++) {
      for (let s = 0; s < 4; s++) {
        flyBack(DECK_POS, botCardsPos(s));
        sfx.deal();
        await sleep(55);
      }
    }
    renderHand(false);
    flyFace(first, DECK_POS, DISCARD_POS, -4);
    await sleep(360);
    pushDiscard(first, -4);
    sfx.slap();
    setAmbient();
    msg.innerHTML = `Starting colour: <b>${COLOR_NAME[eng.currentColor]}</b> ${COLOR_SHAPE[eng.currentColor]}`;
    await sleep(650);
    busy = false;
    nextTurn();
  }

  function nextTurn() {
    if (matchOver) return;
    if (eng.over) {
      void endRound();
      return;
    }
    const p = eng.players[eng.turn];
    seats.forEach((s, i) => s.setState(i === eng.turn ? 'active' : ''));
    syncDeck();
    if (p.isHuman) {
      renderHand(true);
      const canAny = eng.playableIndices().length > 0;
      msg.innerHTML = canAny
        ? `Your turn — match <b>${COLOR_NAME[eng.currentColor]}</b> ${COLOR_SHAPE[eng.currentColor]} · tap a glowing card`
        : `Your turn — no match, tap the deck to draw`;
      sfx.turn();
      buzz();
    } else {
      renderHand(false);
      void botTurn();
    }
  }

  async function botTurn() {
    const seat = eng.turn;
    const p = eng.players[seat];
    seats[seat].setState('think');
    seats[seat].say('…', 900);
    await sleep(900 + Math.random() * 1400);
    if (eng.over || matchOver) return;

    // catch the human if they forgot to shout UNO
    if (eng.players[0].unoRisk && chance(difficulty === 'easy' ? 0.25 : difficulty === 'normal' ? 0.5 : 0.8)) {
      eng.catchUno(0);
      seats[seat].say('Caught you! +2 😈', 1700);
      toast(`${p.name} caught you skipping UNO — draw 2!`, 'bad');
      sfx.lose();
      renderHand(eng.turn === 0);
      renderBotRows();
      await sleep(950);
    }

    const choice = unoBotChoose(eng, seat, difficulty);
    if (choice.index == null) {
      const c = eng.drawOne();
      seats[seat].say(unoBotChatter('draw'), 1100);
      flyBack(DECK_POS, botCardsPos(seat));
      sfx.deal();
      renderBotRows();
      syncDeck();
      await sleep(700);
      if (eng.canPlayDrawn(c)) {
        await sleep(500 + Math.random() * 600);
        await playCard(seat, c, c.color === 'w' ? botPickColor(eng, seat) : undefined);
        return;
      }
      eng.pass();
      msg.textContent = `${p.name} draws and passes`;
      await sleep(700);
      nextTurn();
      return;
    }
    // shout UNO before playing down to one card
    if (choice.shoutUno && chance(difficulty === 'easy' ? 0.75 : difficulty === 'normal' ? 0.9 : 0.98)) {
      eng.shoutUno(seat);
      seats[seat].say('UNO! 🎉', 1500);
      sfx.uno();
      await sleep(430);
    }
    await playCard(seat, p.hand[choice.index], choice.color);
  }

  /** Plays `card` for `seat` (card must still be in that player's hand). */
  async function playCard(seat: number, card: UnoCard, chosen?: UnoColor) {
    busy = true;
    const p = eng.players[seat];
    const idx = p.hand.findIndex((c) => c.uid === card.uid);
    if (idx < 0) {
      busy = false;
      return;
    }

    // hide the source card in your hand right away (visual only)
    if (seat === 0) {
      const nodes = [...handZone.children] as HTMLElement[];
      const nodeIdx = eng.players[0].hand.findIndex((c) => c.uid === card.uid);
      if (nodes[nodeIdx]) nodes[nodeIdx].style.visibility = 'hidden';
    }

    const from = botCardsPos(seat);
    const rot = -10 + Math.random() * 20;

    // +2/+4 shake over the victim before landing (spec beat)
    const isAttack = card.kind === 'd2' || card.kind === 'wd4';
    if (isAttack) {
      const victimSeat = eng.dir === 1 ? (seat + 1) % 4 : (seat + 3) % 4;
      const vc = botCardsPos(victimSeat);
      const sh = el('div', 'uno-card shake');
      sh.innerHTML = unoFaceSvg(card);
      sh.style.setProperty('--uw', `${CARD_W}px`);
      sh.style.setProperty('--uh', `${CARD_H}px`);
      sh.style.transform = `translate3d(${vc.x - CARD_W / 2}px, ${vc.y - CARD_H / 2}px, 0) scale(1.16)`;
      sh.style.zIndex = '700';
      stage.appendChild(sh);
      sfx.slap();
      await sleep(520);
      sh.remove();
    }

    flyFace(card, from, DISCARD_POS, rot);
    await sleep(reducedMotion() ? 90 : 360);
    pushDiscard(card, rot);
    sfx.slap();

    // engine applies the real splice + effects
    const res = eng.play(idx, chosen);
    setAmbient();
    renderBotRows();
    if (seat === 0) renderHand(false);
    syncDeck();

    // chatter per card kind
    if (card.color === 'w') {
      msg.innerHTML = `<b>${seat === 0 ? 'You' : p.name}</b> picked <b>${COLOR_NAME[eng.currentColor]}</b> ${COLOR_SHAPE[eng.currentColor]}`;
      seats[seat].say(`${COLOR_SHAPE[eng.currentColor]} ${COLOR_NAME[eng.currentColor]}`, 1300);
    } else if (card.kind === 'skip') {
      seats[seat].say('Skip! ⏭️', 1200);
    } else if (card.kind === 'rev') {
      seats[seat].say('Reverse! 🔄', 1200);
      setDir();
    } else if (card.kind === 'd2' || card.kind === 'wd4') {
      seats[seat].say(unoBotChatter('attack'), 1300);
    }
    if (res.skipped != null && card.kind !== 'skip') {
      const victim = eng.players[res.skipped];
      msg.innerHTML = `<b>${victim.name}</b> draws ${card.kind === 'wd4' ? 4 : 2} and is skipped 😖`;
    }

    if (eng.over) {
      busy = false;
      await sleep(650);
      void endRound();
      return;
    }

    // did the human just land on one card without shouting?
    if (seat === 0 && eng.players[0].hand.length === 1 && !eng.players[0].saidUno) {
      msg.innerHTML = `<b style="color:#fca5a5">Press UNO! before they catch you!</b>`;
    }

    await sleep(540);
    busy = false;
    nextTurn();
  }

  async function humanPlay(card: UnoCard) {
    if (busy || eng.turn !== 0 || eng.over) return;
    if (!eng.canPlay(card)) return;
    if (card.color === 'w') {
      if (card.kind === 'wd4' && eng.players[0].hand.some((c) => c.color === eng.currentColor && c.uid !== card.uid)) {
        toast('Wild +4 is only legal when you hold no cards of the current colour!', 'bad');
        return;
      }
      const color = await pickColor(card.kind === 'wd4');
      if (!color) return; // cancelled
      if (unoArmed && eng.players[0].hand.length === 2) eng.shoutUno(0);
      unoArmed = false;
      await playCard(0, card, color);
      return;
    }
    if (unoArmed && eng.players[0].hand.length === 2) eng.shoutUno(0);
    unoArmed = false;
    await playCard(0, card);
  }

  /* ------------------------------ deck draw ------------------------------ */
  const doDraw = async () => {
    if (busy || eng.turn !== 0 || eng.over) return;
    busy = true;
    const c = eng.drawOne();
    flyBack(DECK_POS, yourHandCenter());
    sfx.deal();
    renderHand(false);
    syncDeck();
    await sleep(520);
    if (eng.canPlayDrawn(c)) {
      msg.innerHTML = `You drew <b>${cardLabel(c)}</b> — tap it to play, or Pass`;
      // highlight only the drawn card
      const nodes = [...handZone.children] as HTMLElement[];
      const hand = eng.players[0].hand;
      nodes.forEach((nd, i) => {
        const hc = hand[i];
        const playable = hc && hc.uid === c.uid;
        nd.classList.toggle('playable', !!playable);
        nd.classList.toggle('dim', !playable);
        if (playable) nd.onclick = () => {
          passBtn.classList.add('hidden');
          void playCard(0, c);
        };
      });
      passBtn.classList.remove('hidden');
      busy = false;
      return;
    }
    msg.textContent = `Drew ${cardLabel(c)} — no play, passing`;
    eng.pass();
    await sleep(750);
    busy = false;
    nextTurn();
  };
  on(deckEl, 'click', () => void doDraw());
  on(passBtn, 'click', () => {
    sfx.click();
    passBtn.classList.add('hidden');
    eng.pass();
    busy = false;
    nextTurn();
  });

  /* ------------------------------- UNO button ---------------------------- */
  on(unoBtn, 'click', () => {
    const n = eng.players[0].hand.length;
    if (eng.turn !== 0 || !(n === 1 || n === 2)) return;
    eng.shoutUno(0);
    unoArmed = true;
    unoBtn.classList.remove('urgent');
    sfx.uno();
    const p = stageToClientXY(YOU_AV.x, YOU_AV.y);
    fx.sparkle(p.x, p.y, 16, '#f5e6b8');
    toast('UNO! 🎉', 'good');
  });

  /* catch bots who didn't shout: tap their seat */
  seats.slice(1).forEach((s, i) => {
    on(s.el, 'click', () => {
      if (eng.players[i + 1].unoRisk) {
        eng.catchUno(i + 1);
        s.say('Oops! +2 😳', 1400);
        toast(`Caught ${eng.players[i + 1].name} — they draw 2!`, 'good');
        sfx.call();
        renderBotRows();
      }
    });
  });

  /* ------------------------------ colour picker -------------------------- */
  function pickColor(isPlus4: boolean): Promise<UnoColor | null> {
    return new Promise((resolve) => {
      const m = modal({
        title: isPlus4 ? 'Wild +4 — pick a colour' : 'Wild — pick a colour',
        body: (() => {
          const box = el('div', 'uno-pick');
          for (const c of ['r', 'y', 'g', 'b'] as UnoColor[]) {
            const b = el('button', '', COLOR_SHAPE[c]);
            b.type = 'button';
            b.setAttribute('aria-label', COLOR_NAME[c]);
            b.addEventListener('click', () => {
              sfx.click();
              resolve(c);
              m.close();
            });
            box.appendChild(b);
          }
          return box;
        })(),
        dismissable: true,
        onClose: () => resolve(null),
      });
      void m;
    });
  }

  /* ------------------------------ round end ------------------------------ */
  async function endRound() {
    const winner = eng.roundWinner ?? 0;
    const pts = eng.scoreRound();
    scores[winner] += pts;
    roundsPlayed++;
    syncScoreBtn();
    const name = winner === 0 ? 'You' : eng.players[winner].name;
    msg.innerHTML = `<b>${name}</b> win${winner === 0 ? '' : 's'} the round — <b class="num">+${fmt(pts)}</b> pts`;
    seats[winner].setState('win');
    if (winner === 0) {
      seats[winner].say(unoBotChatter('win'), 1900);
      sfx.win();
      fx.flash('rgba(212,175,55,.9)');
      fx.banner('UNO!');
      const rc = stageToClientXY(SW / 2, SH / 2);
      fx.celebrate(rc.x, rc.y, 1.2);
      save.record({ gamesPlayed: 1, handsWon: 1, biggestWin: pts, biggestWinGame: 'uno', best: { uno: pts } });
    } else {
      seats[winner].say(unoBotChatter('win'), 1900);
      seats[0].setState('lose');
      sfx.lose();
      save.record({ gamesPlayed: 1, handsLost: 1 });
    }
    window.dispatchEvent(new Event('neon:stats'));

    const targetReached = target === 'points' ? scores[winner] >= 500 : roundsPlayed >= 5;
    await sleep(1500);

    if (targetReached) {
      matchOver = true;
      const humanWon = winner === 0;
      modal({
        title: humanWon ? '🏆 You win the match!' : `${eng.players[winner].name} wins the match`,
        body:
          scoreboardHtml() +
          `<p class="muted" style="margin-top:12px">Match over after ${roundsPlayed} round${roundsPlayed > 1 ? 's' : ''}.</p>`,
        actions: [
          { label: 'Back to lobby', kind: 'glass', onClick: () => go('lobby') },
          { label: 'Play again', kind: 'primary', onClick: () => resetMatch() },
        ],
      });
    } else {
      modal({
        title: `${name} takes the round`,
        body: scoreboardHtml(),
        actions: [
          { label: 'Leave table', kind: 'ghost', onClick: () => go('lobby') },
          { label: 'Next round', kind: 'primary', onClick: () => void startRound() },
        ],
      });
    }
  }

  function scoreboardHtml() {
    const names = ['You 💰', ...bots.map((b) => `${b.name} ${b.emoji}`)];
    return `<div class="score-rows">${[0, 1, 2, 3]
      .map(
        (i) => `
        <div class="score-row ${i === 0 ? 'me' : ''}">
          <span>${names[i]}</span>
          <b class="num">${fmt(scores[i])}</b>
        </div>`,
      )
      .join('')}</div>`;
  }

  function resetMatch() {
    scores.fill(0);
    roundsPlayed = 0;
    syncScoreBtn();
    void startRound();
  }

  /* ------------------------------ toolbar -------------------------------- */
  on(sortBtn, 'click', () => {
    sortBy = sortBy === 'color' ? 'number' : 'color';
    sortBtn.textContent = `⇅ Sort: ${sortBy === 'color' ? 'Colour' : 'Number'}`;
    sfx.click();
    renderHand(eng.turn === 0 && !busy);
  });
  on(targetBtn, 'click', () => {
    target = target === 'points' ? 'best5' : 'points';
    targetBtn.textContent = target === 'points' ? '🎯 First to 500' : '🎯 Best of 5';
    sfx.click();
    toast(target === 'points' ? 'Match target: 500 points' : 'Match target: best of 5 rounds');
  });
  on(scoreBtn, 'click', () => {
    sfx.click();
    modal({ title: '🏆 Match score', body: scoreboardHtml(), actions: [{ label: 'Close', kind: 'primary' }] });
  });

  /* ------------------------------- keyboard ------------------------------ */
  const keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'u' || e.key === 'U') unoBtn.click();
    else if (e.key === 'd' || e.key === 'D') void doDraw();
  };
  window.addEventListener('keydown', keyHandler);

  /* -------------------------------- boot --------------------------------- */
  const unFit = fitStage(stage, wrap, SW, SH, 0);
  setAmbient();
  syncScoreBtn();

  modal({
    title: '🃏 UNO Classic',
    body: `<ul class="rules">
      <li>Match the top card by <b>colour, number or symbol</b>.</li>
      <li>Tap the deck to draw — if the drawn card matches you may play it.</li>
      <li>Press <b>UNO!</b> (or <span class="kbd">U</span>) when you're down to one card — or draw +2 when caught.</li>
      <li>Tap a bot who forgot to shout to catch them!</li>
      <li>First to <b>500 points</b> wins the match (toggle to best-of-5 in the toolbar).</li>
    </ul>`,
    actions: [
      { label: 'Back to lobby', kind: 'ghost', onClick: () => go('lobby') },
      { label: 'Deal me in', kind: 'primary', onClick: () => void startRound() },
    ],
    dismissable: false,
  });

  return () => {
    unFit();
    window.removeEventListener('keydown', keyHandler);
    bar.destroy();
    seats.forEach((s) => s.destroy());
  };
}
