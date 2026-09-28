import { GameHost } from '../core/GameHost';
import { createDeck, drawPlayingCard } from '../core/assets';
import { shuffle, delay } from '../core/utils';
import { getDifficulty } from '../core/storage';
import { botPokerAction, describePlayerHand } from '../ai/pokerBot';
import { evaluateHand, findShowdownWinners } from './handEval';
import { BettingRound } from './betting';
import type { PokerPlayer } from './types';
import { addChips, getChips, recordGamePlayed, recordWin } from '../core/chips';
import { playChip, playDeal, playWin } from '../core/audio';
import { navigate } from '../core/router';
import { addTutorialButton, showTutorial } from '../core/tutorial';

const BUY_IN = 1000;
type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export function mountPoker(root: HTMLElement): () => void {
  const shell = document.createElement('div');
  shell.className = 'game-shell theme-poker';
  shell.innerHTML = `<div class="game-header"><button class="btn btn-small" id="pk-back">← Lobby</button><h2>♥️ Texas Hold'em</h2><span id="pk-pot"></span></div><div class="game-stage" id="pk-stage"></div><div class="info-bar" id="pk-info"></div><div class="game-controls" id="pk-ctrl"></div>`;
  root.appendChild(shell);

  const header = shell.querySelector('.game-header') as HTMLElement;
  addTutorialButton(header, 'poker');
  showTutorial('poker');

  const stage = shell.querySelector('#pk-stage') as HTMLElement;
  const info = shell.querySelector('#pk-info') as HTMLElement;
  const ctrl = shell.querySelector('#pk-ctrl') as HTMLElement;
  const potEl = shell.querySelector('#pk-pot') as HTMLElement;
  const host = new GameHost(stage, '#1a5c3a');

  let deck: ReturnType<typeof createDeck> = [];
  let players: PokerPlayer[] = [];
  let community: ReturnType<typeof createDeck> = [];
  let pot = 0;
  let dealerBtn = 0;
  let current = 0;
  let street: Street = 'preflop';
  let handNum = 0;
  let sb = 10;
  let bb = 20;
  let toCall = 0;
  let minRaise = 20;
  let round: BettingRound | null = null;
  let cashedIn = false;

  function cashIn(): boolean {
    if (cashedIn) return true;
    if (getChips() < BUY_IN) {
      info.textContent = `Need ${BUY_IN} lobby chips to buy in`;
      return false;
    }
    addChips(-BUY_IN);
    cashedIn = true;
    return true;
  }

  function cashOut(): void {
    if (!cashedIn) return;
    addChips(players[0]?.stack ?? 0);
    cashedIn = false;
  }

  function initPlayers(): void {
    const humanStack = cashIn() ? BUY_IN : 0;
    players = [
      { name: 'You', human: true, stack: humanStack, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 1', human: false, stack: BUY_IN, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 2', human: false, stack: BUY_IN, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 3', human: false, stack: BUY_IN, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 4', human: false, stack: BUY_IN, hole: [], folded: false, bet: 0, allIn: false },
      { name: 'Bot 5', human: false, stack: BUY_IN, hole: [], folded: false, bet: 0, allIn: false },
    ];
  }

  function nextActive(from: number): number {
    const n = players.length;
    for (let i = 1; i <= n; i++) {
      const j = (from + i) % n;
      if (!players[j].folded && !players[j].allIn) return j;
    }
    return from;
  }

  async function newHand(): Promise<void> {
    if (!cashIn() && players[0].stack <= 0) return;
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
    const first = (dealerBtn + 3) % players.length;
    round = new BettingRound(players, first);
    current = first;
    info.textContent = describePlayerHand(players[0].hole, community);
    renderPot();
    await runBettingRound();
  }

  function postBlinds(): void {
    const sbIdx = (dealerBtn + 1) % players.length;
    const bbIdx = (dealerBtn + 2) % players.length;
    putChips(players[sbIdx], sb);
    putChips(players[bbIdx], bb);
    toCall = players[bbIdx].bet;
    minRaise = bb;
  }

  function putChips(p: PokerPlayer, amount: number): void {
    const a = Math.min(amount, p.stack);
    p.stack -= a;
    p.bet += a;
    pot += a;
    if (p.stack === 0) p.allIn = true;
    playChip();
  }

  async function runBettingRound(): Promise<void> {
    if (!round) return;
    while (true) {
      if (round.aliveCount() <= 1) {
        const winner = players.find((p) => !p.folded)!;
        award([winner]);
        return;
      }
      if (round.isComplete()) break;

      const p = players[current];
      if (p.folded || p.allIn) {
        current = nextActive(current);
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
      applyAction(current, decision.action, decision.raiseTo);
      if (round!.aliveCount() <= 1) {
        award([players.find((x) => !x.folded)!]);
        return;
      }
      if (round!.isComplete()) break;
      current = nextActive(current);
    }
    await nextStreet();
  }

  function applyAction(idx: number, action: string, raiseTo?: number): void {
    if (!round) return;
    const p = players[idx];
    const need = toCall - p.bet;

    if (action === 'fold') {
      p.folded = true;
      round.onFold(idx);
    } else if (action === 'check') {
      if (need > 0) return;
      round.onMatchedBet(idx);
    } else if (action === 'call') {
      putChips(p, need);
      round.onMatchedBet(idx);
    } else if (action === 'raise' && raiseTo !== undefined) {
      const target = Math.max(toCall + minRaise, raiseTo);
      const prevToCall = toCall;
      putChips(p, target - p.bet);
      if (p.bet > prevToCall) {
        minRaise = Math.max(bb, p.bet - prevToCall);
        toCall = p.bet;
        round.onRaise(idx);
      } else {
        round.onMatchedBet(idx);
      }
    } else if (action === 'allin') {
      const prevToCall = toCall;
      const beforeBet = p.bet;
      const amount = p.stack;
      putChips(p, amount);
      if (p.bet > prevToCall) {
        toCall = p.bet;
        minRaise = Math.max(bb, p.bet - beforeBet);
        round.onRaise(idx);
      } else {
        round.onMatchedBet(idx);
      }
    }
    renderPot();
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
    add('Fold', () => afterHuman('fold'));
    if (need === 0) add('Check', () => afterHuman('check'));
    else add(`Call ${need}`, () => afterHuman('call'));
    add('Raise', () => afterHuman('raise', toCall + minRaise));
    add('All-In', () => afterHuman('allin'));
  }

  async function afterHuman(action: string, raiseTo?: number): Promise<void> {
    applyAction(0, action, raiseTo);
    if (!round) return;
    if (round.aliveCount() <= 1) {
      award([players.find((p) => !p.folded)!]);
      return;
    }
    if (round.isComplete()) {
      await nextStreet();
      return;
    }
    current = nextActive(current);
    await runBettingRound();
  }

  async function nextStreet(): Promise<void> {
    players.forEach((p) => (p.bet = 0));
    toCall = 0;
    minRaise = bb;

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
    const first = nextActive(dealerBtn);
    round = new BettingRound(players, first);
    current = first;
    await runBettingRound();
  }

  function showdown(): void {
    const contenders = players
      .map((p, i) => ({ p, i }))
      .filter((x) => !x.p.folded)
      .map((x) => ({ playerIndex: x.i, cards: [...x.p.hole, ...community] }));
    const winnerIdx = findShowdownWinners(contenders);
    const winners = winnerIdx.map((i) => players[i]);
    award(winners);
  }

  function award(winners: PokerPlayer[]): void {
    if (!winners.length) return;
    const totalPot = pot;
    const share = Math.floor(totalPot / winners.length);
    let remainder = totalPot - share * winners.length;
    for (const w of winners) {
      w.stack += share + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
    }
    const humanWon = winners.some((w) => w.human);
    if (humanWon) {
      const humanPortion =
        winners.length === 1 && winners[0].human ? totalPot : share * winners.filter((w) => w.human).length;
      recordWin(humanPortion, 'poker');
      playWin();
      host.particles.burst(stage.clientWidth / 2, stage.clientHeight / 2, 60, ['#c9a227', '#fff']);
    }
    const names = winners.map((w) => w.name).join(' & ');
    const rank =
      winners.length === 1
        ? evaluateHand([...winners[0].hole, ...community]).rank
        : 'split pot';
    info.textContent = `${names} win ${totalPot} (${rank})`;
    pot = 0;
    renderPot();
    ctrl.innerHTML = '<button class="btn btn-primary" id="pk-next">Next Hand</button>';
    ctrl.querySelector('#pk-next')!.addEventListener('click', () => newHand());
  }

  function renderPot(): void {
    const stack = players[0]?.stack ?? 0;
    potEl.textContent = `Pot: ${pot} | You: ${stack} | Blinds ${sb}/${bb}`;
  }

  host.start((ctx, _dt, w, h) => {
    ctx.fillStyle = '#1a5c3a';
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
        p.hole.forEach((c, ci) =>
          drawPlayingCard(ctx, { ...c, faceUp: true }, x - 20 + ci * (cw * 0.5), y, cw, ch),
        );
      } else {
        drawPlayingCard(ctx, { suit: 'spades', rank: 'A', faceUp: false, id: 'x' }, x - 10, y, cw, ch);
        drawPlayingCard(ctx, { suit: 'spades', rank: 'A', faceUp: false, id: 'y' }, x + 10, y, cw, ch);
      }
      if (i === dealerBtn) {
        ctx.fillStyle = '#c9a227';
        ctx.fillText('D', x + 30, y - 20);
      }
    });
  });

  initPlayers();
  recordGamePlayed();
  newHand();

  const onBack = () => {
    cashOut();
    navigate({ name: 'lobby' });
  };
  shell.querySelector('#pk-back')!.addEventListener('click', onBack);

  return () => {
    cashOut();
    host.destroy();
    shell.remove();
  };
}
