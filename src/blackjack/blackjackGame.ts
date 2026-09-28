import { GameHost } from '../core/GameHost';
import { createDeck, drawPlayingCard, drawChip, type PlayingCard } from '../core/assets';
import { shuffle, delay } from '../core/utils';
import { getDifficulty } from '../core/storage';
import { botAction, handTotal, isBlackjack, type BJAction } from '../ai/blackjackBot';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playDeal, playFlip, playWin, playLose } from '../core/audio';
import { navigate } from '../core/router';
import { addTutorialButton, showTutorial } from '../core/tutorial';

interface Seat {
  name: string;
  isHuman: boolean;
  cards: PlayingCard[];
  bet: number;
  hands: PlayingCard[][];
  handBets: number[];
  stood: boolean[];
}

export function mountBlackjack(root: HTMLElement): () => void {
  const shell = document.createElement('div');
  shell.className = 'game-shell theme-blackjack';
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" id="bj-back">← Lobby</button><h2>♠️ Blackjack</h2><span id="bj-bal"></span></div><div class="game-stage" id="bj-stage"></div><div class="info-bar" id="bj-info">Place your bet</div><div class="game-controls" id="bj-ctrl"></div>`;
  root.appendChild(shell);

  const header = shell.querySelector('.game-header') as HTMLElement;
  addTutorialButton(header, 'blackjack');
  showTutorial('blackjack');

  const stage = shell.querySelector('#bj-stage') as HTMLElement;
  const info = shell.querySelector('#bj-info') as HTMLElement;
  const ctrl = shell.querySelector('#bj-ctrl') as HTMLElement;
  const balEl = shell.querySelector('#bj-bal') as HTMLElement;
  const host = new GameHost(stage, '#0d5c36');

  let shoe: PlayingCard[] = [];
  let dealt = 0;
  let seats: Seat[] = [];
  let dealer: PlayingCard[] = [];
  let humanBet = 0;
  let phase: 'bet' | 'play' | 'dealer' | 'end' = 'bet';
  let activeHand = 0;
  let insuranceOffer = false;
  let insuranceBet = 0;

  function freshShoe(): void {
    shoe = shuffle(createDeck(6));
    dealt = 0;
  }

  function drawCard(faceUp = true): PlayingCard {
    if (dealt >= shoe.length * 0.75) freshShoe();
    const c = shoe[dealt++];
    return { ...c, faceUp };
  }

  function updateBal(): void {
    balEl.textContent = `💰 ${getChips().toLocaleString()}`;
  }

  function renderControls(): void {
    ctrl.innerHTML = '';
    if (phase === 'bet') {
      for (const amt of [10, 50, 100, 500]) {
        const b = document.createElement('button');
        b.className = 'btn';
        b.textContent = String(amt);
        b.onclick = () => {
          if (getChips() >= amt) {
            humanBet = amt;
            playChip();
            info.textContent = `Bet: ${amt} — press Deal`;
          }
        };
        ctrl.appendChild(b);
      }
      const deal = document.createElement('button');
      deal.className = 'btn btn-primary';
      deal.textContent = 'Deal';
      deal.onclick = () => startHand();
      ctrl.appendChild(deal);
    } else if (phase === 'play') {
      const h = seats[0].hands[activeHand];
      const { total } = handTotal(h);
      if (total < 21 && !seats[0].stood[activeHand]) {
        addBtn('Hit (H)', () => playerAct('hit'));
        addBtn('Stand (S)', () => playerAct('stand'));
        if (h.length === 2 && seats[0].handBets[activeHand] <= getChips()) {
          addBtn('Double (D)', () => playerAct('double'));
        }
        if (h.length === 2 && h[0].rank === h[1].rank && seats[0].hands.length === 1) {
          addBtn('Split', () => playerAct('split'));
        }
      }
      if (insuranceOffer) {
        addBtn('Insurance', takeInsurance);
        addBtn('No Insurance', () => {
          insuranceOffer = false;
          renderControls();
        });
      }
    } else if (phase === 'end') {
      const again = document.createElement('button');
      again.className = 'btn btn-primary';
      again.textContent = 'New Hand';
      again.onclick = () => {
        phase = 'bet';
        humanBet = 0;
        insuranceBet = 0;
        renderControls();
        info.textContent = 'Place your bet';
      };
      ctrl.appendChild(again);
    }
  }

  function takeInsurance(): void {
    const cost = Math.floor(seats[0].handBets[0] / 2);
    if (cost > 0 && getChips() >= cost) {
      insuranceBet = cost;
      addChips(-cost);
      updateBal();
    }
    insuranceOffer = false;
    info.textContent = insuranceBet ? `Insurance ${insuranceBet} placed` : 'No insurance';
    renderControls();
  }

  function addBtn(label: string, fn: () => void): void {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = label;
    b.onclick = fn;
    ctrl.appendChild(b);
  }

  async function startHand(): Promise<void> {
    if (humanBet < 10) {
      info.textContent = 'Select a bet first';
      return;
    }
    addChips(-humanBet);
    updateBal();
    recordGamePlayed();
    insuranceBet = 0;
    seats = [
      { name: 'You', isHuman: true, cards: [], bet: humanBet, hands: [[]], handBets: [humanBet], stood: [false] },
      { name: 'Bot A', isHuman: false, cards: [], bet: 50, hands: [[]], handBets: [50], stood: [false] },
      { name: 'Bot B', isHuman: false, cards: [], bet: 50, hands: [[]], handBets: [50], stood: [false] },
      { name: 'Bot C', isHuman: false, cards: [], bet: 50, hands: [[]], handBets: [50], stood: [false] },
    ];
    dealer = [];
    phase = 'play';
    insuranceOffer = false;

    for (let round = 0; round < 2; round++) {
      for (let s = 0; s < seats.length; s++) {
        seats[s].hands[0].push(drawCard(true));
        playDeal();
        await delay(60);
      }
      dealer.push(drawCard(round === 0));
    }
    if (dealer[0].rank === 'A') insuranceOffer = true;
    activeHand = 0;

    const playerBj = isBlackjack(seats[0].hands[0]);
    if (playerBj) {
      seats[0].stood[0] = true;
      info.textContent = 'Blackjack!';
      renderControls();
      await runBotsThenDealer();
      return;
    }
    renderControls();
  }

  async function runBotsThenDealer(): Promise<void> {
    for (let s = 1; s < seats.length; s++) {
      await playBotSeat(s);
    }
    if (phase === 'play') await dealerPlay();
  }

  function playerAct(action: BJAction): void {
    const seat = seats[0];
    const h = seat.hands[activeHand];
    if (action === 'hit') {
      h.push(drawCard(true));
      playDeal();
      const { total } = handTotal(h);
      if (total > 21) nextHand();
      else if (total === 21) {
        seat.stood[activeHand] = true;
        nextHand();
      }
    } else if (action === 'stand') {
      seat.stood[activeHand] = true;
      nextHand();
    } else if (action === 'double') {
      addChips(-seat.handBets[activeHand]);
      seat.handBets[activeHand] *= 2;
      h.push(drawCard(true));
      seat.stood[activeHand] = true;
      updateBal();
      nextHand();
    } else if (action === 'split') {
      const second = h.pop()!;
      seat.hands.push([second]);
      seat.handBets.push(seat.handBets[0]);
      seat.stood.push(false);
      h.push(drawCard(true));
      seat.hands[1].push(drawCard(true));
      addChips(-seat.handBets[0]);
      updateBal();
    }
    renderControls();
  }

  function nextHand(): void {
    activeHand++;
    if (activeHand >= seats[0].hands.length) {
      runBotsThenDealer();
    }
    renderControls();
  }

  async function playBotSeat(s: number): Promise<void> {
    const seat = seats[s];
    const diff = getDifficulty('blackjack');
    const h = seat.hands[0];
    while (true) {
      const { total } = handTotal(h);
      if (total >= 21) break;
      const up = dealer.find((c) => c.faceUp) ?? dealer[0];
      const act = botAction(h, up, h.length === 2, false, diff);
      if (act === 'stand' || act === 'double') break;
      h.push(drawCard(true));
      await delay(400);
    }
  }

  async function dealerPlay(): Promise<void> {
    phase = 'dealer';
    dealer.forEach((c) => (c.faceUp = true));
    playFlip();
    while (handTotal(dealer).total < 17) {
      dealer.push(drawCard(true));
      await delay(500);
    }
    settle();
  }

  function settle(): void {
    phase = 'end';
    const dt = handTotal(dealer).total;
    const dealerBj = isBlackjack(dealer);
    let credit = 0;
    let totalWager = 0;

    for (let hi = 0; hi < seats[0].hands.length; hi++) {
      const h = seats[0].hands[hi];
      const bet = seats[0].handBets[hi];
      totalWager += bet;
      const { total } = handTotal(h);
      const bj = isBlackjack(h) && h.length === 2;

      if (total > 21) {
        /* lost */
      } else if (dealerBj && bj) credit += bet;
      else if (bj) credit += bet + Math.floor(bet * 1.5);
      else if (dealerBj) {
        /* lost main */
      } else if (dt > 21 || total > dt) credit += bet * 2;
      else if (total === dt) credit += bet;
    }

    if (insuranceBet > 0 && dealerBj) credit += insuranceBet * 3;

    addChips(credit);
    const net = credit - totalWager - insuranceBet;

    if (net > 0) {
      recordWin(net, 'blackjack');
      playWin();
      host.particles.burst(stage.clientWidth / 2, stage.clientHeight / 2, 80, ['#c9a227', '#fff', '#1b6b3a']);
      host.addFloatText(stage.clientWidth / 2, stage.clientHeight / 3, `+${net}`);
    } else if (net < 0) {
      playLose();
      host.addFloatText(stage.clientWidth / 2, stage.clientHeight / 3, `${net}`);
    }

    updateBal();
    info.textContent = `Dealer ${dt} — ${net >= 0 ? 'Win' : 'Loss'} ${Math.abs(net)} chips`;
    renderControls();
  }

  const onKey = (e: KeyboardEvent) => {
    if (phase !== 'play') return;
    if (e.key === 'h' || e.key === 'H') playerAct('hit');
    if (e.key === 's' || e.key === 'S') playerAct('stand');
    if (e.key === 'd' || e.key === 'D') playerAct('double');
  };
  window.addEventListener('keydown', onKey);

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#0d5c36';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#8b691466';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.55, w * 0.42, h * 0.35, 0, 0, Math.PI * 2);
    ctx.stroke();

    const cw = Math.min(48, w * 0.08);
    const ch = cw * 1.4;

    dealer.forEach((c, i) => drawPlayingCard(ctx, c, w / 2 - 40 + i * (cw * 0.5), h * 0.2, cw, ch));

    const seatY = [h * 0.75, h * 0.55, h * 0.4, h * 0.55];
    const seatX = [w * 0.5, w * 0.15, w * 0.5, w * 0.85];
    seats.forEach((seat, si) => {
      ctx.fillStyle = '#fff8';
      ctx.font = '12px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(seat.name, seatX[si], seatY[si] - 10);
      seat.hands.forEach((hand, hi) => {
        hand.forEach((c, ci) => {
          drawPlayingCard(ctx, c, seatX[si] - 30 + ci * (cw * 0.45) + hi * 20, seatY[si], cw, ch);
        });
      });
      if (seat.handBets[0]) drawChip(ctx, seatX[si], seatY[si] + ch + 12, 14, '#e53935', String(seat.handBets[0]));
    });

    if (humanBet && phase === 'bet') drawChip(ctx, w / 2, h * 0.65, 18, '#ffd54f', String(humanBet));
  });

  freshShoe();
  updateBal();
  renderControls();

  shell.querySelector('#bj-back')!.addEventListener('click', () => navigate({ name: 'lobby' }));

  return () => {
    window.removeEventListener('keydown', onKey);
    host.destroy();
    shell.remove();
  };
}
