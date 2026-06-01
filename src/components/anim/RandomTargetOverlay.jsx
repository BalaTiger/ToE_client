import React from 'react';
import { getPileAnchorCenter, getPlayerAreaAnchorCenter } from '../../utils/dom';

function angleFromTo(from, to) {
  return Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
}

function getPilesCenter() {
  const fallback = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.42 };
  const centers = [
    getPileAnchorCenter('[data-inspection-pile]', null),
    getPileAnchorCenter('[data-deck-pile]', null),
    getPileAnchorCenter('[data-discard-pile]', null),
  ].filter(Boolean);
  if (!centers.length) return fallback;
  return {
    x: centers.reduce((sum, p) => sum + p.x, 0) / centers.length,
    y: centers.reduce((sum, p) => sum + p.y, 0) / centers.length,
  };
}

export function RandomTargetOverlay({ anim, exiting }) {
  const [geometry, setGeometry] = React.useState(null);
  React.useLayoutEffect(() => {
    const center = getPilesCenter();
    const target = getPlayerAreaAnchorCenter(anim.targetIdx ?? 0);
    const source = getPlayerAreaAnchorCenter(anim.sourceIdx ?? 0);
    setGeometry({
      center,
      target,
      source,
      targetAngle: angleFromTo(center, target),
      sourceAngle: angleFromTo(center, source),
    });
  }, [anim.sourceIdx, anim.targetIdx]);

  if (!geometry) return null;
  const { center, targetAngle, sourceAngle } = geometry;
  const spinTurns = 3;
  const finalRotation = 360 * spinTurns + targetAngle;
  const sourceName = anim.players?.[anim.sourceIdx]?.name || '角色';
  const targetName = anim.players?.[anim.targetIdx]?.name || '目标';
  const detail = anim.roll != null
    ? `骰点 ${anim.roll}${anim.distance != null ? ` - 距离 ${anim.distance}` : ''}${anim.damage != null ? ` = ${anim.damage} HP` : ''}`
    : '';

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 999,
      background: 'rgba(5,3,1,0.55)',
      pointerEvents: 'none',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'animFadeIn 0.12s ease-out forwards',
    }}>
      <style>{`
        @keyframes randomTargetNeedleSpin {
          0% { transform: rotate(${sourceAngle}deg); }
          58% { transform: rotate(${finalRotation - 22}deg); }
          70% { transform: rotate(${finalRotation + 8}deg); }
          82%, 100% { transform: rotate(${finalRotation}deg); }
        }
        @keyframes randomTargetPulse {
          0%, 100% { transform: translate(-50%, -50%) scale(1); }
          50% { transform: translate(-50%, -50%) scale(1.04); }
        }
      `}</style>
      <div style={{
        position: 'absolute',
        left: center.x,
        top: center.y,
        width: 190,
        height: 190,
        transform: 'translate(-50%, -50%)',
        animation: 'randomTargetPulse 1.2s ease-in-out both',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%,#8a5a2a 0%,#5a3215 42%,#2b1407 100%)',
          border: '5px solid #9b6a32',
          boxShadow: '0 16px 38px rgba(0,0,0,0.65), inset 0 0 18px #f0c07044',
        }} />
        {[0, 45, 90, 135, 180, 225, 270, 315].map(deg => (
          <div key={deg} style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            width: 4,
            height: 18,
            background: '#1b0c04',
            borderRadius: 2,
            transform: `translate(-50%, -50%) rotate(${deg}deg) translateY(-76px)`,
            transformOrigin: '50% 50%',
            opacity: 0.62,
          }} />
        ))}
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 78,
          height: 12,
          transformOrigin: '0 50%',
          animation: 'randomTargetNeedleSpin 2.05s cubic-bezier(.15,.78,.18,1) forwards',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: 88,
            height: 12,
            clipPath: 'polygon(0 20%, 78% 20%, 100% 50%, 78% 80%, 0 80%)',
            background: 'linear-gradient(90deg,#2a0d08,#c02919 74%,#f0c05a)',
            boxShadow: '0 0 14px #f0503066',
          }} />
        </div>
        <div style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: 28,
          height: 28,
          transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'radial-gradient(circle,#e1b970,#6a3918)',
          border: '2px solid #2a1106',
          boxShadow: '0 0 12px #0008',
        }} />
      </div>
      <div style={{
        position: 'absolute',
        left: center.x,
        top: center.y + 120,
        transform: 'translateX(-50%)',
        minWidth: 260,
        padding: '10px 18px',
        background: 'rgba(12,7,3,0.82)',
        border: '1px solid #9b6a32',
        borderRadius: 4,
        textAlign: 'center',
        boxShadow: '0 0 28px #000a',
      }}>
        <div style={{ fontFamily: "'Cinzel',serif", color: '#e8c87a', fontSize: 13, letterSpacing: 2 }}>
          {anim.label || '随机目标'}
        </div>
        <div style={{ fontFamily: "'IM Fell English','Georgia',serif", color: '#c8a96e', fontStyle: 'italic', fontSize: 13, marginTop: 5 }}>
          {sourceName} 指向 {targetName}
        </div>
        {detail && (
          <div style={{ fontFamily: "'IM Fell English','Georgia',serif", color: '#b89858', fontSize: 12, marginTop: 4 }}>
            {detail}
          </div>
        )}
      </div>
    </div>
  );
}
