import { NARRATOR_AVATAR } from './InGameTutorialOverlay';

export default function SoftGuideOverlay({ guide, onClose }) {
  if (!guide) return null;
  return (
    <div
      data-soft-guide-overlay
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 980,
        background: 'rgba(4, 3, 2, 0.68)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 18,
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
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
            <div style={{
              fontFamily: "'Cinzel',serif",
              fontSize: 10,
              letterSpacing: 2,
              textTransform: 'uppercase',
              color: '#8f6d38',
              marginBottom: 5,
            }}>
              {guide.eyebrow || '软引导'}
            </div>
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
          </div>
        </div>

        <div style={{ display: 'grid', gap: 9, marginBottom: 22 }}>
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
      </div>
    </div>
  );
}
