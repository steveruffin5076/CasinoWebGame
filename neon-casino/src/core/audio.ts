/* =============================================================================
   audio.ts — Web Audio API sound kit. Every sound is synthesised at runtime
   (oscillators + noise buffers): zero external files, works fully offline.
   The AudioContext is created lazily on the first user gesture so autoplay
   policies never produce console warnings/errors.
   ========================================================================== */

import { save } from './storage';

type Wave = OscillatorType;

class AudioKit {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private ready = false;

  /** Called from the first click/keypress anywhere. */
  unlock() {
    if (this.ready) return;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      // one shared noise buffer for cards / chips / shuffles
      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      this.noise = buf;
      this.ready = true;
    } catch {
      this.ready = false;
    }
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  get enabled() {
    return save.settings().sound;
  }

  setEnabled(v: boolean) {
    save.setSetting('sound', v);
    if (v) this.unlock();
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /** generic tone */
  private tone(
    freq: number,
    dur = 0.14,
    type: Wave = 'sine',
    gain = 0.16,
    slideTo?: number,
    delay = 0,
  ) {
    if (!this.ready || !this.ctx || !this.master || !this.enabled) return;
    const t = this.now() + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** filtered noise burst (cards, chips, tiles) */
  private burst(
    dur = 0.09,
    gain = 0.2,
    freq = 2400,
    q = 1.2,
    type: BiquadFilterType = 'bandpass',
    delay = 0,
  ) {
    if (!this.ready || !this.ctx || !this.master || !this.noise || !this.enabled) return;
    const t = this.now() + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  /* --------------------------- sound palette ----------------------------- */
  click() {
    this.tone(660, 0.06, 'square', 0.07);
  }
  /** card sliding off the shoe */
  deal() {
    this.burst(0.11, 0.16, 2000, 0.9);
    this.tone(320, 0.09, 'triangle', 0.05, 220);
  }
  /** card flipping face-up */
  flip() {
    this.burst(0.07, 0.13, 3600, 1.6);
    this.tone(520, 0.07, 'sine', 0.05, 720);
  }
  /** chip placed on felt */
  chip(i = 0) {
    this.burst(0.07, 0.2, 1400 + i * 90, 3.4);
    this.tone(180 + i * 22, 0.07, 'square', 0.05);
  }
  /** mahjong tile clack */
  tile() {
    this.burst(0.06, 0.24, 1100, 5);
    this.tone(240, 0.06, 'square', 0.05, 170);
  }
  /** UNO card slap */
  slap() {
    this.burst(0.09, 0.22, 1700, 2.2);
  }
  /** player turn chime (cyan) */
  turn() {
    this.tone(880, 0.1, 'sine', 0.07);
    this.tone(1320, 0.12, 'sine', 0.05, undefined, 0.07);
  }
  win(big = false) {
    const seq = big ? [523, 659, 784, 1047, 1319] : [523, 659, 784];
    seq.forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.13, undefined, i * 0.075));
    if (big) this.tone(1568, 0.5, 'sine', 0.09, undefined, 0.42);
  }
  lose() {
    this.tone(392, 0.28, 'sawtooth', 0.09, 196);
    this.tone(294, 0.34, 'sine', 0.07, 147, 0.1);
  }
  /** push / tie */
  push() {
    this.tone(440, 0.14, 'sine', 0.08);
    this.tone(440, 0.14, 'sine', 0.08, undefined, 0.16);
  }
  /** countdown tick for call timers */
  tick() {
    this.tone(1200, 0.04, 'square', 0.045);
  }
  /** "UNO!" shout */
  uno() {
    this.tone(784, 0.12, 'square', 0.12);
    this.tone(1047, 0.2, 'square', 0.1, undefined, 0.11);
  }
  /** mahjong call (Pung / Kong / Chow / Hu) */
  call() {
    this.tone(330, 0.1, 'square', 0.1);
    this.tone(494, 0.18, 'square', 0.09, undefined, 0.09);
  }
  /** chips counting / pots paid */
  coins() {
    for (let i = 0; i < 6; i++) this.burst(0.06, 0.1, 2600 + Math.random() * 1800, 6, 'bandpass', i * 0.045);
  }
  shuffle() {
    for (let i = 0; i < 7; i++) this.burst(0.07, 0.09, 1800 + Math.random() * 900, 1.4, 'bandpass', i * 0.05);
  }
}

export const sfx = new AudioKit();

/** Install the one-time gesture unlock (safe to call more than once). */
export function installAudioUnlock() {
  const go = () => {
    sfx.unlock();
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
    window.removeEventListener('touchstart', go, true);
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
  window.addEventListener('touchstart', go, true);
}
