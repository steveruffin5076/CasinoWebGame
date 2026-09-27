/* =============================================================================
   chips.ts — chip DOM builders (see chips.css for the 3D look).
   ========================================================================== */

import type { Denom } from '../core/chips';
import { chipBreakdown, DENOMS } from '../core/chips';
import { el } from '../core/utils';

/** A single chip element. */
export function chipEl(denom: number, size = 54): HTMLElement {
  const d = (DENOMS.includes(denom as Denom) ? denom : 10) as number;
  const n = el('div', `chip c${d}`);
  n.style.setProperty('--cs', `${size}px`);
  n.innerHTML = `<div class="in"><b>${d >= 1000 ? '1k' : d}</b></div>`;
  return n;
}

/** A stacked pile of chips representing `amount` (max 5 visible + count). */
export function chipStackEl(amount: number, size = 44): HTMLElement {
  const wrap = el('div', 'chip-stack');
  wrap.style.setProperty('--cs', `${size}px`);
  const parts = chipBreakdown(amount).slice(0, 5);
  if (!parts.length) return wrap;
  let i = 0;
  for (const p of parts) {
    for (let k = 0; k < p.count && i < 5; k++, i++) {
      const c = chipEl(p.denom, size);
      c.style.transform = `translate3d(0, ${-i * Math.max(4, size * 0.16)}px, 0)`;
      c.style.zIndex = String(i);
      c.style.animationDelay = `${i * 35}ms`;
      wrap.appendChild(c);
    }
  }
  return wrap;
}

/** Builds the betting rack (10/50/100/500) used by Blackjack & Poker. */
export function chipRack(
  onPick: (denom: number) => void,
  opts: { clear?: () => void; selected?: number } = {},
): HTMLElement {
  const row = el('div', 'chip-rack');
  for (const d of [10, 50, 100, 500] as Denom[]) {
    const b = el('button', 'chip-btn');
    b.type = 'button';
    b.setAttribute('aria-label', `Bet ${d} chips`);
    b.appendChild(chipEl(d, 52));
    const lbl = el('span', 'lbl', d >= 1000 ? '1k' : String(d));
    b.appendChild(lbl);
    b.addEventListener('click', () => onPick(d));
    row.appendChild(b);
  }
  if (opts.clear) {
    const b = el('button', 'chip-btn');
    b.type = 'button';
    b.innerHTML = `<span class="chip" style="--cs:52px;background:repeating-conic-gradient(from 0deg,#2a2f45 0 9deg,#171b2b 9deg 18deg)">
        <span class="in" style="background:radial-gradient(circle at 34% 26%,rgba(255,255,255,.18),transparent 45%),radial-gradient(circle at 50% 50%,#232838 0 62%,#10131f 100%)"><b style="color:#f8f5ec">✕</b></span></span>
      <span class="lbl">CLEAR</span>`;
    b.setAttribute('aria-label', 'Clear bet');
    b.addEventListener('click', () => opts.clear?.());
    row.appendChild(b);
  }
  return row;
}
