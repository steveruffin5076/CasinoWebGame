import { tickFps } from './fps';
import { ParticlePool } from './particles';

export type GameLoop = (ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => void;

export class GameHost {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop | null = null;
  private raf = 0;
  private ro: ResizeObserver | null = null;
  private clearColor = '#0d3d24';
  particles = new ParticlePool();
  floatingTexts: { x: number; y: number; text: string; life: number; vy: number }[] = [];

  constructor(parent: HTMLElement, clearColor = '#0d3d24') {
    this.clearColor = clearColor;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    parent.appendChild(this.canvas);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(parent);
  }

  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  start(loop: GameLoop): void {
    this.loop = loop;
    const frame = () => {
      const dt = tickFps();
      const dpr = window.devicePixelRatio || 1;
      const w = this.canvas.width / dpr;
      const h = this.canvas.height / dpr;
      this.ctx.fillStyle = this.clearColor;
      this.ctx.fillRect(0, 0, w, h);
      this.loop?.(this.ctx, dt, w, h);
      this.particles.update(dt);
      this.particles.draw(this.ctx);
      for (const ft of this.floatingTexts) {
        ft.life -= dt;
        ft.y += ft.vy * dt;
        this.ctx.globalAlpha = Math.max(0, ft.life);
        this.ctx.fillStyle = '#e8d48a';
        this.ctx.font = 'bold 20px system-ui';
        this.ctx.textAlign = 'center';
        this.ctx.fillText(ft.text, ft.x, ft.y);
      }
      this.ctx.globalAlpha = 1;
      this.floatingTexts = this.floatingTexts.filter((f) => f.life > 0);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.loop = null;
  }

  destroy(): void {
    this.ro?.disconnect();
    this.stop();
    this.canvas.remove();
  }

  addFloatText(x: number, y: number, text: string): void {
    this.floatingTexts.push({ x, y, text, life: 1.2, vy: -40 });
  }
}
