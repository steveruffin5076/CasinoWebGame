import { particleCap } from './fps';
import { pick } from './utils';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  active: boolean;
}

export class ParticlePool {
  private pool: Particle[] = [];

  constructor(size = 200) {
    for (let i = 0; i < size; i++) {
      this.pool.push({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        color: '#fff',
        size: 4,
        active: false,
      });
    }
  }

  burst(x: number, y: number, count: number, colors: string[]): void {
    const cap = particleCap();
    const n = Math.min(count, cap);
    let spawned = 0;
    for (const p of this.pool) {
      if (spawned >= n) break;
      if (!p.active) {
        p.active = true;
        p.x = x;
        p.y = y;
        const a = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 200;
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp - 60;
        p.life = 0;
        p.maxLife = 0.6 + Math.random() * 0.5;
        p.color = pick(colors);
        p.size = 3 + Math.random() * 5;
        spawned++;
      }
    }
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      p.life += dt;
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.life >= p.maxLife) p.active = false;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.pool) {
      if (!p.active) continue;
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
