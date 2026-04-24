import React from 'react';
import { CS, GOD_CS } from '../../constants/card';
import { getPileAnchorCenter, getPlayerHandAnchorCenter } from '../../utils/dom';

// ── Discard Move Overlay ──────────────────────────────────────
// Shows a card-back flying from the actor's hand area to the discard pile
export function DiscardMoveOverlay({ anim, exiting }) {
  if (!anim) return null;
  const card = anim.card || null;
  const s = card ? (card.isGod ? GOD_CS : (CS[card.letter] || null)) : null;
  const discardCardTitle = card?.isGod ? (card.godKey || 'GOD') : card?.key;
  const discardCardSubtitle = card?.isGod ? card.name : '';
  const targetPid = anim.targetPid || 0;

  // Compute start and end positions using actual DOM elements
  const [cardStyle, setCardStyle] = React.useState({});

  React.useEffect(() => {
    const discardPos = getPileAnchorCenter(
      '[data-discard-pile]',
      { x: window.innerWidth * 0.35, y: window.innerHeight * 0.50 }
    );
    const discardX = discardPos.x;
    const discardY = discardPos.y;

    const startPos = getPlayerHandAnchorCenter(targetPid);
    const startX = startPos.x;
    const startY = startPos.y;

    if (startX && startY) {
      const tx = discardX - startX;
      const ty = discardY - startY;

      setCardStyle({
        position: 'absolute',
        left: startX,
        top: startY,
        transform: 'translate(-50%, -50%) scale(1)',
        width: 70,
        height: 94,
        borderRadius: 4,
        background: s ? s.bg : 'linear-gradient(135deg,#1e1208,#0e0804)',
        border: s ? `1.5px solid ${s.borderBright}` : '1.5px solid #4a3010',
        boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: `discardCardFlyCustom 1.0s cubic-bezier(0.4,0,0.3,1) forwards`,
        '--tx': `${tx}px`,
        '--ty': `${ty}px`
      });
    }
  }, [anim, targetPid, s]);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 990, pointerEvents: 'none',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'none',
    }}>
      {/* Subtle bg dim */}
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(4,2,0,0.35)', animation: 'discardBgFade 1.0s ease both' }} />
      {/* Flying card */}
      {Object.keys(cardStyle).length > 0 && (
        <div style={cardStyle}>
          {card && s && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '6px 5px', textAlign: 'center', lineHeight: 1.1 }}>
              <div style={{ fontFamily: "'Cinzel',serif", fontWeight: 700, color: s.text, fontSize: card.isGod ? 17 : 18, letterSpacing: card.isGod ? 1.2 : 0 }}>
                {discardCardTitle}
              </div>
              {!!discardCardSubtitle && (
                <div style={{ marginTop: 5, fontFamily: "'Cinzel',serif", fontWeight: 600, color: '#e8cc88', fontSize: 8.5 }}>
                  {discardCardSubtitle}
                </div>
              )}
            </div>
          )}
          {(!card || !s) && <div style={{
            position: 'absolute', inset: 0, borderRadius: 4,
            background: 'repeating-linear-gradient(45deg,#2a1a0820 0px,#2a1a0820 1px,transparent 1px,transparent 4px)'
          }} />}
        </div>
      )}
    </div>
  );
}

// ── Card Transfer Overlay (hand cards flying to dest) ───────────
// Receives pre-measured positions from parent useEffect([anim])
export function CardTransferOverlay({ transfers }) {
  if (!transfers || !transfers.length) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 480, overflow: 'hidden' }}>
      {transfers.flatMap(({ srcX, srcY, destX, destY, count, key }) =>
        Array.from({ length: count }).map((_, idx) => {
          const ox = (idx - (count - 1) / 2) * 14;
          const oy = idx * (-4);
          const txPx = destX - srcX + ox;
          const tyPx = destY - srcY + oy;
          return (
            <div key={`${key}-${idx}`} style={{
              position: 'absolute',
              left: srcX, top: srcY,
              width: 28, height: 40, marginLeft: -14, marginTop: -20,
              background: 'linear-gradient(135deg,#2e1c0a,#1a0e06)',
              border: '1.5px solid #6a4020',
              borderRadius: 3,
              boxShadow: '0 2px 8px rgba(0,0,0,0.6)',
              '--tx': `${txPx}px`, '--ty': `${tyPx}px`,
              animation: `cardTransferFly 0.62s cubic-bezier(0.25,0,0.35,1) ${idx * 0.07}s both`,
              zIndex: 481 + idx,
            }}>
              <div style={{
                position: 'absolute', inset: 0, borderRadius: 3,
                background: 'repeating-linear-gradient(45deg,#3a2010 0px,#3a2010 1px,transparent 1px,transparent 5px)',
                opacity: 0.4,
              }} />
            </div>
          );
        })
      )}
    </div>
  );
}
