import { useState } from 'react';
import { createPortal } from 'react-dom';

export function GammaSlider({ gamma, onChange }) {
  const [hover, setHover] = useState(false);
  return createPortal(
    <div
      style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1800 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        title="亮度调节"
        style={{
          width: hover ? 178 : 32,
          height: hover ? 40 : 18,
          borderRadius: '0 0 16px 16px',
          background: '#120d06cc',
          border: '1.5px solid #5a3a18',
          borderTop: 'none',
          color: '#b07828',
          fontSize: 13,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(4px)',
          transition: 'all 0.2s ease',
          padding: 0,
          overflow: 'hidden',
          whiteSpace: 'nowrap',
        }}
      >
        {hover ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px' }} onClick={e => e.stopPropagation()}>
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: '#b07828', letterSpacing: 1, whiteSpace: 'nowrap' }}>亮度</span>
            <input
              type="range" min={0.5} max={2} step={0.05}
              value={gamma}
              onChange={e => onChange(parseFloat(e.target.value))}
              style={{ width: 70, accentColor: '#b07828', cursor: 'pointer' }}
            />
            <span style={{ fontFamily: "'Cinzel',serif", fontSize: 9, color: '#b07828', width: 28, textAlign: 'right' }}>{(() => { const v = Math.round((gamma - 1) * 100); return v > 0 ? '+' + v : v; })()}%</span>
            <button onClick={() => onChange(1)} style={{ background: 'none', border: 'none', color: '#7a5020', fontSize: 9, cursor: 'pointer', padding: '0 2px', fontFamily: "'Cinzel',serif" }}>重置</button>
          </div>
        ) : '☀'}
      </div>
    </div>,
    document.body
  );
}
