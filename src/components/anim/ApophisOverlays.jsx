import React from 'react';

export function ApophisEclipseAnim({ exiting }) {
  const sunSize = 58;
  const sunTop = 29;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 820, pointerEvents: 'none', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(circle at 50% 58px, rgba(35,10,5,0.45) 0%, rgba(4,2,8,0.84) 42%, rgba(0,0,0,0.97) 100%)',
        animation: exiting ? 'apophisEclipseFadeOut .25s ease forwards' : 'apophisEclipseDarken 1.9s ease both',
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: sunTop,
        width: sunSize,
        height: sunSize,
        marginLeft: -sunSize / 2,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 38% 34%, #ffd07a 0%, #d96b2a 34%, #54120a 70%, #160207 100%)',
        boxShadow: '0 0 22px #d8461d, 0 0 46px #7a1208',
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: sunTop,
        width: sunSize,
        height: sunSize,
        marginLeft: -sunSize / 2,
        borderRadius: '50%',
        background: 'radial-gradient(circle at 40% 35%, #111 0%, #020205 62%, #000 100%)',
        boxShadow: '0 0 18px #000, inset 0 0 18px #2a0505',
        animation: 'apophisMoonCover 1.45s cubic-bezier(.18,.82,.22,1) both',
      }} />
      <div style={{
        position: 'absolute',
        left: '50%',
        top: sunTop - 4,
        width: sunSize + 8,
        height: sunSize + 8,
        marginLeft: -(sunSize + 8) / 2,
        borderRadius: '50%',
        boxShadow: '0 0 22px #c02014, 0 0 52px #5a0505',
        animation: 'apophisCorona 1.9s ease both',
      }} />
    </div>
  );
}

export function ApophisNightBadge({ night }) {
  const active = !!night?.active;
  if (!active) return null;
  const count = Math.max(0, Number(night.count || 0));
  const limit = Math.max(1, Number(night.limit || 12));
  const progress = Math.max(0, Math.min(1, count / limit));
  const moonTravel = 64 * progress;
  const normalSunOpacity = Math.min(0.9, 0.18 + progress * 0.72);
  const dimSunOpacity = Math.max(0.18, 0.82 - progress * 0.55);
  return (
    <div style={{
      position: 'fixed',
      top: 14,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 88,
      height: 88,
      background: 'transparent',
      zIndex: 705,
      pointerEvents: 'none',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        position: 'relative',
        width: 58,
        height: 58,
        borderRadius: '50%',
        overflow: 'hidden',
        background: 'radial-gradient(circle at 38% 34%, #d86a2c 0%, #7a1c12 42%, #170508 76%, #020103 100%)',
        boxShadow: '0 0 18px #b02a1d, 0 0 34px #4a0505, inset 0 0 18px #2a0202',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 36% 30%, #fff1a8 0%, #ffc247 30%, #f07822 58%, #8a170b 82%, #260404 100%)',
          opacity: normalSunOpacity,
          transition: 'opacity .45s ease',
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 42% 36%, rgba(80,18,12,.42) 0%, rgba(18,5,6,.62) 70%, rgba(0,0,0,.85) 100%)',
          opacity: dimSunOpacity,
          transition: 'opacity .45s ease',
        }} />
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 40% 34%, #151015 0%, #030306 72%, #000 100%)',
          boxShadow: '0 0 18px #000, inset 0 0 18px #2a0202',
          transform: `translateX(${moonTravel}px)`,
          transition: 'transform .45s ease',
        }} />
        <div style={{
          position: 'absolute',
          inset: -3,
          borderRadius: '50%',
          boxShadow: 'inset -10px 0 18px rgba(255,96,35,.30), 0 0 16px rgba(176,42,29,.70)',
          opacity: 0.55 + progress * 0.35,
        }} />
      </div>
    </div>
  );
}
