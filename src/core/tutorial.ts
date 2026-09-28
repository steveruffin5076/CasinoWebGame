import { loadSave, writeSave } from './storage';

export type TutorialGame = 'blackjack' | 'poker' | 'mahjong';

const CONTENT: Record<TutorialGame, { title: string; body: string }> = {
  blackjack: {
    title: 'How to play Blackjack',
    body: `Goal: Beat the dealer without going over 21.

• Tap a chip (10–500), then Deal.
• Hit = take a card. Stand = keep your total. Double = double bet, one card only. Split = split a pair into two hands (once).
• Dealer stands on all 17. Blackjack (Ace + 10-value) pays 3:2.
• Insurance (optional): When dealer shows Ace, pay half your bet; wins 2:1 if dealer has Blackjack.
• Keyboard: H Hit, S Stand, D Double.
• Bots use basic strategy; difficulty changes how often they err.`,
  },
  poker: {
    title: "How to play Texas Hold'em",
    body: `Goal: Win the pot with the best 5-card hand.

• You buy in with 1,000 table chips from your lobby balance when you sit down. Cash out returns your stack when you leave.
• 6 players, blinds 10/20 (double every 10 hands).
• You get 2 hole cards; 5 community cards are dealt (flop 3, turn 1, river 1).
• Actions: Fold, Check, Call, Raise, All-in. Match the current bet to stay in.
• Hand strength hint appears under the table. Best hand at showdown wins; ties split the pot.
• Bots think briefly before acting. Difficulty changes style (loose/tight).`,
  },
  mahjong: {
    title: 'How to play Hong Kong Mahjong',
    body: `Goal: Complete a legal 14-tile hand (4 sets + 1 pair) to win.

• 136 tiles (no Flowers). You start with 13 tiles as East.
• Each turn: Draw from the wall, then discard one tile (tap tile, tap again or drag up).
• Calls on a discard (8s timer): Win (Hu), Pung (triplet), Chow (sequence — only from player above you), or Pass.
• Scoring uses Fan (simplified HK rules); cap 13 Fan. Self-draw: everyone pays; win on discard: discarder pays.
• Sort orders your hand. Match is 4 East rounds (one wind); Leave ends the session and shows results.`,
  },
};

export function hasSeenTutorial(game: TutorialGame): boolean {
  return !!loadSave().tutorialsSeen?.[game];
}

export function markTutorialSeen(game: TutorialGame): void {
  const s = loadSave();
  s.tutorialsSeen = { ...s.tutorialsSeen, [game]: true };
  writeSave(s);
}

export function showTutorial(game: TutorialGame, force = false): void {
  if (!force && hasSeenTutorial(game)) return;
  const { title, body } = CONTENT[game];
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop tutorial-backdrop';
  const modal = document.createElement('div');
  modal.className = 'modal tutorial-modal';
  modal.innerHTML = `<h3>${title}</h3><div class="tutorial-body"></div>`;
  const bodyEl = modal.querySelector('.tutorial-body')!;
  body.split('\n').forEach((line) => {
    if (!line.trim()) return;
    const p = document.createElement('p');
    p.textContent = line.replace(/^•\s*/, '');
    bodyEl.appendChild(p);
  });
  const row = document.createElement('div');
  row.className = 'tutorial-actions';
  const close = document.createElement('button');
  close.className = 'btn btn-primary';
  close.textContent = 'Got it';
  close.onclick = () => {
    markTutorialSeen(game);
    backdrop.remove();
  };
  row.appendChild(close);
  modal.appendChild(row);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
}

export function addTutorialButton(header: HTMLElement, game: TutorialGame): void {
  const btn = document.createElement('button');
  btn.className = 'btn btn-small';
  btn.textContent = '?';
  btn.title = 'How to play';
  btn.setAttribute('aria-label', 'How to play');
  btn.onclick = () => showTutorial(game, true);
  header.appendChild(btn);
}
