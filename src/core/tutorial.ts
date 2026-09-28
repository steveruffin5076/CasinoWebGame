import { loadSave, writeSave } from './storage';

export type PlayableTutorialGame =
  | 'blackjack'
  | 'poker'
  | 'mahjong'
  | 'baccarat'
  | 'craps'
  | 'roulette'
  | 'slots'
  | 'sicbo';

export type TutorialGame = PlayableTutorialGame;

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
• Sort orders your hand. Match is 4 East rounds per wind (4 winds total).`,
  },
  baccarat: {
    title: 'How to play Baccarat',
    body: `Goal: Bet on which hand totals closer to 9 — Player or Banker (or Tie).

• Two hands are dealt: Player and Banker. You do not play the cards yourself.
• Card values: Ace = 1, 2–9 = face value, 10/J/Q/K = 0. Only the last digit counts (e.g. 15 = 5).
• A third card may be drawn for each side by fixed rules (no choices).
• Common bets: Player (1:1), Banker (1:1 minus 5% commission), Tie (often 8:1 or 9:1).
• Natural: 8 or 9 on the first two cards can end the round immediately.
• Tap chip amount, pick Player/Banker/Tie, then Deal. Banker wins pay 5% commission. Virtual chips only.`,
  },
  craps: {
    title: 'How to play Craps',
    body: `Goal: Bet on the outcome of dice rolls on the craps table.

• The shooter rolls two dice. First roll (Come Out): 7 or 11 wins for Pass Line; 2, 3, or 12 loses (craps).
• Any other number (4–6, 8–10) becomes the Point; shooter tries to roll it again before a 7.
• Pass Line: bet with the shooter. Don't Pass: bet against the shooter (slightly different rules on 12).
• Place bets, Field, Hardways, and Proposition bets cover specific numbers or combinations.
• Multi-roll bets stay up until they win, lose, or you take them down.
• Table etiquette: do not touch dice with your hands in live play; in digital play, tap bet areas then Roll.
• Tap Pass Line bet, then Roll. Come-out: 7/11 wins, 2/3/12 loses. Other numbers set the Point — roll it again before 7.`,
  },
  roulette: {
    title: 'How to play Roulette',
    body: `Goal: Predict where the ball will land on a numbered wheel (0 and 1–36 on European; extra 00 on American).

• Inside bets: straight up (one number), split, street, corner, line — higher payouts, lower odds.
• Outside bets: Red/Black, Odd/Even, 1–18/19–36, Dozens, Columns — lower payouts, better coverage.
• European wheel has one zero (house edge ~2.7% on even-money bets). American has 0 and 00 (~5.26%).
• Place chips on the layout before "No more bets." Winning bets are paid per the paytable.
• Neighbors and racetrack bets group numbers on some tables.
• No skill changes where the ball lands — bankroll and bet sizing matter for session length only.`,
  },
  slots: {
    title: 'How to play Slot Machines',
    body: `Goal: Match symbols on the center payline to win virtual chips.

• Pick bet (10–500), press SPIN.
• Three matching symbols pay the most (💎 best). Any two matching pays 2× your bet.
• Outcomes are random. Virtual chips only.`,
  },
  sicbo: {
    title: 'How to play Sic Bo',
    body: `Goal: Bet on the outcome of three dice rolled in a cage or cup.

• Small: total 4–10 (not triple). Big: total 11–17 (not triple). Even money minus house edge.
• Specific Triple: all three dice show the same chosen number — high payout.
• Any Triple: any triple — lower payout than specific triple.
• Total bets: wager on exact sum (e.g. 10) with payouts by probability.
• Combination: two specific numbers appear on at least two of the three dice.
• Single die: bet one number; pays more if it appears 2 or 3 times.
• Pick bet type and amount, then Roll dice. Small/Big pay even money (triples lose). Any Triple pays 25×.`,
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

export function addTutorialButton(header: HTMLElement, game: PlayableTutorialGame): void {
  const btn = document.createElement('button');
  btn.className = 'btn btn-small';
  btn.textContent = '?';
  btn.title = 'How to play';
  btn.setAttribute('aria-label', 'How to play');
  btn.onclick = () => showTutorial(game, true);
  header.appendChild(btn);
}
