import React from 'react';
import { DDCard, DDCardBack } from '../cards';
import { CARD_FACE_RATIO } from '../cards/CardFaceAssets';
import { _getZoomCompensatedRect, getPlayerHandCardAnchor } from '../../utils/dom';
import { getCardFlightStyle } from '../anim/cardSizing';

export function SwapBlindDrawOverlay({
  swapBlindDraw,
  swapBlindCardLayout,
  targetName,
  expansionKey,
  swapBlindHandRef,
  handleSwapBlindDrawSelect,
}) {
  const [shufflePaths, setShufflePaths] = React.useState({});
  const phase = swapBlindDraw?.phase;
  const targetPi = swapBlindDraw?.targetPi;
  const handSnapshot = swapBlindDraw?.handSnapshot;
  const cardHeight = swapBlindCardLayout.width * CARD_FACE_RATIO;
  const flyPath = phase === 'flying' && swapBlindDraw.flyFrom && swapBlindDraw.flyTo
    ? getCardFlightStyle(swapBlindDraw.flyFrom, swapBlindDraw.flyTo) : null;

  React.useLayoutEffect(() => {
    const hand = swapBlindHandRef.current;
    if (phase !== 'shuffling' || !hand || !handSnapshot) return;
    const slots = [...hand.querySelectorAll('[data-blind-card-index]')];
    // Stable flex slots stay measurable while their card planes fly in 3D.
    const handRect = _getZoomCompensatedRect(hand);
    const pileX = handRect.left + handRect.width / 2;
    const pileY = handRect.top + handRect.height / 2;
    const paths = {};
    slots.forEach(element => {
      const idx = Number(element.dataset.blindCardIndex);
      const entry = handSnapshot.find(item => item.idx === idx);
      const rect = _getZoomCompensatedRect(element);
      if (!entry || !rect?.width) return;
      const from = getPlayerHandCardAnchor(targetPi, entry.card);
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const flight = getCardFlightStyle(from, { x, y, width: rect.width, rotation: 0, tilt: 0 });
      paths[idx] = {
        ...flight,
        '--start-x': `${from.x - x}px`,
        '--start-y': `${from.y - y}px`,
        '--pile-x': `${pileX - x}px`,
        '--pile-y': `${pileY - y}px`,
      };
    });
    setShufflePaths(paths);
  }, [phase, targetPi, handSnapshot, swapBlindHandRef, swapBlindCardLayout.width, swapBlindCardLayout.gap, swapBlindCardLayout.maxWidth]);

  if (!swapBlindDraw) return null;

  return (
    <div className="toe-blind-draw" style={{
      position: 'fixed', inset: 0, zIndex: 550,
      backgroundColor: 'rgba(5,3,1,0.88)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: Math.max(18, swapBlindCardLayout.gap * 2),
      animation: 'animFadeIn 0.25s ease both',
    }}>
      <div className="toe-blind-draw-title" style={{
        fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", color: '#c8a96e', fontSize: swapBlindCardLayout.titleFontSize, letterSpacing: 2, textAlign: 'center',
        textShadow: '0 2px 4px #000',
        maxWidth: '92vw',
      }}>
        从 {targetName} 的手牌中暗抽一张
      </div>
      <div ref={swapBlindHandRef} style={{
        display: 'flex', gap: swapBlindCardLayout.gap, alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', maxWidth: swapBlindCardLayout.maxWidth,
      }}>
        {swapBlindDraw.handSnapshot.map(({ idx, card, isFaceUp }) => {
          const isShuffling = swapBlindDraw.phase === 'shuffling';
          const isSelecting = swapBlindDraw.phase === 'selecting';
          const isFlying = swapBlindDraw.phase === 'flying' && swapBlindDraw.selectedIdx === idx;
          const isOtherFlying = swapBlindDraw.phase === 'flying' && swapBlindDraw.selectedIdx !== idx;
          const shufflePath = shufflePaths[idx];
          const visualWidth = isFlying && flyPath ? flyPath.width : isShuffling && shufflePath ? shufflePath.width : swapBlindCardLayout.width;
          const visualHeight = visualWidth * CARD_FACE_RATIO;
          return (
            <div
              key={idx}
              data-blind-card-index={idx}
              onClick={isSelecting ? () => handleSwapBlindDrawSelect(idx) : undefined}
              style={{
                position: 'relative',
                width: swapBlindCardLayout.width, height: cardHeight,
                cursor: isSelecting ? 'pointer' : 'default',
              }}
            >
              <div data-blind-card-plane style={{
                position: 'absolute', left: '50%', top: '50%',
                width: visualWidth, height: visualHeight,
                marginLeft: -visualWidth / 2, marginTop: -visualHeight / 2,
                transition: isSelecting ? 'transform 0.18s ease' : 'none',
                backfaceVisibility: 'hidden',
                ...(isShuffling ? {
                  ...shufflePath,
                  visibility: shufflePath ? 'visible' : 'hidden',
                  animation: shufflePath ? `swapBlindShuffleIn 1.2s cubic-bezier(0.25,0,0.35,1) ${(idx * 0.09).toFixed(2)}s both` : 'none',
                } : isFlying && flyPath ? {
                  ...flyPath,
                  position: 'fixed', left: swapBlindDraw.flyFrom.x, top: swapBlindDraw.flyFrom.y,
                  marginLeft: -visualWidth / 2, marginTop: -visualHeight / 2,
                  animation: 'swapBlindFlyCard 0.7s cubic-bezier(0.25,0,0.35,1) forwards',
                  zIndex: 100,
                } : isOtherFlying ? {
                  opacity: 0, transition: 'opacity 0.15s',
                } : {}),
              }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 3, overflow: 'hidden' }}>
                {isFaceUp ? (
                <DDCard
                  card={card}
                  holderId={swapBlindDraw.targetPi}
                  hoverPreview={isSelecting}
                  frameStyle={{
                    width: visualWidth,
                    height: visualHeight,
                  }}
                />
                ) : (
                <DDCardBack
                  expansionKey={expansionKey}
                  frameStyle={{
                    width: visualWidth,
                    height: visualHeight,
                  }}
                />
                )}
              </div>
              </div>
              {isSelecting && isFaceUp && <div style={{
                position: 'absolute', bottom: -Math.max(20, Math.round(swapBlindCardLayout.height * 0.22)), left: '50%', transform: 'translateX(-50%)',
                fontSize: swapBlindCardLayout.nameFontSize, color: '#c8a96e', fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)",
                whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0.8,
              }}>{card.name}</div>}
            </div>
          );
        })}
      </div>
      {swapBlindDraw.phase === 'selecting' && <div className="toe-blind-draw-title" style={{
        fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal',
        color: '#b8aa8d', fontSize: swapBlindCardLayout.hintFontSize, letterSpacing: 1,
        animation: 'animFadeIn 0.4s ease 0.6s both',
      }}>点击一张牌进行暗抽</div>}
      {swapBlindDraw.phase === 'shuffling' && <div className="toe-blind-draw-title" style={{
        fontFamily: "var(--toe-ui-font, 'Noto Serif SC', 'Source Han Serif SC', 'Songti SC', 'SimSun', serif)", fontStyle: 'normal',
        color: '#a99b80', fontSize: swapBlindCardLayout.hintFontSize, letterSpacing: 1,
      }}>洗牌中…</div>}
    </div>
  );
}
