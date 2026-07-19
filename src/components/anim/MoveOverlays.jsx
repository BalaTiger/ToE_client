import React from 'react';
import { CS, GOD_CS, GOD_DEFS } from '../../constants/card';
import { AreaTooltip, DDCard, GodTooltip, MiniCardFace } from '../cards';
import { useCardHoverTooltip } from '../cards/useCardHoverTooltip';
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
const HUNT_REVEAL_HOLD_TRANSFORM = 'scale(1.06) rotateY(0deg) rotate(3deg)';
const HUNT_REVEAL_HOLD_FILTER = 'drop-shadow(0 10px 18px rgba(0,0,0,0.72))';

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getAdaptiveDrawTransferCardSize() {
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
  const width = Math.round(rawWidth);
  const height = Math.round(width * (108 / 82));
  return { width, height, scale: width / 82 };
}

export function getStandardFlyingCardSize() {
  return getAdaptiveDrawTransferCardSize();
}

function getHuntRevealCardSize() {
  const standard = getStandardFlyingCardSize();
  const width = Math.round(clampNumber(standard.width * 1.28, 68, 128));
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
    const size = getStandardFlyingCardSize();
    const deck = getPileAnchorCenter(
      '[data-deck-pile]',
      { x: window.innerWidth * 0.94 - 35, y: window.innerHeight * 0.08 }
    );
    setStyle({
      left: deck.x,
      top: deck.y,
      width: size.width,
      height: size.height,
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
            width: style.width,
            height: style.height,
            marginLeft: -style.width / 2,
            marginTop: -style.height / 2,
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
    const size = getStandardFlyingCardSize();
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
        width: size.width,
        height: size.height,
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
            <MiniCardFace card={card} width={cardStyle.width} height={cardStyle.height} ambient={false} frameStyle={{boxShadow:'none',border:'none',background:'transparent'}}/>
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
    const size = getStandardFlyingCardSize();
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
      width: size.width,
      height: size.height,
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
        width: style.width,
        height: style.height,
        marginLeft: -style.width / 2,
        marginTop: -style.height / 2,
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
          const transferCardSize = getStandardFlyingCardSize();
          const duration = effect === 'blackGoat' ? 1.28 : effect === 'tsgSlime' ? 0.82 : isDrawKeep ? 0.74 : isGodKeepHand ? 0.78 : isDecipherStone ? 0.78 : 0.62;
          const cardW = transferCardSize.width;
          const cardH = transferCardSize.height;
          return (
            <div key={`${key}-${idx}`} style={{ position: 'absolute', left: srcX, top: srcY }}>
              {effect === 'blackGoat' && <BlackGoatTrail txPx={txPx} tyPx={tyPx} delay={delay} duration={duration} />}
              <div style={{
                position: 'absolute',
                left: 0, top: 0,
                width: cardW, height: cardH, marginLeft: -cardW / 2, marginTop: -cardH / 2,
                backgroundColor: (isDrawKeep || isDecipherStone || isSlime) ? 'transparent' : '#100c08',
                border: (isDrawKeep || isDecipherStone || isSlime || !isGodKeepHand) ? 'none' : `1.5px solid ${GOD_CS.borderBright}`,
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
                {!card && <CardBackLayer expansionKey={expansionKey}/>}
                {card && (
                  <MiniCardFace
                    card={card}
                    width={cardW}
                    height={cardH}
                    ambient={false}
                    frameStyle={{
                      boxShadow: 'none',
                      border: 'none',
                      background: 'transparent',
                    }}
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
  const [targets, setTargets] = React.useState(null);

  React.useLayoutEffect(() => {
    if (!anim) return undefined;
    let cancelled = false;
    let rafId = null;
    const activeElements = [];
    const cards = Array.isArray(anim.cards) && anim.cards.length
      ? anim.cards
      : Array.from({ length: Math.max(1, anim.count || 1) }, () => null);
    const escapeValue = value => (
      typeof CSS !== 'undefined' && CSS.escape
        ? CSS.escape(String(value))
        : String(value).replace(/["\\]/g, '\\$&')
    );
    const clearElementMarks = () => {
      activeElements.splice(0).forEach(el => {
        el.removeAttribute('data-tsg-slime-popping');
        el.style.removeProperty('--tsg-slime-pop-delay');
      });
    };
    const measure = (attempt = 0) => {
      clearElementMarks();
      const fallback = getPlayerHandAnchorCenter(anim.targetPid ?? 0);
      let missingIdentifiedCard = false;
      const measured = cards.map((card, idx) => {
        const cardId = card?.id;
        const selector = cardId != null
          ? `[data-self-hand-card-id="${escapeValue(cardId)}"],[data-player-hand-card-id="${escapeValue(cardId)}"]`
          : null;
        const el = selector ? document.querySelector(selector) : null;
        if (el) {
          activeElements.push(el);
          el.setAttribute('data-tsg-slime-popping', 'true');
          el.style.setProperty('--tsg-slime-pop-delay', `${idx * 0.08}s`);
          const rect = el.getBoundingClientRect();
          return {
            card,
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
            width: rect.width,
            height: rect.height,
            anchored: true,
          };
        }
        if (cardId != null) missingIdentifiedCard = true;
        const offsets = [
          { x: 0, y: 0 },
          { x: -26, y: 10 },
          { x: 28, y: 8 },
          { x: -10, y: -18 },
          { x: 18, y: -16 },
        ];
        const off = offsets[idx % offsets.length];
        return { card, x: fallback.x + off.x, y: fallback.y + off.y, width: 70, height: 92, anchored: false };
      });
      if (missingIdentifiedCard && attempt < 6 && typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        rafId = window.requestAnimationFrame(() => measure(attempt + 1));
        return;
      }
      if (!cancelled) setTargets(measured);
    };
    measure();
    return () => {
      cancelled = true;
      if (rafId != null) window.cancelAnimationFrame?.(rafId);
      clearElementMarks();
    };
  }, [anim]);

  if (!anim || !targets) return null;

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
        [data-tsg-slime-popping="true"] {
          transform-origin: center center;
          animation: tsgSlimeCardMelt 0.94s ease-in var(--tsg-slime-pop-delay, 0s) both;
          filter: drop-shadow(0 0 14px rgba(128,216,168,0.58));
        }
        .tsg-slime-pop-synthetic-card {
          position: absolute;
          left: 0;
          top: 0;
          transform: translate(-50%,-50%);
          transform-origin: center center;
          animation: tsgSlimeSyntheticCardMelt 0.94s ease-in var(--tsg-slime-pop-delay, 0s) both;
          filter: drop-shadow(0 0 14px rgba(128,216,168,0.58));
        }
        @keyframes tsgSlimeSyntheticCardMelt {
          0% { transform: translate(-50%,-50%) scale(1); opacity: 1; }
          46% { transform: translate(-50%,-50%) scale(0.98); opacity: 0.94; }
          76% { transform: translate(-50%,-50%) scale(0.72); opacity: 0.28; filter: blur(1.2px); }
          100% { transform: translate(-50%,-50%) scale(0.22); opacity: 0; filter: blur(3px); }
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
      {targets.map((target, idx) => {
        const left = target.x;
        const top = target.y;
        const delay = idx * 0.08;
        const bubbleSize = Math.max(66, Math.min(108, Math.max(target.width, target.height) * 1.12));
        const ringSize = Math.max(58, Math.min(98, Math.max(target.width, target.height) * 1.02));
        const droplets = [
          [-42, -26], [-18, -48], [18, -44], [44, -18],
          [38, 24], [10, 44], [-24, 38], [-46, 8],
        ];
        return (
          <div key={target.card?.id || `slime-pop-${idx}`} style={{ position: 'absolute', left, top }}>
            {!target.anchored && target.card && (
              <div
                className="tsg-slime-pop-synthetic-card"
                style={{
                  width: target.width,
                  height: target.height,
                  '--tsg-slime-pop-delay': `${delay}s`,
                }}
              >
                <DDCard
                  card={target.card}
                  compact
                  frameStyle={{ boxShadow: 'none', border: 'none', width: target.width, minWidth: target.width, height: target.height }}
                />
              </div>
            )}
            <div style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: bubbleSize,
              height: bubbleSize,
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
              width: ringSize,
              height: ringSize,
              borderRadius: '50%',
              border: '2px solid rgba(190,255,226,0.72)',
              boxShadow: '0 0 16px rgba(128,216,168,0.46)',
              animation: `tsgSlimeRingPop 0.94s ease-out ${delay}s both`,
            }} />
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
      const size = getHuntRevealCardSize();
      const start = getPlayerHandAnchorCenter(targetPid ?? 0);
      const end = getPlayerAreaAnchorCenter(targetPid ?? 0);
      const holdX = start.x + (end.x - start.x) * 0.72;
      const holdY = start.y + (end.y - start.y) * 0.72 - 16;
      setPos({
        startX: start.x,
        startY: start.y,
        endX: end.x,
        endY: end.y,
        holdX,
        holdY,
        width: size.width,
        height: size.height,
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
      animation: 'none',
    }}>
      <div style={{
        position: 'absolute',
        left: pos.startX,
        top: pos.startY,
        width: pos.width,
        height: pos.height,
        marginLeft: -pos.width / 2,
        marginTop: -pos.height / 2,
        '--tx': pos['--tx'],
        '--ty': pos['--ty'],
        opacity: 0,
        transform: 'translate(0,0) scale(0.82) rotateY(18deg) rotate(-4deg)',
        animation: 'huntRevealCardFly 0.82s cubic-bezier(0.22,0.82,0.22,1) both',
        filter: HUNT_REVEAL_HOLD_FILTER,
      }}>
        <MiniCardFace card={anim.card} width={pos.width} height={pos.height} ambient={false} frameStyle={{ boxShadow: 'none' }} />
      </div>
    </div>
  );
}

export function HuntRevealedCardBadge({ card, targetPid, suppressShadow = false }) {
  const pos = useHuntRevealCardPosition(targetPid);
  const { hover, tooltipPosition, cardRef, handleMouseEnter, handleMouseMove, handleMouseLeave } = useCardHoverTooltip();
  if (!card || !pos) return null;
  const godDef = card.isGod ? GOD_DEFS[card.godKey] : null;
  return (
    <>
      <div
        ref={cardRef}
        onMouseEnter={handleMouseEnter}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          position: 'fixed',
          left: pos.holdX,
          top: pos.holdY,
          width: pos.width,
          height: pos.height,
          marginLeft: -pos.width / 2,
          marginTop: -pos.height / 2,
          zIndex: 455,
          pointerEvents: 'auto',
          cursor: 'default',
          transform: HUNT_REVEAL_HOLD_TRANSFORM,
          transformOrigin: '50% 50%',
          filter: suppressShadow ? 'none' : HUNT_REVEAL_HOLD_FILTER,
        }}
      >
        <MiniCardFace card={card} width={pos.width} height={pos.height} ambient={false} frameStyle={{ boxShadow: 'none' }} />
      </div>
      {hover && godDef && <GodTooltip def={godDef} godLevel={card.godLevel || 1} position={tooltipPosition} />}
      {hover && !godDef && <AreaTooltip card={card} position={tooltipPosition} />}
    </>
  );
}
