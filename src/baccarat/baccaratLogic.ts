/** Punto banco drawing rules (simplified natural handling) */

export type BaccaratCard = { rank: number }; // 1-13, value uses baccaratValue

export function baccaratValue(rank: number): number {
  if (rank >= 10) return 0;
  return rank;
}

export function handTotal(cards: BaccaratCard[]): number {
  return cards.reduce((s, c) => s + baccaratValue(c.rank), 0) % 10;
}

function drawThirdPlayer(cards: BaccaratCard[]): boolean {
  const t = handTotal(cards);
  return t <= 5;
}

function drawThirdBanker(_player: BaccaratCard[], banker: BaccaratCard[], playerDrew: BaccaratCard | null): boolean {
  const bt = handTotal(banker);
  if (!playerDrew) {
    return bt <= 5;
  }
  const pt = playerDrew.rank >= 10 ? 0 : playerDrew.rank;
  if (bt <= 2) return true;
  if (bt === 3) return pt !== 8;
  if (bt === 4) return pt >= 2 && pt <= 7;
  if (bt === 5) return pt >= 4 && pt <= 7;
  if (bt === 6) return pt === 6 || pt === 7;
  return false;
}

export function resolveHands(
  player: BaccaratCard[],
  banker: BaccaratCard[],
): { player: BaccaratCard[]; banker: BaccaratCard[] } {
  let p = [...player];
  let b = [...banker];
  const pNat = handTotal(p);
  const bNat = handTotal(b);
  if (pNat >= 8 || bNat >= 8) return { player: p, banker: b };

  let pThird: BaccaratCard | null = null;
  if (drawThirdPlayer(p)) {
    pThird = p[2] ?? null;
  } else {
    p = p.slice(0, 2);
  }

  if (drawThirdBanker(p, b, pThird)) {
    /* keep 3 banker cards if dealt */
  } else {
    b = b.slice(0, 2);
  }
  return { player: p, banker: b };
}

export function dealBaccarat(shoe: BaccaratCard[]): {
  player: BaccaratCard[];
  banker: BaccaratCard[];
  rest: BaccaratCard[];
} {
  const s = [...shoe];
  const player = [s.pop()!, s.pop()!];
  const banker = [s.pop()!, s.pop()!];
  if (handTotal(player) < 8 && handTotal(banker) < 8) {
    if (drawThirdPlayer(player)) player.push(s.pop()!);
    const pThird = player.length > 2 ? player[2] : null;
    if (drawThirdBanker(player, banker, pThird)) banker.push(s.pop()!);
  }
  return { player, banker, rest: s };
}

export function makeShoe(decks = 8): BaccaratCard[] {
  const shoe: BaccaratCard[] = [];
  for (let d = 0; d < decks; d++) {
    for (let r = 1; r <= 13; r++) {
      for (let c = 0; c < 4; c++) shoe.push({ rank: r });
    }
  }
  return shoe;
}
