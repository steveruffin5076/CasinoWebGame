/* =============================================================================
   blackjack.ts — the Blackjack table (UI layer).
   Layout is authored on a 1000 x 680 virtual stage and scaled to any screen
   (360px phones through 1920px desktops) with one GPU transform.
   ========================================================================== */

import './blackjack.css';
import { el, fmt, sleep, reducedMotion, on, fitStage, center, buzz } from '../core/utils';
import { wallet } from '../core/chips';
import { sfx } from '../core/audio';
import { save } from '../core/storage';
import { fx, toast, bigWin } from '../core/fx';
import { topBar, Seat, modal } from '../core/ui';
import { go } from '../core/router';
import { roster } from '../core/personalities';
import { CardPool } from '../assets/cards';
import { chipRack, chipEl } from '../assets/chips';
import { handValue, isBlackjack, type Card } from '../core/deck';
import { BlackjackEngine, type Hand } from './engine';
import { botDecide, botTakesInsurance } from '../ai/blackjackBot';

/* ------------------------------ layout consts ----------------------------- */
const SW = 1000;
const SH = 680;
const CW = 74; // card width
const BCW = 66; // bot card width
const SPACING = 30; // overlap between cards in a hand

interface Spot {
  av: { x: number; y: number };
  hand: { x: number; y: number };
  bet: { x: number; y: number };
  cardW: number;
}

/** table spots: 0 = YOU (bottom), 1..3 = bots left / centre / right */
const SPOTS: Spot[] = [
  { av: { x: 330, y: 618 }, hand: { x: 505, y: 575 }, bet: { x: 505, y: 500 }, cardW: CW },
  { av: { x: 115, y: 268 }, hand: { x: 118, y: 392 }, bet: { x: 118, y: 458 }, cardW: BCW },
  { av: { x: 500, y: 252 }, hand: { x: 500, y: 368 }, bet: { x: 500, y: 428 }, cardW: BCW },
  { av: { x: 885, y: 268 }, hand: { x: 882, y: 392 }, bet: { x: 882, y: 458 }, cardW: BCW },
];
const DEALER = { x: 500, y: 138 };
const SHOE_POS = { x: 705, y: 95 };

export function mountBlackjack(root: HTMLElement): () => void {
  const difficulty = save.settings().difficulty.blackjack;
  const bots = roster(3, 'bj-' + difficulty);
  const eng = new BlackjackEngine(['You', ...bots.map((b) => b.name)], 0);

  /* ------------------------------- skeleton ------------------------------ */
  const bar = topBar({ title: '♠️ Blackjack', sub: 'Blackjack pays 3:2 · S17', onBack: () => go('lobby') });
  const wrap = el('div', 'stage-wrap');
  const stage = el('div', 'stage');
  wrap.appendChild(stage);

  const table = el('div', 'bj-table');
  // canvas-generated felt noise (cheap, drawn once, DPR-aware)
  const noise = document.createElement('canvas');
  noise.className = 'felt-noise';
  paintFeltNoise(noise);
  table.appendChild(noise);
  table.insertAdjacentHTML(
    'beforeend',
    `<div class="felt-text">BLACKJACK PAYS 3 TO 2<span class="sub">DEALER STANDS ON ALL 17 · INSURANCE PAYS 2 TO 1</span></div>`,
  );
  stage.appendChild(table);

  // shoe
  const shoeBox = el('div', 'bj-shoe');
  shoeBox.innerHTML = `<div class="cards"><i></i><i></i><i></i></div>
    <div class="meter"><i style="width:100%"></i></div><div class="lbl">6-DECK SHOE</div>`;
  stage.appendChild(shoeBox);
  const shoeMeter = shoeBox.querySelector('.meter i') as HTMLElement;

  // seats
  const seats: Seat[] = [
    new Seat({ name: 'You', avatar: 'vic', x: SPOTS[0].av.x, y: SPOTS[0].av.y, you: true }),
    ...bots.map((b, i) => new Seat({ name: `${b.name} ${b.emoji}`, avatar: b.avatar, x: SPOTS[i + 1].av.x, y: SPOTS[i + 1].av.y })),
  ];
  seats.forEach((s) => stage.appendChild(s.el));

  // betting circles
  const betCircles = SPOTS.map((sp, i) => {
    const c = el('div', `bj-bet${i === 0 ? ' yours' : ''}`);
    c.style.left = `${sp.bet.x}px`;
    c.style.top = `${sp.bet.y}px`;
    c.innerHTML = `<span class="amt num"></span>`;
    stage.appendChild(c);
    return c;
  });

  // card views + hand tags
  const pool = new CardPool(stage);
  const handTags = new Map<string, HTMLElement>();
  const tagFor = (key: string) => {
    let t = handTags.get(key);
    if (!t) {
      t = el('div', 'bj-hand');
      t.innerHTML = `<div class="tag"></div>`;
      stage.appendChild(t);
      handTags.set(key, t);
    }
    return t;
  };

  /* -------------------------------- dock -------------------------------- */
  const dock = el('div', 'game-dock');
  const msg = el('div', 'msg-bar', 'Place your bet');
  const rackRow = el('div', 'row');
  const actionRow = el('div', 'row');
  dock.append(msg, rackRow, actionRow);
  root.append(bar.el, wrap, dock);

  let bet = 0;
  let roundActive = false;

  const dealBtn = el('button', 'btn btn-primary btn-pulse', 'Deal');
  dealBtn.type = 'button';
  const clearBtn = el('button', 'btn btn-glass btn-sm', 'Clear');
  clearBtn.type = 'button';
  const rack = chipRack(
    (d) => {
      if (roundActive) return;
      if (!wallet.canAfford(bet + d)) {
        toast('Not enough chips — try a smaller bet', 'bad');
        return;
      }
      bet += d;
      sfx.chip();
      buzz();
      syncBet();
      const r = betCircles[0].getBoundingClientRect();
      fx.flyChips(
        { x: r.left - 90, y: r.top + r.height / 2 },
        center(betCircles[0]),
        d,
        2,
      );
    },
    { clear: () => {
        bet = 0;
        syncBet();
      } },
  );
  rackRow.append(rack, dealBtn, clearBtn);

  // action buttons
  interface Act { id: string; label: string; key?: string; run: () => void; enabled: () => boolean }
  const acts: Act[] = [];
  const mkAct = (id: string, label: string, key: string | undefined, run: () => void, enabled: () => boolean) => {
    const b = el('button', 'btn btn-glass', key ? `${label} <span class="kbd">${key}</span>` : label);
    b.type = 'button';
    b.addEventListener('click', () => {
      if (b.disabled) return;
      run();
    });
    actionRow.appendChild(b);
    acts.push({ id, label, key, run, enabled });
  };

  const syncActions = () => {
    for (const a of acts) {
      const b = actionRow.children[acts.indexOf(a)] as HTMLButtonElement;
      b.disabled = !a.enabled();
    }
  };

  /* --------------------------- state -> render --------------------------- */

  const handKey = (seat: number) => `s${seat}`;
  const anchorFor = (seat: number) => {
    const p = eng.players[seat];
    const base = SPOTS[p.slot] ?? SPOTS[0];
    const isSplitHand = p.name.includes('(2)');
    return {
      x: base.hand.x + (isSplitHand ? 84 : 0),
      y: base.hand.y,
      cardW: base.cardW,
    };
  };

  function updateTag(seat: number) {
    const p = eng.players[seat];
    const h = p.hand;
    const key = handKey(seat);
    const t = tagFor(key);
    const a = anchorFor(seat);
    t.style.left = `${a.x}px`;
    t.style.top = `${a.y + 26}px`;
    const tag = t.querySelector('.tag') as HTMLElement;
    if (!h || !h.cards.length) {
      t.style.display = 'none';
      return;
    }
    t.style.display = '';
    const { total, soft } = handValue(h.cards);
    const txt = `${soft && total < 21 ? `Soft ${total}` : total}${h.doubled ? ' · 2×' : ''}`;
    tag.className = 'tag' + (total > 21 ? ' bust' : isBlackjack(h.cards) && !h.fromSplit ? ' bj' : '');
    tag.textContent = total > 21 ? `${total} BUST` : isBlackjack(h.cards) && !h.fromSplit ? 'BLACKJACK!' : txt;
  }

  function updateBetCircle(i: number, amount: number) {
    const c = betCircles[i];
    (c.querySelector('.amt') as HTMLElement).textContent = amount > 0 ? fmt(amount) : '';
    c.classList.toggle('need', i === 0 && amount === 0 && !roundActive);
  }

  function syncBet() {
    updateBetCircle(0, bet);
    dealBtn.disabled = bet <= 0 || roundActive || !wallet.canAfford(bet);
    dealBtn.classList.toggle('btn-pulse', bet > 0 && !roundActive);
    msg.innerHTML = bet > 0 ? `Bet <b class="num">${fmt(bet)}</b> — Deal when ready` : 'Place your bet';
    clearBtn.disabled = bet <= 0 || roundActive;
  }

  function setShoeMeter() {
    shoeMeter.style.width = `${Math.round((1 - eng.shoe.used) * 100)}%`;
  }

  function clearTable() {
    pool.releaseAll();
    handTags.forEach((t) => t.remove());
    handTags.clear();
  }

  /* ------------------------------ animation ------------------------------ */

  /** animated single-card deal to any hand (or dealer) */
  async function animDeal(target: 'dealer' | number, delayMs = 0, faceUp = true) {
    const card: Card =
      target === 'dealer'
        ? eng.dealer[eng.dealer.length - 1]
        : eng.players[target].hand!.cards[eng.players[target].hand!.cards.length - 1];
    const v = pool.take();
    const a = target === 'dealer' ? { x: DEALER.x, y: DEALER.y, cardW: 72 } : anchorFor(target);
    const n = target === 'dealer' ? eng.dealer.length : eng.players[target].hand!.cards.length;
    const tot = target === 'dealer' ? n - 1 : n - 1;
    const x = target === 'dealer'
      ? DEALER.x - (n - 1) * 28 - 36 + tot * 56
      : a.x - (n - 1) * SPACING - a.cardW / 2 + tot * SPACING * 2;
    const y = a.y - a.cardW * 0.7;
    v.setSize(a.cardW);
    v.set(card, false);
    sfx.deal();
    v.el.style.zIndex = String(50 + tot);
    v.dealFrom(SHOE_POS.x, SHOE_POS.y, x, y, 0, delayMs);
    if (faceUp) v.flip(true, delayMs + 200), sfx.flip();
    else if (target === 'dealer') v.flip(false, 0);
    await sleep(delayMs + (reducedMotion() ? 30 : 420));
    if (target !== 'dealer') updateTag(target);
  }

  /* -------------------------------- flow --------------------------------- */

  let insuranceBet = 0;

  async function onDeal() {
    if (bet <= 0 || roundActive || !wallet.spend(bet)) return;
    roundActive = true;
    betCircles[0].classList.remove('need');
    sfx.shuffle();
    eng.autoBetBots();
    // animate bot bets
    eng.players.forEach((p, i) => {
      if (i === 0 || !p.hand) return;
      updateBetCircle(i, p.hand.bet);
      const r = betCircles[i].getBoundingClientRect();
      fx.flyChips({ x: r.left - 160, y: r.top - 120 }, center(betCircles[i]), p.hand.bet > 100 ? 100 : 50, 2, 60);
    });
    syncBet();
    clearBtn.disabled = true;
    msg.textContent = 'Dealing…';
    await sleep(420);

    // initial deal (two passes, dealer takes one each pass — standard order)
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < eng.players.length; i++) {
        const p = eng.players[i];
        if (!p.hand || p.hand.cards.length > pass) continue;
        const c = eng.shoe.draw();
        p.hand.cards.push(c);
        await animDeal(i, 0, true);
      }
      const dc = eng.shoe.draw();
      eng.dealer.push(dc);
      await animDeal('dealer', 0, pass === 0);
    }
    setShoeMeter();

    // insurance?
    if (eng.insuranceOffered()) {
      const cost = Math.floor(bet / 2);
      const res = await askModal(
        'Insurance?',
        `Dealer shows an Ace. Take insurance for <b class="num">${fmt(cost)}</b>? Pays 2:1 if the dealer has blackjack.`,
        'Take insurance',
        'No thanks',
      );
      if (res && wallet.spend(cost)) {
        insuranceBet = cost;
        toast(`Insurance: ${fmt(cost)} chips`, '');
        sfx.chip();
      }
    }

    // dealer peek
    if (isBlackjack(eng.dealer)) {
      msg.textContent = 'Dealer has Blackjack.';
      await revealDealer();
      await settle();
      return;
    }

    // player turns (human first, then bots — seat order; ghost split seats are
    // handled inside humanTurn/botTurn, so skip them here)
    for (let i = 0; i < eng.players.length; i++) {
      const p = eng.players[i];
      if (!p.hand || p.name.includes('(2)')) continue;
      seats[p.slot].setState('active');
      if (p.isHuman) await humanTurn(i);
      else await botTurn(i);
      seats[p.slot].setState('');
    }

    // dealer
    seats[0].setState('');
    msg.textContent = 'Dealer plays…';
    await revealDealer();
    const before = eng.dealer.length;
    const drawn = eng.playDealer();
    for (let k = 0; k < drawn.length; k++) {
      const v = pool.take();
      const n = before + k + 1;
      v.setSize(72);
      v.set(drawn[k], false);
      const x = DEALER.x - (n - 1) * 28 - 36 + (n - 1) * 56;
      v.dealFrom(SHOE_POS.x, SHOE_POS.y, x, DEALER.y - 72 * 0.7, 0, 0);
      v.flip(true, 220);
      sfx.deal();
      await sleep(430);
    }
    updateDealerTag();
    await settle();
  }

  async function revealDealer() {
    const holeView = holeViewBySize();
    if (holeView) {
      holeView.classList.add('flipped');
      sfx.flip();
      await sleep(360);
    }
    updateDealerTag();
  }

  let dealerTag: HTMLElement | null = null;
  function updateDealerTag() {
    dealerTag ||= (() => {
      const t = el('div', 'bj-hand');
      t.innerHTML = `<div class="tag"></div>`;
      stage.appendChild(t);
      return t;
    })();
    dealerTag.style.left = `${DEALER.x}px`;
    dealerTag.style.top = `${DEALER.y + 56}px`;
    const tag = dealerTag.querySelector('.tag') as HTMLElement;
    const { total } = handValue(eng.dealer);
    tag.className = 'tag' + (total > 21 ? ' bust' : '');
    tag.textContent = eng.dealer.length ? (total > 21 ? `${total} BUST` : `Dealer ${total}`) : '';
  }

  function holeViewBySize() {
    const cards = [...stage.querySelectorAll('.card')] as HTMLElement[];
    for (const c of cards) {
      const w = parseFloat(c.style.width || '0');
      const flipped = c.classList.contains('flipped');
      const y = /translate3d\(([-\d.]+)px, ([-\d.]+)px/.exec(c.style.transform || '');
      const yy = y ? parseFloat(y[2]) : -1;
      if (Math.round(w) === 72 && !flipped && yy > 0 && yy < 220) return c;
    }
    return null;
  }

  /* ------------------------------- human turn ---------------------------- */

  function humanControls(on: boolean) {
    dealBtn.disabled = true;
    for (let i = 0; i < acts.length; i++) {
      const b = actionRow.children[i] as HTMLButtonElement;
      b.disabled = !on || !acts[i].enabled();
    }
    actionRow.classList.toggle('hidden', !on);
    if (on) syncActions();
  }

  /** seat currently controlled by the human (0 normally, ghost seat after split) */
  let humanSeat = 0;

  function awaitHuman(seat: number): Promise<void> {
    humanSeat = seat;
    return new Promise((resolve) => {
      humanDone = resolve;
      humanControls(true);
      msg.innerHTML = `Your move${seat > 0 ? ' (split hand)' : ''} — <span class="kbd">H</span> hit · <span class="kbd">S</span> stand · <span class="kbd">D</span> double`;
      sfx.turn();
      buzz();
    });
  }

  let humanDone: (() => void) | null = null;

  async function humanTurn(seat: number) {
    // loop because a split creates a second hand for the same slot
    while (true) {
      const p = eng.players[seat];
      if (!p.hand) break;
      if (p.hand.done || handValue(p.hand.cards).total >= 21) {
        if (handValue(p.hand.cards).total > 21) {
          toast('Bust!', 'bad');
          sfx.lose();
        }
        break;
      }
      await awaitHuman(seat);
      // the action ran; loop re-checks
    }
    // second split hand (ghost seat right after)
    const ghost = eng.players[seat + 1];
    if (ghost && ghost.name.includes('(2)') && ghost.hand && !ghost.hand.done) {
      // deal its second card if pending
      if (eng.splitPending(seat + 1)) {
        const c = eng.fillSplit(seat + 1);
        await animDeal(seat + 1, 0, true);
        void c;
      }
      await humanTurn(seat + 1);
    }
  }

  async function botTurn(seat: number) {
    const p = eng.players[seat];
    const slot = p.slot;
    seats[slot].setState('think');
    seats[slot].say('…', 900);
    await sleep(700 + Math.random() * 900);
    while (p.hand && !p.hand.done) {
      const { total } = handValue(p.hand.cards);
      if (total >= 21) break;
      const act = botDecide(
        p.hand.cards,
        eng.dealer[0],
        eng.canDouble(seat),
        eng.canSplit(seat),
        difficulty,
      );
      if (act === 'hit') {
        eng.hit(seat);
        await animDeal(seat, 0, true);
        await sleep(320 + Math.random() * 260);
      } else if (act === 'double') {
        eng.double(seat);
        updateBetCircle(slot, p.hand.bet);
        const r = betCircles[slot].getBoundingClientRect();
        fx.flyChips({ x: r.left - 120, y: r.top - 90 }, center(betCircles[slot]), 100, 2, 0);
        seats[slot].say('Double! 💰');
        await animDeal(seat, 0, true);
        await sleep(300);
      } else if (act === 'split') {
        eng.split(seat);
        await animDeal(seat, 0, true);
        updateBetCircle(slot, p.hand.bet);
        // second card for the ghost hand (engine handles split-ace rules)
        eng.fillSplit(seat + 1);
        await animDeal(seat + 1, 0, true);
        seats[slot].say('Split! ✌️');
        await sleep(360);
      } else {
        eng.stand(seat);
        await sleep(220 + Math.random() * 240);
      }
    }
    const v = p.hand ? handValue(p.hand.cards).total : 0;
    if (v > 21) {
      seats[slot].setState('lose');
      seats[slot].say('Bust 😵', 1300);
    } else seats[slot].setState('');
    await sleep(240);
    // play the ghost split hand too
    const ghost = eng.players[seat + 1];
    if (ghost && ghost.name.includes('(2)') && ghost.hand) {
      await botTurn(seat + 1);
    }
  }

  /* ------------------------------- settlement ---------------------------- */

  async function settle() {
    humanControls(false);
    actionRow.classList.add('hidden');
    const results = eng.settle();
    const insBack = eng.settleInsurance();

    let net = 0;
    let won = false;
    let bj = false;
    for (const r of results) {
      const p = eng.players[r.seat];
      const spot = SPOTS[p.slot];
      const c = betCircles[p.slot];
      const rct = c.getBoundingClientRect();
      const seatEl = seats[p.slot];
      if (p.isHuman) {
        const profit = r.payout - r.bet;
        net += profit;
        if (r.result === 'win' || r.result === 'bj') {
          won = true;
          if (r.result === 'bj') bj = true;
        }
        if (r.payout > 0) {
          wallet.payout(r.payout);
          fx.flyChips({ x: rct.left, y: rct.top - 140 }, center(c), r.bet >= 500 ? 500 : 100, 4);
        }
      } else {
        p.bankroll += r.payout - r.bet;
        if (r.payout > r.bet) {
          seatEl.setState('win');
          seatEl.say(r.result === 'bj' ? 'Blackjack! 😎' : 'Winner 🎉', 1500);
          fx.flyChips({ x: rct.left, y: rct.top - 140 }, center(c), 100, 3);
        } else if (r.payout === 0) {
          seatEl.setState('lose');
        }
        updateBetCircle(p.slot, 0);
      }
      // tag colour
      const tag = handTags.get(handKey(r.seat))?.querySelector('.tag');
      if (tag) tag.classList.add(r.result === 'win' || r.result === 'bj' ? 'win' : r.result === 'push' ? '' : 'bust');
    }

    if (insBack > 0) {
      wallet.payout(insBack);
      toast(`Insurance pays ${fmt(insBack)}!`, 'good');
      net += insBack - insuranceBet;
    } else if (insuranceBet > 0) {
      net -= insuranceBet;
    }
    insuranceBet = 0;

    // player-visible feedback
    const dv = handValue(eng.dealer).total;
    await sleep(520);
    if (bj) {
      bigWin(net);
      seats[0].setState('win');
      seats[0].say('Blackjack! 🃏', 1800);
    } else if (won) {
      sfx.win();
      fx.flash();
      const rc = betCircles[0].getBoundingClientRect();
      fx.celebrate(rc.left + rc.width / 2, rc.top, 1);
      fx.floatText(rc.left + rc.width / 2, rc.top - 30, `+${fmt(net)}`);
      seats[0].setState('win');
      if (net >= bet * 5) bigWin(net);
    } else if (net === 0) {
      sfx.push();
      toast('Push — bet returned');
      msg.textContent = 'Push.';
    } else {
      sfx.lose();
      seats[0].setState('lose');
      msg.textContent = dv > 21 ? `Dealer busts with ${dv} — but the house took this one.` : `Dealer takes it (${dv}).`;
      toast(`-${fmt(-net)} chips`, 'bad');
    }
    if (won) msg.textContent = bj ? 'BLACKJACK! Paid 3:2 🔥' : `You win ${fmt(net)} chips!`;

    // stats
    save.record({
      gamesPlayed: 1,
      handsWon: results.filter((r) => eng.players[r.seat].isHuman && (r.result === 'win' || r.result === 'bj')).length,
      handsLost: results.filter((r) => eng.players[r.seat].isHuman && r.result === 'lose').length,
      biggestWin: net > 0 ? net : 0,
      biggestWinGame: net > 0 ? 'blackjack' : undefined,
      best: { blackjack: net > 0 ? net : 0 },
    });
    window.dispatchEvent(new Event('neon:stats'));

    eng.nextRound();
    setShoeMeter();
    updateBetCircle(0, 0);
    bet = 0;
    roundActive = false;
    seats.forEach((s) => setTimeout(() => s.setState(''), 1600));
    await sleep(900);
    clearTable();
    updateDealerTag();
    dealerTag?.remove();
    dealerTag = null;
    syncBet();
    actionRow.classList.add('hidden');
    betCircles[0].classList.add('need');
  }

  /* ------------------------------- actions ------------------------------- */

  const humanAct = async (kind: 'hit' | 'stand' | 'double' | 'split') => {
    const seat = humanSeat;
    humanControls(false);
    if (kind === 'hit') {
      eng.hit(seat);
      await animDeal(seat, 0, true);
      const v = handValue(eng.players[seat].hand!.cards);
      if (v.total > 21) {
        sfx.lose();
        toast('Bust!', 'bad');
      }
    } else if (kind === 'stand') {
      eng.stand(seat);
    } else if (kind === 'double') {
      const h = eng.players[seat].hand!;
      if (!wallet.spend(h.bet)) {
        toast('Not enough chips to double', 'bad');
      } else {
        eng.double(seat);
        updateBetCircle(0, h.bet);
        const r = betCircles[0].getBoundingClientRect();
        fx.flyChips({ x: r.left - 120, y: r.top - 80 }, center(betCircles[0]), h.bet >= 500 ? 500 : 100, 3);
        await animDeal(seat, 0, true);
      }
    } else if (kind === 'split') {
      const h = eng.players[seat].hand!;
      if (!wallet.spend(h.bet)) {
        toast('Not enough chips to split', 'bad');
      } else {
        eng.split(seat);
        updateBetCircle(0, h.bet);
        await animDeal(seat, 0, true);
        const ghost = eng.players[seat + 1];
        const c = eng.shoe.draw();
        ghost.hand!.cards.push(c);
        await animDeal(seat + 1, 0, true);
        toast('Split — playing two hands');
      }
    }
    updateTag(seat);
    humanDone?.();
    humanDone = null;
  };

  mkAct('hit', 'Hit', 'H', () => void humanAct('hit'), () => eng.canHit(0));
  mkAct('stand', 'Stand', 'S', () => void humanAct('stand'), () => !!eng.players[0].hand && !eng.players[0].hand!.done);
  mkAct('double', 'Double', 'D', () => void humanAct('double'), () => eng.canDouble(0) && wallet.canAfford(eng.players[0].hand!.bet));
  mkAct('split', 'Split', 'P', () => void humanAct('split'), () => eng.canSplit(0) && wallet.canAfford(eng.players[0].hand!.bet));
  actionRow.classList.add('hidden');

  /* ------------------------------- keyboard ------------------------------ */
  const keyHandler = (e: KeyboardEvent) => {
    if (roundActive && humanDone) {
      const k = e.key.toLowerCase();
      if (k === 'h' && eng.canHit(0)) { e.preventDefault(); void humanAct('hit'); }
      else if (k === 's' && eng.players[0].hand && !eng.players[0].hand!.done) { e.preventDefault(); void humanAct('stand'); }
      else if (k === 'd' && eng.canDouble(0) && wallet.canAfford(eng.players[0].hand!.bet)) { e.preventDefault(); void humanAct('double'); }
      else if (k === 'p' && eng.canSplit(0) && wallet.canAfford(eng.players[0].hand!.bet)) { e.preventDefault(); void humanAct('split'); }
    } else if (!roundActive && (e.key === 'Enter' || e.key === ' ') && bet > 0) {
      e.preventDefault();
      void onDeal();
    }
  };
  window.addEventListener('keydown', keyHandler);

  dealBtn.addEventListener('click', () => void onDeal());
  betCircles[0].addEventListener('click', () => {
    if (!roundActive && bet > 0) void onDeal();
  });

  /* ------------------------- leave-table confirm -------------------------- */
  const guard = (e: MouseEvent) => {
    if (!roundActive) return;
    const t = (e.target as HTMLElement).closest('.back');
    if (!t) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    modal({
      title: 'Leave the table?',
      body: `<p class="muted" style="margin:0;line-height:1.55">Your bet of <b class="num">${fmt(bet)}</b> stays with the house if you walk now.</p>`,
      actions: [
        { label: 'Keep playing', kind: 'primary' },
        { label: 'Leave anyway', kind: 'danger', onClick: () => { roundActive = false; go('lobby'); } },
      ],
    });
  };
  bar.el.addEventListener('click', guard, true);

  /* -------------------------------- boot --------------------------------- */
  const unFit = fitStage(stage, wrap, SW, SH, 0);
  syncBet();
  betCircles[0].classList.add('need');
  msg.innerHTML = 'Place your bet — tap chips then <b>Deal</b>';

  return () => {
    unFit();
    window.removeEventListener('keydown', keyHandler);
    bar.destroy();
    clearTable();
    seats.forEach((s) => s.destroy());
  };
}

/* ------------------------------- helpers ---------------------------------- */

function askModal(title: string, html: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    const m = modal({
      title,
      body: `<p style="margin:0;line-height:1.55">${html}</p>`,
      actions: [
        { label: no, kind: 'glass', onClick: () => resolve(false) },
        { label: yes, kind: 'primary', onClick: () => resolve(true) },
      ],
      onClose: () => resolve(false),
    });
    void m;
  });
}

/** paints subtle felt texture noise onto a canvas (once, cheap). */
function paintFeltNoise(canvas: HTMLCanvasElement) {
  const w = 470;
  const h = 310;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (Math.random() * 36 - 18);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 26;
  }
  ctx.putImageData(img, 0, 0);
}

export type { Hand };
