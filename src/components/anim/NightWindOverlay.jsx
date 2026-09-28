import React, { useEffect, useRef, useState } from 'react';
import {
  createEffectNoiseOrigin,
  createEffectNoiseSampler,
  loadEffectNoiseTexture,
} from './effectNoise';

const NIGHT_WIND_DURATION_S = 1.65;
const NIGHT_WIND_DPR_LIMIT = 0.95;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function makeRand(seed) {
  let state = seed >>> 0;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    state ^= state >>> 16;
    return (state >>> 0) / 4294967296;
  };
}

function fallbackNoise(u, v, time, seed = 0) {
  const a = Math.sin((u * 19.31 + v * 37.17 + time * 1.9 + seed * 0.071) * 12.9898) * 43758.5453;
  const b = Math.sin((u * 53.47 - v * 21.11 + time * 0.83 + seed * 0.113) * 78.233) * 24634.6345;
  return ((a - Math.floor(a)) * 0.62 + (b - Math.floor(b)) * 0.38) * 2 - 1;
}

function createDustPuffCanvas(color, seed) {
  const canvas = document.createElement('canvas');
  const width = 96;
  const height = 48;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  const [r, g, b] = color;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const nx = (x - width * 0.5) / (width * 0.48);
      const ny = (y - height * 0.5) / (height * 0.46);
      const dist = Math.sqrt(nx * nx + ny * ny);
      const edge = 1 - smoothstep(0.48, 1.08, dist);
      if (edge <= 0) continue;
      const n = fallbackNoise(x / width, y / height, 0, seed);
      const grain = 0.52 + n * 0.42;
      const alpha = Math.max(0, edge * grain);
      const idx = (y * width + x) * 4;
      image.data[idx] = Math.max(0, Math.min(255, r + n * 18));
      image.data[idx + 1] = Math.max(0, Math.min(255, g + n * 14));
      image.data[idx + 2] = Math.max(0, Math.min(255, b + n * 10));
      image.data[idx + 3] = Math.floor(alpha * 138);
    }
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function NightWindAnim({ exiting }) {
  const canvasRef = useRef(null);
  const [noiseTexture, setNoiseTexture] = useState(null);

  useEffect(() => {
    let disposed = false;
    loadEffectNoiseTexture()
      .then(texture => {
        if (!disposed) setNoiseTexture(texture);
      })
      .catch(() => {
        if (!disposed) setNoiseTexture(false);
      });
    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || noiseTexture == null) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    const sampler = noiseTexture
      ? createEffectNoiseSampler(noiseTexture, {
        origin: createEffectNoiseOrigin('night-wind-desert-dust'),
        scale: 1.85,
        velocity: { x: 0.25, y: -0.045 },
      })
      : null;
    const rand = makeRand(0x9f14d3b);
    let dpr = 1;
    let width = 1;
    let height = 1;
    let gusts = [];
    let grit = [];
    let dustPuffs = [];
    let raf = 0;

    const sampleNoise = (u, v, time, seed = 0) => {
      if (!sampler) return fallbackNoise(u, v, time, seed);
      const n0 = sampler.sampleVector(u, v, time).value;
      const n1 = sampler.sampleVector(u * 2.1 + 0.17, v * 1.7 - 0.09, time * 0.72).x;
      return n0 * 0.68 + n1 * 0.32;
    };

    const rebuildScene = () => {
      width = window.innerWidth || 1280;
      height = window.innerHeight || 720;
      const mobileLike = Math.min(width, height) < 760;
      dpr = Math.min(window.devicePixelRatio || 1, mobileLike ? 0.78 : NIGHT_WIND_DPR_LIMIT);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      dustPuffs = [
        createDustPuffCanvas([206, 176, 121], 31),
        createDustPuffCanvas([134, 113, 86], 79),
      ];

      const bandCount = mobileLike ? 4 : 5;
      gusts = Array.from({ length: bandCount }, (_, i) => ({
        baseY: height * (0.34 + rand() * 0.42),
        amp: height * (0.035 + rand() * 0.055),
        thickness: (18 + rand() * 34) * (mobileLike ? 0.72 : 0.88),
        speed: 0.34 + rand() * 0.42,
        phase: rand() * 1.35,
        opacity: 0.07 + rand() * 0.08,
        seed: i * 113 + 19,
        steps: mobileLike ? 12 : 16,
        angle: -0.12 - rand() * 0.12,
      }));
      const gritCount = mobileLike ? 36 : 58;
      grit = Array.from({ length: gritCount }, (_, i) => ({
        x: rand(),
        y: 0.24 + rand() * 0.62,
        z: 0.35 + rand() * 1.35,
        speed: 0.48 + rand() * 1.16,
        drift: (rand() - 0.5) * 0.035,
        size: 0.55 + rand() * 2.1,
        alpha: 0.08 + rand() * 0.2,
        seed: i * 47 + 5,
      }));
    };

    const drawDustBand = (gust, time, sceneAlpha) => {
      for (let i = 0; i < gust.steps; i += 1) {
        const p = i / Math.max(1, gust.steps - 1);
        const flow = (p + gust.phase + time * gust.speed) % 1.42;
        const x = width * (1.18 - flow);
        if (x < -width * 0.26 || x > width * 1.22) continue;
        const u = p * 1.2 + gust.phase * 0.31;
        const v = gust.baseY / Math.max(1, height) + i * 0.017;
        const noise = sampleNoise(u, v, time, gust.seed + i);
        const wave = Math.sin((p * 2.6 + time * (0.62 + gust.speed) + gust.phase) * Math.PI * 2);
        const y = gust.baseY + wave * gust.amp * 0.38 + noise * gust.amp;
        const centerFade = smoothstep(-0.16, 0.12, x / width) * (1 - smoothstep(0.96, 1.22, x / width));
        const density = clamp01(0.42 + noise * 0.5 + Math.sin(time * 3.1 + i) * 0.1);
        const alpha = gust.opacity * centerFade * density * sceneAlpha;
        if (alpha <= 0.006) continue;
        const puffW = (82 + density * 118 + gust.thickness) * (0.72 + p * 0.52);
        const puffH = gust.thickness * (0.44 + density * 0.62);
        ctx.globalAlpha = alpha;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(gust.angle + noise * 0.08);
        const puff = density > 0.58 ? dustPuffs[0] : dustPuffs[1];
        ctx.drawImage(puff, -puffW, -puffH, puffW * 2, puffH * 2);
        ctx.restore();
      }
    };

    const drawGrit = (time, sceneAlpha) => {
      ctx.globalCompositeOperation = 'source-over';
      grit.forEach(dot => {
        const travel = (dot.x - time * dot.speed * 0.24 / dot.z + 1.4) % 1.4;
        const x = travel * width - width * 0.18;
        const n = sampleNoise(dot.x + time * 0.14, dot.y, time, dot.seed);
        const y = dot.y * height + (n * 28 + Math.sin(time * 5.5 + dot.seed) * 4) / dot.z;
        const horizonFade = smoothstep(0.24, 0.38, dot.y) * (1 - smoothstep(0.92, 1.04, dot.y));
        const alpha = dot.alpha * horizonFade * sceneAlpha * (0.45 + Math.abs(n) * 0.55);
        if (alpha <= 0.01) return;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = n > 0 ? 'rgb(226,196,136)' : 'rgb(156,131,94)';
        ctx.beginPath();
        ctx.ellipse(x, y, dot.size * (1.6 / dot.z), dot.size * (0.64 / dot.z), -0.18, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const draw = now => {
      const time = (now - started) / 1000;
      const sceneAlpha = (exiting ? 0.45 : 1)
        * smoothstep(0, 0.16, time)
        * (1 - smoothstep(NIGHT_WIND_DURATION_S - 0.28, NIGHT_WIND_DURATION_S, time));
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = sceneAlpha;
      ctx.globalCompositeOperation = 'source-over';
      const sky = ctx.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, 'rgba(4,7,13,0.54)');
      sky.addColorStop(0.48, 'rgba(17,16,18,0.34)');
      sky.addColorStop(1, 'rgba(70,49,24,0.20)');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, width, height);

      const horizon = ctx.createLinearGradient(0, height * 0.42, 0, height);
      horizon.addColorStop(0, 'rgba(0,0,0,0)');
      horizon.addColorStop(0.52, 'rgba(166,128,70,0.12)');
      horizon.addColorStop(1, 'rgba(96,62,27,0.30)');
      ctx.fillStyle = horizon;
      ctx.fillRect(0, height * 0.38, width, height * 0.62);

      ctx.globalCompositeOperation = 'source-over';
      gusts.forEach(gust => drawDustBand(gust, time, sceneAlpha));
      drawGrit(time, sceneAlpha);
      ctx.globalAlpha = sceneAlpha;
      ctx.globalCompositeOperation = 'multiply';
      const vignette = ctx.createRadialGradient(width * 0.5, height * 0.52, height * 0.18, width * 0.5, height * 0.52, Math.max(width, height) * 0.72);
      vignette.addColorStop(0, 'rgba(255,255,255,0)');
      vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, width, height);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      if (time < NIGHT_WIND_DURATION_S && !exiting) raf = requestAnimationFrame(draw);
    };

    rebuildScene();
    const started = performance.now();
    window.addEventListener('resize', rebuildScene);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', rebuildScene);
    };
  }, [exiting, noiseTexture]);

  return (
    <div className={`night-wind-overlay${exiting ? ' night-wind-exiting' : ''}`}>
      <canvas ref={canvasRef} className="night-wind-canvas" aria-hidden="true" />
    </div>
  );
}

export { NightWindAnim };
