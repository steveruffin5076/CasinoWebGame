/** Synthesized SFX via Web Audio API — no external files */

import { loadSave, writeSave } from './storage';

let ctx: AudioContext | null = null;

function ac(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  return ctx;
}

export function isMuted(): boolean {
  return loadSave().settings.soundMuted;
}

export function setMuted(m: boolean): void {
  const s = loadSave();
  s.settings.soundMuted = m;
  writeSave(s);
}

export function toggleMute(): boolean {
  setMuted(!isMuted());
  return isMuted();
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08): void {
  if (isMuted()) return;
  const c = ac();
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(c.destination);
  const t = c.currentTime;
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur);
}

export function resumeAudio(): void {
  if (!isMuted()) ac().resume();
}

export function playChip(): void {
  tone(880, 0.05, 'square', 0.04);
  setTimeout(() => tone(1200, 0.04, 'square', 0.03), 30);
}

export function playDeal(): void {
  tone(400, 0.06, 'triangle', 0.05);
}

export function playFlip(): void {
  tone(600, 0.08, 'sawtooth', 0.03);
}

export function playWin(): void {
  [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.12, 'sine', 0.06), i * 80));
}

export function playLose(): void {
  tone(200, 0.2, 'sawtooth', 0.05);
}

export function playClick(): void {
  tone(1000, 0.03, 'square', 0.02);
}

export function playUno(): void {
  tone(740, 0.1, 'square', 0.06);
  setTimeout(() => tone(988, 0.15, 'square', 0.06), 100);
}
