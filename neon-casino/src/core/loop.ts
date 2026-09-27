/* =============================================================================
   loop.ts — ONE requestAnimationFrame loop for the whole app.
   Everything animated (particles, count-downs, FPS sampling) subscribes here
   so we never stack rAF loops and never fight for frames.
   ========================================================================== */

import { flag, reducedMotion } from './utils';
import { save } from './storage';

type Cb = (dt: number, now: number) => void;

class Ticker {
  private subs = new Set<Cb>();
  private raf = 0;
  private last = 0;
  private frames = 0;
  private acc = 0;
  private slowFor = 0;

  fps = 60;
  /** true when the device (or the user) asked for the cheap visual path */
  low = false;
  /** particle budget multiplier derived from `low` */
  get quality() {
    return this.low ? 0.3 : 1;
  }

  constructor() {
    this.low = save.settings().fx === 'low' || reducedMotion();
    if (reducedMotion()) document.documentElement.classList.add('lowfx');
    this.start();
  }

  add(cb: Cb) {
    this.subs.add(cb);
    return () => this.subs.delete(cb);
  }

  private start() {
    this.last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(64, t - this.last); // clamp long frames (tab switches)
      this.last = t;
      // fps sampling (weighted, updated ~4x/second)
      this.frames++;
      this.acc += dt;
      if (this.acc >= 250) {
        this.fps = Math.round((this.frames * 1000) / this.acc);
        this.frames = 0;
        this.acc = 0;
        this.sample();
      }
      for (const cb of this.subs) {
        try {
          cb(dt, t);
        } catch (err) {
          // a broken subscriber must never kill the loop
          console.error('[ticker]', err);
        }
      }
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  /** Auto-degrade: below 45fps for 3 consecutive seconds -> low FX mode. */
  private sample() {
    if (this.low) return;
    if (this.fps < 45) {
      this.slowFor += 0.25;
      if (this.slowFor >= 3) this.degrade('auto');
    } else {
      this.slowFor = Math.max(0, this.slowFor - 0.25);
    }
  }

  degrade(reason: 'auto' | 'user') {
    if (this.low && reason === 'auto') return;
    this.low = true;
    document.documentElement.classList.add('lowfx');
    window.dispatchEvent(new CustomEvent('fx:degrade', { detail: { reason } }));
  }

  upgrade() {
    this.low = reducedMotion();
    if (!this.low) {
      document.documentElement.classList.remove('lowfx');
      this.slowFor = 0;
    }
  }

  stop() {
    cancelAnimationFrame(this.raf);
  }
}

export const ticker = new Ticker();

/* ------------------------------- FPS meter -------------------------------- */
/** Shows a live FPS/particle readout when the URL contains ?fps=1 */
export function installFpsMeter() {
  if (!flag('fps')) return;
  const node = document.createElement('div');
  node.id = 'fps';
  document.body.appendChild(node);
  let acc = 0;
  ticker.add((dt) => {
    acc += dt;
    if (acc < 200) return;
    acc = 0;
    node.textContent = `${ticker.fps} fps\n${ticker.low ? 'low-fx' : 'full-fx'}`;
  });
}
