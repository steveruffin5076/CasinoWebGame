/** FPS tracking, optional meter (?fps=1), auto quality reduction */

import { loadSave, writeSave } from './storage';

let lowQuality = false;
let showMeter = false;
let _fps = 60;
let badFrames = 0;
let lastTime = performance.now();
let frameCount = 0;
let meterEl: HTMLDivElement | null = null;

export function initFps(): void {
  showMeter = new URLSearchParams(location.search).get('fps') === '1';
  if (showMeter) {
    meterEl = document.createElement('div');
    meterEl.className = 'fps-meter';
    document.body.appendChild(meterEl);
  }
}

export function isHighFpsMode(): boolean {
  const s = loadSave();
  return s.settings.highFps && !lowQuality;
}

export function setHighFpsMode(on: boolean): void {
  const s = loadSave();
  s.settings.highFps = on;
  writeSave(s);
}

export function isLowQuality(): boolean {
  return lowQuality;
}

export function tickFps(): number {
  const now = performance.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  frameCount++;
  if (frameCount >= 30) {
    _fps = Math.round(30 / ((now - (lastTime - dt * 1000 * 30)) / 1000));
    frameCount = 0;
    const instant = dt > 0 ? 1 / dt : 60;
    if (instant < 45) badFrames++;
    else badFrames = Math.max(0, badFrames - 1);
    if (badFrames > 180 && loadSave().settings.highFps) {
      lowQuality = true;
    }
    _fps = Math.round(instant);
    if (meterEl) meterEl.textContent = `FPS: ${_fps}${lowQuality ? ' (low)' : ''}`;
  }
  return Math.min(dt, 0.05);
}

export function particleCap(): number {
  return isHighFpsMode() ? 150 : 40;
}
