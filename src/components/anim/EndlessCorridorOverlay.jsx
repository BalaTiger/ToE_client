import React from 'react';

const RINGS = Array.from({ length: 11 }, (_, i) => i);
const SIDE_TUNNEL = {
  x: 112,
  y: 258,
  gapX: 70,
  gapY: 3,
  width: 300,
  height: 200,
  shrinkX: 18,
  shrinkY: 10,
};
const MOUTH_TUNNEL = {
  width: 310,
  height: 210,
  shrinkX: 20,
  shrinkY: 12,
  spokeX: 162,
  spokeY: 110,
};
const TURN_ANIM = {
  begin: '0.24s',
  dur: '1.45s',
  fill: 'freeze',
  calcMode: 'spline',
  keySplines: '.2 .8 .2 1',
};

function sideRing(i) {
  return {
    x: SIDE_TUNNEL.x + i * SIDE_TUNNEL.gapX,
    y: SIDE_TUNNEL.y + i * SIDE_TUNNEL.gapY,
    w: SIDE_TUNNEL.width - i * SIDE_TUNNEL.shrinkX,
    h: SIDE_TUNNEL.height - i * SIDE_TUNNEL.shrinkY,
  };
}

function mouthRing(i) {
  const w = MOUTH_TUNNEL.width - i * MOUTH_TUNNEL.shrinkX;
  const h = MOUTH_TUNNEL.height - i * MOUTH_TUNNEL.shrinkY;
  return {
    x: 500 - w / 2,
    y: 350 - h / 2,
    w,
    h,
  };
}

function AnimatedAttr({ name, from, to }) {
  return (
    <animate
      attributeName={name}
      values={`${from};${to}`}
      begin={TURN_ANIM.begin}
      dur={TURN_ANIM.dur}
      fill={TURN_ANIM.fill}
      calcMode={TURN_ANIM.calcMode}
      keySplines={TURN_ANIM.keySplines}
    />
  );
}

export function EndlessCorridorTunnelAnim({ exiting }) {
  return (
    <div
      className={`endlessCorridorOverlay${exiting ? ' ending' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 940,
        pointerEvents: 'none',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 50%, rgba(13,35,38,.18) 0%, rgba(4,10,16,.9) 58%, rgba(0,0,0,.98) 100%)',
      }}
    >
      <svg
        viewBox="0 0 1000 700"
        preserveAspectRatio="xMidYMid slice"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          filter: 'drop-shadow(0 0 10px rgba(129,255,221,.45))',
        }}
      >
        <defs>
          <radialGradient id="endlessCorridorLight" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="#effff5" stopOpacity="0.98" />
            <stop offset="16%" stopColor="#b8ffe9" stopOpacity="0.7" />
            <stop offset="48%" stopColor="#41bda8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#041018" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="endlessCorridorStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#5fe7d0" />
            <stop offset="50%" stopColor="#d8fff2" />
            <stop offset="100%" stopColor="#276b84" />
          </linearGradient>
        </defs>
        <g className="endlessCorridorCamera">
          <g className="endlessCorridorTunnel">
            {RINGS.map(i => {
              const t = i / (RINGS.length - 1);
              const from = sideRing(i);
              const to = mouthRing(i);
              return (
                <rect
                  key={i}
                  x={from.x}
                  y={from.y}
                  width={from.w}
                  height={from.h}
                  rx="8"
                  fill="none"
                  stroke="url(#endlessCorridorStroke)"
                  strokeWidth={2.6 - t * 1.2}
                  opacity={0.24 + t * 0.58}
                  vectorEffect="non-scaling-stroke"
                >
                  <AnimatedAttr name="x" from={from.x} to={to.x} />
                  <AnimatedAttr name="y" from={from.y} to={to.y} />
                  <AnimatedAttr name="width" from={from.w} to={to.w} />
                  <AnimatedAttr name="height" from={from.h} to={to.h} />
                </rect>
              );
            })}
            {RINGS.slice(0, -1).map(i => {
              const aFrom = sideRing(i);
              const bFrom = sideRing(i + 1);
              const aTo = mouthRing(i);
              const bTo = mouthRing(i + 1);
              const fractions = [0, 0.25, 0.5, 0.75, 1];
              const lines = [
                ...fractions.map(f => ({
                  x1: aFrom.x + aFrom.w * f,
                  y1: aFrom.y,
                  x2: bFrom.x + bFrom.w * f,
                  y2: bFrom.y,
                  tx1: aTo.x + aTo.w * f,
                  ty1: aTo.y,
                  tx2: bTo.x + bTo.w * f,
                  ty2: bTo.y,
                })),
                ...fractions.map(f => ({
                  x1: aFrom.x + aFrom.w * f,
                  y1: aFrom.y + aFrom.h,
                  x2: bFrom.x + bFrom.w * f,
                  y2: bFrom.y + bFrom.h,
                  tx1: aTo.x + aTo.w * f,
                  ty1: aTo.y + aTo.h,
                  tx2: bTo.x + bTo.w * f,
                  ty2: bTo.y + bTo.h,
                })),
                ...[0.25, 0.5, 0.75].map(f => ({
                  x1: aFrom.x,
                  y1: aFrom.y + aFrom.h * f,
                  x2: bFrom.x,
                  y2: bFrom.y + bFrom.h * f,
                  tx1: aTo.x,
                  ty1: aTo.y + aTo.h * f,
                  tx2: bTo.x,
                  ty2: bTo.y + bTo.h * f,
                })),
                ...[0.25, 0.5, 0.75].map(f => ({
                  x1: aFrom.x + aFrom.w,
                  y1: aFrom.y + aFrom.h * f,
                  x2: bFrom.x + bFrom.w,
                  y2: bFrom.y + bFrom.h * f,
                  tx1: aTo.x + aTo.w,
                  ty1: aTo.y + aTo.h * f,
                  tx2: bTo.x + bTo.w,
                  ty2: bTo.y + bTo.h * f,
                })),
              ];
              return (
                <g key={`spoke-${i}`} stroke="url(#endlessCorridorStroke)" strokeWidth="1" opacity={0.11 + i * 0.035}>
                  {lines.map((line, lineIdx) => (
                    <line key={lineIdx} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2}>
                      <AnimatedAttr name="x1" from={line.x1} to={line.tx1} />
                      <AnimatedAttr name="y1" from={line.y1} to={line.ty1} />
                      <AnimatedAttr name="x2" from={line.x2} to={line.tx2} />
                      <AnimatedAttr name="y2" from={line.y2} to={line.ty2} />
                    </line>
                  ))}
                </g>
              );
            })}
            <g className="endlessCorridorEntranceRays" stroke="#b8ffe9" strokeWidth="1.4">
              {[-1, 1].map(sx => (
                <React.Fragment key={sx}>
                  <line x1="500" y1="350" x2={500 + sx * MOUTH_TUNNEL.spokeX} y2={350 - MOUTH_TUNNEL.spokeY} />
                  <line x1="500" y1="350" x2={500 + sx * MOUTH_TUNNEL.spokeX} y2={350 + MOUTH_TUNNEL.spokeY} />
                </React.Fragment>
              ))}
            </g>
          </g>
        </g>
        <circle className="endlessCorridorCore" cx="500" cy="350" r="30" fill="url(#endlessCorridorLight)" />
        <rect className="endlessCorridorFlash" x="0" y="0" width="1000" height="700" fill="#effff5" />
      </svg>
    </div>
  );
}
