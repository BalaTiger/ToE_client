import React from 'react';
import { DDCard, DDCardBack } from '../cards';

export function SwapBlindDrawOverlay({
  swapBlindDraw,
  swapBlindCardLayout,
  targetName,
  expansionKey,
  swapBlindHandRef,
  handleSwapBlindDrawSelect,
}) {
  if (!swapBlindDraw) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 550,
      background: 'rgba(5,3,1,0.88)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: Math.max(18, swapBlindCardLayout.gap * 2),
      animation: 'animFadeIn 0.25s ease both',
    }}>
      <div style={{
        fontFamily: "'Cinzel',serif", color: '#c8a96e', fontSize: swapBlindCardLayout.titleFontSize, letterSpacing: 2, textAlign: 'center',
        textShadow: '0 0 20px rgba(200,169,110,0.3)',
        maxWidth: '92vw',
      }}>
        从 {targetName} 的手牌中暗抽一张
      </div>
      <div ref={swapBlindHandRef} style={{
        display: 'flex', gap: swapBlindCardLayout.gap, alignItems: 'center', justifyContent: 'center',
        flexWrap: 'wrap', maxWidth: swapBlindCardLayout.maxWidth, perspective: '1200px',
      }}>
        {swapBlindDraw.handSnapshot.map(({ idx, card, isFaceUp }) => {
          const isShuffling = swapBlindDraw.phase === 'shuffling';
          const isSelecting = swapBlindDraw.phase === 'selecting';
          const isFlying = swapBlindDraw.phase === 'flying' && swapBlindDraw.selectedIdx === idx;
          const isOtherFlying = swapBlindDraw.phase === 'flying' && swapBlindDraw.selectedIdx !== idx;
          const seed = idx * 137 + idx * 31;
          const startX = `${(Math.sin(seed) * 220).toFixed(1)}px`;
          const startY = `${(Math.cos(seed * 1.3) * 180 - 80).toFixed(1)}px`;
          const startRz = `${(Math.sin(seed * 0.7) * 35).toFixed(1)}deg`;
          const pileX = `${(Math.sin(seed * 2.1) * 8).toFixed(1)}px`;
          const pileY = `${(Math.cos(seed * 1.7) * 6).toFixed(1)}px`;
          const handCount = swapBlindDraw.handSnapshot.length;
          const cardSpacing = swapBlindCardLayout.spacing;
          const totalWidth = (handCount - 1) * cardSpacing;
          const finalX = `${(idx * cardSpacing - totalWidth / 2).toFixed(1)}px`;
          return (
            <div
              key={idx}
              onClick={isSelecting ? () => handleSwapBlindDrawSelect(idx) : undefined}
              style={{
                position: 'relative',
                width: swapBlindCardLayout.width, height: swapBlindCardLayout.height,
                cursor: isSelecting ? 'pointer' : 'default',
                transformStyle: 'preserve-3d',
                transition: isSelecting ? 'transform 0.18s ease' : 'none',
                ...(isShuffling ? {
                  '--start-x': startX, '--start-y': startY, '--start-rz': startRz,
                  '--pile-x': pileX, '--pile-y': pileY,
                  '--final-x': finalX, '--final-y': '0px',
                  // 内层 face/back 两个 div 已经各自通过 rotateY 决定正反面朝向（face-up: face 0°/back 180°；
                  // face-down: face 180°/back 0°），外层洗牌动画落到 0° 即可，否则会与内层叠加成双重旋转，
                  // 让本该背面朝上的牌露出正面。
                  '--final-ry': '0deg',
                  '--pile-ry': isFaceUp ? '0deg' : `${(Math.sin(seed) * 20).toFixed(1)}deg`,
                  animation: 'swapBlindShuffleIn 1.2s cubic-bezier(0.25,0,0.35,1) both',
                  animationDelay: `${(idx * 0.09).toFixed(2)}s`,
                } : isFlying ? {
                  '--fly-tx': `${(swapBlindDraw.flyTo?.x || 0) - (swapBlindDraw.flyFrom?.x || 0)}px`,
                  '--fly-ty': `${(swapBlindDraw.flyTo?.y || 0) - (swapBlindDraw.flyFrom?.y || 0)}px`,
                  animation: 'swapBlindFlyCard 0.7s cubic-bezier(0.25,0,0.35,1) forwards',
                  zIndex: 100,
                } : isOtherFlying ? {
                  opacity: 0, transition: 'opacity 0.15s',
                } : {}),
              }}
            >
              <div style={{
                position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
                transform: isFaceUp ? 'none' : 'rotateY(180deg)',
                borderRadius: 3, overflow: 'hidden',
              }}>
                <DDCard
                  card={card}
                  holderId={swapBlindDraw.targetPi}
                  frameStyle={{
                    transform: `scale(${swapBlindCardLayout.scale})`,
                    transformOrigin: 'top left',
                  }}
                />
              </div>
              <div style={{
                position: 'absolute', inset: 0, backfaceVisibility: 'hidden',
                transform: isFaceUp ? 'rotateY(180deg)' : 'none',
                borderRadius: 3, overflow: 'hidden',
              }}>
                <DDCardBack
                  expansionKey={expansionKey}
                  frameStyle={{
                    width: swapBlindCardLayout.width,
                    height: swapBlindCardLayout.height,
                  }}
                />
              </div>
              {isSelecting && isFaceUp && <div style={{
                position: 'absolute', bottom: -Math.max(20, Math.round(swapBlindCardLayout.height * 0.22)), left: '50%', transform: 'translateX(-50%)',
                fontSize: swapBlindCardLayout.nameFontSize, color: '#c8a96e', fontFamily: "'Cinzel',serif",
                whiteSpace: 'nowrap', pointerEvents: 'none', opacity: 0.8,
              }}>{card.name}</div>}
            </div>
          );
        })}
      </div>
      {swapBlindDraw.phase === 'selecting' && <div style={{
        fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic',
        color: '#7a5a2a', fontSize: swapBlindCardLayout.hintFontSize, letterSpacing: 1,
        animation: 'animFadeIn 0.4s ease 0.6s both',
      }}>点击一张牌进行暗抽</div>}
      {swapBlindDraw.phase === 'shuffling' && <div style={{
        fontFamily: "'IM Fell English','Georgia',serif", fontStyle: 'italic',
        color: '#5a4020', fontSize: swapBlindCardLayout.hintFontSize, letterSpacing: 1,
      }}>洗牌中…</div>}
    </div>
  );
}
