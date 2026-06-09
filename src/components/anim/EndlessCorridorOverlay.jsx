import React from 'react';

const RING_COUNT = 11;
const MID_RING = Math.floor(RING_COUNT / 2);
const TUNNEL = {
  width: 240,
  height: 160,
  depthGap: 96,
};

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
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

function project(point, cameraZ, focal, cx, cy) {
  const z = Math.max(80, cameraZ - point.z);
  const scale = focal / z;
  return {
    x: cx + point.x * scale,
    y: cy + point.y * scale,
    scale,
  };
}

function getRingPoints(width, height, z) {
  const halfW = width / 2;
  const halfH = height / 2;
  const leftSamples = [-1, -0.45, 0, 0.45, 1].map(t => ({ x: -halfW, y: t * halfH, z }));
  const rightSamples = [-1, -0.45, 0, 0.45, 1].map(t => ({ x: halfW, y: t * halfH, z }));
  const topSamples = [-0.55, 0, 0.55].map(t => ({ x: t * halfW, y: -halfH, z }));
  const bottomSamples = [-0.55, 0, 0.55].map(t => ({ x: t * halfW, y: halfH, z }));
  return {
    corners: [
      { x: -halfW, y: -halfH, z },
      { x: halfW, y: -halfH, z },
      { x: halfW, y: halfH, z },
      { x: -halfW, y: halfH, z },
    ],
    connectors: [...leftSamples, ...rightSamples, ...topSamples, ...bottomSamples],
  };
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
      const p = clamp01(time);
      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;
      const focal = Math.min(w, h) * 1.08;
      const spread = smoothstep(0.02, 0.26, p);
      const turn = easeInOut(smoothstep(0.22, 0.78, p));
      const dive = smoothstep(0.66, 1, p);
      const yaw = lerp(-1.22, 0, turn);
      const cameraZ = 1180 - dive * 520;
      const zoom = 0.82 + dive * 0.58;

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
        const points = getRingPoints(TUNNEL.width * zoom * sizePulse, TUNNEL.height * zoom * sizePulse, z);
        const transformPoint = point => project(rotateY(point, yaw), cameraZ, focal, cx, cy);
        return {
          i,
          z,
          opacity: (0.26 + (i / (RING_COUNT - 1)) * 0.56) * (1 - smoothstep(0.86, 1, p) * 0.7),
          corners: points.corners.map(transformPoint),
          connectors: points.connectors.map(transformPoint),
        };
      });

      for (let i = 0; i < rings.length - 1; i += 1) {
        const a = rings[i];
        const b = rings[i + 1];
        const alpha = Math.min(a.opacity, b.opacity) * 0.74;
        a.connectors.forEach((pt, idx) => {
          drawLine(ctx, pt, b.connectors[idx], alpha * (idx % 5 === 2 ? 0.92 : 0.58), idx % 5 === 2 ? 1.45 : 1.05);
        });
      }

      rings.forEach(ring => {
        const c = ring.corners;
        const alpha = ring.opacity;
        drawLine(ctx, c[0], c[1], alpha, 2.2);
        drawLine(ctx, c[1], c[2], alpha, 2.2);
        drawLine(ctx, c[2], c[3], alpha, 2.2);
        drawLine(ctx, c[3], c[0], alpha, 2.2);
        const leftMid = ring.connectors[2];
        const rightMid = ring.connectors[7];
        const topMid = ring.connectors[11];
        const bottomMid = ring.connectors[14];
        drawLine(ctx, leftMid, rightMid, alpha * 0.25, 0.9);
        drawLine(ctx, topMid, bottomMid, alpha * 0.18, 0.8);
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

export function EndlessCorridorTunnelAnim({ exiting }) {
  return (
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
        <div className="endlessCorridorFlash" />
      </div>
    </div>
  );
}
