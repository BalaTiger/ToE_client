import React from 'react';
import { getPlayerAreaAnchorCenter } from '../../utils/dom';

function fallbackPoint(pid, isTarget = false) {
  const x = isTarget ? window.innerWidth * 0.62 : window.innerWidth * 0.38;
  const y = pid === 0 ? window.innerHeight * 0.78 : window.innerHeight * 0.28;
  return { x, y };
}

function resolvePoint(pid, isTarget = false) {
  return getPlayerAreaAnchorCenter(pid ?? 0) || fallbackPoint(pid, isTarget);
}

export function ThrowStoneOverlay({ anim, exiting }) {
  const [geometry, setGeometry] = React.useState(null);
  React.useLayoutEffect(() => {
    const source = resolvePoint(anim?.sourceIdx ?? 0, false);
    const rawTarget = resolvePoint(anim?.targetIdx ?? 0, true);
    const hit = (anim?.damage || 0) > 0;
    const missOffset = hit ? { x: 0, y: 0 } : {
      x: rawTarget.x >= source.x ? 82 : -82,
      y: 46,
    };
    const target = { x: rawTarget.x + missOffset.x, y: rawTarget.y + missOffset.y };
    setGeometry({
      source,
      target,
      dx: target.x - source.x,
      dy: target.y - source.y,
      hit,
    });
  }, [anim?.sourceIdx, anim?.targetIdx, anim?.damage]);

  if (!geometry) return null;
  const { source, dx, dy, hit } = geometry;
  const flightCurve = Math.max(48, Math.min(132, Math.abs(dx) * 0.12 + Math.abs(dy) * 0.08));
  const controlX = dx * 0.5;
  const controlY = dy * 0.5 - flightCurve;
  const flightPath = `path("M 0 0 Q ${controlX.toFixed(1)} ${controlY.toFixed(1)} ${dx.toFixed(1)} ${dy.toFixed(1)}")`;
  const flightAngle = Math.atan2(dy, dx) * 180 / Math.PI;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1750,
      pointerEvents: 'none',
      animation: exiting ? 'animFadeOut 0.16s ease-in forwards' : 'animFadeIn 0.08s ease-out forwards',
    }}>
      <style>{`
        @keyframes throwStoneTravel {
          0% {
            opacity: 1;
            offset-distance: 0%;
            filter: drop-shadow(0 0 4px rgba(0,0,0,0.9));
          }
          58% {
            filter: drop-shadow(0 14px 12px rgba(0,0,0,0.5));
          }
          96% {
            opacity: 1;
            offset-distance: 100%;
            filter: drop-shadow(0 3px 4px rgba(0,0,0,0.48));
          }
          100% {
            opacity: 0;
            offset-distance: 100%;
            filter: drop-shadow(0 3px 4px rgba(0,0,0,0.48));
          }
        }
        @keyframes throwStoneSpinScale {
          0% { transform: rotate(-26deg) scale(0.82); }
          58% { transform: rotate(410deg) scale(1.04); }
          96% { transform: rotate(${hit ? 642 : 650}deg) scale(${hit ? 0.98 : 0.82}); }
          100% { transform: rotate(${hit ? 660 : 700}deg) scale(${hit ? 0.72 : 0.62}); }
        }
        @keyframes throwStoneTrail {
          0% { opacity: 0; transform: scaleX(0.2); }
          18% { opacity: 0.5; transform: scaleX(1); }
          78%, 100% { opacity: 0; transform: scaleX(0.18); }
        }
        @keyframes throwStoneImpact {
          0%, 82% { opacity: 0; transform: translate(-50%, -50%) scale(0.46); }
          92% { opacity: ${hit ? 0.95 : 0.34}; transform: translate(-50%, -50%) scale(${hit ? 1 : 0.72}); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(${hit ? 1.75 : 1.18}); }
        }
        @keyframes throwStoneShard {
          0%, 84% { opacity: 0; transform: translate3d(0, 0, 0) rotate(0deg) scale(0.4); }
          94% { opacity: ${hit ? 0.95 : 0.34}; }
          100% { opacity: 0; transform: translate3d(var(--sx), var(--sy), 0) rotate(var(--sr)) scale(0.9); }
        }
      `}</style>
      <div style={{
        position: 'absolute',
        left: source.x,
        top: source.y,
        width: 34,
        height: 30,
        offsetPath: flightPath,
        offsetDistance: '0%',
        offsetAnchor: '50% 50%',
        offsetRotate: '0deg',
        animation: 'throwStoneTravel 1.12s cubic-bezier(.17,.78,.22,1) forwards',
      }}>
        <div style={{
          position: 'absolute',
          left: -72,
          top: 10,
          width: 78,
          height: 6,
          transformOrigin: '100% 50%',
          transform: `rotate(${flightAngle.toFixed(1)}deg)`,
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: '100% 50%',
            background: 'linear-gradient(90deg, transparent, rgba(205,160,92,0.18), rgba(235,204,144,0.52))',
            filter: 'blur(2px)',
            animation: 'throwStoneTrail 0.72s ease-out forwards',
          }} />
        </div>
        <div style={{
          position: 'absolute',
          inset: 0,
          animation: 'throwStoneSpinScale 1.12s cubic-bezier(.17,.78,.22,1) forwards',
        }}>
          <div style={{
            position: 'absolute',
            inset: 0,
            clipPath: 'polygon(18% 7%, 72% 0%, 100% 34%, 82% 82%, 40% 100%, 4% 62%)',
            background: 'linear-gradient(135deg,#b7a07e 0%,#6e5b46 40%,#31261c 74%,#c1ad8b 100%)',
            boxShadow: 'inset -7px -7px 10px rgba(0,0,0,0.46), inset 5px 4px 7px rgba(255,230,170,0.24), 0 0 14px rgba(0,0,0,0.55)',
          }} />
          <div style={{
            position: 'absolute',
            left: 8,
            top: 6,
            width: 9,
            height: 7,
            clipPath: 'polygon(0 0, 100% 20%, 62% 100%, 14% 68%)',
            background: 'rgba(235,218,178,0.38)',
          }} />
        </div>
      </div>
      <div style={{
        position: 'absolute',
        left: source.x + dx,
        top: source.y + dy,
        width: hit ? 96 : 62,
        height: hit ? 96 : 62,
        borderRadius: '50%',
        border: `2px solid ${hit ? 'rgba(232,188,112,0.72)' : 'rgba(170,146,112,0.32)'}`,
        boxShadow: hit ? '0 0 24px rgba(232,188,112,0.42), inset 0 0 24px rgba(70,48,28,0.52)' : '0 0 14px rgba(120,100,80,0.22)',
        animation: 'throwStoneImpact 1.12s ease-out forwards',
      }} />
      {[[-26, -16, '-84deg'], [31, -22, '58deg'], [-18, 28, '154deg'], [38, 18, '206deg'], [2, -38, '24deg']].map(([sx, sy, sr], idx) => (
        <div key={idx} style={{
          '--sx': `${sx}px`,
          '--sy': `${sy}px`,
          '--sr': sr,
          position: 'absolute',
          left: source.x + dx,
          top: source.y + dy,
          width: idx % 2 ? 7 : 9,
          height: idx % 2 ? 5 : 6,
          clipPath: 'polygon(18% 0%, 100% 22%, 74% 100%, 0% 68%)',
          background: hit ? '#bca47a' : '#8b7860',
          boxShadow: '0 0 6px rgba(0,0,0,0.45)',
          animation: `throwStoneShard 1.08s ease-out ${idx * 0.025}s forwards`,
        }} />
      ))}
    </div>
  );
}
