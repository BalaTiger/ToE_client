import React from 'react';
import { CS, GOD_CS, getCardBackImage } from '../../constants/card';
import { MiniCardFace } from '../cards';
import { getPileAnchorCenter, getPlayerHandAnchorCenter } from '../../utils/dom';

const BLACK_GOAT_PARTICLES = [
  { x: -18, y: -18, size: 7, delay: 0.00, dur: 0.58, glow: 1.00 },
  { x: 16, y: -12, size: 5, delay: 0.05, dur: 0.52, glow: 0.85 },
  { x: -12, y: 18, size: 4, delay: 0.10, dur: 0.62, glow: 0.70 },
  { x: 20, y: 14, size: 6, delay: 0.15, dur: 0.56, glow: 0.95 },
  { x: -24, y: 4, size: 4, delay: 0.20, dur: 0.50, glow: 0.75 },
  { x: 8, y: 24, size: 5, delay: 0.25, dur: 0.64, glow: 0.80 },
];

function BlackGoatTrail({ txPx, tyPx, delay = 0, duration = 1.28 }) {
  const shouldFlipGoat = txPx > 0;

  return (
    <>
      <div style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 46,
        height: 46,
        marginLeft: -23,
        marginTop: -23,
        borderRadius: '50%',
        border: '1px solid rgba(74,222,128,0.42)',
        background: 'radial-gradient(circle,rgba(34,197,94,0.24) 0%,rgba(12,68,32,0.26) 42%,rgba(0,0,0,0) 72%)',
        boxShadow: '0 0 22px rgba(74,222,128,0.42), inset 0 0 14px rgba(20,83,45,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        '--tx': `${txPx}px`,
        '--ty': `${tyPx}px`,
        animation: `cardTransferFly ${duration}s cubic-bezier(0.25,0,0.35,1) ${delay}s both, goatSigilPulse ${duration}s ease-out ${delay}s both`,
        zIndex: 486,
      }}>
        <div style={{
          width: 72,
          height: 72,
          backgroundImage: "url('/img/effects/evil_goat_spirit_run_spritesheet.png')",
          backgroundSize: '700% 100%',
          backgroundRepeat: 'no-repeat',
          filter: 'drop-shadow(0 0 10px rgba(74,222,128,0.95)) drop-shadow(0 0 18px rgba(21,128,61,0.75))',
          animation: `goatRunSprite ${Math.max(0.72, duration * 0.72)}s steps(1) ${delay}s infinite`,
          transform: shouldFlipGoat ? 'scaleX(-1)' : 'scaleX(1)',
          transformOrigin: 'center',
        }} />
      </div>
      {BLACK_GOAT_PARTICLES.map((p, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: p.x,
          top: p.y,
          width: p.size,
          height: p.size,
          marginLeft: -p.size / 2,
          marginTop: -p.size / 2,
          borderRadius: '50%',
          background: 'radial-gradient(circle,#bbf7d0 0%,#4ade80 42%,rgba(22,101,52,0) 76%)',
          boxShadow: `0 0 ${Math.round(14 * p.glow)}px rgba(74,222,128,${0.75 * p.glow})`,
          '--tx': `${txPx + p.x * 0.55}px`,
          '--ty': `${tyPx + p.y * 0.55}px`,
          '--drift-x': `${p.x * 1.35}px`,
          '--drift-y': `${p.y * 1.15}px`,
          animation: `blackGoatParticleFly ${duration + p.delay * 0.75}s cubic-bezier(0.25,0,0.35,1) ${delay + p.delay}s both`,
          zIndex: 485,
        }} />
      ))}
    </>
  );
}

// ── Discard Move Overlay ──────────────────────────────────────
// Shows a card-back flying from the actor's hand area to the discard pile
export function ZhuHideCardOverlay({ anim, exiting }) {
  const [style, setStyle] = React.useState(null);

  React.useEffect(() => {
    if (!anim?.card) return;
    const deck = getPileAnchorCenter(
      '[data-deck-pile]',
      { x: window.innerWidth * 0.94 - 35, y: window.innerHeight * 0.08 }
    );
    setStyle({
      left: deck.x,
      top: deck.y,
      '--pull-x': '-96px',
      '--pull-y': '18px',
      '--bottom-x': '8px',
      '--bottom-y': '78px',
    });
  }, [anim]);

  if (!anim?.card) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 992,
      pointerEvents: 'none',
      overflow: 'hidden',
      animation: `zhuHideOverlayDepth 1.15s steps(1,end) forwards${exiting ? ', animFadeOut 0.18s ease-in forwards' : ''}`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,7,2,0.24)', animation: 'moveOverlayBgFade 1.15s ease both' }} />
      {style && (
        <>
          <div style={{
            position: 'absolute',
            left: style.left,
            top: style.top,
            width: 70,
            height: 94,
            marginLeft: -35,
            marginTop: -47,
            '--pull-x': style['--pull-x'],
            '--pull-y': style['--pull-y'],
            '--bottom-x': style['--bottom-x'],
            '--bottom-y': style['--bottom-y'],
            zIndex: 6,
            animation: 'zhuHideCardPath 1.15s cubic-bezier(0.28,0,0.22,1) forwards, zhuHideDepth 1.15s steps(1,end) forwards',
          }}>
            <div style={{
              position: 'absolute',
              inset: -24,
              borderRadius: '50%',
              background: 'radial-gradient(circle,rgba(234,179,8,0.28),rgba(113,63,18,0.14) 42%,rgba(0,0,0,0) 72%)',
              filter: 'blur(1px)',
              animation: 'zhuHideGlow 1.15s ease forwards',
            }} />
            <MiniCardFace card={anim.card} />
          </div>
        </>
      )}
    </div>
  );
}

export function DiscardMoveOverlay({ anim, exiting, expansionKey = 'temporary' }) {
  const [cardStyle, setCardStyle] = React.useState({});

  React.useEffect(() => {
    if (!anim) return;
    const card = anim.card || null;
    const s = card ? (card.isGod ? GOD_CS : (CS[card.letter] || null)) : null;
    const cardBackImage = getCardBackImage(expansionKey);
    const targetPid = anim.targetPid || 0;
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
        backgroundColor: s ? undefined : '#100c08',
        backgroundImage: s ? undefined : `url('${cardBackImage}')`,
        backgroundSize: s ? undefined : 'cover',
        backgroundPosition: s ? undefined : 'center',
        backgroundRepeat: s ? undefined : 'no-repeat',
        background: s ? s.bg : undefined,
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
  }, [anim, expansionKey]);

  if (!anim) return null;
  const card = anim.card || null;
  const s = card ? (card.isGod ? GOD_CS : (CS[card.letter] || null)) : null;

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
            <MiniCardFace card={card} width={70} height={94} ambient={false} frameStyle={{boxShadow:'none',border:'none',background:'transparent'}}/>
          )}
        </div>
      )}
    </div>
  );
}

export function BuryToDeckOverlay({ anim, exiting, expansionKey = 'temporary' }) {
  const [style, setStyle] = React.useState(null);

  React.useEffect(() => {
    if (!anim) return;
    const start = getPlayerHandAnchorCenter(anim.fromPid ?? 0);
    const deck = getPileAnchorCenter(
      '[data-deck-pile]',
      { x: window.innerWidth * 0.94 - 35, y: window.innerHeight * 0.08 }
    );
    const tx = deck.x - start.x;
    const ty = deck.y - start.y;
    setStyle({
      left: start.x,
      top: start.y,
      deckLeft: deck.x,
      deckTop: deck.y,
      '--tx': `${tx}px`,
      '--ty': `${ty}px`,
    });
  }, [anim]);

  if (!anim || !style) return null;
  const cardBackImage = getCardBackImage(expansionKey);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 992,
      pointerEvents: 'none',
      overflow: 'hidden',
      animation: `buryToDeckOverlayDepth 1.15s steps(1,end) forwards${exiting ? ', animFadeOut 0.18s ease-in forwards' : ''}`,
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,7,2,0.18)', animation: 'moveOverlayBgFade 1.15s ease both' }} />
      <div style={{
        position: 'absolute',
        left: style.left,
        top: style.top,
        width: 58,
        height: 82,
        marginLeft: -29,
        marginTop: -41,
        '--tx': style['--tx'],
        '--ty': style['--ty'],
        zIndex: 6,
        animation: 'buryToDeckPath 1.15s cubic-bezier(0.28,0,0.22,1) forwards, buryToDeckDepth 1.15s steps(1,end) forwards',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 4,
          backgroundImage: `url('${cardBackImage}')`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          border: '1.5px solid #4a3010',
          boxShadow: '0 6px 18px rgba(0,0,0,0.65), inset 0 0 10px rgba(0,0,0,0.5)',
        }} />
      </div>
    </div>
  );
}

// ── Card Transfer Overlay (hand cards flying to dest) ───────────
// Receives pre-measured positions from parent useEffect([anim])
export function CardTransferOverlay({ transfers, expansionKey = 'temporary' }) {
  if (!transfers || !transfers.length) return null;
  const cardBackImage = getCardBackImage(expansionKey);
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 480, overflow: 'hidden' }}>
      {transfers.flatMap(({ srcX, srcY, destX, destY, count, key, effect }) =>
        Array.from({ length: count }).map((_, idx) => {
          const ox = (idx - (count - 1) / 2) * 14;
          const oy = idx * (-4);
          const txPx = destX - srcX + ox;
          const tyPx = destY - srcY + oy;
          const delay = idx * 0.07;
          const duration = effect === 'blackGoat' ? 1.28 : 0.62;
          return (
            <div key={`${key}-${idx}`} style={{ position: 'absolute', left: srcX, top: srcY }}>
              {effect === 'blackGoat' && <BlackGoatTrail txPx={txPx} tyPx={tyPx} delay={delay} duration={duration} />}
              <div style={{
                position: 'absolute',
                left: 0, top: 0,
                width: 28, height: 40, marginLeft: -14, marginTop: -20,
                backgroundColor: '#100c08',
                backgroundImage: `url('${cardBackImage}')`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
                border: effect === 'blackGoat' ? '1.5px solid #4ade80' : '1.5px solid #6a4020',
                borderRadius: 3,
                boxShadow: effect === 'blackGoat' ? '0 0 16px rgba(74,222,128,0.5), 0 2px 8px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.6)',
                '--tx': `${txPx}px`, '--ty': `${tyPx}px`,
                animation: `cardTransferFly ${duration}s cubic-bezier(0.25,0,0.35,1) ${delay}s both`,
                zIndex: 481 + idx,
              }}>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
