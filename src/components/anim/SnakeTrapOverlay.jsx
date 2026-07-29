import React from 'react';
import { _getZoomCompensatedRect } from '../../utils/dom';

const SNAKE_COLORS = [
  '#b8f0a4', '#9ee68d', '#c4f5ad', '#8fd57e', '#d1ffc0',
];
const BITE_START_SEC = 1.75;

function measureCenterArea() {
  if (typeof document === 'undefined') {
    return {
      center: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.48 },
      uiRects: [],
    };
  }
  const selectors = ['[data-deck-pile]', '[data-discard-pile]', '[data-inspection-pile]'];
  const rects = selectors
    .map(sel => document.querySelector(sel))
    .map(el => _getZoomCompensatedRect(el))
    .filter(r => r && r.width > 0 && r.height > 0);
  if (rects.length) {
    const left = Math.min(...rects.map(r => r.left));
    const right = Math.max(...rects.map(r => r.right));
    const top = Math.min(...rects.map(r => r.top));
    const bottom = Math.max(...rects.map(r => r.bottom));
    return {
      center: { x: (left + right) / 2, y: (top + bottom) / 2 },
      uiRects: measureSnakeTrapUiRects(),
    };
  }
  return {
    center: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.46 },
    uiRects: measureSnakeTrapUiRects(),
  };
}

function measureSnakeTrapUiRects() {
  if (typeof document === 'undefined') return [];
  const rects = [];
  [
    '[data-log-panel]',
    '[data-prompt-panel]',
    '[data-pid]',
  ].forEach(sel => {
    document.querySelectorAll(sel).forEach(el => {
      const r = _getZoomCompensatedRect(el);
      if (r && r.width > 0 && r.height > 0) {
        rects.push({
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
        });
      }
    });
  });
  return rects;
}

function measurePanelCenters(hits) {
  if (typeof document === 'undefined') return [];
  return hits.map((hit, order) => {
    const el = document.querySelector(`[data-pid="${hit.idx}"]`);
    const r = _getZoomCompensatedRect(el);
    if (r && r.width > 0 && r.height > 0) {
      return {
        ...hit,
        order,
        x: r.left + r.width / 2,
        y: r.top + r.height / 2,
      };
    }
    return {
      ...hit,
      order,
      x: window.innerWidth * 0.5,
      y: window.innerHeight * 0.35,
    };
  });
}

function getEdgePoint(center, angle) {
  const rad = (angle * Math.PI) / 180;
  const halfW = window.innerWidth / 2;
  const halfH = window.innerHeight / 2;
  const dx = Math.cos(rad) || 0.001;
  const dy = Math.sin(rad) || 0.001;
  const t = Math.min(
    dx > 0 ? (window.innerWidth - center.x + 140) / dx : (-center.x - 140) / dx,
    dy > 0 ? (window.innerHeight - center.y + 140) / dy : (-center.y - 140) / dy,
  );
  const distance = Math.max(halfW, halfH, Math.abs(t));
  return {
    x: center.x + Math.cos(rad) * distance,
    y: center.y + Math.sin(rad) * distance,
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function buildSnakeSpec(center, angle, index) {
  const end = getEdgePoint(center, angle);
  const rad = (angle * Math.PI) / 180;
  const normal = { x: -Math.sin(rad), y: Math.cos(rad) };
  const dx = end.x - center.x;
  const dy = end.y - center.y;
  const length = Math.hypot(dx, dy);
  const amp = 18 + (index % 4) * 4;
  const wave = 0.9 + (index % 3) * 0.12;
  const samples = [];
  let totalLength = 0;
  let prev = null;
  for (let i = 0; i <= 180; i += 1) {
    const t = i / 180;
    const baseDist = length * t;
    const edgeEase = Math.sin(Math.PI * t);
    const lateral = (
      Math.sin(t * Math.PI * 5.6 * wave + index * 0.9) * amp
      + Math.sin(t * Math.PI * 2.1 + index) * amp * 0.22
    ) * edgeEase;
    const point = {
      x: center.x + Math.cos(rad) * baseDist + normal.x * lateral,
      y: center.y + Math.sin(rad) * baseDist + normal.y * lateral,
      dist: totalLength,
    };
    if (prev) totalLength += Math.hypot(point.x - prev.x, point.y - prev.y);
    point.dist = totalLength;
    samples.push(point);
    prev = point;
  }
  return {
    index,
    angle,
    start: center,
    end,
    samples,
    length: totalLength,
    delay: 0.08 + index * 0.08,
    duration: 2.05 + (index % 3) * 0.1,
    color: SNAKE_COLORS[index % SNAKE_COLORS.length],
  };
}

function sampleSnakePath(snake, dist) {
  const samples = snake.samples || [];
  if (!samples.length) return { x: snake.start.x, y: snake.start.y };
  if (dist <= 0) return samples[0];
  if (dist >= snake.length) return samples[samples.length - 1];
  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi - 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (samples[mid].dist < dist) lo = mid;
    else hi = mid;
  }
  const a = samples[lo];
  const b = samples[hi];
  const t = (dist - a.dist) / Math.max(1, b.dist - a.dist);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

function uiOverlapAmount(pt, uiRects) {
  for (const r of uiRects || []) {
    const pad = 10;
    if (pt.x >= r.left - pad && pt.x <= r.right + pad && pt.y >= r.top - pad && pt.y <= r.bottom + pad) {
      const insideX = Math.min(pt.x - (r.left - pad), (r.right + pad) - pt.x);
      const insideY = Math.min(pt.y - (r.top - pad), (r.bottom + pad) - pt.y);
      return clamp01((Math.min(insideX, insideY) + 16) / 64);
    }
  }
  return 0;
}

function drawSnake(ctx, snake, time, uiRects) {
  const local = time - snake.delay;
  if (local < 0 || local > snake.duration + 0.28) return;
  const p = clamp01(local / snake.duration);
  const fade = smoothstep(0, 0.12, p);
  if (fade <= 0) return;
  const headDist = snake.length * (0.06 + 1.04 * smoothstep(0, 1, p));
  const segmentCount = 18;
  const spacing = 17;
  const pts = [];
  for (let i = 0; i < segmentCount; i += 1) {
    const bodyDist = headDist - i * spacing;
    if (bodyDist < -14) continue;
    const tailFade = i / (segmentCount - 1);
    const sampled = sampleSnakePath(snake, bodyDist);
    const x = sampled.x;
    const y = sampled.y;
    const tailTaper = Math.max(0.04, (1 - tailFade) ** 1.6);
    const radius = Math.max(0.25, (10.6 - tailFade * 6.8) * tailTaper * (0.72 + 0.28 * fade));
    const overlap = uiOverlapAmount({ x, y }, uiRects);
    const underUi = overlap > 0 ? 1 - smoothstep(0, 1, overlap) : 1;
    if (underUi <= 0.02) continue;
    pts.push({ x, y, r: radius * (0.42 + 0.58 * underUi), a: underUi });
  }
  if (pts.length < 2) return;

  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i += 1) {
    const curr = pts[i];
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.hypot(tx, ty) || 1;
    const nx = -ty / len;
    const ny = tx / len;
    left.push({ x: curr.x + nx * curr.r, y: curr.y + ny * curr.r });
    right.push({ x: curr.x - nx * curr.r, y: curr.y - ny * curr.r });
  }

  ctx.save();
  const avgAlpha = pts.reduce((sum, pt) => sum + (pt.a ?? 1), 0) / pts.length;
  ctx.globalAlpha = fade * avgAlpha;
  ctx.shadowColor = 'rgba(83, 172, 61, 0.58)';
  ctx.shadowBlur = 13;
  ctx.beginPath();
  left.forEach((pt, i) => {
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else {
      const prev = left[i - 1];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pt.x) / 2, (prev.y + pt.y) / 2);
    }
  });
  const tail = pts[pts.length - 1];
  ctx.lineTo(tail.x, tail.y);
  [...right].reverse().forEach((pt, i) => {
    if (i > 0) {
      const prev = right[right.length - i];
      ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + pt.x) / 2, (prev.y + pt.y) / 2);
    }
  });
  ctx.closePath();
  ctx.save();
  ctx.globalAlpha *= 0.58;
  ctx.fillStyle = 'rgba(69, 145, 51, 0.64)';
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(3, 13, 4, 0.98)';
  ctx.fill();
  ctx.shadowBlur = 0;

  const head = pts[0];
  if (uiOverlapAmount(head, uiRects) > 0) {
    ctx.restore();
    return;
  }
  const neck = pts[1] || head;
  const angle = Math.atan2(head.y - neck.y, head.x - neck.x);
  ctx.translate(head.x, head.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.ellipse(-5, 0, 20, 13, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(3, 13, 4, 0.98)';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-7, -13);
  ctx.bezierCurveTo(12, -22, 34, -9, 35, 6);
  ctx.bezierCurveTo(36, 22, 11, 23, -7, 13);
  ctx.bezierCurveTo(-19, 6, -19, -7, -7, -13);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2, 9, 3, 1)';
  ctx.fill();
  ctx.restore();
}

function drawFang(ctx, x, y, angle, size, alpha, white, curve = 1, length = 1, rootOffset = 0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(size, size);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = white ? 'rgba(255,255,255,0.98)' : 'rgba(210,255,184,0.72)';
  ctx.fillStyle = white ? 'rgba(255,255,255,0.96)' : 'rgba(215,255,188,0.9)';
  ctx.lineWidth = white ? 2.2 : 1.7;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.shadowColor = white ? 'rgba(255,255,255,0.95)' : 'rgba(155,255,106,0.74)';
  ctx.shadowBlur = white ? 18 : 10;
  ctx.beginPath();
  const rootY = -33 + rootOffset;
  const tipY = rootY + 71 * length;
  const midY = rootY + 31 * length;
  const baseTipY = rootY + 69 * length;
  const bend = curve * 0.52;
  ctx.moveTo(-7, rootY);
  ctx.bezierCurveTo(4 * bend, rootY + 15 * length, 5 * bend, rootY + 41 * length, -1 * bend, tipY);
  ctx.bezierCurveTo(17 * bend, rootY + 39 * length, 19 * bend, rootY + 13 * length, 7, rootY - 3);
  ctx.bezierCurveTo(3, rootY - 6, -4, rootY - 5, -7, rootY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, rootY + 11 * length);
  ctx.bezierCurveTo(4 * bend, rootY + 27 * length, 3 * bend, midY, 0, baseTipY - 8);
  ctx.strokeStyle = white ? 'rgba(145,190,128,0.38)' : 'rgba(28,62,26,0.28)';
  ctx.lineWidth = white ? 1.2 : 1;
  ctx.stroke();
  ctx.restore();
}

function impactNoise(seed) {
  const x = Math.sin(seed * 91.713 + 17.131) * 43758.5453;
  return x - Math.floor(x);
}

function drawTaperedLine(ctx, x1, y1, x2, y2, width, alpha, white, seed = 0) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const startW = width * (0.5 + impactNoise(seed + 1) * 0.3);
  const endW = width * (0.95 + impactNoise(seed + 2) * 0.5);
  const notch = len * (0.08 + impactNoise(seed + 3) * 0.08);
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = white ? 'rgba(255,255,255,0.94)' : 'rgba(202,255,164,0.72)';
  ctx.shadowColor = white ? 'rgba(255,255,255,0.82)' : 'rgba(150,255,105,0.48)';
  ctx.shadowBlur = white ? 10 : 5;
  ctx.beginPath();
  ctx.moveTo(x1 + nx * startW * 0.5, y1 + ny * startW * 0.5);
  ctx.lineTo(x2 + nx * endW * 0.5, y2 + ny * endW * 0.5);
  ctx.lineTo(x2 - dx / len * notch, y2 - dy / len * notch);
  ctx.lineTo(x2 - nx * endW * 0.45, y2 - ny * endW * 0.45);
  ctx.lineTo(x1 - nx * startW * 0.5, y1 - ny * startW * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawPolarImpactBursts(ctx, white, burst) {
  const count = 30;
  for (let i = 0; i < count; i += 1) {
    const n = impactNoise(i * 3.7);
    const angle = (i / count) * Math.PI * 2 + (n - 0.5) * 0.16;
    if (impactNoise(i + 41) < 0.18) continue;
    const inner = 34 + impactNoise(i + 7) * 12;
    const outer = inner + 9 + impactNoise(i + 13) * 30;
    const width = 1.1 + impactNoise(i + 19) * 3.4;
    const alpha = burst * (0.34 + impactNoise(i + 23) * 0.62);
    drawTaperedLine(
      ctx,
      Math.cos(angle) * inner,
      Math.sin(angle) * inner,
      Math.cos(angle) * outer,
      Math.sin(angle) * outer,
      width,
      alpha,
      white,
      i + 101,
    );
  }
}

function drawBiteSpeedLines(ctx) {
  ctx.save();
  ctx.restore();
}

function drawBite(ctx, hit, time) {
  const delay = BITE_START_SEC + hit.order * 0.32;
  const local = time - delay;
  if (local < 0 || local > 0.56) return;
  const p = clamp01(local / 0.56);
  const appear = smoothstep(0, 0.14, p) * (1 - smoothstep(0.72, 1, p));
  if (appear <= 0) return;
  const close = smoothstep(0.12, 0.28, p);
  const reopen = smoothstep(0.5, 1, p);
  const jawGap = (42 * (1 - close) + 6 * close) + reopen * 26;
  const white = p > 0.24 && p < 0.36;
  ctx.save();
  ctx.translate(hit.x, hit.y);
  const scale = 1.05 + 0.22 * smoothstep(0.05, 0.2, p);
  ctx.scale(scale * 0.78, scale);
  ctx.globalAlpha = appear;
  const burst = smoothstep(0.18, 0.3, p) * (1 - smoothstep(0.42, 0.75, p));
  if (burst > 0) {
    ctx.save();
    ctx.globalAlpha = burst;
    drawPolarImpactBursts(ctx, white, burst);
    ctx.restore();
  }
  if (white) {
    const lineAlpha = smoothstep(0.23, 0.28, p) * (1 - smoothstep(0.35, 0.42, p));
    if (lineAlpha > 0) {
      ctx.save();
      ctx.globalAlpha *= lineAlpha;
      drawBiteSpeedLines(ctx);
      ctx.restore();
    }
  }
  drawFang(ctx, -28, -jawGap, -0.24, 1.02, appear, white, -1, 0.72, 0);
  drawFang(ctx, 28, -jawGap, 0.24, 1.02, appear, white, 1, 0.72, 0);
  drawFang(ctx, -9, -jawGap - 15, -0.08, 0.52, appear * 0.92, white, -1, 0.62, -18);
  drawFang(ctx, 9, -jawGap - 15, 0.08, 0.52, appear * 0.92, white, 1, 0.62, -18);
  drawFang(ctx, -18, jawGap, Math.PI + 0.2, 0.68, appear * 0.78, white, 1, 0.66, 0);
  drawFang(ctx, 18, jawGap, Math.PI - 0.2, 0.68, appear * 0.78, white, -1, 0.66, 0);
  ctx.restore();
}

function drawBlackFlash(ctx, hits, time, w, h) {
  hits.forEach(hit => {
    const delay = BITE_START_SEC + hit.order * 0.32;
    const local = time - delay;
    if (local < 0 || local > 0.22) return;
    const peak = smoothstep(0.03, 0.07, local) * (1 - smoothstep(0.08, 0.2, local));
    if (peak <= 0) return;
    ctx.save();
    ctx.globalAlpha = peak * 0.88;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  });
}

function SnakeTrapCanvas({ layout, rayAngles, exiting }) {
  const canvasRef = React.useRef(null);
  const hitsKey = React.useMemo(
    () => layout.biteHits.map(hit => `${hit.idx}:${hit.order}:${Math.round(hit.x)}:${Math.round(hit.y)}`).join('|'),
    [layout.biteHits],
  );
  const rayKey = React.useMemo(
    () => rayAngles.map(angle => Math.round(angle * 10) / 10).join('|'),
    [rayAngles],
  );
  const uiRectsKey = React.useMemo(
    () => layout.uiRects.map(r => `${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`).join('|'),
    [layout.uiRects],
  );
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const snakes = rayAngles.map((angle, index) => buildSnakeSpec(layout.center, angle, index));
    const started = performance.now();
    const render = now => {
      const time = (now - started) / 1000;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(2, 12, 3, 0.06)';
      ctx.fillRect(0, 0, w, h);
      snakes.forEach(snake => drawSnake(ctx, snake, time, layout.uiRects));
      drawBlackFlash(ctx, layout.biteHits, time, w, h);
      layout.biteHits.forEach(hit => drawBite(ctx, hit, time));
      ctx.restore();
      if (time < 3.25 && !exiting) raf = requestAnimationFrame(render);
    };
    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  // Stable geometry keys deliberately control canvas reconstruction. Depending on
  // the layout arrays themselves would restart the animation on every measurement.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    layout.center.x,
    layout.center.y,
    uiRectsKey,
    hitsKey,
    rayKey,
    exiting,
  ]);
  return <canvas ref={canvasRef} className="snake-trap-canvas" aria-hidden="true" />;
}

export function SnakeTrapOverlay({ anim, exiting }) {
  const rayAngles = Array.isArray(anim?.rayAngles) ? anim.rayAngles : [];
  const assignmentHits = React.useMemo(() => {
    if (Array.isArray(anim?.assignmentHits) && anim.assignmentHits.length) return anim.assignmentHits;
    const list = [];
    (Array.isArray(anim?.assignmentList) ? anim.assignmentList : []).forEach(item => {
      const count = Math.max(1, item?.count || 1);
      for (let i = 0; i < count; i += 1) list.push({ idx: item.idx, name: item.name });
    });
    return list;
  }, [anim]);
  const [layout, setLayout] = React.useState(() => ({
    center: { x: window.innerWidth * 0.5, y: window.innerHeight * 0.46 },
    uiRects: [],
    biteHits: [],
  }));

  React.useLayoutEffect(() => {
    const measured = measureCenterArea();
    setLayout({
      center: measured.center,
      uiRects: measured.uiRects,
      biteHits: measurePanelCenters(assignmentHits),
    });
  }, [assignmentHits]);

  return (
    <div
      className="snake-trap-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        pointerEvents: 'none',
        overflow: 'hidden',
        animation: exiting ? 'snakeTrapFadeOut 0.22s ease-in forwards' : 'none',
      }}
    >
      <div className="snake-trap-vignette" />
      <div
        className="snake-trap-nest"
        style={{ left: layout.center.x, top: layout.center.y }}
      />
      <SnakeTrapCanvas layout={layout} rayAngles={rayAngles} exiting={exiting} />
    </div>
  );
}
