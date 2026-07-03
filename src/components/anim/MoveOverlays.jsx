import React from 'react';
import { CS, GOD_CS } from '../../constants/card';
import { DDCard, MiniCardFace } from '../cards';
import { CardBackLayer } from '../cards/AnimatedCardBack';
import { getPileAnchorCenter, getPlayerAreaAnchorCenter, getPlayerHandAnchorCenter } from '../../utils/dom';
import { buildPublicUrl } from '../../utils/url';

const BLACK_GOAT_PARTICLES = [
  { x: -18, y: -18, size: 7, delay: 0.00, dur: 0.58, glow: 1.00 },
  { x: 16, y: -12, size: 5, delay: 0.05, dur: 0.52, glow: 0.85 },
  { x: -12, y: 18, size: 4, delay: 0.10, dur: 0.62, glow: 0.70 },
  { x: 20, y: 14, size: 6, delay: 0.15, dur: 0.56, glow: 0.95 },
  { x: -24, y: 4, size: 4, delay: 0.20, dur: 0.50, glow: 0.75 },
  { x: 8, y: 24, size: 5, delay: 0.25, dur: 0.64, glow: 0.80 },
];

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getAdaptiveDrawTransferCardSize(count = 1) {
  if (typeof window === 'undefined') return { width: 76, height: 100, scale: 76 / 82 };
  const vw = window.innerWidth || 1280;
  const vh = window.innerHeight || 720;
  const portraitMobile = vw <= 640 && vh >= vw;
  const landscapeMobile = vh <= 520 && vw > vh;
  const largeBoost = clampNumber((vw - 1280) / 960, 0, 1);
  const rawWidth = portraitMobile
    ? clampNumber(vw * 0.145, 52, 60)
    : landscapeMobile
      ? clampNumber(vh * 0.16, 56, 66)
      : 76 + largeBoost * 42;
  const multiCardScale = count > 1 ? clampNumber(1 - (count - 1) * 0.04, 0.78, 1) : 1;
  const width = Math.round(rawWidth * multiCardScale);
  const height = Math.round(width * (108 / 82));
  return { width, height, scale: width / 82 };
}

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
          backgroundImage: `url('${buildPublicUrl('/img/effects/evil_goat_spirit_run_spritesheet.webp')}')`,
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

export function DiscardMoveOverlay({ anim, exiting, expansionKey = '地神的潜影' }) {
  const [cardStyle, setCardStyle] = React.useState({});

  React.useEffect(() => {
    if (!anim) return;
    const card = anim.card || null;
    const s = card ? (card.isGod ? GOD_CS : (CS[card.letter] || null)) : null;
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
        backgroundColor: s ? 'transparent' : '#100c08',
        background: s ? 'transparent' : undefined,
        border: 'none',
        boxShadow: '0 6px 24px rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: `discardCardFlyCustom 1.0s cubic-bezier(0.4,0,0.3,1) forwards`,
        '--tx': `${tx}px`,
        '--ty': `${ty}px`
      });
    }
  }, [anim]);

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
        <div style={{
          ...cardStyle,
          overflow: 'hidden',
        }}>
          {!s && <CardBackLayer expansionKey={expansionKey}/>}
          {card && s && (
            <MiniCardFace card={card} width={70} height={94} ambient={false} frameStyle={{boxShadow:'none',border:'none',background:'transparent'}}/>
          )}
        </div>
      )}
    </div>
  );
}

export function BuryToDeckOverlay({ anim, exiting, expansionKey = '地神的潜影' }) {
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
          backgroundColor: '#100c08',
          border: 'none',
          boxShadow: '0 6px 18px rgba(0,0,0,0.65), inset 0 0 10px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>
          <CardBackLayer expansionKey={expansionKey}/>
        </div>
      </div>
    </div>
  );
}

// ── Card Transfer Overlay (hand cards flying to dest) ───────────
// Receives pre-measured positions from parent useEffect([anim])
export function CardTransferOverlay({ transfers, expansionKey = '地神的潜影' }) {
  if (!transfers || !transfers.length) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 480, overflow: 'hidden' }}>
      {transfers.flatMap(({ srcX, srcY, destX, destY, count, key, effect, cards }) =>
        Array.from({ length: count }).map((_, idx) => {
          const card = Array.isArray(cards) ? cards[idx] : null;
          const ox = (idx - (count - 1) / 2) * 14;
          const oy = idx * (-4);
          const txPx = destX - srcX + ox;
          const tyPx = destY - srcY + oy;
          const delay = idx * 0.07;
          const isGodKeepHand = effect === 'godKeepHand' && card;
          const isSlime = effect === 'tsgSlime' && card;
          const isDecipherStone = effect === 'decipherStone' && card;
          const isDrawKeep = effect === 'draw' && card;
          const drawCardSize = isDrawKeep ? getAdaptiveDrawTransferCardSize(count) : null;
          const duration = effect === 'blackGoat' ? 1.28 : effect === 'tsgSlime' ? 0.82 : isDrawKeep ? 0.74 : isGodKeepHand ? 0.78 : isDecipherStone ? 0.78 : 0.62;
          const cardW = isSlime ? 42 : isDrawKeep ? drawCardSize.width : isGodKeepHand ? 58 : isDecipherStone ? 58 : 28;
          const cardH = isSlime ? 56 : isDrawKeep ? drawCardSize.height : isGodKeepHand ? 82 : isDecipherStone ? 76 : 40;
          return (
            <div key={`${key}-${idx}`} style={{ position: 'absolute', left: srcX, top: srcY }}>
              {effect === 'blackGoat' && <BlackGoatTrail txPx={txPx} tyPx={tyPx} delay={delay} duration={duration} />}
              <div style={{
                position: 'absolute',
                left: 0, top: 0,
                width: cardW, height: cardH, marginLeft: -cardW / 2, marginTop: -cardH / 2,
                backgroundColor: (isDrawKeep || isDecipherStone) ? 'transparent' : '#100c08',
                border: (isDrawKeep || isDecipherStone || (!isSlime && !isGodKeepHand)) ? 'none' : effect === 'blackGoat' ? '1.5px solid #4ade80' : effect === 'tsgSlime' ? '1.5px solid #80d8a8' : `1.5px solid ${GOD_CS.borderBright}`,
                borderRadius: 3,
                boxShadow: effect === 'blackGoat'
                  ? '0 0 16px rgba(74,222,128,0.5), 0 2px 8px rgba(0,0,0,0.6)'
                  : effect === 'tsgSlime'
                    ? '0 0 18px rgba(128,216,168,0.45), 0 2px 8px rgba(0,0,0,0.6)'
                    : isGodKeepHand
                      ? `0 0 18px ${GOD_CS.glow}66, 0 2px 8px rgba(0,0,0,0.6)`
                      : '0 2px 8px rgba(0,0,0,0.6)',
                '--tx': `${txPx}px`, '--ty': `${tyPx}px`,
                animation: `cardTransferFly ${duration}s cubic-bezier(0.25,0,0.35,1) ${delay}s both`,
                zIndex: 481 + idx,
                overflow: 'hidden',
              }}>
                {!isSlime && !isDecipherStone && !isDrawKeep && <CardBackLayer expansionKey={expansionKey}/>}
                {isDrawKeep && (
                  <MiniCardFace
                    card={card}
                    width={cardW}
                    height={cardH}
                    frameStyle={{
                      boxShadow: 'none',
                      border: 'none',
                      background: 'transparent',
                    }}
                  />
                )}
                {isSlime && (
                  <DDCard
                    card={card}
                    small
                    frameStyle={{ boxShadow: 'none', border: 'none', width: cardW, minWidth: cardW, height: cardH }}
                  />
                )}
                {isDecipherStone && (
                  <MiniCardFace
                    card={card}
                    width={cardW}
                    height={cardH}
                    ambient={false}
                    frameStyle={{ boxShadow: 'none', border: 'none', background: 'transparent' }}
                  />
                )}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

export function TsathogguaSlimePopOverlay({ anim, exiting }) {
  const [pos, setPos] = React.useState(null);

  React.useEffect(() => {
    if (!anim) return;
    const anchor = getPlayerHandAnchorCenter(anim.targetPid ?? 0);
    setPos(anchor);
  }, [anim]);

  if (!anim || !pos) return null;
  const cards = Array.isArray(anim.cards) && anim.cards.length
    ? anim.cards
    : Array.from({ length: Math.max(1, anim.count || 1) }, () => null);
  const offsets = [
    { x: 0, y: 0 },
    { x: -26, y: 10 },
    { x: 28, y: 8 },
    { x: -10, y: -18 },
    { x: 18, y: -16 },
  ];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 992,
      pointerEvents: 'none',
      overflow: 'hidden',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'none',
    }}>
      <style>{`
        @keyframes tsgSlimeBubblePop {
          0% { transform: translate(-50%,-50%) scale(0.62); opacity: 0; filter: blur(0.6px); }
          22% { transform: translate(-50%,-54%) scale(1.08); opacity: 1; filter: blur(0); }
          62% { transform: translate(-50%,-62%) scale(1.18); opacity: 0.88; }
          78% { transform: translate(-50%,-64%) scale(1.34); opacity: 0.78; }
          100% { transform: translate(-50%,-66%) scale(1.78); opacity: 0; filter: blur(2px); }
        }
        @keyframes tsgSlimeCardMelt {
          0% { transform: scale(1); opacity: 1; }
          46% { transform: scale(0.98); opacity: 0.94; }
          76% { transform: scale(0.72); opacity: 0.28; filter: blur(1.2px); }
          100% { transform: scale(0.22); opacity: 0; filter: blur(3px); }
        }
        @keyframes tsgSlimeRingPop {
          0% { transform: translate(-50%,-50%) scale(0.3); opacity: 0; }
          34% { opacity: 0; }
          62% { transform: translate(-50%,-50%) scale(0.92); opacity: 0.9; }
          100% { transform: translate(-50%,-50%) scale(2.15); opacity: 0; }
        }
        @keyframes tsgSlimeDropletPop {
          0% { transform: translate(-50%,-50%) scale(0.2); opacity: 0; }
          54% { opacity: 0; }
          68% { opacity: 1; }
          100% { transform: translate(calc(-50% + var(--dx)), calc(-50% + var(--dy))) scale(0.12); opacity: 0; }
        }
      `}</style>
      {cards.map((card, idx) => {
        const off = offsets[idx % offsets.length];
        const left = pos.x + off.x;
        const top = pos.y + off.y;
        const delay = idx * 0.08;
        const droplets = [
          [-42, -26], [-18, -48], [18, -44], [44, -18],
          [38, 24], [10, 44], [-24, 38], [-46, 8],
        ];
        return (
          <div key={card?.id || `slime-pop-${idx}`} style={{ position: 'absolute', left, top }}>
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 82,
              height: 82,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 36% 28%,rgba(232,255,246,0.86) 0%,rgba(137,232,190,0.48) 26%,rgba(50,143,111,0.20) 56%,rgba(6,38,31,0) 74%)',
              border: '1px solid rgba(167,243,208,0.58)',
              boxShadow: '0 0 24px rgba(128,216,168,0.58), inset -8px -10px 18px rgba(13,72,56,0.36), inset 7px 7px 16px rgba(242,255,250,0.42)',
              animation: `tsgSlimeBubblePop 0.94s cubic-bezier(0.22,0.78,0.24,1) ${delay}s both`,
            }} />
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 74,
              height: 74,
              borderRadius: '50%',
              border: '2px solid rgba(190,255,226,0.72)',
              boxShadow: '0 0 16px rgba(128,216,168,0.46)',
              animation: `tsgSlimeRingPop 0.94s ease-out ${delay}s both`,
            }} />
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 42,
              height: 56,
              marginLeft: -21,
              marginTop: -28,
              animation: `tsgSlimeCardMelt 0.94s ease-in ${delay}s both`,
              filter: 'drop-shadow(0 0 14px rgba(128,216,168,0.58))',
            }}>
              {card ? (
                <DDCard card={card} small frameStyle={{ width: 42, minWidth: 42, height: 56, boxShadow: 'none' }} />
              ) : (
                <div style={{ width: 42, height: 56, borderRadius: 4, background: 'linear-gradient(160deg,#0b1f18,#07130f)', border: '1.5px solid #80d8a8' }} />
              )}
            </div>
            {droplets.map(([dx, dy], dotIdx) => (
              <div key={dotIdx} style={{
                position: 'absolute',
                left: 0,
                top: 0,
                width: dotIdx % 3 === 0 ? 8 : 6,
                height: dotIdx % 3 === 0 ? 8 : 6,
                borderRadius: '50%',
                background: 'radial-gradient(circle,#f0fff8 0%,#9af0c8 42%,rgba(68,180,132,0) 76%)',
                boxShadow: '0 0 10px rgba(154,240,200,0.75)',
                '--dx': `${dx}px`,
                '--dy': `${dy}px`,
                animation: `tsgSlimeDropletPop 0.94s cubic-bezier(0.16,0.76,0.2,1) ${delay}s both`,
              }} />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function useHuntRevealCardPosition(targetPid) {
  const [pos, setPos] = React.useState(null);

  React.useEffect(() => {
    function measure() {
      const start = getPlayerHandAnchorCenter(targetPid ?? 0);
      const end = getPlayerAreaAnchorCenter(targetPid ?? 0);
      setPos({
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        '--tx': `${end.x - start.x}px`,
        '--ty': `${end.y - start.y}px`,
      });
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [targetPid]);

  return pos;
}

export function HuntRevealCardOverlay({ anim, exiting }) {
  const pos = useHuntRevealCardPosition(anim?.targetPid ?? 0);
  if (!anim?.card || !pos) return null;
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 650,
      pointerEvents: 'none',
      overflow: 'hidden',
      animation: exiting ? 'animFadeOut 0.18s ease-in forwards' : 'none',
    }}>
      <div style={{
        position: 'absolute',
        left: pos.startX,
        top: pos.startY,
        width: 70,
        height: 94,
        marginLeft: -35,
        marginTop: -47,
        '--tx': pos['--tx'],
        '--ty': pos['--ty'],
        animation: 'huntRevealCardFly 0.82s cubic-bezier(0.22,0.82,0.22,1) both',
        filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.72))',
      }}>
        <MiniCardFace card={anim.card} width={70} height={94} ambient={false} frameStyle={{ boxShadow: 'none' }} />
      </div>
    </div>
  );
}

export function HuntRevealedCardBadge({ card, targetPid }) {
  const pos = useHuntRevealCardPosition(targetPid);
  if (!card || !pos) return null;
  return (
    <div style={{
      position: 'fixed',
      left: pos.endX,
      top: pos.endY,
      width: 70,
      height: 94,
      marginLeft: -35,
      marginTop: -47,
      zIndex: 455,
      pointerEvents: 'none',
      filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.7))',
    }}>
      <div style={{
        position: 'absolute',
        inset: -5,
        borderRadius: 8,
        border: '1px solid rgba(220,40,40,0.55)',
        boxShadow: '0 0 16px rgba(220,40,40,0.35)',
      }} />
      <MiniCardFace card={card} width={70} height={94} ambient={false} frameStyle={{ boxShadow: 'none' }} />
    </div>
  );
}
