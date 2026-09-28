import React from 'react';
import { FullscreenLightLayer } from './FullscreenLightLayer';

const RING_COUNT = 11;
const MID_RING = Math.floor(RING_COUNT / 2);
const TUNNEL = {
  width: 240,
  height: 160,
  depthGap: 96,
};

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function easeInOut(x) {
  return x * x * (3 - 2 * x);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rotateY(point, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: point.x * c + point.z * s,
    y: point.y,
    z: -point.x * s + point.z * c,
  };
}

function project(point, cameraZ, focal, cx, cy, cameraX = 0, cameraY = 0, roll = 0) {
  const z = Math.max(80, cameraZ - point.z);
  const scale = focal / z;
  const sx = (point.x - cameraX) * scale;
  const sy = (point.y - cameraY) * scale;
  const c = Math.cos(roll);
  const s = Math.sin(roll);
  return {
    x: cx + sx * c - sy * s,
    y: cy + sx * s + sy * c,
    scale,
  };
}

function getRingPoints(width, height, z) {
  const halfW = width / 2;
  const halfH = height / 2;
  const contour = [];
  const rough = (i, amp = 1) => Math.sin(i * 2.17 + z * 0.011) * amp + Math.sin(i * 4.73 + z * 0.007) * amp * 0.45;
  const push = (x, y, i, amp = 1) => contour.push({
    x: x + rough(i, amp) * halfW * 0.012,
    y: y + rough(i + 19, amp) * halfH * 0.012,
    z,
  });

  // Horseshoe-like tunnel cross section: broad floor, mostly straight side walls,
  // and an arched crown. Rock irregularity is kept subtle and follows the wall.
  const wallTopY = -halfH * 0.28;
  const floorY = halfH * 0.82;
  const sideX = halfW * 0.9;
  let k = 0;
  for (let i = 0; i <= 6; i += 1) {
    const t = i / 6;
    const y = floorY + (wallTopY - floorY) * t;
    const naturalInset = Math.sin(t * Math.PI) * halfW * 0.035;
    push(-sideX + naturalInset, y, k++, 0.8);
  }
  for (let i = 1; i <= 12; i += 1) {
    const a = Math.PI - (i / 13) * Math.PI;
    const x = Math.cos(a) * sideX;
    const y = wallTopY - Math.sin(a) * halfH * 0.7;
    push(x, y, k++, 1.15);
  }
  for (let i = 6; i >= 0; i -= 1) {
    const t = i / 6;
    const y = floorY + (wallTopY - floorY) * t;
    const naturalInset = Math.sin(t * Math.PI) * halfW * 0.035;
    push(sideX - naturalInset, y, k++, 0.8);
  }
  for (let i = 1; i <= 6; i += 1) {
    const t = i / 7;
    const x = sideX + (-sideX - sideX) * t;
    const y = floorY + Math.sin(t * Math.PI) * halfH * 0.025;
    push(x, y, k++, 0.65);
  }

  return { contour };
}

function drawLine(ctx, a, b, alpha, width = 1.4) {
  ctx.globalAlpha = alpha;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function EndlessCorridorCanvas({ exiting }) {
  const canvasRef = React.useRef(null);
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
    const started = performance.now();
    const render = now => {
      const time = (now - started) / 2300;
      const p = Math.max(0, Math.min(1, time));
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      const focal = Math.min(w, h) * 1.08;
      const spread = smoothstep(0.02, 0.26, p);
      const turn = easeInOut(smoothstep(0.14, 0.86, p));
      const approach = easeInOut(smoothstep(0.28, 0.82, p));
      const dive = easeInOut(smoothstep(0.58, 1, p));
      const yaw = lerp(-1.18, 0, turn);
      const cameraX = lerp(-92, 0, approach);
      const cameraY = lerp(-58, 0, smoothstep(0.18, 0.8, p));
      const roll = lerp(-0.08, 0.045 * Math.sin((p - 0.58) * Math.PI * 2.1), dive);
      const cameraZ = 1240 - approach * 260 - dive * 390;
      const zoom = 0.8 + approach * 0.23 + dive * 0.42;

      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.strokeStyle = 'rgba(190,255,236,0.86)';
      ctx.shadowColor = 'rgba(95,231,208,0.45)';
      ctx.shadowBlur = 8;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';

      const rings = Array.from({ length: RING_COUNT }, (_, i) => {
        const depthOffset = i - MID_RING;
        const collapsedZ = depthOffset * 1.1;
        const finalZ = depthOffset * -TUNNEL.depthGap;
        const z = lerp(collapsedZ, finalZ, spread);
        const sizePulse = 1 + 0.025 * Math.sin(i * 1.7 + p * Math.PI * 2);
        const widthWarp = 1 + 0.08 * Math.sin(i * 0.9 + p * Math.PI * 1.4);
        const heightWarp = 1 + 0.035 * Math.cos(i * 1.2 + p * Math.PI);
        const points = getRingPoints(TUNNEL.width * zoom * sizePulse * widthWarp, TUNNEL.height * zoom * sizePulse * heightWarp, z);
        const transformPoint = point => project(rotateY(point, yaw), cameraZ, focal, cx, cy, cameraX, cameraY, roll);
        return {
          i,
          z,
          opacity: (0.26 + (i / (RING_COUNT - 1)) * 0.56) * (1 - smoothstep(0.86, 1, p) * 0.7),
          contour: points.contour.map(transformPoint),
        };
      });

      for (let i = 0; i < rings.length - 1; i += 1) {
        const a = rings[i];
        const b = rings[i + 1];
        const alpha = Math.min(a.opacity, b.opacity) * 0.74;
        a.contour.forEach((pt, idx) => {
          const strong = idx % 3 === 0;
          drawLine(ctx, pt, b.contour[idx], alpha * (strong ? 0.9 : 0.62), strong ? 1.35 : 0.95);
        });
      }

      rings.forEach(ring => {
        const alpha = ring.opacity;
        ring.contour.forEach((pt, idx) => {
          const next = ring.contour[(idx + 1) % ring.contour.length];
          drawLine(ctx, pt, next, alpha, idx % 3 === 0 ? 2.1 : 1.65);
        });
      });

      ctx.restore();
      if (p < 1 && !exiting) raf = requestAnimationFrame(render);
    };
    resize();
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(render);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [exiting]);
  return <canvas className="endlessCorridorCanvas" ref={canvasRef} aria-hidden="true" />;
}

const TUNNEL_RUSH_SOUND_DELAY_MS = 1650;
let softFlashTextureUrl = null;

function getSoftFlashTextureUrl() {
  if (softFlashTextureUrl) return softFlashTextureUrl;
  if (typeof document === 'undefined') return '';
  const size = 96;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  const center = size / 2;
  const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.3, 'rgba(255,255,255,.98)');
  gradient.addColorStop(0.52, 'rgba(250,255,252,.68)');
  gradient.addColorStop(0.74, 'rgba(232,255,246,.24)');
  gradient.addColorStop(1, 'rgba(190,255,236,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  softFlashTextureUrl = canvas.toDataURL('image/png');
  return softFlashTextureUrl;
}

export function EndlessCorridorTunnelAnim({ exiting, onTunnelRush }) {
  const softFlashSrc = React.useMemo(() => getSoftFlashTextureUrl(), []);

  React.useEffect(() => {
    const timer = setTimeout(() => {
      onTunnelRush?.();
    }, TUNNEL_RUSH_SOUND_DELAY_MS);
    return () => clearTimeout(timer);
  }, [onTunnelRush]);

  return (
    <>
      <FullscreenLightLayer className={`endlessCorridorTopLight${exiting ? ' ending' : ''}`}>
        {softFlashSrc ? (
          <img className="endlessCorridorFlash" src={softFlashSrc} alt="" aria-hidden="true" />
        ) : (
          <div className="endlessCorridorFlash" />
        )}
      </FullscreenLightLayer>
      <div className={`endlessCorridorOverlay${exiting ? ' ending' : ''}`}>
        <div className="endlessCorridorStage">
          <EndlessCorridorCanvas exiting={exiting} />
          <div className="endlessCorridorEntranceRays">
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="endlessCorridorCore" />
          <div className="endlessCorridorExposure" />
        </div>
      </div>
    </>
  );
}
