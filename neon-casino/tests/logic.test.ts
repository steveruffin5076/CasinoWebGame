/* Headless logic tests for the Neon Casino engines (run via esbuild+node). */
import { BlackjackEngine, isBlackjack } from '../src/blackjack/engine';
import { botDecide } from '../src/ai/blackjackBot';
import { PokerEngine } from '../src/poker/engine';
import { pokerBotDecide } from '../src/ai/pokerBot';
import { evaluate, evaluate5, preflopStrength, compare } from '../src/poker/handEval';
import { UnoEngine } from '../src/uno/engine';
import { unoBotChoose } from '../src/ai/unoBot';
import { decompose, shanten, canWin, scoreWin, countsOf } from '../src/mahjong/scoring';
import { buildWall, sortTiles, type TileId } from '../src/mahjong/tiles';
import { mahjongBotDiscard, mahjongBotChow, mahjongBotPung } from '../src/ai/mahjongBot';
import type { Card } from '../src/core/deck';
import { freshDeck } from '../src/core/deck';

let failures = 0;
const ok = (cond: boolean, name: string) => {
  if (!cond) {
    failures++;
    console.error('  ✗ FAIL:', name);
  } else console.log('  ✓', name);
};

/* ------------------------------- handEval --------------------------------- */
console.log('\n--- poker hand evaluator ---');
const C = (r: string, s: string): Card => ({
  id: Math.random() * 1e9,
  r: r as Card['r'],
  s: s as Card['s'],
  v: 0,
});
const ev = (cards: Card[]) => evaluate5(cards);
ok(ev([C('A','s'),C('K','s'),C('Q','s'),C('J','s'),C('10','s')]).name.includes('Royal'), 'royal flush');
ok(ev([C('9','h'),C('8','h'),C('7','h'),C('6','h'),C('5','h')]).cat === 8, 'straight flush');
ok(ev([C('9','c'),C('9','d'),C('9','h'),C('9','s'),C('5','h')]).cat === 7, 'quads');
ok(ev([C('9','c'),C('9','d'),C('3','h'),C('3','s'),C('3','h')]).cat === 6, 'full house');
ok(ev([C('2','c'),C('5','c'),C('7','c'),C('9','c'),C('J','c')]).cat === 5, 'flush');
ok(ev([C('5','c'),C('6','d'),C('7','h'),C('8','s'),C('9','h')]).cat === 4, 'straight');
ok(ev([C('14','s') as any ?? null, C('2','d'),C('3','h'),C('4','s'),C('5','h')]).cat === 4, 'wheel straight');
ok(ev([C('7','c'),C('7','d'),C('7','h'),C('2','s'),C('9','h')]).cat === 3, 'trips');
ok(ev([C('7','c'),C('7','d'),C('2','h'),C('2','s'),C('9','h')]).cat === 2, 'two pair');
ok(ev([C('7','c'),C('7','d'),C('A','h'),C('K','s'),C('9','h')]).cat === 1, 'pair');
ok(ev([C('A','c'),C('J','d'),C('8','h'),C('5','s'),C('3','h')]).cat === 0, 'high card');
ok(compare(evaluate([C('A','s'),C('K','s'),C('Q','s'),C('J','s'),C('10','s'),C('2','h'),C('3','d')]), evaluate([C('A','c'),C('A','d'),C('K','h'),C('K','s'),C('K','h')])) > 0, 'royal beats trips in evaluate7');
ok(preflopStrength([C('A','s'),C('K','s')]) > preflopStrength([C('7','d'),C('2','c')]), 'AKs > 72o');

/* ------------------------------- blackjack -------------------------------- */
console.log('\n--- blackjack engine (500 bot rounds) ---');
{
  let err = 0;
  let bjCount = 0;
  for (let i = 0; i < 500; i++) {
    try {
      const e = new BlackjackEngine(['A', 'B', 'C', 'D'], 0);
      e.autoBetBots();
      e.placeBet(0, 10);
      // deal
      for (let pass = 0; pass < 2; pass++) {
        for (let s = 0; s < e.players.length; s++) {
          if (e.players[s].hand && e.players[s].hand!.cards.length <= pass) e.players[s].hand!.cards.push(e.shoe.draw());
        }
        e.dealer.push(e.shoe.draw());
      }
      if (isBlackjack(e.dealer)) {
        e.settle();
        e.settleInsurance();
        bjCount++;
        continue;
      }
      // players act
      for (let s = 0; s < e.players.length; s++) {
        let guard = 0;
        while (e.players[s] && e.players[s].hand && !e.players[s].hand!.done && guard++ < 12) {
          const act = botDecide(e.players[s].hand!.cards, e.dealer[0], e.canDouble(s), e.canSplit(s), 'hard');
          if (act === 'hit') e.hit(s);
          else if (act === 'stand') e.stand(s);
          else if (act === 'double') e.double(s);
          else if (act === 'split') {
            e.split(s);
            if (e.splitPending(s)) e.fillSplit(s);
            // handle ghost seat
            const ghost = e.players[s + 1];
            if (ghost?.name.includes('(2)')) {
              let g2 = 0;
              while (ghost.hand && !ghost.hand.done && g2++ < 12) {
                const a2 = botDecide(ghost.hand.cards, e.dealer[0], e.canDouble(s + 1), e.canSplit(s + 1), 'hard');
                if (a2 === 'hit') e.hit(s + 1);
                else if (a2 === 'double') e.double(s + 1);
                else e.stand(s + 1);
              }
            }
          }
        }
        // ghost seats appended shift indices; loop handles them as normal seats
      }
      e.playDealer();
      e.settle();
      e.nextRound();
    } catch (ex) {
      err++;
      if (err < 3) console.error('   round error:', ex);
    }
  }
  ok(err === 0, `500 blackjack rounds without errors (${err} failed)`);
  ok(bjCount > 0, `dealer blackjacks occurred (${bjCount})`);
}

/* --------------------------------- poker ---------------------------------- */
console.log('\n--- poker engine (200 hands, all bots) ---');
{
  let err = 0;
  let showdowns = 0;
  let foldouts = 0;
  for (let h = 0; h < 200; h++) {
    try {
      const e = new PokerEngine(['B0','B1','B2','B3','B4','B5'], -1, 1000);
      if (e.players[0].isHuman) throw new Error('bad');
      e.startHand();
      let guard = 0;
      while (!e.handOver && guard++ < 400) {
        if (e.activeNotFolded().length <= 1) break;
        while (!e.bettingDone() && guard++ < 400) {
          if (e.activeNotFolded().length <= 1) break;
          const s = e.turn;
          const p = e.players[s];
          if (p.folded || p.allIn || p.sittingOut) { e.advanceTurn(); continue; }
          const dec = pokerBotDecide(e, s, 'normal', 0.5);
          e.apply(s, dec.action);
          e.advanceTurn();
        }
        if (e.activeNotFolded().length <= 1) break;
        if (e.street === 'river') break;
        e.dealStreet();
        e.finishStreet();
      }
      if (e.activeNotFolded().length <= 1) { e.foldout(); foldouts++; }
      else { e.showdown(); showdowns++; }
      // conservation of chips: every committed/bet chip ends up in a stack
      // (potOnTable keeps stale committed values until the next hand starts)
      const total = e.players.reduce((a, p) => a + p.stack, 0);
      if (total !== 6000) throw new Error(`chip leak: ${total}`);
      e.nextRound?.();
    } catch (ex) {
      err++;
      if (err < 3) console.error('   hand error:', ex);
    }
  }
  ok(err === 0, `200 poker hands without errors (${err} failed)`);
  ok(showdowns > 20 && foldouts > 20, `mix of showdowns (${showdowns}) and foldouts (${foldouts})`);
}

/* ---------------------------------- uno ----------------------------------- */
console.log('\n--- uno engine (100 rounds, all bots) ---');
{
  let err = 0;
  let wins = 0;
  for (let r = 0; r < 100; r++) {
    try {
      const e = new UnoEngine(['A','B','C','D'], -1);
      e.startRound();
      let guard = 0;
      while (!e.over && guard++ < 2000) {
        const s = e.turn;
        const p = e.players[s];
        const legal = e.playableIndices();
        if (!legal.length) {
          const c = e.drawOne();
          if (e.canPlayDrawn(c)) {
            const idx = p.hand.findIndex((x) => x.uid === c.uid);
            e.play(idx, 'r');
          } else e.pass();
        } else {
          const ch = unoBotChoose(e, s, 'normal');
          if (ch.shoutUno && p.hand.length === 2) e.shoutUno(s);
          e.play(ch.index!, ch.color);
        }
      }
      if (e.over) wins++;
      const cards = e.players.reduce((a, p) => a + p.hand.length, 0) + e.discard.length + e.deck.length;
      if (cards !== 108) throw new Error(`card leak: ${cards}`);
    } catch (ex) {
      err++;
      if (err < 3) console.error('   round error:', ex);
    }
  }
  ok(err === 0, `100 uno rounds without errors (${err} failed)`);
  ok(wins === 100, `all rounds ended (${wins})`);
}

/* -------------------------------- mahjong --------------------------------- */
console.log('\n--- mahjong scoring ---');
{
  // 111 234 567 99 + 555 = winning hand
  const win1: TileId[] = ['d1','d1','d1','d2','d3','d4','d5','d6','d7','b5','b5','c9','c9','c9'];
  ok(decompose(win1) !== null, 'decompose: 111 234 567 555 99');
  ok(canWin(win1.slice(0, 13), 0, win1[13]), 'canWin on the 14th tile');
  // not a win
  const notWin: TileId[] = ['d1','d1','d2','d3','d4','d5','d6','d7','b5','b5','c9','c9','c2','c3'];
  ok(decompose(notWin) === null, 'decompose rejects non-winning hand');
  // shanten sanity
  const tenpai: TileId[] = ['d1','d1','d1','d2','d3','d4','d5','d6','d7','b5','b5','c9','c9'];
  ok(shanten(tenpai, 0) === 0, `tenpai hand = 0 shanten (got ${shanten(tenpai, 0)})`);
  const junk: TileId[] = ['d1','d3','d5','d7','d9','b2','b4','b6','b8','c1','c3','c5','we'];
  const sj = shanten(junk, 0);
  ok(sj >= 3, `junk hand far from ready (got ${sj})`);
  // scoring
  const d = decompose(win1)!;
  const sets = [...d.sets.map((s) => ({ ...s, concealed: true }))];
  const res = scoreWin(sets, d.pair, 0, 0, true);
  ok(res.fan >= 1, `scoring produces fan (${res.fan})`);
  ok(res.lines.length >= 2, 'scoring lists breakdown lines');
  // all pungs: 111 555 999 EEE + RR pair
  const pungs: TileId[] = ['d1','d1','d1','d5','d5','d5','d9','d9','d9','we','we','we','dr','dr'];
  const dp = decompose(pungs)!;
  const rp = scoreWin(dp.sets.map((s) => ({ ...s, concealed: true })), dp.pair, 0, 0, false);
  ok(rp.lines.some((l) => l.name === 'All Pungs'), 'All Pungs detected');
  // dragon pung: 111 555 999 RRR + EE pair
  const dr: TileId[] = ['d1','d1','d1','d5','d5','d5','d9','d9','d9','dr','dr','dr','we','we'];
  const dd = decompose(dr)!;
  const rd = scoreWin(dd.sets.map((s) => ({ ...s, concealed: true })), dd.pair, 0, 0, false);
  ok(rd.lines.some((l) => l.name === 'Dragon Pung/Kong'), 'dragon pung detected');
  // bot discard never throws on random hands
  let err = 0;
  for (let i = 0; i < 200; i++) {
    try {
      const wall = buildWall().slice(0, 13);
      const sorted = sortTiles(wall);
      const discard = mahjongBotDiscard({ hand: sorted, melds: 0, visible: sorted }, 'hard');
      if (!sorted.includes(discard)) throw new Error('discard not in hand');
      mahjongBotPung({ hand: sorted, melds: 0, visible: sorted }, 'd1', 'normal');
      mahjongBotChow({ hand: sorted, melds: 0, visible: sorted }, 'd5', 'hard');
    } catch {
      err++;
    }
  }
  ok(err === 0, `200 random bot discards without errors (${err})`);
}

console.log('\n' + (failures === 0 ? 'ALL TESTS PASSED ✅' : `${failures} FAILURES ❌`));
process.exit(failures === 0 ? 0 : 1);
