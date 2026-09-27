/* =============================================================================
   preload.ts — warms every generated SVG (52 card faces, card back, 34 mahjong
   tile faces, 56 UNO faces, 6 avatars) into a hidden offscreen container on
   first load so the tables never hitch mid-deal. Drives the loading bar.
   ========================================================================== */

import { cardFrontSvg } from '../assets/cards';
import { freshDeck } from './deck';
import { avatarSvg } from '../assets/avatars';
import { tileFaceSvg, ALL_TILE_IDS } from '../mahjong/tiles';
import { unoFaceSvg, ALL_UNO_IDS, unoCardFromKey } from '../uno/faces';
import { el } from './utils';

export function preloadAll(onProgress?: (pct: number) => void): Promise<void> {
  return new Promise((resolve) => {
    const host = el('div');
    host.style.cssText =
      'position:fixed;left:-99999px;top:0;width:1200px;height:900px;opacity:0;pointer-events:none;contain:content';
    document.body.appendChild(host);

    const jobs: (() => void)[] = [];
    // playing cards
    for (const c of freshDeck()) {
      jobs.push(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:74px;height:104px';
        d.innerHTML = cardFrontSvg(c);
        host.appendChild(d);
      });
    }
    // mahjong tiles
    for (const t of ALL_TILE_IDS) {
      jobs.push(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:44px;height:60px';
        d.innerHTML = tileFaceSvg(t);
        host.appendChild(d);
      });
    }
    // uno cards
    for (const u of ALL_UNO_IDS) {
      jobs.push(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:56px;height:84px';
        d.innerHTML = unoFaceSvg(unoCardFromKey(u));
        host.appendChild(d);
      });
    }
    // avatars
    for (const a of ['vic', 'lin', 'bella', 'charlie', 'rae', 'nick'] as const) {
      jobs.push(() => {
        const d = document.createElement('div');
        d.style.cssText = 'position:absolute;width:56px;height:56px';
        d.innerHTML = avatarSvg(a, 'normal');
        host.appendChild(d);
      });
    }

    let i = 0;
    const step = () => {
      const t0 = performance.now();
      // time-sliced: keep each slice under ~8ms so the bar keeps animating
      while (i < jobs.length && performance.now() - t0 < 8) jobs[i++]();
      onProgress?.(i / jobs.length);
      if (i < jobs.length) requestAnimationFrame(step);
      else {
        // let the browser rasterise, then drop the scratch DOM
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            host.remove();
            resolve();
          }),
        );
      }
    };
    requestAnimationFrame(step);
  });
}
