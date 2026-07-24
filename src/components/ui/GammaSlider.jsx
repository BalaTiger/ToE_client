import { useState } from 'react';
import { createPortal } from 'react-dom';

const rowStyle = {
  display: 'grid',
  gridTemplateColumns: '34px 112px 34px',
  alignItems: 'center',
  gap: 8,
};

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

export function GammaSlider({
  gamma,
  onChange,
  musicVolume = 1,
  onMusicVolumeChange,
  sfxVolume = 1,
  onSfxVolumeChange,
}) {
  const [hover, setHover] = useState(false);
  const gammaPercent = Math.round((gamma - 1) * 100);
  return createPortal(
    <div
      style={{ position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)', zIndex: 1800 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        title="视听设置"
        aria-label="视听设置"
        style={{
          width: hover ? 230 : 54,
          height: hover ? 126 : 20,
          borderRadius: '0 0 16px 16px',
          background: '#120d06e8',
          border: '1.5px solid #5a3a18',
          borderTop: 'none',
          color: '#b07828',
          fontSize: 12,
          cursor: 'default',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backdropFilter: 'blur(5px)',
          transition: 'width 0.2s ease, height 0.2s ease',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          boxShadow: hover ? '0 8px 24px #0008' : 'none',
        }}
      >
        {hover ? (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: 9, padding: '10px 13px', width: '100%', boxSizing: 'border-box' }}
            onClick={event => event.stopPropagation()}
          >
            <div style={rowStyle}>
              <span style={{ fontSize: 10, letterSpacing: 1 }}>亮度</span>
              <input type="range" min={0.5} max={2} step={0.05} value={gamma} onChange={event => onChange(Number(event.target.value))} style={{ width: '100%', accentColor: '#c18a36' }}/>
              <span style={{ fontSize: 9, textAlign: 'right' }}>{gammaPercent > 0 ? `+${gammaPercent}` : gammaPercent}%</span>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 10, letterSpacing: 1 }}>音乐</span>
              <input type="range" min={0} max={1} step={0.05} value={musicVolume} onChange={event => onMusicVolumeChange?.(Number(event.target.value))} style={{ width: '100%', accentColor: '#8c66b8' }}/>
              <span style={{ fontSize: 9, textAlign: 'right' }}>{percent(musicVolume)}</span>
            </div>
            <div style={rowStyle}>
              <span style={{ fontSize: 10, letterSpacing: 1 }}>音效</span>
              <input type="range" min={0} max={1} step={0.05} value={sfxVolume} onChange={event => onSfxVolumeChange?.(Number(event.target.value))} style={{ width: '100%', accentColor: '#b07828' }}/>
              <span style={{ fontSize: 9, textAlign: 'right' }}>{percent(sfxVolume)}</span>
            </div>
          </div>
        ) : (
          <span aria-hidden="true" style={{ display: 'flex', alignItems: 'center', gap: 4, lineHeight: 1 }}>
            <span style={{ fontSize: 13 }}>☀</span><span style={{ color: '#76501f' }}>／</span><span style={{ fontSize: 13 }}>♪</span>
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
