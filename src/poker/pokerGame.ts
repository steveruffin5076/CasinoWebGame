import { GameHost } from '../core/GameHost';
import { createDeck, drawPlayingCard, type PlayingCard } from '../core/assets';
import { shuffle, delay } from '../core/utils';
import { getDifficulty } from '../core/storage';
import { botPokerAction, describePlayerHand } from '../ai/pokerBot';
import { evaluateHand, compareHands } from './handEval';
import { addChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playDeal, playWin } from '../core/audio';
import { navigate } from '../core/router';

interface PokerPlayer {
  name: string;
  human: boolean;
  stack: number;
  hole: PlayingCard[];
  folded: boolean;
  bet: number;
  allIn: boolean;
}

type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export function mountPoker(root: HTMLElement): () => void {
  const shell = document.createElement('div');
  shell.className = 'game-shell';
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" id="pk-back">← Lobby</button><h2>♥️ Texas Hold'em</h2><span id="pk-pot"></span></div><div class="game-stage" id="pk-stage"></div><div class="info-bar" id="pk-info"></div><div class="game-controls" id="pk-ctrl"></div>`;
  root.appendChild(shell);

  const stage = shell.querySelector('#pk-stage') as HTMLElement;
  const info = shell.querySelector('#pk-info') as HTMLElement;
  const ctrl = shell.querySelector('#pk-ctrl') as HTMLElement;
  const potEl = shell.querySelector('#pk-pot') as HTMLElement;
  const host = new GameHost(stage);

  let deck: PlayingCard[] = [];
  let players: PokerPlayer[] = [];
  let community: PlayingCard[] = [];
  let pot = 0;
  let dealerBtn = 0;
  let current = 0;
  let street: Street = 'preflop';
  let handNum = 0;
  let sb = 10;
  let bb = 20;
  let toCall = 0;
  let minRaise = 20;
  let lastRaiser = -1;

  function initPlayers(): void {
    players = [
      { name: 'You', human: true, stack: 1000, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 1', human: false, stack: 1000, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 2', human: false, stack: 1000, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 3', human: false, stack: 1000, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 4', human: false, stack: 1000, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 5', human: false, stack: 1000, hole: [], folded: false, bet: 0, allIn: false },
    ];
  }

  async function newHand(): Promise<void> {
    handNum++;
    if (handNum % 10 === 0) {
      sb *= 2;
      bb *= 2;
    }
    deck = shuffle(createDeck(1));
    community = [];
    pot = 0;
    street = 'preflop';
    players.forEach((p) => {
      p.hole = [];
      p.folded = p.stack <= 0;
      p.bet = 0;
      p.allIn = false;
      if (!p.folded) {
        p.hole.push(deck.pop()!, deck.pop()!);
      }
    });
    dealerBtn = (dealerBtn + 1) % players.length;
    postBlinds();
    current = (dealerBtn + 3) % players.length;
    info.textContent = describePlayerHand(players[0].hole, community);
    renderPot();
    await bettingRound();
  }

  function postBlinds(): void {
    const sbIdx = (dealerBtn + 1) % players.length;
    const bbIdx = (dealerBtn + 2) % players.length;
    bet(players[sbIdx], sb);
    bet(players[bbIdx], bb);
    toCall = bb;
    minRaise = bb * 2;
    current = (bbIdx + 1) % players.length;
  }

  function bet(p: PokerPlayer, amount: number): void {
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    pot += a;
    if (p.stack === 0) p.allIn = true;
    playChip();
  }

  async function bettingRound(): Promise<void> {
    lastRaiser = -1;
    while (true) {
      const p = players[current];
      if (p.folded || p.allIn) {
        current = (current + 1) % players.length;
        continue;
      }
      const need = toCall - p.bet;
      if (p.human) {
        renderHumanControls(need);
        return;
      }
      info.textContent = `${p.name} thinking...`;
      ctrl.innerHTML = '<span class="thinking">...</span>';
      await delay(getDifficulty('poker') === 'easy' ? 2500 : 1500);
      const decision = botPokerAction({
        hole: p.hole,
        community,
        pot,
        toCall: need,
        stack: p.stack,
        minRaise,
        difficulty: getDifficulty('poker'),
      });
      applyAction(p, decision.action, decision.raiseTo);
      if (checkRoundEnd()) break;
      current = (current + 1) % players.length;
    }
    nextStreet();
  }

  function applyAction(p: PokerPlayer, action: string, raiseTo?: number): void {
    const need = toCall - p.bet;
    if (action === 'fold') p.folded = true;
    else if (action === 'check') {
      /* noop */
    } else if (action === 'call') {
      bet(p, need);
    } else if (action === 'raise' && raiseTo) {
      const add = raiseTo - p.bet;
      bet(p, add);
      toCall = p.bet;
      minRaise = raiseTo;
      lastRaiser = current;
    } else if (action === 'allin') {
      bet(p, p.stack);
      if (p.bet > toCall) {
        toCall = p.bet;
        lastRaiser = current;
      }
    }
    renderPot();
  }

  function checkRoundEnd(): boolean {
    const inHand = players.filter((p) => !p.folded);
    if (inHand.length === 1) {
      award(inHand[0]);
      return true;
    }
    const maxBet = Math.max(...players.map((p) => p.bet));
    const allMatched = players.every((p) => p.folded || p.allIn || p.bet === maxBet);
    if (allMatched) {
      const next = (current + 1) % players.length;
      if (lastRaiser === -1 && next === (street === 'preflop' ? (dealerBtn + 3) % players.length : (dealerBtn + 1) % players.length)) return true;
      if (lastRaiser >= 0 && next === (lastRaiser + 1) % players.length) return true;
    }
    return false;
  }

  function renderHumanControls(need: number): void {
    ctrl.innerHTML = '';
    const add = (t: string, fn: () => void) => {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = t;
      b.onclick = fn;
      ctrl.appendChild(b);
    };
    add('Fold', () => {
      applyAction(players[0], 'fold');
      afterHuman();
    });
    if (need === 0) add('Check', () => {
      applyAction(players[0], 'check');
      afterHuman();
    });
    else add(`Call ${need}`, () => {
      applyAction(players[0], 'call');
      afterHuman();
    });
    add('Raise', () => {
      applyAction(players[0], 'raise', toCall + minRaise);
      afterHuman();
    });
    add('All-In', () => {
      applyAction(players[0], 'allin');
      afterHuman();
    });
  }

  async function afterHuman(): Promise<void> {
    current = (current + 1) % players.length;
    if (checkRoundEnd()) nextStreet();
    else await bettingRound();
  }

  async function nextStreet(): Promise<void> {
    players.forEach((p) => (p.bet = 0));
    toCall = 0;
    minRaise = bb;
    lastRaiser = -1;
    current = (dealerBtn + 1) % players.length;

    if (street === 'preflop') {
      street = 'flop';
      community.push(deck.pop()!, deck.pop()!, deck.pop()!);
    } else if (street === 'flop') {
      street = 'turn';
      community.push(deck.pop()!);
    } else if (street === 'turn') {
      street = 'river';
      community.push(deck.pop()!);
    } else if (street === 'river') {
      street = 'showdown';
      showdown();
      return;
    }
    playDeal();
    info.textContent = describePlayerHand(players[0].hole, community);
    await bettingRound();
  }

  function showdown(): void {
    const contenders = players.filter((p) => !p.folded);
    let best = contenders[0];
    for (const p of contenders.slice(1)) {
      if (compareHands([...p.hole, ...community], [...best.hole, ...community]) > 0) best = p;
    }
    award(best);
  }

  function award(winner: PokerPlayer): void {
    winner.stack += pot;
    if (winner.human) {
      recordWin(pot, 'poker');
      playWin();
      host.particles.burst(stage.clientWidth / 2, stage.clientHeight / 2, 60, ['#ffd54f', '#ff2bd6']);
      addChips(pot);
    }
    pot = 0;
    renderPot();
    info.textContent = `${winner.name} wins! (${evaluateHand([...winner.hole, ...community]).rank})`;
    ctrl.innerHTML = '<button class="btn btn-primary" id="pk-next">Next Hand</button>';
    ctrl.querySelector('#pk-next')!.addEventListener('click', () => newHand());
  }

  function renderPot(): void {
    potEl.textContent = `Pot: ${pot} | Blinds ${sb}/${bb}`;
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#0a3d2e';
    ctx.fillRect(0, 0, w, h);
    const cw = Math.min(44, w * 0.07);
    const ch = cw * 1.4;
    community.forEach((c, i) => {
      drawPlayingCard(ctx, { ...c, faceUp: true }, w / 2 - 100 + i * (cw + 6), h * 0.4, cw, ch);
    });
    const angles = 6;
    players.forEach((p, i) => {
      const a = (i / angles) * Math.PI * 2 - Math.PI / 2;
      const x = w / 2 + Math.cos(a) * w * 0.38;
      const y = h / 2 + Math.sin(a) * h * 0.32;
      ctx.fillStyle = p.folded ? '#888' : '#fff';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(`${p.name} $${p.stack}`, x, y - 8);
      if (p.human || street === 'showdown') {
        p.hole.forEach((c, ci) => drawPlayingCard(ctx, { ...c, faceUp: p.human || street === 'showdown' }, x - 20 + ci * (cw * 0.5), y, cw, ch));
      } else {
        drawPlayingCard(ctx, { suit: 'spades', rank: 'A', faceUp: false, id: 'x' }, x - 10, y, cw, ch);
        drawPlayingCard(ctx, { suit: 'spades', rank: 'A', faceUp: false, id: 'y' }, x + 10, y, cw, ch);
      }
      if (i === dealerBtn) {
        ctx.fillStyle = '#ffd54f';
        ctx.fillText('D', x + 30, y - 20);
      }
    });
  });

  initPlayers();
  recordGamePlayed();
  newHand();
  shell.querySelector('#pk-back')!.addEventListener('click', () => navigate({ name: 'lobby' }));

  return () => {
    host.destroy();
    shell.remove();
  };
}
