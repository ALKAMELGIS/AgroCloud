import React, { useEffect, useRef } from 'react';
import {
  normalizeWeatherSim,
  weatherSimHasActiveEffect,
  weatherWindVector,
  type WeatherSimState,
} from './weatherSimModel';

/* ───────────────────────────── Particle types ───────────────────────────── */

type RainDrop = { x: number; y: number; len: number; vy: number; thickness: number; alpha: number };
type SnowFlake = { x: number; y: number; r: number; vy: number; phase: number; sway: number; alpha: number };
type Cloud = { x: number; y: number; r: number; vx: number; alpha: number; squish: number };
type FogBlob = { x: number; y: number; r: number; vx: number; phase: number };

type Lightning = {
  /** 0 = idle, otherwise a decaying flash brightness. */
  flash: number;
  /** seconds until the next strike may occur. */
  cooldown: number;
  /** jagged bolt polyline in canvas px (empty while idle). */
  bolt: Array<{ x: number; y: number }>;
  /** seconds the bolt stays drawn. */
  boltLife: number;
};

const RAIN_MAX = 620;
const SNOW_MAX = 360;
const CLOUD_MAX = 16;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Full-bleed, physically-plausible weather renderer drawn on a single <canvas>
 * above the map. Driven entirely by the shared WeatherSimState: intensities map
 * to particle counts/speeds, wind to velocity vectors, temperature to colour
 * grading, and thunder to stochastic lightning. Honours play/pause, animation
 * speed and prefers-reduced-motion. Pointer-events are disabled so the map stays
 * fully interactive underneath.
 */
export const WeatherVizOverlay: React.FC<{ sim: WeatherSimState }> = ({ sim }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<WeatherSimState>(normalizeWeatherSim(sim));
  simRef.current = normalizeWeatherSim(sim);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;

    const rain: RainDrop[] = [];
    const snow: SnowFlake[] = [];
    const clouds: Cloud[] = [];
    const fog: FogBlob[] = [];
    const lightning: Lightning = { flash: 0, cooldown: 1.2, bolt: [], boltLife: 0 };

    const resize = () => {
      const parent = canvas.parentElement;
      const rect = parent ? parent.getBoundingClientRect() : { width: window.innerWidth, height: window.innerHeight };
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => resize()) : null;
    if (ro && canvas.parentElement) ro.observe(canvas.parentElement);
    window.addEventListener('resize', resize);

    const spawnRain = (drop: RainDrop, fromTop: boolean) => {
      drop.x = rand(-0.1 * width, 1.1 * width);
      drop.y = fromTop ? rand(-height * 0.2, 0) : rand(0, height);
      drop.len = rand(8, 22);
      drop.vy = rand(0.85, 1.15);
      drop.thickness = rand(0.6, 1.4);
      drop.alpha = rand(0.25, 0.6);
    };
    const spawnSnow = (f: SnowFlake, fromTop: boolean) => {
      f.x = rand(0, width);
      f.y = fromTop ? rand(-height * 0.15, 0) : rand(0, height);
      f.r = rand(0.8, 3.2);
      f.vy = rand(0.6, 1.1);
      f.phase = rand(0, Math.PI * 2);
      f.sway = rand(8, 26);
      f.alpha = rand(0.55, 0.95);
    };
    const spawnCloud = (c: Cloud, anywhere: boolean) => {
      c.r = rand(80, 200);
      c.x = anywhere ? rand(0, width) : rand(-c.r, -c.r * 0.2);
      c.y = rand(-height * 0.05, height * 0.55);
      c.vx = rand(0.6, 1.4);
      c.alpha = rand(0.18, 0.42);
      c.squish = rand(0.4, 0.62);
    };
    const spawnFog = (b: FogBlob) => {
      b.r = rand(width * 0.25, width * 0.6);
      b.x = rand(0, width);
      b.y = rand(height * 0.45, height * 1.05);
      b.vx = rand(0.1, 0.4) * (Math.random() < 0.5 ? -1 : 1);
      b.phase = rand(0, Math.PI * 2);
    };

    const ensurePool = <T,>(pool: T[], target: number, make: () => T) => {
      target = Math.max(0, Math.min(target, pool.length + 40));
      while (pool.length < target) pool.push(make());
      if (pool.length > target) pool.length = target;
    };

    const buildBolt = () => {
      const startX = rand(width * 0.2, width * 0.8);
      const pts: Array<{ x: number; y: number }> = [{ x: startX, y: -10 }];
      let x = startX;
      let y = 0;
      const segs = Math.round(rand(7, 12));
      const endY = rand(height * 0.45, height * 0.8);
      for (let i = 1; i <= segs; i++) {
        y = (endY / segs) * i;
        x += rand(-42, 42);
        pts.push({ x, y });
      }
      return pts;
    };

    let last = performance.now();
    let rafId = 0;

    const frame = (now: number) => {
      rafId = requestAnimationFrame(frame);
      const s = simRef.current;
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.05) dt = 0.05; // clamp after tab-switches
      const motion = s.playing && !reduceMotion ? dt * s.speed : 0;

      // Effective intensities — storm reinforces rain/wind/darkness.
      const stormN = s.storm / 100;
      const rainStrength = Math.min(100, s.rain + stormN * 55);
      const snowStrength = s.snow;
      const cloudStrength = Math.min(100, s.cloud + stormN * 35);
      const fogStrength = s.fog;
      const windVec = weatherWindVector(s.windDirection);
      const windKmh = s.windSpeed + stormN * 30;
      const windPx = windVec.x * windKmh; // horizontal px/s contribution baseline
      const gust = 1 + stormN * 0.4 * Math.sin(now / 600);

      ctx.clearRect(0, 0, width, height);

      /* 1 ─ Sky grading (clouds dim + storm darken + temperature tint) */
      const dim = cloudStrength / 100;
      const storms = stormN;
      if (dim > 0.02 || storms > 0.02) {
        const g = ctx.createLinearGradient(0, 0, 0, height);
        const topA = Math.min(0.78, dim * 0.42 + storms * 0.5);
        const botA = Math.min(0.6, dim * 0.22 + storms * 0.34);
        const base = storms > 0.3 ? '24, 28, 42' : '150, 160, 176';
        g.addColorStop(0, `rgba(${base}, ${topA})`);
        g.addColorStop(1, `rgba(${base}, ${botA})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
      // Temperature colour grade.
      const cold = Math.max(0, Math.min(1, (4 - s.temperatureC) / 30));
      const warm = Math.max(0, Math.min(1, (s.temperatureC - 32) / 20));
      if (cold > 0.02) {
        ctx.fillStyle = `rgba(120, 170, 230, ${cold * 0.26})`;
        ctx.fillRect(0, 0, width, height);
      }
      if (warm > 0.02) {
        ctx.fillStyle = `rgba(255, 168, 86, ${warm * 0.2})`;
        ctx.fillRect(0, 0, width, height);
      }

      /* 2 ─ Clouds */
      ensurePool(clouds, reduceMotion ? Math.round((cloudStrength / 100) * 5) : Math.round((cloudStrength / 100) * CLOUD_MAX), () => {
        const c: Cloud = { x: 0, y: 0, r: 0, vx: 0, alpha: 0, squish: 0.5 };
        spawnCloud(c, true);
        return c;
      });
      if (clouds.length) {
        for (const c of clouds) {
          c.x += (windPx * 0.05 + c.vx) * motion * 18;
          if (c.x - c.r > width + 40) spawnCloud(c, false);
          if (c.x + c.r < -40) {
            c.x = width + c.r;
          }
          const a = c.alpha * (0.5 + dim * 0.6);
          const grad = ctx.createRadialGradient(c.x, c.y, c.r * 0.1, c.x, c.y, c.r);
          const tone = storms > 0.3 ? '70, 78, 100' : '226, 232, 240';
          grad.addColorStop(0, `rgba(${tone}, ${a})`);
          grad.addColorStop(1, `rgba(${tone}, 0)`);
          ctx.save();
          ctx.translate(c.x, c.y);
          ctx.scale(1, c.squish);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(0, 0, c.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }

      /* 3 ─ Fog veil */
      if (fogStrength > 1) {
        const fd = fogStrength / 100;
        const veil = ctx.createLinearGradient(0, height, 0, 0);
        veil.addColorStop(0, `rgba(214, 220, 228, ${0.18 + fd * 0.7})`);
        veil.addColorStop(0.55, `rgba(210, 216, 226, ${0.12 + fd * 0.5})`);
        veil.addColorStop(1, `rgba(206, 212, 222, ${fd * 0.18})`);
        ctx.fillStyle = veil;
        ctx.fillRect(0, 0, width, height);

        ensurePool(fog, reduceMotion ? 2 : 4, () => {
          const b: FogBlob = { x: 0, y: 0, r: 0, vx: 0, phase: 0 };
          spawnFog(b);
          return b;
        });
        for (const b of fog) {
          b.x += (b.vx + windVec.x * 0.3) * motion * 26;
          b.phase += motion * 0.6;
          if (b.x - b.r > width) b.x = -b.r;
          if (b.x + b.r < 0) b.x = width + b.r;
          const yy = b.y + Math.sin(b.phase) * 14;
          const grad = ctx.createRadialGradient(b.x, yy, 0, b.x, yy, b.r);
          grad.addColorStop(0, `rgba(226, 230, 236, ${fd * 0.4})`);
          grad.addColorStop(1, 'rgba(226, 230, 236, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(b.x, yy, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* 4 ─ Rain */
      ensurePool(rain, Math.round((rainStrength / 100) * RAIN_MAX), () => {
        const d: RainDrop = { x: 0, y: 0, len: 0, vy: 1, thickness: 1, alpha: 0.4 };
        spawnRain(d, false);
        return d;
      });
      if (rain.length) {
        const fallSpeed = (640 + rainStrength * 5 + windKmh * 2) * gust; // px/s
        const slantX = (windPx * 1.6) * gust;
        ctx.lineCap = 'round';
        for (const d of rain) {
          d.x += slantX * motion;
          d.y += fallSpeed * d.vy * motion;
          if (d.y > height + 20 || d.x < -60 || d.x > width + 60) {
            spawnRain(d, true);
            continue;
          }
          const dirX = slantX;
          const dirY = fallSpeed * d.vy;
          const mag = Math.hypot(dirX, dirY) || 1;
          const ux = (dirX / mag) * d.len;
          const uy = (dirY / mag) * d.len;
          ctx.strokeStyle = `rgba(190, 214, 248, ${d.alpha})`;
          ctx.lineWidth = d.thickness;
          ctx.beginPath();
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - ux, d.y - uy);
          ctx.stroke();
        }
      }

      /* 5 ─ Snow */
      ensurePool(snow, Math.round((snowStrength / 100) * SNOW_MAX), () => {
        const f: SnowFlake = { x: 0, y: 0, r: 1, vy: 1, phase: 0, sway: 12, alpha: 0.8 };
        spawnSnow(f, false);
        return f;
      });
      if (snow.length) {
        const fallSpeed = 36 + snowStrength * 1.1; // gentle
        for (const f of snow) {
          f.phase += motion * 1.6;
          f.y += fallSpeed * f.vy * motion;
          f.x += (windVec.x * windKmh * 0.7 + Math.sin(f.phase) * f.sway * 0.06) * motion * 14;
          if (f.y > height + 6) {
            spawnSnow(f, true);
            continue;
          }
          if (f.x < -10) f.x = width + 10;
          if (f.x > width + 10) f.x = -10;
          ctx.fillStyle = `rgba(255, 255, 255, ${f.alpha})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      /* 6 ─ Lightning */
      const thunderN = s.thunder / 100;
      if (thunderN > 0.01 && s.playing && !reduceMotion) {
        lightning.cooldown -= motion;
        if (lightning.cooldown <= 0) {
          // Strike. Higher thunder ⇒ shorter, more frequent intervals.
          lightning.flash = rand(0.6, 1);
          lightning.bolt = buildBolt();
          lightning.boltLife = rand(0.08, 0.16);
          lightning.cooldown = rand(0.6, 4.5) * (1.15 - thunderN);
        }
      }
      if (lightning.flash > 0.001) {
        ctx.fillStyle = `rgba(226, 234, 255, ${lightning.flash * 0.5})`;
        ctx.fillRect(0, 0, width, height);
        // double-strobe decay
        lightning.flash *= 0.82;
        if (lightning.flash < 0.05 && Math.random() < 0.4) lightning.flash = rand(0.2, 0.4);
        if (lightning.flash < 0.01) lightning.flash = 0;
      }
      if (lightning.boltLife > 0 && lightning.bolt.length > 1) {
        lightning.boltLife -= dt;
        ctx.save();
        ctx.strokeStyle = 'rgba(236, 242, 255, 0.95)';
        ctx.lineWidth = 2.2;
        ctx.shadowColor = 'rgba(190, 210, 255, 0.9)';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(lightning.bolt[0]!.x, lightning.bolt[0]!.y);
        for (let i = 1; i < lightning.bolt.length; i++) ctx.lineTo(lightning.bolt[i]!.x, lightning.bolt[i]!.y);
        ctx.stroke();
        ctx.restore();
        if (lightning.boltLife <= 0) lightning.bolt = [];
      }
    };

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      if (ro) ro.disconnect();
    };
  }, []);

  if (!weatherSimHasActiveEffect(normalizeWeatherSim(sim))) return null;

  return <canvas ref={canvasRef} className="si-wviz-canvas" aria-hidden />;
};
