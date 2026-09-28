import { easeOutCubic, lerp } from './utils';

export interface AnimTarget {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
}

export interface Tween {
  from: Partial<AnimTarget>;
  to: Partial<AnimTarget>;
  duration: number;
  elapsed: number;
  onComplete?: () => void;
}

export function createTween(
  from: Partial<AnimTarget>,
  to: Partial<AnimTarget>,
  duration: number,
  onComplete?: () => void,
): Tween {
  return { from, to, duration, elapsed: 0, onComplete };
}

export function stepTween(t: Tween, dt: number, target: AnimTarget): boolean {
  t.elapsed += dt;
  const p = easeOutCubic(Math.min(1, t.elapsed / t.duration));
  const keys = new Set([...Object.keys(t.from), ...Object.keys(t.to)]) as Set<keyof AnimTarget>;
  for (const k of keys) {
    const a = t.from[k] ?? target[k];
    const b = t.to[k] ?? target[k];
    (target as unknown as Record<string, number>)[k] = lerp(a as number, b as number, p);
  }
  if (t.elapsed >= t.duration) {
    t.onComplete?.();
    return true;
  }
  return false;
}

/** Card flip: scaleX 1 -> 0 -> 1 with midpoint callback */
export function flipCard(
  target: AnimTarget,
  duration: number,
  onMid?: () => void,
): { update: (dt: number) => boolean } {
  let elapsed = 0;
  let midCalled = false;
  return {
    update(dt: number) {
      elapsed += dt;
      const half = duration / 2;
      if (elapsed < half) {
        target.scaleX = lerp(1, 0.05, easeOutCubic(elapsed / half));
      } else {
        if (!midCalled) {
          midCalled = true;
          onMid?.();
        }
        target.scaleX = lerp(0.05, 1, easeOutCubic((elapsed - half) / half));
      }
      return elapsed >= duration;
    },
  };
}
