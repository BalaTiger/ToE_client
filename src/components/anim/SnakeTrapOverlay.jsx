import React from 'react';
import { _getZoomCompensatedRect } from '../../utils/dom';

const SNAKE_COLORS = [
  '#b8f0a4', '#9ee68d', '#c4f5ad', '#8fd57e', '#d1ffc0',
];
const BITE_START_SEC = 1.75;

function measureCenterArea() {
  if (typeof document === 'undefined') {
    return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.48 };
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
    return { x: (left + right) / 2, y: (top + bottom) / 2 };
  }
  return { x: window.innerWidth * 0.5, y: window.innerHeight * 0.46 };
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
    dx > 0 ? (window.innerWidth - center.x + 120) / dx : (-center.x - 120) / dx,
    dy > 0 ? (window.innerHeight - center.y + 120) / dy : (-center.y - 120) / dy,
  );
  const distance = Math.max(halfW, halfH, Math.abs(t));
  return {
    x: center.x + Math.cos(rad) * distance,
    y: center.y + Math.sin(rad) * distance,
  };
}

function buildSnakePath(center, angle, index) {
  const end = getEdgePoint(center, angle);
  const rad = (angle * Math.PI) / 180;
  const normal = { x: -Math.sin(rad), y: Math.cos(rad) };
  const length = Math.hypot(end.x - center.x, end.y - center.y);
  const wobbleA = 34 + (index % 3) * 8;
  const wobbleB = -28 - (index % 4) * 6;
  const p1 = {
    x: center.x + Math.cos(rad) * length * 0.24 + normal.x * wobbleA,
    y: center.y + Math.sin(rad) * length * 0.24 + normal.y * wobbleA,
  };
  const p2 = {
    x: center.x + Math.cos(rad) * length * 0.55 + normal.x * wobbleB,
    y: center.y + Math.sin(rad) * length * 0.55 + normal.y * wobbleB,
  };
  const p3 = {
    x: center.x + Math.cos(rad) * length * 0.78 + normal.x * wobbleA * 0.55,
    y: center.y + Math.sin(rad) * length * 0.78 + normal.y * wobbleA * 0.55,
  };
  return `M ${center.x} ${center.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y} S ${end.x} ${end.y}, ${end.x} ${end.y}`;
}

function SnakeSilhouette({ path, index, color }) {
  const delay = 0.08 + index * 0.08;
  return (
    <g className="snake-trap-snake" style={{ '--snake-delay': `${delay}s` }}>
      <path
        d={path}
        fill="none"
        stroke="rgba(6, 18, 7, 0.96)"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="12"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="20 22"
        opacity="0.78"
      />
      <path
        d={path}
        fill="none"
        stroke="rgba(234, 255, 214, 0.9)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="2 26"
        opacity="0.72"
      />
    </g>
  );
}

function FangBite({ hit }) {
  const delay = BITE_START_SEC + hit.order * 0.32;
  return (
    <div
      className="snake-trap-fang-bite"
      style={{
        left: hit.x,
        top: hit.y,
        '--bite-delay': `${delay}s`,
      }}
    >
      <div className="snake-trap-bite-burst" />
      <div className="snake-trap-fang snake-trap-fang-left" />
      <div className="snake-trap-fang snake-trap-fang-right" />
      <div className="snake-trap-venom-drop snake-trap-venom-drop-a" />
      <div className="snake-trap-venom-drop snake-trap-venom-drop-b" />
      <div className="snake-trap-venom-drop snake-trap-venom-drop-c" />
    </div>
  );
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
    biteHits: [],
  }));

  React.useLayoutEffect(() => {
    const center = measureCenterArea();
    setLayout({
      center,
      biteHits: measurePanelCenters(assignmentHits),
    });
  }, [assignmentHits]);

  const paths = React.useMemo(
    () => rayAngles.map((angle, index) => buildSnakePath(layout.center, angle, index)),
    [layout.center, rayAngles],
  );

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
      <svg
        className="snake-trap-svg"
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        preserveAspectRatio="none"
      >
        {paths.map((path, i) => (
          <SnakeSilhouette
            key={i}
            path={path}
            index={i}
            color={SNAKE_COLORS[i % SNAKE_COLORS.length]}
          />
        ))}
      </svg>
      {layout.biteHits.map((hit, i) => (
        <FangBite key={`${hit.idx}-${i}`} hit={hit} />
      ))}
    </div>
  );
}
