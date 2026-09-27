/* =============================================================================
   chips.ts — the wallet. Virtual chips only, persisted in localStorage.
   Every screen shows the same live balance; changes publish to subscribers so
   the top-bar pill count-up animation fires everywhere at once.
   ========================================================================== */

import { save, START_BALANCE } from './storage';
import { fmt } from './utils';

type Listener = (balance: number, delta: number) => void;
const subs = new Set<Listener>();

export const DENOMS = [10, 50, 100, 500, 1000] as const;
export type Denom = (typeof DENOMS)[number];

export const wallet = {
  get balance(): number {
    return save.data.balance;
  },

  canAfford(n: number): boolean {
    return save.data.balance >= n;
  },

  /** Spend chips (returns false — and does nothing — if the balance is short). */
  spend(n: number): boolean {
    const b = save.data.balance;
    if (n < 0 || b < n) return false;
    save.patch({ balance: b - n });
    emit(-n);
    return true;
  },

  /** Win / refund / bonus. */
  payout(n: number): void {
    if (n <= 0) return;
    save.patch({ balance: save.data.balance + n });
    emit(n);
  },

  /** Force a value (used by FREE REFILL and table cash-outs). */
  set(n: number): void {
    const delta = n - save.data.balance;
    save.patch({ balance: Math.max(0, Math.round(n)) });
    emit(delta);
  },

  refill(): void {
    this.set(START_BALANCE);
  },

  onChange(fn: Listener): () => void {
    subs.add(fn);
    return () => subs.delete(fn);
  },
};

function emit(delta: number) {
  const b = wallet.balance;
  for (const fn of subs) {
    try {
      fn(b, delta);
    } catch (err) {
      console.error('[wallet]', err);
    }
  }
}

/** Formats a chip amount with thousands separators (tabular nums). */
export const chips = (n: number) => `${fmt(n)}`;

/** Breaks an amount into the fewest chips for stack rendering. */
export function chipBreakdown(amount: number): { denom: Denom; count: number }[] {
  const out: { denom: Denom; count: number }[] = [];
  let rest = Math.max(0, Math.round(amount));
  for (const d of [...DENOMS].reverse()) {
    const c = Math.floor(rest / d);
    if (c > 0) {
      out.push({ denom: d, count: Math.min(c, 10) });
      rest -= c * d;
    }
  }
  return out;
}
