/* =============================================================================
   utils.ts — small shared helpers (DOM, math, timing, formatting).
   ========================================================================== */

export const TAU = Math.PI * 2;

/* ------------------------------- math ------------------------------------ */
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const easeOutBack = (t: number) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
/** Deterministic-ish pseudo random helper (defaults to Math.random). */
export const randInt = (n: number) => Math.floor(Math.random() * n);
export const pick = <T>(a: readonly T[]): T => a[randInt(a.length)];
export const chance = (p: number) => Math.random() < p;

/** Fisher–Yates, in place. */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/* ------------------------------- timing ---------------------------------- */
export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** true when the user asked the OS to reduce motion. */
export const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Is this a touch-first device? (used for hint copy + hit sizing) */
export const isTouch = () =>
  typeof matchMedia === 'function' && matchMedia('(hover: none) and (pointer: coarse)').matches;

/** Reads a boolean query-string flag, e.g. ?fps=1 */
export function flag(name: string): boolean {
  const v = new URLSearchParams(location.search).get(name);
  return v !== null && v !== '0' && v !== 'false';
}

/** Short haptic buzz on supporting phones (never throws). */
export function buzz(ms = 12) {
  try {
    (navigator as Navigator & { vibrate?: (p: number | number[]) => boolean }).vibrate?.(ms);
  } catch {
    /* ignore */
  }
}

/* ------------------------------- DOM ------------------------------------- */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

export const qs = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;

export const qsa = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

/** addEventListener with typed target + automatic passive for touch/scroll. */
export function on<K extends keyof HTMLElementEventMap>(
  target: HTMLElement | Window | Document,
  type: K | string,
  fn: (ev: HTMLElementEventMap[K]) => void,
  opts?: AddEventListenerOptions,
): () => void {
  const o: AddEventListenerOptions =
    opts ?? (/^(touchstart|touchmove|wheel|scroll)$/.test(type) ? { passive: true } : {});
  target.addEventListener(type, fn as EventListener, o);
  return () => target.removeEventListener(type, fn as EventListener, o);
}

/* --------------------------- formatting ---------------------------------- */
/** 1_234_567 -> "1,234,567" (tabular-nums safe). */
export const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
export const signed = (n: number) => (n >= 0 ? `+${fmt(n)}` : `-${fmt(-n)}`);

/** Count-up tween used by the balance pill / pot displays. */
export function countUp(
  node: HTMLElement,
  from: number,
  to: number,
  dur = 700,
  format: (n: number) => string = fmt,
) {
  if (reducedMotion() || dur <= 0) {
    node.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  let raf = 0;
  const step = (t: number) => {
    const p = clamp((t - t0) / dur, 0, 1);
    node.textContent = format(lerp(from, to, easeOutCubic(p)));
    if (p < 1) raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

/* --------------------------- misc ---------------------------------------- */
export const uid = (() => {
  let i = 0;
  return (p = 'id') => `${p}-${++i}`;
})();

/** Deep clone of plain data (no functions/dates). */
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Group array items by key. */
export function groupBy<T, K extends string | number>(a: T[], key: (v: T) => K) {
  const m = {} as Record<K, T[]>;
  for (const v of a) (m[key(v)] ||= []).push(v);
  return m;
}

/**
 * Scales a fixed-size "virtual stage" to fit its container.
 * Card layouts are authored once in virtual pixels (e.g. 1000x640) and then
 * scaled with a single GPU transform — no layout thrash, perfect on any screen
 * from 360px phones to 1920px desktops.
 */
export function fitStage(
  stage: HTMLElement,
  wrap: HTMLElement,
  vw: number,
  vh: number,
  pad = 8,
): () => void {
  const apply = () => {
    const w = wrap.clientWidth - pad * 2;
    const h = wrap.clientHeight - pad * 2;
    if (w <= 0 || h <= 0) return;
    const s = Math.min(w / vw, h / vh);
    stage.style.width = `${vw}px`;
    stage.style.height = `${vh}px`;
    stage.style.transform = `scale(${s})`;
  };
  apply();
  const ro = new ResizeObserver(apply);
  ro.observe(wrap);
  window.addEventListener('orientationchange', apply);
  return () => {
    ro.disconnect();
    window.removeEventListener('orientationchange', apply);
  };
}

/** Converts virtual stage coordinates to viewport (client) coordinates. */
export function stageToClient(stage: HTMLElement, x: number, y: number) {
  const r = stage.getBoundingClientRect();
  const s = r.width / stage.offsetWidth || 1;
  return { x: r.left + x * s, y: r.top + y * s, scale: s };
}

/** Element centre in viewport coordinates. */
export function center(node: HTMLElement) {
  const r = node.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
