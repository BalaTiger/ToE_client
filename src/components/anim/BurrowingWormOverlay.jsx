import React from 'react';

const WORM_DURATION_S = 2.75;
const WORM_DPR_LIMIT = 1.1;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
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

function quadPoint(a, c, b, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

function quadTangent(a, c, b, t) {
  return {
    x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
    y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y),
  };
}

function buildBurrows(width, height) {
  const s = Math.min(width, height);
  const cx = width * 0.5;
  const cy = height * 0.52;
  return [
    {
      start: 0.12,
      a: { x: cx - s * 0.42, y: cy + s * 0.14 },
      b: { x: cx + s * 0.22, y: cy - s * 0.06 },
      c: { x: cx - s * 0.08, y: cy - s * 0.34 },
      tiltA: -0.1,
      tiltB: 0.18,
      seed: 11,
    },
    {
      start: 0.58,
      a: { x: cx + s * 0.36, y: cy + s * 0.18 },
      b: { x: cx - s * 0.28, y: cy - s * 0.1 },
      c: { x: cx + s * 0.04, y: cy - s * 0.32 },
      tiltA: 0.2,
      tiltB: -0.14,
      seed: 37,
    },
    {
      start: 1.04,
      a: { x: cx - s * 0.12, y: cy + s * 0.27 },
      b: { x: cx + s * 0.42, y: cy + s * 0.02 },
      c: { x: cx + s * 0.18, y: cy - s * 0.28 },
      tiltA: -0.18,
      tiltB: 0.08,
      seed: 73,
    },
  ];
}

function drawGround(ctx, width, height, time, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, 'rgba(17,12,8,0.26)');
  grad.addColorStop(0.46, 'rgba(42,28,15,0.24)');
  grad.addColorStop(1, 'rgba(78,49,22,0.34)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.globalAlpha = alpha * 0.38;
  ctx.strokeStyle = 'rgba(178,132,72,0.18)';
  ctx.lineWidth = 1;
  const spacing = Math.max(42, Math.min(width, height) * 0.07);
  for (let y = -spacing; y < height + spacing; y += spacing) {
    ctx.beginPath();
    for (let x = -20; x <= width + 20; x += 36) {
      const yy = y + Math.sin(x * 0.018 + time * 1.1) * 8;
      if (x <= -20) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawHole(ctx, hole, radius, tilt, open, seed) {
  if (open <= 0) return;
  const rand = makeRand(seed);
  ctx.save();
  ctx.translate(hole.x, hole.y);
  ctx.rotate(tilt);
  ctx.scale(1.42, 0.58);
  ctx.globalAlpha = open;

  const outer = ctx.createRadialGradient(0, 0, radius * 0.18, 0, 0, radius * 1.24);
  outer.addColorStop(0, 'rgba(3,2,1,0.98)');
  outer.addColorStop(0.48, 'rgba(18,9,3,0.96)');
  outer.addColorStop(0.68, 'rgba(73,45,20,0.82)');
  outer.addColorStop(1, 'rgba(160,115,66,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(0, 0, radius * (0.5 + open * 0.5), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = open * 0.7;
  for (let i = 0; i < 18; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = radius * (0.62 + rand() * 0.58) * open;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    ctx.fillStyle = rand() > 0.36 ? 'rgba(120,78,39,0.74)' : 'rgba(73,47,28,0.72)';
    ctx.beginPath();
    ctx.ellipse(x, y, radius * (0.035 + rand() * 0.055), radius * (0.02 + rand() * 0.035), a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawWormBody(ctx, burrow, local, width, height) {
  const p = clamp01(local / 0.5);
  const appear = smoothstep(0.03, 0.15, p) * (1 - smoothstep(0.88, 1, p));
  const travel = easeOutCubic(clamp01((p - 0.1) / 0.78));
  const s = Math.min(width, height);
  const bodyWidth = Math.max(20, s * 0.052);
  const visibleStart = Math.max(0, travel - 0.9);
  const visibleEnd = Math.min(1, travel + 0.22);

  ctx.save();
  ctx.globalAlpha = appear;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  for (let i = 0; i <= 42; i += 1) {
    const t = visibleStart + (visibleEnd - visibleStart) * (i / 42);
    const pt = quadPoint(burrow.a, burrow.c, burrow.b, t);
    const wobble = Math.sin((t * 8.5 - p * 5.2 + burrow.seed) * Math.PI) * bodyWidth * 0.08;
    const tan = quadTangent(burrow.a, burrow.c, burrow.b, t);
    const len = Math.hypot(tan.x, tan.y) || 1;
    const x = pt.x + (-tan.y / len) * wobble;
    const y = pt.y + (tan.x / len) * wobble;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(5,3,2,0.82)';
  ctx.lineWidth = bodyWidth * 1.45;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(44,31,22,0.96)';
  ctx.lineWidth = bodyWidth;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(118,84,56,0.42)';
  ctx.lineWidth = bodyWidth * 0.38;
  ctx.stroke();

  const ringCount = 26;
  for (let i = 0; i < ringCount; i += 1) {
    const t = visibleStart + (visibleEnd - visibleStart) * (i / Math.max(1, ringCount - 1));
    if (t < 0 || t > 1) continue;
    const pt = quadPoint(burrow.a, burrow.c, burrow.b, t);
    const tan = quadTangent(burrow.a, burrow.c, burrow.b, t);
    const angle = Math.atan2(tan.y, tan.x);
    const pulse = 0.5 + 0.5 * Math.sin((i * 0.8 - p * 18) + burrow.seed);
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(angle + Math.PI / 2);
    ctx.globalAlpha = appear * (0.26 + pulse * 0.28);
    ctx.strokeStyle = 'rgba(183,139,91,0.72)';
    ctx.lineWidth = Math.max(1.2, bodyWidth * 0.075);
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyWidth * 0.55, bodyWidth * 0.18, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const headT = clamp01(visibleEnd);
  const head = quadPoint(burrow.a, burrow.c, burrow.b, headT);
  const headTan = quadTangent(burrow.a, burrow.c, burrow.b, headT);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(Math.atan2(headTan.y, headTan.x));
  ctx.globalAlpha = appear * smoothstep(0.08, 0.3, p) * (1 - smoothstep(0.74, 0.96, p));
  ctx.fillStyle = 'rgba(12,8,6,0.94)';
  ctx.beginPath();
  ctx.ellipse(0, 0, bodyWidth * 0.75, bodyWidth * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190,155,112,0.24)';
  ctx.beginPath();
  ctx.ellipse(bodyWidth * 0.18, -bodyWidth * 0.12, bodyWidth * 0.22, bodyWidth * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function drawBurstDust(ctx, burrow, local, radius) {
  const rand = makeRand(burrow.seed * 131);
  const age = clamp01(local / 0.36);
  const alpha = (1 - age) * smoothstep(0, 0.08, local);
  if (alpha <= 0) return;
  [burrow.a, burrow.b].forEach((hole, hIdx) => {
    ctx.save();
    ctx.translate(hole.x, hole.y);
    ctx.rotate(hIdx ? burrow.tiltB : burrow.tiltA);
    ctx.globalAlpha = alpha * 0.62;
    for (let i = 0; i < 24; i += 1) {
      const a = rand() * Math.PI * 2;
      const speed = radius * (0.38 + rand() * 0.9);
      const x = Math.cos(a) * speed * age * 1.35;
      const y = Math.sin(a) * speed * age * 0.52 - radius * 0.1 * age;
      ctx.fillStyle = rand() > 0.42 ? 'rgba(172,126,72,0.65)' : 'rgba(82,58,38,0.62)';
      ctx.beginPath();
      ctx.ellipse(x, y, radius * (0.035 + rand() * 0.055), radius * (0.018 + rand() * 0.028), a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });
}

function cubicPoint(a, b, c, d, t) {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
}

function attackPathPoint(width, height, variant, t) {
  const start = variant === 1
    ? { x: width * 1.14, y: -height * 0.05 }
    : { x: -width * 0.14, y: -height * 0.05 };
  const bendIn = variant === 1
    ? { x: width * 0.82, y: height * 0.26 }
    : { x: width * 0.18, y: height * 0.26 };
  const outerBend = variant === 1
    ? { x: -width * 0.14, y: height * 0.86 }
    : { x: width * 1.14, y: height * 0.86 };
  const strike = variant === 1
    ? { x: width * 0.46, y: height * 0.52 }
    : { x: width * 0.54, y: height * 0.56 };
  const bendT = 0.68;
  const base = t < bendT
    ? cubicPoint(
      start,
      bendIn,
      variant === 1 ? { x: width * 0.18, y: height * 0.58 } : { x: width * 0.82, y: height * 0.58 },
      outerBend,
      t / bendT
    )
    : cubicPoint(
      outerBend,
      variant === 1 ? { x: -width * 0.06, y: height * 1.04 } : { x: width * 1.06, y: height * 1.04 },
      variant === 1 ? { x: width * 0.2, y: height * 0.66 } : { x: width * 0.8, y: height * 0.68 },
      strike,
      (t - bendT) / (1 - bendT)
    );
  const probeT = t > 0.994 ? Math.max(0, t - 0.006) : Math.min(1, t + 0.006);
  const probe = probeT < bendT
    ? cubicPoint(
      start,
      bendIn,
      variant === 1 ? { x: width * 0.18, y: height * 0.58 } : { x: width * 0.82, y: height * 0.58 },
      outerBend,
      probeT / bendT
    )
    : cubicPoint(
      outerBend,
      variant === 1 ? { x: -width * 0.06, y: height * 1.04 } : { x: width * 1.06, y: height * 1.04 },
      variant === 1 ? { x: width * 0.2, y: height * 0.66 } : { x: width * 0.8, y: height * 0.68 },
      strike,
      (probeT - bendT) / (1 - bendT)
    );
  const dx = t > 0.994 ? base.x - probe.x : probe.x - base.x;
  const dy = t > 0.994 ? base.y - probe.y : probe.y - base.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const amp = height * (variant === 1 ? 0.085 : 0.095) * (1 - t * 0.45);
  const phase = variant === 1 ? 0.28 : -0.1;
  const wave = Math.sin((t * 2.35 + phase) * Math.PI * 2) * amp;
  return {
    x: base.x + nx * wave,
    y: base.y + ny * wave,
  };
}

function drawAttackHeadGlow(ctx, width, height, variant, alpha, cutWidth) {
  if (alpha <= 0) return;
  const head = attackPathPoint(width, height, variant, 1);
  const tail = attackPathPoint(width, height, variant, 0.975);
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  ctx.save();
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  const spark = ctx.createRadialGradient(0, 0, 0, 0, 0, cutWidth * 0.76);
  spark.addColorStop(0, 'rgba(255,255,255,0.96)');
  spark.addColorStop(0.32, 'rgba(220,238,255,0.5)');
  spark.addColorStop(1, 'rgba(220,238,255,0)');
  ctx.fillStyle = spark;
  ctx.scale(1.7, 0.66);
  ctx.beginPath();
  ctx.arc(0, 0, cutWidth * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawAttackSlash(ctx, width, height, attackStart, time, variant) {
  const age = time - attackStart;
  const duration = 0.42;
  if (age < 0 || age > duration) return;
  const p = clamp01(age / duration);
  const drawP = smoothstep(0, 0.36, p);
  const eraseP = smoothstep(0.48, 0.96, p) * 0.985;
  const fade = 1 - smoothstep(0.92, 1, p);
  const trailStart = Math.min(eraseP, Math.max(0, drawP - 0.001));
  const visibleLen = Math.max(0.001, drawP - trailStart);
  const steps = 38;
  const cutWidth = Math.max(76, Math.min(width, height) * 0.19);
  if (drawP >= 0.995 && visibleLen < 0.09) {
    drawAttackHeadGlow(ctx, width, height, variant, fade * (1 - smoothstep(0.04, 0.09, visibleLen)), cutWidth);
    return;
  }
  const pts = Array.from({ length: steps + 1 }, (_, i) => {
    const u = i / steps;
    const t = trailStart + visibleLen * u;
    const pt = attackPathPoint(width, height, variant, t);
    const probe = attackPathPoint(width, height, variant, t > 0.994 ? Math.max(0, t - 0.006) : Math.min(1, t + 0.006));
    const dx = t > 0.994 ? pt.x - probe.x : probe.x - pt.x;
    const dy = t > 0.994 ? pt.y - probe.y : probe.y - pt.y;
    const len = Math.hypot(dx, dy) || 1;
    const rough = Math.sin((i * 12.989 + variant * 31.7) * 2.17) * (1 - u) * 0.18;
    const perspective = 0.54 + Math.pow(t, 1.52) * 1.5;
    const widthScale = (0.22 + Math.sin(u * Math.PI) * 0.38 + u * 0.92) * perspective * (1 + rough);
    return {
      ...pt,
      nx: -dy / len,
      ny: dx / len,
      u,
      t,
      w: cutWidth * widthScale,
    };
  });

  const drawSoftBrushTrail = (scale, alpha, innerColor, midColor, outerColor, stepEvery = 1) => {
    ctx.save();
    pts.forEach((pt, index) => {
      if (index % stepEvery !== 0 && index !== pts.length - 1) return;
      const radius = Math.max(4, pt.w * scale);
      const brushAlpha = alpha * fade * (0.2 + 0.8 * Math.sin(pt.u * Math.PI * 0.5));
      ctx.save();
      ctx.globalAlpha = brushAlpha;
      ctx.translate(pt.x, pt.y);
      ctx.rotate(Math.atan2(pt.ny, pt.nx) + Math.PI / 2);
      ctx.scale(1.25 + pt.t * 0.55, 0.62);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
      grad.addColorStop(0, innerColor);
      grad.addColorStop(0.42, midColor);
      grad.addColorStop(1, outerColor);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
    ctx.restore();
  };

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.globalCompositeOperation = 'screen';
  drawSoftBrushTrail(
    1.12,
    0.78,
    'rgba(238,248,255,0.24)',
    'rgba(180,210,235,0.11)',
    'rgba(110,145,175,0)'
  );
  drawSoftBrushTrail(
    0.68,
    0.92,
    'rgba(255,255,255,0.66)',
    'rgba(226,242,255,0.25)',
    'rgba(170,205,235,0)'
  );
  drawSoftBrushTrail(
    0.34,
    0.94,
    'rgba(255,255,255,0.96)',
    'rgba(245,251,255,0.34)',
    'rgba(215,235,255,0)'
  );
  ctx.globalCompositeOperation = 'source-over';

  const drawCorePath = () => {
    ctx.beginPath();
    pts.forEach((pt, index) => {
      if (index === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
  };

  ctx.globalAlpha = fade * 0.52;
  ctx.filter = 'blur(6px)';
  drawCorePath();
  ctx.strokeStyle = 'rgba(225,242,255,0.74)';
  ctx.lineWidth = Math.max(24, cutWidth * 0.22);
  ctx.stroke();
  ctx.filter = 'none';
  ctx.globalAlpha = fade * 0.72;
  drawCorePath();
  ctx.strokeStyle = 'rgba(252,254,255,0.96)';
  ctx.lineWidth = Math.max(8, cutWidth * 0.07);
  ctx.stroke();

  ctx.globalAlpha = fade * 0.76;
  const shardCount = 18;
  for (let i = 0; i < shardCount; i += 1) {
    const u = Math.pow(i / shardCount, 1.45) * 0.66;
    const t = trailStart + visibleLen * u;
    const pt = attackPathPoint(width, height, variant, t);
    const next = attackPathPoint(width, height, variant, Math.min(1, t + 0.006));
    const dx = next.x - pt.x;
    const dy = next.y - pt.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const spread = cutWidth * (0.22 + (1 - u) * 0.72);
    const side = i % 2 ? 1 : -1;
    const offset = side * spread * (0.25 + 0.75 * Math.abs(Math.sin(i * 2.31 + variant)));
    const size = cutWidth * (0.025 + Math.pow(t, 1.35) * 0.09) * (0.75 + (1 - u) * 0.55);
    ctx.save();
    ctx.translate(
      pt.x + nx * offset + Math.sin(i * 4.1) * size,
      pt.y + ny * offset + Math.cos(i * 3.6) * size * 0.35
    );
    ctx.rotate((variant ? -0.5 : 0.5) + Math.sin(i * 1.7) * 0.55);
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255,255,255,0.72)' : 'rgba(185,215,245,0.42)';
    ctx.beginPath();
    ctx.moveTo(-size * 1.4, 0);
    ctx.lineTo(size * 1.1, -size * 0.34);
    ctx.lineTo(size * 0.38, size * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  const head = attackPathPoint(width, height, variant, drawP);
  const tail = attackPathPoint(width, height, variant, Math.max(0, drawP - 0.025));
  const angle = Math.atan2(head.y - tail.y, head.x - tail.x);
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.globalAlpha = fade * smoothstep(0.08, 0.35, p);
  const spark = ctx.createRadialGradient(0, 0, 0, 0, 0, cutWidth * 0.68);
  spark.addColorStop(0, 'rgba(255,255,255,0.95)');
  spark.addColorStop(0.34, 'rgba(220,238,255,0.55)');
  spark.addColorStop(1, 'rgba(220,238,255,0)');
  ctx.fillStyle = spark;
  ctx.scale(1.55, 0.62);
  ctx.beginPath();
  ctx.arc(0, 0, cutWidth * 0.64, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function BurrowingWormAnim({ exiting }) {
  const canvasRef = React.useRef(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let burrows = [];

    const resize = () => {
      width = window.innerWidth || 1280;
      height = window.innerHeight || 720;
      const mobileLike = Math.min(width, height) < 760;
      dpr = Math.min(window.devicePixelRatio || 1, mobileLike ? 0.85 : WORM_DPR_LIMIT);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      burrows = buildBurrows(width, height);
    };

    const started = performance.now();
    const render = now => {
      const time = (now - started) / 1000;
      const sceneFade = smoothstep(0, 0.12, time) * (1 - smoothstep(WORM_DURATION_S - 0.22, WORM_DURATION_S, time));
      ctx.clearRect(0, 0, width, height);
      const blackPhase = smoothstep(1.5, 1.7, time);
      const shake =
        (1 - blackPhase) * (
          (time < 1.56 ? 1.5 + 3.8 * Math.max(0, Math.sin(time * 34)) : 0)
          + burrows.reduce((sum, burrow) => {
            const local = time - burrow.start;
            if (local < 0 || local > 0.18) return sum;
            return sum + (1 - local / 0.18) * 8;
          }, 0)
        );
      ctx.save();
      ctx.translate(Math.sin(time * 118) * shake, Math.cos(time * 97) * shake * 0.62);
      drawGround(ctx, width, height, time, sceneFade * (1 - blackPhase * 0.75));
      const radius = Math.max(34, Math.min(width, height) * 0.065);
      burrows.forEach(burrow => {
        const local = time - burrow.start;
        const openA = smoothstep(-0.02, 0.08, local) * (1 - smoothstep(0.42, 0.58, local));
        const openB = smoothstep(0.16, 0.28, local) * (1 - smoothstep(0.46, 0.62, local));
        drawBurstDust(ctx, burrow, local, radius);
        drawWormBody(ctx, burrow, local, width, height);
        drawHole(ctx, burrow.a, radius, burrow.tiltA, openA, burrow.seed);
        drawHole(ctx, burrow.b, radius * 0.94, burrow.tiltB, openB, burrow.seed + 9);
      });
      ctx.restore();

      if (blackPhase > 0) {
        ctx.save();
        ctx.globalAlpha = blackPhase * sceneFade;
        ctx.fillStyle = 'rgba(0,0,0,0.96)';
        ctx.fillRect(0, 0, width, height);
        const vignette = ctx.createRadialGradient(width * 0.5, height * 0.5, height * 0.12, width * 0.5, height * 0.5, Math.max(width, height) * 0.62);
        vignette.addColorStop(0, 'rgba(42,45,50,0.1)');
        vignette.addColorStop(1, 'rgba(0,0,0,0.78)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
        drawAttackSlash(ctx, width, height, 1.74, time, 0);
        drawAttackSlash(ctx, width, height, 2.16, time, 1);
      }

      if (time < WORM_DURATION_S && !exiting) raf = requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [exiting]);

  return (
    <div className={`burrowing-worm-overlay${exiting ? ' burrowing-worm-exiting' : ''}`}>
      <canvas ref={canvasRef} className="burrowing-worm-canvas" aria-hidden="true" />
    </div>
  );
}

export { BurrowingWormAnim };
