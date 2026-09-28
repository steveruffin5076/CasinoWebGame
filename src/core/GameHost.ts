import { tickFps } from './fps';
import { ParticlePool } from './particles';

export type GameLoop = (ctx: CanvasRenderingContext2D, dt: number, w: number, h: number) => void;

export class GameHost {
  canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private loop: GameLoop | null = null;
  private raf = 0;
  particles = new ParticlePool();
  floatingTexts: { x: number; y: number; text: string; life: number; vy: number }[] = [];

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    parent.appendChild(this.canvas);
    this.resize();
    window.addEventListener('resize', () => this.resize(), { passive: true });
  }

  resize(): void {
    const rect = this.canvas.parentElement?.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = rect?.width ?? window.innerWidth;
    const h = rect?.height ?? window.innerHeight - 120;
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
      const w = this.canvas.width / (window.devicePixelRatio || 1);
      const h = this.canvas.height / (window.devicePixelRatio || 1);
      this.ctx.fillStyle = '#0d0520';
      this.ctx.fillRect(0, 0, w, h);
      this.loop?.(this.ctx, dt, w, h);
      this.particles.update(dt);
      this.particles.draw(this.ctx);
      for (const ft of this.floatingTexts) {
        ft.life -= dt;
        ft.y += ft.vy * dt;
        this.ctx.globalAlpha = Math.max(0, ft.life);
        this.ctx.fillStyle = '#7fff7f';
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
    this.stop();
    this.canvas.remove();
  }

  addFloatText(x: number, y: number, text: string): void {
    this.floatingTexts.push({ x, y, text, life: 1.2, vy: -40 });
  }
}
