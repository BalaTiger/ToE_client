import { NARRATOR_AVATAR } from './InGameTutorialOverlay';

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function padRect(rect, padding = 8) {
  if (!rect) return null;
  return {
    top: rect.top - padding,
    left: rect.left - padding,
    right: rect.right + padding,
    bottom: rect.bottom + padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
  };
}

function getPanelPosition(spotlights = []) {
  if (typeof window === 'undefined' || !spotlights.length) {
    return { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  }
  const vw = window.innerWidth || 1024;
  const vh = window.innerHeight || 720;
  const panelW = Math.min(vw - 28, 430);
  const panelH = Math.min(vh - 28, 285);
  const rects = spotlights.map(item => padRect(item.rect, item.padding ?? 8)).filter(Boolean);
  const union = {
    left: Math.min(...rects.map(r => r.left)),
    right: Math.max(...rects.map(r => r.right)),
    top: Math.min(...rects.map(r => r.top)),
    bottom: Math.max(...rects.map(r => r.bottom)),
  };
  const candidates = [
    { left: union.right + 22, top: union.top },
    { left: union.left - panelW - 22, top: union.top },
    { left: (vw - panelW) / 2, top: union.bottom + 22 },
    { left: (vw - panelW) / 2, top: union.top - panelH - 22 },
    { left: vw - panelW - 18, top: vh - panelH - 18 },
  ];
  const chosen = candidates.find(pos => (
    pos.left >= 14 &&
    pos.top >= 14 &&
    pos.left + panelW <= vw - 14 &&
    pos.top + panelH <= vh - 14
  )) || candidates[candidates.length - 1];
  return {
    left: clamp(chosen.left, 14, Math.max(14, vw - panelW - 14)),
    top: clamp(chosen.top, 14, Math.max(14, vh - panelH - 14)),
    transform: 'none',
  };
}

export default function SoftGuideOverlay({ guide, onClose, spotlights = [] }) {
  if (!guide) return null;
  const hasSpotlights = spotlights.length > 0;
  const panelPosition = getPanelPosition(spotlights);
  const hasHeader = !!(guide.eyebrow || guide.title);
  const hasConfirmButton = guide.confirmText !== '';
  return (
    <div
      data-soft-guide-overlay
      onClick={!hasConfirmButton ? onClose : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 980,
        pointerEvents: 'auto',
        cursor: hasConfirmButton ? 'default' : 'pointer',
      }}
    >
      {hasSpotlights ? (
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
        >
          <defs>
            <mask id="soft-guide-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              {spotlights.map(item => {
                const r = padRect(item.rect, item.padding ?? 8);
                if (!r) return null;
                return (
                  <rect
                    key={`hole-${item.id || item.label}`}
                    x={r.left}
                    y={r.top}
                    width={r.width}
                    height={r.height}
                    rx="8"
                    ry="8"
                    fill="black"
                  />
                );
              })}
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(4,3,2,0.72)" mask="url(#soft-guide-mask)" />
        </svg>
      ) : (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(4, 3, 2, 0.68)' }} />
      )}

      {spotlights.map(item => {
        const r = padRect(item.rect, item.padding ?? 8);
        if (!r) return null;
        return (
          <div
            key={`spot-${item.id || item.label}`}
            style={{
              position: 'absolute',
              left: r.left,
              top: r.top,
              width: r.width,
              height: r.height,
              border: '1.5px solid #e8c87a',
              borderRadius: 8,
              boxShadow: '0 0 0 1px #3a2510, 0 0 24px #e8c87a88, inset 0 0 18px #e8c87a18',
              pointerEvents: 'none',
            }}
          >
          </div>
        );
      })}

      <div
        onClick={event => {
          if (hasConfirmButton) event.stopPropagation();
        }}
        style={{
          position: 'absolute',
          ...panelPosition,
          width: 'min(92vw, 430px)',
          background: 'linear-gradient(180deg, #171008 0%, #0e0a06 100%)',
          border: '1.5px solid #7a5020',
          borderRadius: 6,
          boxShadow: '0 22px 80px #000000dd, 0 0 42px #7a502055',
          padding: '24px 26px 22px',
          color: '#c8a96e',
          fontFamily: "'IM Fell English','Noto Serif SC','Georgia',serif",
          animation: 'animPop 0.22s ease-out',
        }}
      >
        {hasHeader && (
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <img
              src={NARRATOR_AVATAR}
              alt="narrator"
              style={{
                width: 58,
                height: 58,
                borderRadius: 4,
                objectFit: 'cover',
                objectPosition: 'top',
                border: '1.5px solid #5a3a10',
                boxShadow: '0 0 16px #7a502066',
                flexShrink: 0,
              }}
            />
            <div>
              {guide.eyebrow && (
                <div style={{
                  fontFamily: "'Cinzel',serif",
                  fontSize: 10,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  color: '#8f6d38',
                  marginBottom: 5,
                }}>
                  {guide.eyebrow}
                </div>
              )}
              {guide.title && (
                <h3 style={{
                  margin: 0,
                  fontFamily: "'Cinzel Decorative','Cinzel',serif",
                  fontSize: 22,
                  color: '#e8c87a',
                  letterSpacing: 1.2,
                  textShadow: '0 0 22px #c8a96e33',
                }}>
                  {guide.title}
                </h3>
              )}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 9, marginBottom: hasConfirmButton ? 22 : 0 }}>
          {(guide.lines || []).map((line, idx) => (
            <p
              key={idx}
              style={{
                margin: 0,
                color: idx === 0 ? '#dcc284' : '#b89858',
                fontSize: 14,
                lineHeight: 1.8,
                fontStyle: 'italic',
              }}
            >
              {line}
            </p>
          ))}
        </div>

        {hasConfirmButton && (
          <button
            type="button"
            onClick={onClose}
            style={{
              width: '100%',
              padding: '10px 18px',
              background: '#1c1008',
              border: '1.5px solid #c8a96e',
              color: '#e8c87a',
              fontFamily: "'Cinzel',serif",
              fontWeight: 700,
              fontSize: 12,
              borderRadius: 3,
              cursor: 'pointer',
              letterSpacing: 1.2,
              boxShadow: '0 0 18px #c8a96e22',
            }}
          >
            {guide.confirmText || '知道了'}
          </button>
        )}
      </div>
    </div>
  );
}
